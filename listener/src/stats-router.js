import express from 'express';
import rateLimit from 'express-rate-limit';
import { log } from './logger.js';
import { rateLimitKeyGenerator } from './security.js';
import { parseIntInRange, parentBridgeId } from './utils.js';
import { detectOutliers } from './anomaly-detection.js';

const STATS_RATE_LIMIT_WINDOW_MS = parseIntInRange(
  process.env.API_STATS_RATE_LIMIT_WINDOW_MS,
  60_000,
  1_000,
  24 * 60 * 60 * 1000
);
const STATS_RATE_LIMIT_MAX = parseIntInRange(
  process.env.API_STATS_RATE_LIMIT_MAX,
  120,
  1,
  100_000
);

export function createStatsRouter({ pool, cached, getRooms, getRetentionSettings }) {
  const router = express.Router();
  const statsReadLimiter = rateLimit({
    windowMs: STATS_RATE_LIMIT_WINDOW_MS,
    max: STATS_RATE_LIMIT_MAX,
    standardHeaders: true,
    legacyHeaders: false,
    validate: false,
    keyGenerator: rateLimitKeyGenerator,
    message: { error: 'Too many requests' },
  });

  router.get('/stats/hourly', statsReadLimiter, async (_req, res) => {
    try {
      const rows = await cached('stats:hourly', async () => {
        const result = await pool.query(`
          SELECT EXTRACT(HOUR FROM timestamp AT TIME ZONE 'UTC') AS hour, COUNT(*) AS count
          FROM event_logs WHERE timestamp >= NOW() - INTERVAL '30 days'
          GROUP BY hour ORDER BY hour
        `);
        return result.rows;
      }, 60_000);
      res.json(rows);
    } catch (err) {
      log.error('[api] /api/stats/hourly error:', err.message ?? err.stack ?? err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  router.get('/stats/daily', statsReadLimiter, async (req, res) => {
    const days = parseIntInRange(req.query.days, 30, 7, 365);
    try {
      const rows = await cached(`stats:daily:${days}`, async () => {
        const result = await pool.query(`
          SELECT DATE(timestamp AT TIME ZONE 'UTC') AS day, COUNT(*) AS count
          FROM event_logs WHERE timestamp >= NOW() - ($1::int * INTERVAL '1 day')
          GROUP BY day ORDER BY day
        `, [days]);
        return result.rows;
      }, 60_000);
      res.json(rows);
    } catch (err) {
      log.error('[api] /api/stats/daily error:', err.message ?? err.stack ?? err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  router.get('/stats/top-devices', statsReadLimiter, async (req, res) => {
    const days = parseIntInRange(req.query.days, 7, 1, 90);
    try {
      const result = await pool.query(`
        SELECT
          counts.accessory_name,
          counts.event_count,
          latest.accessory_id,
          latest.room_name,
          latest.service_type
        FROM (
          SELECT accessory_name, COUNT(*)::int AS event_count
          FROM event_logs
          WHERE timestamp >= NOW() - ($1::int * INTERVAL '1 day')
          GROUP BY accessory_name
          ORDER BY event_count DESC
          LIMIT 10
        ) counts
        JOIN LATERAL (
          SELECT accessory_id, room_name, service_type
          FROM event_logs
          WHERE accessory_name = counts.accessory_name
          ORDER BY timestamp DESC, id DESC
          LIMIT 1
        ) latest ON true
        ORDER BY counts.event_count DESC
      `, [days]);
      const rooms = getRooms();
      const rows = result.rows.map((r) => ({
        ...r,
        room_name: rooms[r.accessory_id] ?? rooms[parentBridgeId(r.accessory_id)] ?? r.room_name,
      }));
      res.json(rows);
    } catch (err) {
      log.error('[api] /api/stats/top-devices error:', err.message ?? err.stack ?? err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  router.get('/stats/rooms', statsReadLimiter, async (req, res) => {
    const days = parseIntInRange(req.query.days, 7, 1, 90);
    try {
      const result = await pool.query(`
        SELECT accessory_id, room_name, COUNT(*)::int AS count
        FROM event_logs
        WHERE timestamp >= NOW() - ($1::int * INTERVAL '1 day')
        GROUP BY accessory_id, room_name
      `, [days]);
      const rooms = getRooms();
      const totals = {};
      for (const row of result.rows) {
        const name = rooms[row.accessory_id]
          ?? rooms[parentBridgeId(row.accessory_id)]
          ?? row.room_name;
        if (!name) continue;
        totals[name] = (totals[name] ?? 0) + row.count;
      }
      const sorted = Object.entries(totals)
        .map(([room_name, count]) => ({ room_name, count }))
        .sort((a, b) => b.count - a.count);
      res.json(sorted);
    } catch (err) {
      log.error('[api] /api/stats/rooms error:', err.message ?? err.stack ?? err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  router.get('/stats/weekday', statsReadLimiter, async (req, res) => {
    const days = parseIntInRange(req.query.days, 90, 7, 365);
    try {
      const rows = await cached(`stats:weekday:${days}`, async () => {
        const result = await pool.query(`
          SELECT
            EXTRACT(DOW  FROM timestamp AT TIME ZONE 'UTC')::int AS day_of_week,
            EXTRACT(HOUR FROM timestamp AT TIME ZONE 'UTC')::int AS hour,
            COUNT(*)::int AS count
          FROM event_logs
          WHERE timestamp >= NOW() - ($1::int * INTERVAL '1 day')
          GROUP BY day_of_week, hour
          ORDER BY day_of_week, hour
        `, [days]);
        return result.rows;
      }, 120_000);
      res.json(rows);
    } catch (err) {
      log.error('[api] /api/stats/weekday error:', err.message ?? err.stack ?? err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  router.get('/stats/heatmap', statsReadLimiter, async (_req, res) => {
    try {
      const rows = await cached('stats:heatmap', async () => {
        const result = await pool.query(`
          SELECT accessory_name,
                 EXTRACT(HOUR FROM timestamp AT TIME ZONE 'UTC')::int AS hour,
                 COUNT(*)::int AS count
          FROM event_logs
          WHERE timestamp >= NOW() - INTERVAL '7 days'
          GROUP BY accessory_name, hour
          ORDER BY accessory_name, hour
        `);
        return result.rows;
      }, 60_000);
      res.json(rows);
    } catch (err) {
      log.error('[api] /api/stats/heatmap error:', err.message ?? err.stack ?? err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  router.get('/stats/device-patterns', statsReadLimiter, async (_req, res) => {
    try {
      const rows = await cached('stats:device-patterns', async () => {
        const result = await pool.query(`
          SELECT accessory_name,
                 EXTRACT(HOUR FROM timestamp AT TIME ZONE 'UTC')::int AS hour,
                 COUNT(*)::int AS total_count
          FROM event_logs
          WHERE timestamp >= NOW() - INTERVAL '30 days'
          GROUP BY accessory_name, hour
          ORDER BY accessory_name, hour
        `);
        return result.rows;
      }, 120_000);
      res.json(rows);
    } catch (err) {
      log.error('[api] /api/stats/device-patterns error:', err.message ?? err.stack ?? err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  router.get('/stats/anomalies', statsReadLimiter, async (_req, res) => {
    try {
      const [deviceRows, roomRows] = await cached('stats:anomalies', () => Promise.all([
        pool.query(`
          WITH scope_set AS (
            SELECT DISTINCT accessory_name AS scope_name
            FROM event_logs
            WHERE timestamp >= NOW() - INTERVAL '31 days'
              AND accessory_name IS NOT NULL
              AND accessory_name <> ''
          ),
          hours AS (
            SELECT generate_series(0, 23)::int AS hour
          ),
          history AS (
            SELECT
              accessory_name AS scope_name,
              EXTRACT(HOUR FROM timestamp AT TIME ZONE 'UTC')::int AS hour,
              DATE(timestamp AT TIME ZONE 'UTC') AS day_key,
              COUNT(*)::int AS count
            FROM event_logs
            WHERE timestamp >= NOW() - INTERVAL '31 days'
              AND timestamp < NOW() - INTERVAL '1 day'
              AND accessory_name IS NOT NULL
              AND accessory_name <> ''
            GROUP BY 1, 2, 3
          ),
          baseline AS (
            SELECT
              scopes.scope_name,
              hours.hour,
              COALESCE(AVG(history.count), 0)::float8 AS baseline_avg,
              COALESCE(STDDEV_SAMP(history.count), 0)::float8 AS baseline_std,
              COUNT(history.day_key)::int AS baseline_days
            FROM scope_set scopes
            CROSS JOIN hours
            LEFT JOIN history
              ON history.scope_name = scopes.scope_name
             AND history.hour = hours.hour
            GROUP BY scopes.scope_name, hours.hour
          ),
          current_window AS (
            SELECT
              accessory_name AS scope_name,
              EXTRACT(HOUR FROM timestamp AT TIME ZONE 'UTC')::int AS hour,
              COUNT(*)::int AS event_count
            FROM event_logs
            WHERE timestamp >= NOW() - INTERVAL '1 day'
              AND accessory_name IS NOT NULL
              AND accessory_name <> ''
            GROUP BY 1, 2
          )
          SELECT
            baseline.scope_name,
            baseline.hour,
            baseline.baseline_avg,
            baseline.baseline_std,
            baseline.baseline_days,
            COALESCE(current_window.event_count, 0)::int AS event_count
          FROM baseline
          LEFT JOIN current_window
            ON current_window.scope_name = baseline.scope_name
           AND current_window.hour = baseline.hour
          WHERE baseline.baseline_days > 0
        `),
        pool.query(`
          WITH scope_set AS (
            SELECT DISTINCT COALESCE(room_name, 'Unassigned') AS scope_name
            FROM event_logs
            WHERE timestamp >= NOW() - INTERVAL '31 days'
          ),
          hours AS (
            SELECT generate_series(0, 23)::int AS hour
          ),
          history AS (
            SELECT
              COALESCE(room_name, 'Unassigned') AS scope_name,
              EXTRACT(HOUR FROM timestamp AT TIME ZONE 'UTC')::int AS hour,
              DATE(timestamp AT TIME ZONE 'UTC') AS day_key,
              COUNT(*)::int AS count
            FROM event_logs
            WHERE timestamp >= NOW() - INTERVAL '31 days'
              AND timestamp < NOW() - INTERVAL '1 day'
            GROUP BY 1, 2, 3
          ),
          baseline AS (
            SELECT
              scopes.scope_name,
              hours.hour,
              COALESCE(AVG(history.count), 0)::float8 AS baseline_avg,
              COALESCE(STDDEV_SAMP(history.count), 0)::float8 AS baseline_std,
              COUNT(history.day_key)::int AS baseline_days
            FROM scope_set scopes
            CROSS JOIN hours
            LEFT JOIN history
              ON history.scope_name = scopes.scope_name
             AND history.hour = hours.hour
            GROUP BY scopes.scope_name, hours.hour
          ),
          current_window AS (
            SELECT
              COALESCE(room_name, 'Unassigned') AS scope_name,
              EXTRACT(HOUR FROM timestamp AT TIME ZONE 'UTC')::int AS hour,
              COUNT(*)::int AS event_count
            FROM event_logs
            WHERE timestamp >= NOW() - INTERVAL '1 day'
            GROUP BY 1, 2
          )
          SELECT
            baseline.scope_name,
            baseline.hour,
            baseline.baseline_avg,
            baseline.baseline_std,
            baseline.baseline_days,
            COALESCE(current_window.event_count, 0)::int AS event_count
          FROM baseline
          LEFT JOIN current_window
            ON current_window.scope_name = baseline.scope_name
           AND current_window.hour = baseline.hour
          WHERE baseline.baseline_days > 0
        `),
      ]), 120_000);

      const deviceOutliers = detectOutliers(deviceRows.rows, 'device').slice(0, 50);
      const roomOutliers = detectOutliers(roomRows.rows, 'room').slice(0, 50);

      res.json({
        generatedAt: new Date().toISOString(),
        outlierCount: deviceOutliers.length + roomOutliers.length,
        devices: deviceOutliers,
        rooms: roomOutliers,
      });
    } catch (err) {
      log.error('[api] /api/stats/anomalies error:', err.message ?? err.stack ?? err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  router.get('/stats/quiet-hours', statsReadLimiter, async (_req, res) => {
    const settings = getRetentionSettings();
    if (!settings.quietHoursEnabled) {
      return res.json({ enabled: false });
    }
    const startHour = settings.quietHoursStart; // UTC hour
    const endHour = settings.quietHoursEnd;     // UTC hour
    const excluded = settings.quietHoursExcludedAccessories ?? [];
    try {
      const hourCondition = startHour > endHour
        ? '(EXTRACT(HOUR FROM timestamp AT TIME ZONE \'UTC\')::int >= $1 OR EXTRACT(HOUR FROM timestamp AT TIME ZONE \'UTC\')::int < $2)'
        : 'EXTRACT(HOUR FROM timestamp AT TIME ZONE \'UTC\')::int >= $1 AND EXTRACT(HOUR FROM timestamp AT TIME ZONE \'UTC\')::int < $2';
      const params = [startHour, endHour];
      let excludeCondition = '';
      if (excluded.length) {
        params.push(excluded);
        excludeCondition = `AND accessory_id <> ALL($${params.length})`;
      }
      const result = await pool.query(`
        SELECT
          accessory_id,
          accessory_name,
          room_name,
          COUNT(*)::int AS count,
          MAX(timestamp) AS last_seen_at
        FROM event_logs
        WHERE timestamp >= NOW() - INTERVAL '24 hours'
          AND ${hourCondition}
          AND accessory_name IS NOT NULL
          AND accessory_name <> ''
          ${excludeCondition}
        GROUP BY accessory_id, accessory_name, room_name
        ORDER BY count DESC
        LIMIT 20
      `, params);
      res.json({
        enabled: true,
        quietHoursStart: startHour,
        quietHoursEnd: endHour,
        excludedAccessories: excluded,
        events: result.rows.map((r) => ({
          accessoryId: r.accessory_id,
          accessoryName: r.accessory_name,
          room: r.room_name || null,
          count: r.count,
          lastSeenAt: r.last_seen_at,
        })),
      });
    } catch (err) {
      log.error('[api] /api/stats/quiet-hours error:', err.message ?? err.stack ?? err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  return router;
}
