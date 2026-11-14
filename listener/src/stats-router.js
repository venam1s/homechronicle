import express from 'express';
import rateLimit from 'express-rate-limit';
import { log } from './logger.js';
import { rateLimitKeyGenerator } from './security.js';
import { parseIntInRange, roomFor } from './utils.js';
import { normalizeRetentionSettings } from './retention-router.js';
import { detectOutliers } from './anomaly-detection.js';
import { CATEGORIES, resolveCategory } from './categories.js';

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

export function createStatsRouter({ pool, cached, getRooms, getRetentionSettings, getCategoryOverrides = () => ({}) }) {
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
        room_name: roomFor(rooms, r.accessory_id) ?? r.room_name,
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
        const name = roomFor(rooms, row.accessory_id)
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
          WITH buckets AS (
            SELECT
              accessory_id,
              service_type,
              accessory_name,
              EXTRACT(HOUR FROM timestamp AT TIME ZONE 'UTC')::int AS hour,
              DATE(timestamp AT TIME ZONE 'UTC') AS day_key,
              (timestamp >= NOW() - INTERVAL '1 day') AS is_current,
              COUNT(*)::int AS count,
              MAX(timestamp) AS last_seen
            FROM event_logs
            WHERE timestamp >= NOW() - INTERVAL '31 days'
              AND accessory_name IS NOT NULL
              AND accessory_name <> ''
            GROUP BY 1, 2, 3, 4, 5, 6
          ),
          -- Scope each component by (accessory_id, service_type), shown under its
          -- most recent name, so a stored-name change doesn't reset its baseline
          -- (e.g. legacy HomeKit "Name · Service" names becoming plain "Name").
          latest_name AS (
            SELECT DISTINCT ON (accessory_id, service_type)
              accessory_id, service_type, accessory_name AS scope_name
            FROM buckets
            ORDER BY accessory_id, service_type, last_seen DESC
          ),
          named AS (
            SELECT latest_name.scope_name, buckets.hour, buckets.day_key, buckets.is_current, buckets.count
            FROM buckets
            JOIN latest_name
              ON latest_name.accessory_id = buckets.accessory_id
             AND latest_name.service_type IS NOT DISTINCT FROM buckets.service_type
          ),
          scope_set AS (
            SELECT DISTINCT scope_name FROM named
          ),
          hours AS (
            SELECT generate_series(0, 23)::int AS hour
          ),
          history AS (
            SELECT scope_name, hour, day_key, SUM(count)::int AS count
            FROM named
            WHERE NOT is_current
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
            SELECT scope_name, hour, SUM(count)::int AS event_count
            FROM named
            WHERE is_current
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

  router.get('/stats/quiet-hours', statsReadLimiter, async (req, res) => {
    try {
      // Resolve quiet-hours config: per-user blob if an authenticated session provides one
      // with a 'quietHoursEnabled' key; otherwise fall back to the shared retention.json config.
      // Requests with no req.hcSession (service API_TOKEN / AUTH_ENABLED=false) always use
      // the shared config (QH-04). No cached() call — per-user result must not enter the
      // shared module-level Map (QH-09).
      let settings;
      const userId = req.hcSession?.user_id;
      if (userId) {
        const prefResult = await pool.query(
          'SELECT prefs FROM user_preferences WHERE user_id = $1',
          [userId],
        );
        const blob = prefResult.rows[0]?.prefs ?? {};
        if (blob && typeof blob === 'object' && !Array.isArray(blob) && 'quietHoursEnabled' in blob) {
          // Blob values pass through normalizeRetentionSettings so malformed values
          // (e.g. non-numeric start/end) cannot inject into SQL parameters (QH-03).
          settings = normalizeRetentionSettings(blob);
        }
      }
      if (!settings) {
        settings = getRetentionSettings();
      }
      if (!settings.quietHoursEnabled) {
        return res.json({ enabled: false });
      }
      const startHour = settings.quietHoursStart; // UTC hour
      const endHour = settings.quietHoursEnd;     // UTC hour
      const excluded = settings.quietHoursExcludedAccessories ?? [];
      const hourCondition = startHour > endHour
        ? '(EXTRACT(HOUR FROM timestamp AT TIME ZONE \'UTC\')::int >= $1 OR EXTRACT(HOUR FROM timestamp AT TIME ZONE \'UTC\')::int < $2)'
        : 'EXTRACT(HOUR FROM timestamp AT TIME ZONE \'UTC\')::int >= $1 AND EXTRACT(HOUR FROM timestamp AT TIME ZONE \'UTC\')::int < $2';
      const params = [startHour, endHour];
      let excludeCondition = '';
      if (excluded.length) {
        params.push(excluded);
        // Excluding a multi-outlet plug ("MAC:aid") also excludes each of its
        // split outlets ("MAC:aid:serviceIid").
        excludeCondition = `AND accessory_id <> ALL($${params.length})
          AND NOT (
            array_length(string_to_array(accessory_id, ':'), 1) = 8
            AND array_to_string((string_to_array(accessory_id, ':'))[1:7], ':') = ANY($${params.length})
          )`;
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

  // -- Tier 2 optional dashboard panels (read-only) --

  // Latest temperature/humidity per accessory. Legacy Matter rows report a
  // generic characteristic ('MeasuredValue') in centi-units, so the metric is
  // disambiguated by cluster_id (1026 = temperature, 1029 = relative humidity)
  // and the value is ÷100. Rows written since the Matter normalisation (0.4.0)
  // and all HomeKit rows carry CurrentTemperature / CurrentRelativeHumidity in
  // real units (no scaling) — the JS below branches on `characteristic`.
  router.get('/stats/sensor-environment', statsReadLimiter, async (_req, res) => {
    try {
      const out = await cached('stats:sensor-environment', async () => {
        const result = await pool.query(`
          SELECT DISTINCT ON (accessory_id, metric)
            accessory_id, accessory_name, room_name, protocol, characteristic, new_value, timestamp, metric
          FROM (
            SELECT id, accessory_id, accessory_name, room_name, protocol, characteristic, new_value, timestamp,
              CASE
                WHEN characteristic = 'CurrentTemperature' OR cluster_id = 1026 THEN 'temperature'
                WHEN characteristic = 'CurrentRelativeHumidity' OR cluster_id = 1029 THEN 'humidity'
              END AS metric
            FROM event_logs
            WHERE timestamp >= NOW() - INTERVAL '7 days'
              AND (characteristic IN ('CurrentTemperature', 'CurrentRelativeHumidity')
                   OR cluster_id IN (1026, 1029))
          ) sub
          WHERE metric IS NOT NULL
          ORDER BY accessory_id, metric, timestamp DESC, id DESC
        `);
        const rooms = getRooms();
        const byAccessory = new Map();
        for (const row of result.rows) {
          const raw = Number.parseFloat(row.new_value);
          if (!Number.isFinite(raw)) continue;
          // Legacy Matter rows (characteristic MeasuredValue, matched by cluster_id)
          // are centi-units. Rows written since the Matter normalisation (0.4.0)
          // carry the HomeKit names and are already in real units — do not scale them.
          const isLegacyMatter = row.protocol === 'matter'
            && row.characteristic !== 'CurrentTemperature'
            && row.characteristic !== 'CurrentRelativeHumidity';
          const value = isLegacyMatter ? raw / 100 : raw;
          let entry = byAccessory.get(row.accessory_id);
          if (!entry) {
            entry = {
              accessoryId: row.accessory_id,
              accessoryName: row.accessory_name,
              roomName: roomFor(rooms, row.accessory_id) ?? row.room_name,
              temperature: null,
              humidity: null,
              lastUpdated: null,
            };
            byAccessory.set(row.accessory_id, entry);
          }
          if (row.metric === 'temperature') entry.temperature = Math.round(value * 10) / 10;
          else if (row.metric === 'humidity') entry.humidity = Math.round(value * 10) / 10;
          const ts = row.timestamp ? new Date(row.timestamp).toISOString() : null;
          if (ts && (!entry.lastUpdated || ts > entry.lastUpdated)) entry.lastUpdated = ts;
        }
        return [...byAccessory.values()].filter((e) => e.temperature !== null || e.humidity !== null);
      }, 60_000);
      res.json(out);
    } catch (err) {
      log.error('[api] /api/stats/sensor-environment error:', err.message ?? err.stack ?? err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Latest battery level + low-battery flag per accessory, low/empty first.
  router.get('/stats/battery-levels', statsReadLimiter, async (_req, res) => {
    try {
      const out = await cached('stats:battery-levels', async () => {
        const result = await pool.query(`
          SELECT DISTINCT ON (accessory_id, characteristic)
            accessory_id, accessory_name, room_name, characteristic, new_value, timestamp
          FROM event_logs
          WHERE timestamp >= NOW() - INTERVAL '30 days'
            AND characteristic IN ('BatteryLevel', 'StatusLowBattery')
          ORDER BY accessory_id, characteristic, timestamp DESC, id DESC
        `);
        const rooms = getRooms();
        const byAccessory = new Map();
        for (const row of result.rows) {
          let entry = byAccessory.get(row.accessory_id);
          if (!entry) {
            entry = {
              accessoryId: row.accessory_id,
              accessoryName: row.accessory_name,
              roomName: roomFor(rooms, row.accessory_id) ?? row.room_name,
              batteryLevel: null,
              lowBattery: null,
              lastUpdated: null,
            };
            byAccessory.set(row.accessory_id, entry);
          }
          if (row.characteristic === 'BatteryLevel') {
            const level = Number.parseInt(row.new_value, 10);
            entry.batteryLevel = Number.isFinite(level) ? Math.max(0, Math.min(100, level)) : null;
          } else if (row.characteristic === 'StatusLowBattery') {
            entry.lowBattery = row.new_value === '1' || row.new_value === 'true';
          }
          const ts = row.timestamp ? new Date(row.timestamp).toISOString() : null;
          if (ts && (!entry.lastUpdated || ts > entry.lastUpdated)) entry.lastUpdated = ts;
        }
        return [...byAccessory.values()].sort((a, b) => {
          const aLow = a.lowBattery === true ? 0 : 1;
          const bLow = b.lowBattery === true ? 0 : 1;
          if (aLow !== bLow) return aLow - bLow;
          const aLvl = a.batteryLevel == null ? -1 : a.batteryLevel;
          const bLvl = b.batteryLevel == null ? -1 : b.batteryLevel;
          return aLvl - bLvl;
        });
      }, 300_000);
      res.json(out);
    } catch (err) {
      log.error('[api] /api/stats/battery-levels error:', err.message ?? err.stack ?? err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Database / retention health metrics. The archive row count is wrapped in
  // its own try/catch so a missing/locked archive table degrades to null
  // rather than failing the whole endpoint with a 500.
  router.get('/stats/retention-health', statsReadLimiter, async (_req, res) => {
    try {
      const out = await cached('stats:retention-health', async () => {
        const retentionDays = Number(getRetentionSettings().retentionDays) || 365;
        const main = await pool.query(`
          SELECT
            (SELECT COUNT(*) FROM event_logs)::bigint AS total_rows,
            (SELECT MIN(timestamp) FROM event_logs) AS oldest_event,
            (SELECT MAX(timestamp) FROM event_logs) AS newest_event,
            (SELECT COUNT(*) FROM event_logs WHERE timestamp >= NOW() - INTERVAL '30 days')::bigint AS rows_30d,
            (SELECT COUNT(*) FROM event_logs WHERE timestamp < NOW() - ($1::int * INTERVAL '1 day'))::bigint AS events_past_retention,
            pg_database_size(current_database())::bigint AS db_size_bytes,
            pg_total_relation_size('event_logs')::bigint AS table_size_bytes
        `, [retentionDays]);
        const row = main.rows[0] ?? {};

        let archivedRows = null;
        try {
          const archive = await pool.query('SELECT COUNT(*)::bigint AS archived FROM event_logs_archive');
          archivedRows = Number(archive.rows[0]?.archived ?? 0);
        } catch (archiveErr) {
          log.warn('[api] /api/stats/retention-health archive count failed:', archiveErr.message ?? archiveErr);
          archivedRows = null;
        }

        return {
          totalRows: Number(row.total_rows ?? 0),
          oldestEvent: row.oldest_event ? new Date(row.oldest_event).toISOString() : null,
          newestEvent: row.newest_event ? new Date(row.newest_event).toISOString() : null,
          avgEventsPerDay: Math.round(Number(row.rows_30d ?? 0) / 30),
          dbSizeBytes: Number(row.db_size_bytes ?? 0),
          tableSizeBytes: Number(row.table_size_bytes ?? 0),
          retentionDays,
          eventsPastRetention: Number(row.events_past_retention ?? 0),
          archivedRows,
        };
      }, 300_000);
      res.json(out);
    } catch (err) {
      log.error('[api] /api/stats/retention-health error:', err.message ?? err.stack ?? err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Top-8 characteristics by event count, with the remainder collapsed into a
  // single 'Other' bucket. Bucketing is done in JS so the long tail still
  // contributes to the 'Other' total.
  router.get('/stats/characteristic-breakdown', statsReadLimiter, async (req, res) => {
    const days = parseIntInRange(req.query.days, 7, 1, 90);
    try {
      const out = await cached(`stats:characteristic-breakdown:${days}`, async () => {
        const result = await pool.query(`
          SELECT characteristic, COUNT(*)::int AS count
          FROM event_logs
          WHERE timestamp >= NOW() - ($1::int * INTERVAL '1 day')
            AND characteristic IS NOT NULL
          GROUP BY characteristic
          ORDER BY count DESC
        `, [days]);
        const rows = result.rows.map((r) => ({
          characteristic: r.characteristic,
          count: Number(r.count),
        }));
        if (rows.length <= 8) return rows;
        const top = rows.slice(0, 8);
        const other = rows.slice(8).reduce((sum, r) => sum + r.count, 0);
        return [...top, { characteristic: 'Other', count: other }];
      }, 60_000);
      res.json(out);
    } catch (err) {
      log.error('[api] /api/stats/characteristic-breakdown error:', err.message ?? err.stack ?? err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Events and devices per device category over the last `days`, with the
  // preceding period of the same length for a trend. The per-device service
  // types are cached; categories (overrides included) are resolved on every
  // request so a changed override shows up immediately.
  router.get('/stats/categories', statsReadLimiter, async (req, res) => {
    const days = parseIntInRange(req.query.days, 7, 1, 90);
    try {
      const rows = await cached(`stats:categories:${days}`, async () => {
        const result = await pool.query(`
          SELECT accessory_id, MAX(accessory_name) AS accessory_name, service_type,
                 COUNT(*) FILTER (WHERE timestamp >= NOW() - ($1::int * INTERVAL '1 day'))::int AS current,
                 COUNT(*) FILTER (WHERE timestamp < NOW() - ($1::int * INTERVAL '1 day'))::int AS previous
          FROM event_logs
          WHERE timestamp >= NOW() - ($1::int * 2 * INTERVAL '1 day')
          GROUP BY accessory_id, service_type
        `, [days]);
        return result.rows;
      }, 60_000);

      const devices = new Map();
      for (const row of rows) {
        const device = devices.get(row.accessory_id) ?? {
          accessoryId: row.accessory_id,
          name: row.accessory_name,
          serviceTypes: new Set(),
          events: 0,
          previousEvents: 0,
        };
        device.serviceTypes.add(row.service_type);
        device.events += Number(row.current);
        device.previousEvents += Number(row.previous);
        devices.set(row.accessory_id, device);
      }

      const overrides = getCategoryOverrides();
      const byCategory = new Map();
      for (const device of devices.values()) {
        const { category } = resolveCategory(device.accessoryId, device.serviceTypes, overrides);
        const bucket = byCategory.get(category) ?? { events: 0, previousEvents: 0, devices: [] };
        bucket.events += device.events;
        bucket.previousEvents += device.previousEvents;
        bucket.devices.push(device);
        byCategory.set(category, bucket);
      }

      const categories = CATEGORIES
        .filter((c) => byCategory.has(c.id))
        .map((c) => {
          const bucket = byCategory.get(c.id);
          return {
            id: c.id,
            label: c.label,
            events: bucket.events,
            previousEvents: bucket.previousEvents,
            devices: bucket.devices.length,
            topDevices: bucket.devices
              .filter((d) => d.events > 0)
              .sort((a, b) => b.events - a.events)
              .slice(0, 3)
              .map((d) => ({ accessoryId: d.accessoryId, name: d.name, events: d.events })),
          };
        })
        .sort((a, b) => b.events - a.events);
      res.json({ days, categories });
    } catch (err) {
      log.error('[api] /api/stats/categories error:', err.message ?? err.stack ?? err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  return router;
}
