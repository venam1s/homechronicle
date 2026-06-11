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

/**
 * Delete expired session rows (WR-03).
 * validateSession already filters WHERE expires_at > NOW(), so expired rows are
 * never returned — but without this sweep they accumulate forever (the common case:
 * users close the tab and the session simply lapses). Runs alongside the event and
 * alert_deliveries retention sweeps to keep the sessions table bounded on
 * long-running self-hosted instances.
 * @returns {Promise<{deleted: number}>}
 */
export async function runSessionRetentionSweep() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query(
      `DELETE FROM sessions WHERE expires_at < NOW()`,
    );
    await client.query('COMMIT');
    return { deleted: result.rowCount };
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
    `SELECT id, email, password_hash, role, disabled_at FROM users WHERE email = $1`,
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
 * Updates last_seen_at; only matches non-expired sessions whose user still exists.
 * Returns session row with user role + email attached, or null if not found / expired
 * / user deleted (AUTH-04).
 *
 * Single atomic UPDATE ... FROM users join (WR-05): collapses the former two-query
 * read (UPDATE then a separate SELECT role on a different pooled connection) into one
 * round trip. last_seen_at is now updated only when a matching user row exists, so a
 * concurrently-deleted user no longer leaves an inconsistent intermediate. The join
 * also surfaces u.email so the gate can populate req.hcSession.email (WR-02), making
 * the GET /me email branch real instead of permanently dead.
 * @param {pg.Pool} pool
 * @param {string} tokenHash - SHA-256 hex of the raw token
 * @returns {Promise<{id: bigint, user_id: bigint, csrf_token: string|null, expires_at: Date, role: string, email: string}|null>}
 */
export async function validateSession(pool, tokenHash) {
  const result = await pool.query(
    `UPDATE sessions s
     SET last_seen_at = NOW()
     FROM users u
     WHERE s.token_hash = $1 AND s.expires_at > NOW() AND u.id = s.user_id AND u.disabled_at IS NULL
     RETURNING s.id, s.user_id, s.csrf_token, s.expires_at, u.role, u.email`,
    [tokenHash],
  );
  return result.rows[0] ?? null;
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

// -- User Management CRUD (pool-first positional arg for testability) --

/**
 * List all users with id, email, role, created_at, and disabled_at.
 * Callers derive status: disabled_at !== null → 'disabled', else 'active'.
 * @param {pg.Pool} pool
 * @returns {Promise<Array<{id: bigint, email: string, role: string, created_at: Date, disabled_at: Date|null}>>}
 */
export async function listUsers(pool) {
  const result = await pool.query(
    `SELECT id, email, role, created_at, disabled_at FROM users ORDER BY created_at`,
  );
  return result.rows;
}

/**
 * Disable a user account by setting disabled_at to NOW().
 * Disabled users fail validateSession on their very next request (USER-05).
 * Callers must also call revokeSessionsForUser to purge active sessions immediately.
 * @param {pg.Pool} pool
 * @param {bigint|number} userId
 * @returns {Promise<{id: bigint, role: string, disabled_at: Date}|null>}
 */
export async function disableUser(pool, userId) {
  const result = await pool.query(
    `UPDATE users SET disabled_at = NOW() WHERE id = $1 RETURNING id, role, disabled_at`,
    [userId],
  );
  return result.rows[0] ?? null;
}

/**
 * Re-enable a previously disabled user account by clearing disabled_at.
 * @param {pg.Pool} pool
 * @param {bigint|number} userId
 * @returns {Promise<{id: bigint, role: string, disabled_at: null}|null>}
 */
export async function enableUser(pool, userId) {
  const result = await pool.query(
    `UPDATE users SET disabled_at = NULL WHERE id = $1 RETURNING id, role, disabled_at`,
    [userId],
  );
  return result.rows[0] ?? null;
}

/**
 * Delete a user account.
 * Sessions are cascade-deleted by the FK ON DELETE CASCADE defined in migration 0003.
 * @param {pg.Pool} pool
 * @param {bigint|number} userId
 * @returns {Promise<{id: bigint}|null>}
 */
export async function removeUser(pool, userId) {
  const result = await pool.query(
    `DELETE FROM users WHERE id = $1 RETURNING id`,
    [userId],
  );
  return result.rows[0] ?? null;
}

/**
 * Delete all sessions for a given user.
 * Used on account disable and password change (PWD-01) to force re-authentication.
 * @param {pg.Pool} pool
 * @param {bigint|number} userId
 * @returns {Promise<void>}
 */
export async function revokeSessionsForUser(pool, userId) {
  await pool.query(
    `DELETE FROM sessions WHERE user_id = $1`,
    [userId],
  );
}

/**
 * Update a user's role ('admin' or 'member').
 * @param {pg.Pool} pool
 * @param {bigint|number} userId
 * @param {'admin'|'member'} role
 * @returns {Promise<{id: bigint, email: string, role: string}|null>}
 */
export async function setUserRole(pool, userId, role) {
  const result = await pool.query(
    `UPDATE users SET role = $2 WHERE id = $1 RETURNING id, email, role`,
    [userId, role],
  );
  return result.rows[0] ?? null;
}

/**
 * Count the number of active (non-disabled) admin users.
 * Primitive for the last-admin guard in users-router (Plan 21-06).
 * @param {pg.Pool} pool
 * @returns {Promise<number>}
 */
export async function countAdmins(pool) {
  const result = await pool.query(
    `SELECT COUNT(*)::int AS count FROM users WHERE role='admin' AND disabled_at IS NULL`,
  );
  return result.rows[0].count;
}

// -- Invite CRUD (pool-first positional arg for testability) --

/**
 * Insert a new pending invite.
 * The tokenHash must be the SHA-256 hex digest of the raw invite token (T-21-03-TOKENLEAK).
 * Raw tokens are never stored — callers hash before passing tokenHash.
 * @param {pg.Pool} pool
 * @param {{ email: string, tokenHash: string, role?: string, invitedBy?: bigint|number|null, expiresAt: Date }} params
 * @returns {Promise<{id: bigint, email: string, role: string, expires_at: Date}>}
 */
export async function createInvite(pool, { email, tokenHash, role = 'member', invitedBy = null, expiresAt }) {
  const result = await pool.query(
    `INSERT INTO invites (email, token_hash, role, invited_by, expires_at)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, email, role, expires_at`,
    [email, tokenHash, role, invitedBy, expiresAt],
  );
  return result.rows[0];
}

/**
 * Find the most recent pending invite for an email address.
 * Used to check for duplicate pending invites before creating a new one.
 * @param {pg.Pool} pool
 * @param {string} email
 * @returns {Promise<object|null>}
 */
export async function findInviteByEmail(pool, email) {
  const result = await pool.query(
    `SELECT id, email, role, status, expires_at, created_at
     FROM invites
     WHERE email = $1 AND status = 'pending'
     ORDER BY created_at DESC
     LIMIT 1`,
    [email],
  );
  return result.rows[0] ?? null;
}

/**
 * List all pending, non-expired invites ordered by creation date descending.
 * @param {pg.Pool} pool
 * @returns {Promise<Array<{id: bigint, email: string, role: string, status: string, created_at: Date, expires_at: Date}>>}
 */
export async function listInvites(pool) {
  const result = await pool.query(
    `SELECT id, email, role, status, created_at, expires_at
     FROM invites
     WHERE status = 'pending' AND expires_at > NOW()
     ORDER BY created_at DESC`,
  );
  return result.rows;
}

/**
 * Revoke a pending invite by id.
 * Only succeeds when the invite is still pending; returns null if already handled.
 * @param {pg.Pool} pool
 * @param {bigint|number} inviteId
 * @returns {Promise<{id: bigint}|null>}
 */
export async function revokeInvite(pool, inviteId) {
  const result = await pool.query(
    `UPDATE invites
     SET status = 'revoked'
     WHERE id = $1 AND status = 'pending'
     RETURNING id`,
    [inviteId],
  );
  return result.rows[0] ?? null;
}

/**
 * Atomically redeem a pending invite token (single-use, T-21-03-REPLAY).
 * The UPDATE wins only when status='pending', expires_at>NOW(), and used_at IS NULL.
 * A second call with the same token_hash returns null because used_at is already set.
 * @param {pg.Pool} pool
 * @param {string} tokenHash - SHA-256 hex of the raw invite token
 * @returns {Promise<{id: bigint, email: string, role: string}|null>}
 */
export async function redeemInvite(pool, tokenHash) {
  const result = await pool.query(
    `UPDATE invites
     SET status = 'accepted', used_at = NOW()
     WHERE token_hash = $1
       AND status = 'pending'
       AND expires_at > NOW()
       AND used_at IS NULL
     RETURNING id, email, role`,
    [tokenHash],
  );
  return result.rows[0] ?? null;
}

// -- Password Reset Token CRUD (pool-first positional arg for testability) --

/**
 * Insert a new password reset token.
 * The tokenHash must be the SHA-256 hex digest of the raw reset token (T-21-03-TOKENLEAK).
 * @param {pg.Pool} pool
 * @param {{ userId: bigint|number, tokenHash: string, expiresAt: Date }} params
 * @returns {Promise<{id: bigint}>}
 */
export async function createPasswordResetToken(pool, { userId, tokenHash, expiresAt }) {
  const result = await pool.query(
    `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
     VALUES ($1, $2, $3)
     RETURNING id`,
    [userId, tokenHash, expiresAt],
  );
  return result.rows[0];
}

/**
 * Atomically redeem a password reset token (single-use, T-21-03-REPLAY / PWD-03).
 * The UPDATE wins only when expires_at>NOW() and used_at IS NULL.
 * A second call with the same token_hash returns null because used_at is already set.
 * @param {pg.Pool} pool
 * @param {string} tokenHash - SHA-256 hex of the raw reset token
 * @returns {Promise<{id: bigint, user_id: bigint}|null>}
 */
export async function redeemResetToken(pool, tokenHash) {
  const result = await pool.query(
    `UPDATE password_reset_tokens
     SET used_at = NOW()
     WHERE token_hash = $1
       AND expires_at > NOW()
       AND used_at IS NULL
     RETURNING id, user_id`,
    [tokenHash],
  );
  return result.rows[0] ?? null;
}
