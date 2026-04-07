import express from 'express';
import rateLimit from 'express-rate-limit';
import { log } from './logger.js';
import { rateLimitKeyGenerator } from './security.js';
import { parseIntInRange } from './utils.js';

const ARCHIVE_READ_RATE_LIMIT_WINDOW_MS = parseIntInRange(
  process.env.API_STATS_RATE_LIMIT_WINDOW_MS,
  60_000,
  1_000,
  24 * 60 * 60 * 1000
);
const ARCHIVE_READ_RATE_LIMIT_MAX = parseIntInRange(
  process.env.API_STATS_RATE_LIMIT_MAX,
  120,
  1,
  100_000
);
const ARCHIVE_WRITE_RATE_LIMIT_WINDOW_MS = parseIntInRange(
  process.env.API_WRITE_RATE_LIMIT_WINDOW_MS,
  60_000,
  1_000,
  24 * 60 * 60 * 1000
);
const ARCHIVE_WRITE_RATE_LIMIT_MAX = parseIntInRange(
  process.env.API_WRITE_RATE_LIMIT_MAX,
  60,
  1,
  100_000
);

export function createArchiveRouter({ pool, loadRooms, saveRooms, loadDisplayNames, saveDisplayNames, loadNotes, saveNotes }) {
  const router = express.Router();

  const archiveReadLimiter = rateLimit({
    windowMs: ARCHIVE_READ_RATE_LIMIT_WINDOW_MS,
    max: ARCHIVE_READ_RATE_LIMIT_MAX,
    standardHeaders: true,
    legacyHeaders: false,
    validate: false,
    keyGenerator: rateLimitKeyGenerator,
    message: { error: 'Too many requests' },
  });

  const archiveWriteLimiter = rateLimit({
    windowMs: ARCHIVE_WRITE_RATE_LIMIT_WINDOW_MS,
    max: ARCHIVE_WRITE_RATE_LIMIT_MAX,
    standardHeaders: true,
    legacyHeaders: false,
    validate: false,
    keyGenerator: rateLimitKeyGenerator,
    message: { error: 'Too many requests' },
  });

  // Archive export (CSV download)
  router.get('/archive/export', archiveReadLimiter, async (_req, res) => {
    const columns = [
      'source_id', 'timestamp', 'accessory_id', 'accessory_name', 'room_name',
      'service_type', 'characteristic', 'old_value', 'new_value',
      'protocol', 'transport', 'endpoint_id', 'cluster_id', 'attribute_id', 'archived_at',
    ];

    function csvCell(val) {
      if (val == null) return '';
      const str = val instanceof Date ? val.toISOString() : String(val);
      // Prevent CSV injection: prefix formula-triggering characters with a single quote
      const safe = /^[=+\-@\t\r]/.test(str) ? `'${str}` : str;
      return /[,"\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
    }

    function csvRow(row) {
      return columns.map((col) => csvCell(row[col])).join(',');
    }

    const MAX_EXPORT_ROWS = parseIntInRange(process.env.ARCHIVE_MAX_EXPORT_ROWS, 500_000, 1_000, 10_000_000);

    try {
      const countResult = await pool.query('SELECT COUNT(*) AS cnt FROM event_logs_archive');
      if (Number(countResult.rows[0].cnt) === 0) {
        return res.status(404).json({ error: 'No archived events to export.' });
      }

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="homechronicle-archive.csv"');
      res.write(columns.join(',') + '\n');

      const BATCH = 5000;
      let offset = 0;
      let hasMore = true;
      let totalExported = 0;
      while (hasMore && totalExported < MAX_EXPORT_ROWS) {
        const batchLimit = Math.min(BATCH, MAX_EXPORT_ROWS - totalExported);
        const batch = await pool.query(
          `SELECT ${columns.join(', ')} FROM event_logs_archive ORDER BY timestamp ASC LIMIT $1 OFFSET $2`,
          [batchLimit, offset]
        );
        for (const row of batch.rows) {
          res.write(csvRow(row) + '\n');
        }
        totalExported += batch.rows.length;
        offset += batch.rows.length;
        hasMore = batch.rows.length === batchLimit;
      }
      res.end();
    } catch (err) {
      log.error('[archive] /api/archive/export error:', err.message ?? err.stack ?? err);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Internal server error' });
      } else {
        res.end();
      }
    }
  });

  router.get('/archive/count', archiveReadLimiter, async (_req, res) => {
    try {
      const result = await pool.query('SELECT COUNT(*) AS count FROM event_logs_archive');
      res.json({ count: Number(result.rows[0].count) });
    } catch (err) {
      log.error('[archive] /api/archive/count error:', err.message ?? err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Data management
  router.delete('/data/accessory', archiveWriteLimiter, async (req, res) => {
    const { accessoryId } = req.body ?? {};
    if (!accessoryId) return res.status(400).json({ error: 'accessoryId is required' });
    try {
      const result = await pool.query(
        'DELETE FROM event_logs WHERE accessory_id = $1', [accessoryId]
      );
      const rooms = loadRooms();
      delete rooms[accessoryId];
      await saveRooms(rooms);
      const names = loadDisplayNames();
      delete names[accessoryId];
      await saveDisplayNames(names);
      const notes = loadNotes();
      delete notes[accessoryId];
      await saveNotes(notes);
      log.info(`[data] Deleted ${result.rowCount} event(s) for accessory ${accessoryId}`);
      res.json({ success: true, deleted: result.rowCount });
    } catch (err) {
      log.error('[data] /api/data/accessory error:', err.message ?? err.stack ?? err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  router.delete('/data/all', archiveWriteLimiter, async (req, res) => {
    if (req.body?.confirm !== 'DELETE ALL') {
      return res.status(400).json({ error: 'Request body must include { "confirm": "DELETE ALL" }' });
    }
    try {
      const result = await pool.query('DELETE FROM event_logs');
      await saveRooms({});
      await saveDisplayNames({});
      await saveNotes({});
      log.info(`[data] Wiped all data — ${result.rowCount} event(s) deleted`);
      res.json({ success: true, deleted: result.rowCount });
    } catch (err) {
      log.error('[data] /api/data/all error:', err.message ?? err.stack ?? err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  return router;
}
