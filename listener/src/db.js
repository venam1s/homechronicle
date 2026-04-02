/**
 * db.js — PostgreSQL client and event insertion helper.
 */

import pg from 'pg';
import { runner } from 'node-pg-migrate';
import { fileURLToPath } from 'url';
import path from 'path';
import { log } from './logger.js';

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

pool.on('error', (err) => {
  log.error('[db] Unexpected pool error:', err.message ?? err.stack ?? err);
});

/**
 * Insert a single HomeKit event into event_logs.
 *
 * @param {object} event
 * @param {string} event.accessoryId      - protocol-specific accessory identifier
 * @param {string} event.accessoryName
 * @param {string|null} event.roomName
 * @param {string|null} event.serviceType - e.g. "Lightbulb"
 * @param {string} event.characteristic   - e.g. "On"
 * @param {string|null} event.oldValue
 * @param {string} event.newValue
 * @param {string} event.protocol         - "homekit" | "matter"
 * @param {string|null} event.transport   - e.g. "ip", "thread"
 * @param {number|null} event.endpointId
 * @param {number|null} event.clusterId
 * @param {number|null} event.attributeId
 * @param {number|null} event.rawIid      - HAP instance ID
 */
export async function insertEvent(event) {
  const {
    accessoryId,
    accessoryName,
    roomName = null,
    serviceType = null,
    characteristic,
    oldValue = null,
    newValue,
    protocol = 'homekit',
    transport = null,
    endpointId = null,
    clusterId = null,
    attributeId = null,
    rawIid = null,
  } = event;

  const result = await pool.query(
    `INSERT INTO event_logs
       (accessory_id, accessory_name, room_name, service_type,
        characteristic, old_value, new_value, protocol, transport,
        endpoint_id, cluster_id, attribute_id, raw_iid)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
     RETURNING id, timestamp`,
    [accessoryId, accessoryName, roomName, serviceType,
      characteristic, oldValue, String(newValue), protocol, transport,
      endpointId, clusterId, attributeId, rawIid]
  );
  return result.rows[0];
}

/**
 * Run all pending database migrations using node-pg-migrate.
 * On existing installs where the schema exists but pgmigrations tracking
 * has not yet been set up, the baseline migration is fake-applied so that
 * node-pg-migrate does not attempt to re-create already-existing objects.
 */
export async function migrateDb() {
  const migrationsDir = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    '../migrations',
  );

  // Check if this is an existing install (event_logs already exists)
  const { rows: tableRows } = await pool.query(`
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'event_logs'
  `);
  const hasEventLogs = tableRows.length > 0;

  // Check if pgmigrations already tracks the baseline
  let baselineAlreadyTracked = false;
  if (hasEventLogs) {
    try {
      const { rows: pgmRows } = await pool.query(`
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'pgmigrations'
      `);
      if (pgmRows.length > 0) {
        const { rows: baselineRows } = await pool.query(
          `SELECT 1 FROM pgmigrations WHERE name = '0001_baseline'`,
        );
        baselineAlreadyTracked = baselineRows.length > 0;
      }
    } catch {
      // pgmigrations doesn't exist yet — baseline not tracked
    }
  }

  // Existing install without pgmigrations: fake-apply baseline only
  if (hasEventLogs && !baselineAlreadyTracked) {
    await runner({
      databaseUrl: process.env.DATABASE_URL,
      dir: migrationsDir,
      direction: 'up',
      count: 1,
      fake: true,
      migrationsTable: 'pgmigrations',
      singleTransaction: true,
      log: (msg) => log.debug('[migrate]', msg),
    });
    log.info('[db] Existing install detected — baseline migration marked as applied.');
  }

  // Run all pending migrations
  await runner({
    databaseUrl: process.env.DATABASE_URL,
    dir: migrationsDir,
    direction: 'up',
    migrationsTable: 'pgmigrations',
    singleTransaction: true,
    log: (msg) => log.debug('[migrate]', msg),
  });

  log.info('[db] Schema ready.');
}

export async function runRetentionSweep({
  retentionDays,
  archiveBeforeDelete = true,
}) {
  if (!Number.isFinite(retentionDays) || retentionDays <= 0) {
    return { archived: 0, deleted: 0, cutoffDays: retentionDays };
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    if (archiveBeforeDelete) {
      const moveResult = await client.query(
        `WITH moved AS (
           INSERT INTO event_logs_archive
             (source_id, timestamp, accessory_id, accessory_name, room_name,
              service_type, characteristic, old_value, new_value, protocol,
              transport, endpoint_id, cluster_id, attribute_id, raw_iid)
           SELECT id, timestamp, accessory_id, accessory_name, room_name,
                  service_type, characteristic, old_value, new_value, protocol,
                  transport, endpoint_id, cluster_id, attribute_id, raw_iid
           FROM event_logs
           WHERE timestamp < NOW() - ($1::int * INTERVAL '1 day')
           ON CONFLICT (source_id) DO NOTHING
           RETURNING source_id
         )
         DELETE FROM event_logs logs
         USING moved
         WHERE logs.id = moved.source_id`,
        [retentionDays]
      );
      await client.query('COMMIT');
      return { archived: moveResult.rowCount, deleted: moveResult.rowCount, cutoffDays: retentionDays };
    }

    const deleteResult = await client.query(
      `DELETE FROM event_logs
       WHERE timestamp < NOW() - ($1::int * INTERVAL '1 day')`,
      [retentionDays]
    );

    await client.query('COMMIT');
    return { archived: 0, deleted: deleteResult.rowCount, cutoffDays: retentionDays };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function runAlertDeliveriesRetentionSweep({ retentionDays }) {
  if (!Number.isFinite(retentionDays) || retentionDays <= 0) {
    return { deleted: 0, cutoffDays: retentionDays };
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query(
      `DELETE FROM alert_deliveries WHERE sent_at < NOW() - ($1::int * INTERVAL '1 day')`,
      [retentionDays],
    );
    await client.query('COMMIT');
    return { deleted: result.rowCount, cutoffDays: retentionDays };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export { pool };
