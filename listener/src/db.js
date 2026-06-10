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
export async function insertEvent(event, executor = pool) {
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

  const result = await executor.query(
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

// -- User CRUD (pool-first positional arg for testability) --

/**
 * Return total count of users.
 * @param {pg.Pool} pool
 * @returns {Promise<number>}
 */
export async function getUserCount(pool) {
  const result = await pool.query('SELECT COUNT(*) AS n FROM users');
  return parseInt(result.rows[0].n, 10);
}

/**
 * Insert a new user.
 * Email is lowercased and trimmed before insert.
 * @param {pg.Pool} pool
 * @param {{ email: string, passwordHash: string, role?: string }} params
 * @returns {Promise<{id: bigint, email: string, role: string}>}
 */
export async function createUser(pool, { email, passwordHash, role = 'member' }) {
  const normalizedEmail = String(email).trim().toLowerCase();
  const result = await pool.query(
    `INSERT INTO users (email, password_hash, role)
     VALUES ($1, $2, $3)
     RETURNING id, email, role`,
    [normalizedEmail, passwordHash, role],
  );
  return result.rows[0];
}

/**
 * Find a user by email (case-insensitive).
 * @param {pg.Pool} pool
 * @param {string} email
 * @returns {Promise<{id: bigint, email: string, password_hash: string, role: string}|null>}
 */
export async function findUserByEmail(pool, email) {
  const normalizedEmail = String(email).trim().toLowerCase();
  const result = await pool.query(
    `SELECT id, email, password_hash, role FROM users WHERE email = $1`,
    [normalizedEmail],
  );
  return result.rows[0] ?? null;
}

// -- Session CRUD (pool-first positional arg for testability) --

/**
 * Create a new session row.
 * The tokenHash must be the SHA-256 hex digest of the raw session token (D-12).
 * @param {pg.Pool} pool
 * @param {{ userId: bigint|number, tokenHash: string, expiresAt: Date }} params
 * @returns {Promise<{id: bigint, user_id: bigint, csrf_token: string|null, expires_at: Date}>}
 */
export async function createSession(pool, { userId, tokenHash, expiresAt }) {
  const result = await pool.query(
    `INSERT INTO sessions (user_id, token_hash, expires_at)
     VALUES ($1, $2, $3)
     RETURNING id, user_id, csrf_token, expires_at`,
    [userId, tokenHash, expiresAt],
  );
  return result.rows[0];
}

/**
 * Validate a session by its token hash.
 * Updates last_seen_at; only matches non-expired sessions.
 * Returns session row with user role attached, or null if not found / expired (AUTH-04).
 * @param {pg.Pool} pool
 * @param {string} tokenHash - SHA-256 hex of the raw token
 * @returns {Promise<{id: bigint, user_id: bigint, csrf_token: string|null, expires_at: Date, role: string}|null>}
 */
export async function validateSession(pool, tokenHash) {
  const result = await pool.query(
    `UPDATE sessions
     SET last_seen_at = NOW()
     WHERE token_hash = $1 AND expires_at > NOW()
     RETURNING id, user_id, csrf_token, expires_at`,
    [tokenHash],
  );
  if (result.rows.length === 0) return null;
  const session = result.rows[0];
  const userResult = await pool.query(
    `SELECT role FROM users WHERE id = $1`,
    [session.user_id],
  );
  if (userResult.rows.length === 0) return null;
  return { ...session, role: userResult.rows[0].role };
}

/**
 * Revoke (delete) a session by its token hash.
 * @param {pg.Pool} pool
 * @param {string} tokenHash
 * @returns {Promise<void>}
 */
export async function revokeSession(pool, tokenHash) {
  await pool.query(
    `DELETE FROM sessions WHERE token_hash = $1`,
    [tokenHash],
  );
}

/**
 * Update the CSRF token stored on a session row.
 * @param {pg.Pool} pool
 * @param {bigint|number} sessionId
 * @param {string} csrfToken
 * @returns {Promise<void>}
 */
export async function updateSessionCsrfToken(pool, sessionId, csrfToken) {
  await pool.query(
    `UPDATE sessions SET csrf_token = $1 WHERE id = $2`,
    [csrfToken, sessionId],
  );
}
