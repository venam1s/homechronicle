import express from 'express';
import rateLimit from 'express-rate-limit';
import { log } from './logger.js';
import { rateLimitKeyGenerator } from './security.js';
import { csvCell, parseIntInRange, parentBridgeId } from './utils.js';

const EVENTS_RATE_LIMIT_WINDOW_MS = parseIntInRange(
  process.env.EVENTS_RATE_LIMIT_WINDOW_MS,
  60_000,
  1_000,
  24 * 60 * 60 * 1000
);
const EVENTS_RATE_LIMIT_MAX = parseIntInRange(
  process.env.EVENTS_RATE_LIMIT_MAX,
  300,
  1,
  100_000
);

const EVENTS_EXPORT_RATE_LIMIT_MAX = parseIntInRange(
  process.env.EVENTS_EXPORT_RATE_LIMIT_MAX,
  10,
  1,
  10_000
);
const EVENTS_MAX_EXPORT_ROWS = parseIntInRange(
  process.env.EVENTS_MAX_EXPORT_ROWS,
  500_000,
  1_000,
  10_000_000
);
const EXPORT_BATCH = 5000;

const EXPORT_COLUMNS = [
  'id', 'timestamp', 'accessory_id', 'accessory_name', 'room_name',
  'service_type', 'characteristic', 'old_value', 'new_value', 'protocol',
  'transport', 'endpoint_id', 'cluster_id', 'attribute_id', 'raw_iid',
];

/**
 * WHERE clause for the Timeline's filters (room, accessory, characteristic,
 * from, to). Shared by the paged list and the export so an export always
 * contains exactly the events the Timeline shows for the same filters.
 */
export function buildEventFilters(query = {}) {
  const conditions = [];
  const params = [];
  if (query.room) { params.push(query.room); conditions.push(`room_name = $${params.length}`); }
  if (query.accessory) { params.push(`%${query.accessory}%`); conditions.push(`accessory_name ILIKE $${params.length}`); }
  if (query.characteristic) { params.push(query.characteristic); conditions.push(`characteristic = $${params.length}`); }
  if (query.from) { params.push(query.from); conditions.push(`timestamp >= $${params.length}`); }
  if (query.to) { params.push(query.to); conditions.push(`timestamp <= $${params.length}`); }
  return { conditions, params };
}

export function createEventsRouter({ pool, getRooms }) {
  const router = express.Router();
  const eventsReadLimiter = rateLimit({
    windowMs: EVENTS_RATE_LIMIT_WINDOW_MS,
    max: EVENTS_RATE_LIMIT_MAX,
    standardHeaders: true,
    legacyHeaders: false,
    validate: false,
    keyGenerator: rateLimitKeyGenerator,
    message: { error: 'Too many requests' },
  });

  router.get('/events', eventsReadLimiter, async (req, res) => {
    try {
      const page = parseIntInRange(req.query.page, 1, 1, 1_000_000);
      const limit = parseIntInRange(req.query.limit, 50, 1, 200);
      const offset = (page - 1) * limit;

      const { conditions, params } = buildEventFilters(req.query);

      const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

      let total;
      let estimated = false;

      if (conditions.length === 0) {
        const reltuplesResult = await pool.query(
          `SELECT reltuples FROM pg_class WHERE relname = 'event_logs'`
        );
        const reltuples = Number(reltuplesResult.rows[0]?.reltuples ?? 0);
        if (reltuples > 0) {
          total = Math.round(reltuples);
          estimated = true;
        } else {
          log.debug('[api] reltuples <= 0, falling back to exact COUNT for /api/events');
          const countResult = await pool.query('SELECT COUNT(*) AS total FROM event_logs');
          total = Number.parseInt(countResult.rows[0].total, 10);
        }
      } else {
        const countResult = await pool.query(
          `SELECT COUNT(*) AS total FROM event_logs ${where}`,
          params
        );
        total = Number.parseInt(countResult.rows[0].total, 10);
      }

      params.push(limit, offset);
      const dataResult = await pool.query(
        `SELECT id, timestamp, accessory_id, accessory_name, room_name,
                service_type, characteristic, old_value, new_value, protocol,
                transport, endpoint_id, cluster_id, attribute_id, raw_iid
         FROM event_logs ${where}
         ORDER BY timestamp DESC, id DESC
         LIMIT $${params.length - 1} OFFSET $${params.length}`,
        params
      );

      const rooms = getRooms();
      const events = dataResult.rows.map((row) => ({
        ...row,
        room_name: rooms[row.accessory_id]
          ?? rooms[parentBridgeId(row.accessory_id)]
          ?? row.room_name,
      }));

      res.json({ total, page, limit, pages: Math.ceil(total / limit), estimated, events });
    } catch (err) {
      log.error('[api] /api/events error:', err.message ?? err.stack ?? err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  const eventsExportLimiter = rateLimit({
    windowMs: EVENTS_RATE_LIMIT_WINDOW_MS,
    max: EVENTS_EXPORT_RATE_LIMIT_MAX,
    standardHeaders: true,
    legacyHeaders: false,
    validate: false,
    keyGenerator: rateLimitKeyGenerator,
    message: { error: 'Too many requests' },
  });

  // Download the events matching the Timeline filters, oldest first, as CSV
  // or JSON. Streams in keyset-paginated batches so a year of events never
  // sits in memory; capped at EVENTS_MAX_EXPORT_ROWS.
  router.get('/events/export', eventsExportLimiter, async (req, res) => {
    const format = String(req.query.format ?? 'csv').toLowerCase();
    if (format !== 'csv' && format !== 'json') {
      return res.status(400).json({ error: 'format must be csv or json' });
    }

    const { conditions, params } = buildEventFilters(req.query);
    try {
      const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
      const countResult = await pool.query(`SELECT COUNT(*) AS total FROM event_logs ${where}`, params);
      const total = Number.parseInt(countResult.rows[0]?.total ?? '0', 10);
      const exported = Math.min(total, EVENTS_MAX_EXPORT_ROWS);

      const stamp = new Date().toISOString().slice(0, 16).replace(/[-:]/g, '').replace('T', '-');
      const filename = `homechronicle-events-${stamp}.${format}`;
      res.setHeader('Content-Type', format === 'csv' ? 'text/csv; charset=utf-8' : 'application/json; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('X-Export-Total', String(total));
      res.setHeader('X-Export-Rows', String(exported));
      if (total > exported) res.setHeader('X-Export-Truncated', 'true');

      // UTF-8 BOM so Excel reads accented device names correctly.
      res.write(format === 'csv' ? `\uFEFF${EXPORT_COLUMNS.join(',')}\n` : '[');

      const rooms = getRooms();
      let written = 0;
      // Cursor carried as text: Postgres timestamps have microseconds, a JS
      // Date only milliseconds, and a truncated cursor would repeat rows.
      let cursor = null;
      while (written < exported) {
        const batchParams = [...params];
        const batchConditions = [...conditions];
        if (cursor) {
          batchParams.push(cursor.ts, cursor.id);
          batchConditions.push(`(timestamp, id) > ($${batchParams.length - 1}::timestamptz, $${batchParams.length})`);
        }
        batchParams.push(Math.min(EXPORT_BATCH, exported - written));
        const batchWhere = batchConditions.length ? `WHERE ${batchConditions.join(' AND ')}` : '';
        // eslint-disable-next-line no-await-in-loop
        const batch = await pool.query(
          `SELECT ${EXPORT_COLUMNS.join(', ')}, timestamp::text AS cursor_ts
           FROM event_logs ${batchWhere}
           ORDER BY timestamp ASC, id ASC
           LIMIT $${batchParams.length}`,
          batchParams
        );
        if (!batch.rows.length) break;

        let chunk = '';
        for (const row of batch.rows) {
          const out = { ...row };
          delete out.cursor_ts;
          out.room_name = rooms[row.accessory_id] ?? rooms[parentBridgeId(row.accessory_id)] ?? row.room_name;
          if (format === 'csv') {
            chunk += `${EXPORT_COLUMNS.map((col) => csvCell(out[col])).join(',')}\n`;
          } else {
            chunk += `${written === 0 ? '\n' : ',\n'}${JSON.stringify(out)}`;
          }
          written += 1;
        }
        res.write(chunk);
        const last = batch.rows[batch.rows.length - 1];
        cursor = { ts: last.cursor_ts, id: last.id };
      }
      if (format === 'json') res.write(written ? '\n]\n' : ']\n');
      res.end();
    } catch (err) {
      log.error('[api] /api/events/export error:', err.message ?? err.stack ?? err);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Internal server error' });
      } else {
        res.end();
      }
    }
  });

  router.get('/events/jump', eventsReadLimiter, async (req, res) => {
    const { accessory, hour, limit = '50', room, from, to } = req.query;
    if (!accessory || hour === undefined) {
      return res.status(400).json({ error: 'accessory and hour are required' });
    }

    const pageSize = parseIntInRange(limit, 50, 1, 200);
    const hourInt = Number.parseInt(String(hour), 10);

    try {
      const matchParams = [accessory, hourInt];
      const matchConditions = [
        'accessory_name = $1',
        `EXTRACT(HOUR FROM timestamp AT TIME ZONE 'UTC') = $2`,
      ];
      if (room) { matchParams.push(room); matchConditions.push(`room_name = $${matchParams.length}`); }
      if (from) { matchParams.push(from); matchConditions.push(`timestamp >= $${matchParams.length}`); }
      if (to) { matchParams.push(to); matchConditions.push(`timestamp <= $${matchParams.length}`); }

      const matchResult = await pool.query(
        `SELECT id, timestamp
         FROM event_logs
         WHERE ${matchConditions.join(' AND ')}
         ORDER BY timestamp DESC, id DESC
         LIMIT 1`,
        matchParams
      );

      if (!matchResult.rows.length) return res.json({ page: null, eventId: null });

      const { id: eventId, timestamp } = matchResult.rows[0];
      const countParams = [timestamp, eventId];
      const countConditions = [
        '(timestamp > $1 OR (timestamp = $1 AND id > $2))',
      ];
      // Include accessory filter so page number matches the filtered /events view
      countParams.push(`%${accessory}%`);
      countConditions.push(`accessory_name ILIKE $${countParams.length}`);
      if (room) { countParams.push(room); countConditions.push(`room_name = $${countParams.length}`); }
      if (from) { countParams.push(from); countConditions.push(`timestamp >= $${countParams.length}`); }
      if (to) { countParams.push(to); countConditions.push(`timestamp <= $${countParams.length}`); }

      const countResult = await pool.query(
        `SELECT COUNT(*) AS newer FROM event_logs WHERE ${countConditions.join(' AND ')}`,
        countParams
      );

      const newer = Number.parseInt(countResult.rows[0].newer, 10);
      const page = Math.floor(newer / pageSize) + 1;
      res.json({ page, eventId: String(eventId) });
    } catch (err) {
      log.error('[api] /api/events/jump error:', err.message ?? err.stack ?? err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  return router;
}
