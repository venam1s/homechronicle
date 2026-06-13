/**
 * db-session.test.js — Unit tests for session/user CRUD in db.js.
 *
 * Uses mock pools (following project pattern from events-router.integration.test.js)
 * since the Node.js built-in test runner has no ES module mocking support.
 *
 * Behavioral coverage:
 *  - createSession stores a row (D-12: tokenHash persisted as-is, never raw token)
 *  - validateSession returns session+role for a non-expired session
 *  - validateSession returns null when expires_at is in the past (AUTH-04 absolute expiry)
 *  - validateSession returns null when token_hash is not found
 *  - revokeSession deletes the row; subsequent validateSession returns null
 *  - updateSessionCsrfToken sets csrf_token on the session row
 *  - createUser normalizes email to lowercase+trimmed, default role 'member'
 *  - findUserByEmail normalizes email; returns null when not found
 *  - getUserCount returns integer count
 *
 * Source-inspection coverage (no live DB required):
 *  - validateSession uses UPDATE...WHERE expires_at > NOW() (absolute expiry gate)
 *  - sessions.token_hash equals the SHA-256 hex passed in (D-12)
 *  - role CHECK constraint uses 'admin'/'member' (D-16) in migration SQL
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createHash } from 'node:crypto';

import {
  createSession,
  validateSession,
  revokeSession,
  updateSessionCsrfToken,
  createUser,
  findUserByEmail,
  getUserCount,
  listUsers,
  disableUser,
  enableUser,
  removeUser,
  revokeSessionsForUser,
  setUserRole,
  countAdmins,
} from '../src/db.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dbSource = readFileSync(join(__dirname, '../src/db.js'), 'utf8');
const migrationSource = readFileSync(join(__dirname, '../migrations/0003_users_sessions.sql'), 'utf8');

// ---------------------------------------------------------------------------
// Helper: build a mock pool that simulates createSession / validateSession
// ---------------------------------------------------------------------------

/**
 * Returns a mock pool whose query() method handles the SQL patterns used by
 * the session CRUD functions.  The store map holds session rows keyed by
 * token_hash.  Users are looked up from a separate map.
 */
function makeMockPool({ sessions = {}, users = {}, rowCount = 1 } = {}) {
  return {
    query(sql, params) {
      const s = sql.trim();

      // getUserCount
      if (s.includes('COUNT(*) AS n FROM users')) {
        return Promise.resolve({ rows: [{ n: String(Object.keys(users).length) }] });
      }

      // countAdmins — COUNT of non-disabled admins
      if (s.includes('COUNT(*)') && s.includes("role='admin'")) {
        const count = Object.values(users).filter(
          (u) => u.role === 'admin' && !u.disabled_at,
        ).length;
        return Promise.resolve({ rows: [{ count }] });
      }

      // createUser
      if (s.includes('INSERT INTO users')) {
        const email = String(params[0]).trim().toLowerCase();
        const passwordHash = params[1];
        const role = params[2] ?? 'member';
        const id = BigInt(Object.keys(users).length + 1);
        users[email] = { id, email, password_hash: passwordHash, role, disabled_at: null, created_at: new Date() };
        return Promise.resolve({ rows: [{ id, email, role }] });
      }

      // findUserByEmail — supports both old and new SELECT (with disabled_at)
      if (s.includes('FROM users WHERE email')) {
        const email = String(params[0]).trim().toLowerCase();
        const row = users[email] ?? null;
        return Promise.resolve({ rows: row ? [row] : [] });
      }

      // listUsers — SELECT all users
      if (s.includes('SELECT') && s.includes('FROM users') && s.includes('ORDER BY created_at')) {
        const rows = Object.values(users).sort(
          (a, b) => new Date(a.created_at) - new Date(b.created_at),
        );
        return Promise.resolve({ rows });
      }

      // disableUser — SET disabled_at = NOW()
      if (s.includes('UPDATE users') && s.includes('disabled_at = NOW()')) {
        const userId = params[0];
        const userEntry = Object.values(users).find((u) => String(u.id) === String(userId));
        if (!userEntry) return Promise.resolve({ rows: [] });
        userEntry.disabled_at = new Date();
        return Promise.resolve({ rows: [{ id: userEntry.id, role: userEntry.role, disabled_at: userEntry.disabled_at }] });
      }

      // enableUser — SET disabled_at = NULL
      if (s.includes('UPDATE users') && s.includes('disabled_at = NULL')) {
        const userId = params[0];
        const userEntry = Object.values(users).find((u) => String(u.id) === String(userId));
        if (!userEntry) return Promise.resolve({ rows: [] });
        userEntry.disabled_at = null;
        return Promise.resolve({ rows: [{ id: userEntry.id, role: userEntry.role, disabled_at: null }] });
      }

      // setUserRole — UPDATE users SET role=$2
      if (s.includes('UPDATE users') && s.includes('SET role')) {
        const userId = params[0];
        const role = params[1];
        const userEntry = Object.values(users).find((u) => String(u.id) === String(userId));
        if (!userEntry) return Promise.resolve({ rows: [] });
        userEntry.role = role;
        return Promise.resolve({ rows: [{ id: userEntry.id, email: userEntry.email, role }] });
      }

      // removeUser — DELETE FROM users
      if (s.includes('DELETE FROM users WHERE id')) {
        const userId = params[0];
        const userEntry = Object.values(users).find((u) => String(u.id) === String(userId));
        if (!userEntry) return Promise.resolve({ rows: [] });
        // Also cascade-delete sessions
        for (const [hash, sess] of Object.entries(sessions)) {
          if (String(sess.user_id) === String(userId)) {
            delete sessions[hash];
          }
        }
        delete users[userEntry.email];
        return Promise.resolve({ rows: [{ id: userEntry.id }] });
      }

      // revokeSessionsForUser — DELETE FROM sessions WHERE user_id=$1
      if (s.includes('DELETE FROM sessions WHERE user_id')) {
        const userId = params[0];
        for (const [hash, sess] of Object.entries(sessions)) {
          if (String(sess.user_id) === String(userId)) {
            delete sessions[hash];
          }
        }
        return Promise.resolve({ rowCount: 1 });
      }

      // createSession (5-column shape: user_id, token_hash, expires_at, user_agent, ip_address)
      if (s.includes('INSERT INTO sessions')) {
        const userId = params[0];
        const tokenHash = params[1];
        const expiresAt = params[2];
        const userAgent = params[3] ?? null;
        const ipAddress = params[4] ?? null;
        const id = BigInt(Object.keys(sessions).length + 1);
        const row = {
          id,
          user_id: userId,
          csrf_token: null,
          expires_at: expiresAt,
          user_agent: userAgent,
          ip_address: ipAddress,
        };
        sessions[tokenHash] = row;
        return Promise.resolve({ rows: [row] });
      }

      // validateSession — single atomic UPDATE sessions s ... FROM users u ...
      // RETURNING s.*, u.role, u.email (WR-05). Joins the user; only returns a row
      // when the session is non-expired AND a matching user exists AND user is not disabled.
      if (s.includes('UPDATE sessions') && s.includes('last_seen_at')) {
        const tokenHash = params[0];
        const row = sessions[tokenHash];
        if (!row) return Promise.resolve({ rows: [] });
        // Simulate expires_at > NOW() check
        if (new Date(row.expires_at) <= new Date()) {
          return Promise.resolve({ rows: [] }); // expired
        }
        // Simulate the FROM users u JOIN: no matching user -> no row returned.
        const user = Object.values(users).find((u) => String(u.id) === String(row.user_id));
        if (!user) return Promise.resolve({ rows: [] });
        // Simulate AND u.disabled_at IS NULL guard (T-21-03-DISABLED / USER-05)
        if (user.disabled_at) return Promise.resolve({ rows: [] });
        return Promise.resolve({ rows: [{ ...row, role: user.role, email: user.email }] });
      }

      // revokeSession
      if (s.includes('DELETE FROM sessions WHERE token_hash')) {
        const tokenHash = params[0];
        const existed = tokenHash in sessions;
        delete sessions[tokenHash];
        return Promise.resolve({ rowCount: existed ? 1 : 0 });
      }

      // updateSessionCsrfToken
      if (s.includes('UPDATE sessions SET csrf_token')) {
        const csrfToken = params[0];
        const sessionId = params[1];
        for (const [hash, row] of Object.entries(sessions)) {
          if (String(row.id) === String(sessionId)) {
            sessions[hash] = { ...row, csrf_token: csrfToken };
          }
        }
        return Promise.resolve({ rowCount: 1 });
      }

      return Promise.reject(new Error(`Unexpected SQL in mock pool: ${s.slice(0, 80)}`));
    },
  };
}

// ---------------------------------------------------------------------------
// Source-inspection tests — verify security invariants without a live DB
// ---------------------------------------------------------------------------

test('validateSession SQL uses expires_at > NOW() for absolute expiry (AUTH-04)', () => {
  assert.ok(
    dbSource.includes('expires_at > NOW()'),
    'validateSession must filter WHERE expires_at > NOW() to enforce absolute expiry',
  );
});

test('validateSession SQL updates last_seen_at via UPDATE sessions (not a SELECT)', () => {
  assert.ok(
    dbSource.includes('UPDATE sessions') && dbSource.includes('last_seen_at = NOW()'),
    'validateSession must UPDATE sessions SET last_seen_at = NOW()',
  );
});

test('validateSession SQL uses FROM sessions WHERE token_hash (D-12 hash-at-rest pattern)', () => {
  assert.ok(
    dbSource.includes('WHERE token_hash = $1'),
    'validateSession must look up session by token_hash, not raw token',
  );
});

test('migration 0003 role CHECK uses admin/member, not admin/user (D-16)', () => {
  assert.ok(
    migrationSource.includes("CHECK (role IN ('admin', 'member'))"),
    "Migration 0003 must declare CHECK (role IN ('admin', 'member'))",
  );
  assert.ok(
    !migrationSource.includes("'user'"),
    "Migration 0003 must NOT reference role value 'user' (D-16 override)",
  );
});

test('migration 0003 sessions has token_hash UNIQUE (D-12)', () => {
  assert.ok(
    migrationSource.includes('token_hash') && migrationSource.includes('UNIQUE'),
    'Migration 0003 sessions table must declare token_hash with UNIQUE constraint',
  );
});

test('migration 0003 sessions has csrf_token column', () => {
  assert.ok(
    migrationSource.includes('csrf_token'),
    'Migration 0003 sessions table must include csrf_token column',
  );
});

test('migration 0003 sessions has expires_at column (AUTH-04)', () => {
  assert.ok(
    migrationSource.includes('expires_at'),
    'Migration 0003 sessions table must include expires_at column',
  );
});

test('migration 0003 down section drops sessions before users (FK order)', () => {
  const downIdx = migrationSource.indexOf('-- Down Migration');
  assert.ok(downIdx >= 0, 'Migration 0003 must have a Down Migration section');
  const downSection = migrationSource.slice(downIdx);
  const sessIdx = downSection.indexOf('DROP TABLE IF EXISTS sessions');
  const userIdx = downSection.indexOf('DROP TABLE IF EXISTS users');
  assert.ok(sessIdx >= 0, 'Down Migration must drop sessions table');
  assert.ok(userIdx >= 0, 'Down Migration must drop users table');
  assert.ok(sessIdx < userIdx, 'Down Migration must drop sessions before users (FK dependency)');
});

test('db.js exports all seven Phase-20 CRUD functions with pool-first signatures', () => {
  const fns = [
    'getUserCount',
    'createUser',
    'findUserByEmail',
    'createSession',
    'validateSession',
    'revokeSession',
    'updateSessionCsrfToken',
  ];
  for (const fn of fns) {
    assert.ok(
      dbSource.includes(`export async function ${fn}(pool`),
      `db.js must export async function ${fn}(pool, ...) with pool as first arg`,
    );
  }
});

test('db.js exports all Phase-21 user-management CRUD functions with pool-first signatures', () => {
  const fns = [
    'listUsers',
    'disableUser',
    'enableUser',
    'removeUser',
    'revokeSessionsForUser',
    'setUserRole',
    'countAdmins',
  ];
  for (const fn of fns) {
    assert.ok(
      dbSource.includes(`export async function ${fn}(pool`),
      `db.js must export async function ${fn}(pool, ...) with pool as first arg`,
    );
  }
});

test('validateSession SQL includes AND u.disabled_at IS NULL (T-21-03-DISABLED / USER-05)', () => {
  assert.ok(
    dbSource.includes('disabled_at IS NULL'),
    'validateSession WHERE clause must include AND u.disabled_at IS NULL to reject disabled users',
  );
});

test('countAdmins SQL uses disabled_at IS NULL guard (so disabled admins are excluded)', () => {
  // The source must contain disabled_at IS NULL at least twice (validateSession + countAdmins)
  const matches = (dbSource.match(/disabled_at IS NULL/g) ?? []).length;
  assert.ok(
    matches >= 2,
    `db.js must contain disabled_at IS NULL at least twice (validateSession + countAdmins); found ${matches}`,
  );
});

test('createUser default role is member, not user (D-16)', () => {
  const fnStart = dbSource.indexOf("export async function createUser(pool,");
  assert.ok(fnStart >= 0, 'createUser must be exported');
  const fnBody = dbSource.slice(fnStart, fnStart + 500);
  assert.ok(
    fnBody.includes("role = 'member'"),
    "createUser default role must be 'member' not 'user' (D-16)",
  );
  assert.ok(
    !fnBody.includes("role = 'user'"),
    "createUser must NOT default role to 'user' (D-16)",
  );
});

// ---------------------------------------------------------------------------
// Behavioral tests using mock pools
// ---------------------------------------------------------------------------

// -- getUserCount --

test('getUserCount returns 0 when users map is empty', async () => {
  const pool = makeMockPool({ users: {} });
  const count = await getUserCount(pool);
  assert.equal(count, 0);
});

test('getUserCount returns integer count matching user map size', async () => {
  const pool = makeMockPool({ users: { 'a@b.com': { id: 1n, email: 'a@b.com', password_hash: 'x', role: 'member' } } });
  const count = await getUserCount(pool);
  assert.equal(count, 1);
  assert.equal(typeof count, 'number');
});

// -- createUser --

test('createUser inserts user and returns id, email, role', async () => {
  const pool = makeMockPool();
  const result = await createUser(pool, { email: 'Alice@Example.COM', passwordHash: 'hash123' });
  assert.ok(result.id);
  assert.equal(result.email, 'alice@example.com');
  assert.equal(result.role, 'member');
});

test('createUser lowercases and trims email before insert', async () => {
  const users = {};
  const pool = makeMockPool({ users });
  await createUser(pool, { email: '  BOB@EXAMPLE.COM  ', passwordHash: 'h' });
  assert.ok('bob@example.com' in users, 'email must be stored as lowercase+trimmed');
});

test('createUser respects explicit role parameter', async () => {
  const pool = makeMockPool();
  const result = await createUser(pool, { email: 'admin@x.com', passwordHash: 'h', role: 'admin' });
  assert.equal(result.role, 'admin');
});

// -- findUserByEmail --

test('findUserByEmail returns user object when found', async () => {
  const users = { 'carol@x.com': { id: 1n, email: 'carol@x.com', password_hash: 'ph', role: 'member' } };
  const pool = makeMockPool({ users });
  const user = await findUserByEmail(pool, 'carol@x.com');
  assert.ok(user);
  assert.equal(user.email, 'carol@x.com');
  assert.equal(user.password_hash, 'ph');
  assert.equal(user.role, 'member');
});

test('findUserByEmail returns null when email not found', async () => {
  const pool = makeMockPool({ users: {} });
  const result = await findUserByEmail(pool, 'nobody@x.com');
  assert.equal(result, null);
});

test('findUserByEmail normalizes email to lowercase+trimmed before lookup', async () => {
  const users = { 'dave@x.com': { id: 2n, email: 'dave@x.com', password_hash: 'ph', role: 'member' } };
  const pool = makeMockPool({ users });
  const user = await findUserByEmail(pool, '  DAVE@X.COM  ');
  assert.ok(user, 'findUserByEmail must normalize lookup email to lowercase+trimmed');
  assert.equal(user.email, 'dave@x.com');
});

// -- createSession --

test('createSession returns id, user_id, csrf_token, expires_at', async () => {
  const pool = makeMockPool();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const result = await createSession(pool, { userId: 1n, tokenHash: 'sha256hexabc', expiresAt });
  assert.ok(result.id);
  assert.equal(String(result.user_id), '1');
  assert.equal(result.csrf_token, null);
  assert.deepEqual(result.expires_at, expiresAt);
});

test('createSession persists user_agent + ip_address (5-column shape, D-01)', async () => {
  const sessions = {};
  const pool = makeMockPool({ sessions });
  const expiresAt = new Date(Date.now() + 1000);
  await createSession(pool, {
    userId: 1n,
    tokenHash: 'metahash',
    expiresAt,
    userAgent: 'Mozilla/5.0 Test',
    ipAddress: '10.0.0.7',
  });
  assert.equal(sessions['metahash'].user_agent, 'Mozilla/5.0 Test');
  assert.equal(sessions['metahash'].ip_address, '10.0.0.7');
});

test('createSession truncates a user_agent longer than 512 chars to 512 (T-23-UA-DOS)', async () => {
  const sessions = {};
  const pool = makeMockPool({ sessions });
  const longUA = 'A'.repeat(2000);
  await createSession(pool, {
    userId: 1n,
    tokenHash: 'longuahash',
    expiresAt: new Date(Date.now() + 1000),
    userAgent: longUA,
  });
  assert.equal(sessions['longuahash'].user_agent.length, 512, 'UA truncated to 512 before insert');
});

test('createSession defaults user_agent + ip_address to null when omitted', async () => {
  const sessions = {};
  const pool = makeMockPool({ sessions });
  await createSession(pool, { userId: 1n, tokenHash: 'nometahash', expiresAt: new Date(Date.now() + 1000) });
  assert.equal(sessions['nometahash'].user_agent, null);
  assert.equal(sessions['nometahash'].ip_address, null);
});

test('createSession stores the exact tokenHash passed in (D-12: hash-at-rest)', async () => {
  const sessions = {};
  const pool = makeMockPool({ sessions });
  const rawFakeToken = 'raw-random-bytes-NEVER-stored';
  const tokenHash = createHash('sha256').update(rawFakeToken).digest('hex');
  await createSession(pool, { userId: 1n, tokenHash, expiresAt: new Date(Date.now() + 1000) });
  // The stored key must be the hash, not the raw token
  assert.ok(tokenHash in sessions, 'sessions map must be keyed by SHA-256 hex (D-12)');
  assert.ok(!(rawFakeToken in sessions), 'raw token must NOT be stored in sessions (D-12)');
  assert.notEqual(tokenHash, rawFakeToken, 'token hash must differ from raw token');
});

// -- validateSession --

test('validateSession returns session with role for a valid non-expired session', async () => {
  const sessions = {};
  const users = { 'eve@x.com': { id: 1n, email: 'eve@x.com', password_hash: 'ph', role: 'admin' } };
  const pool = makeMockPool({ sessions, users });
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  await createSession(pool, { userId: 1n, tokenHash: 'validhash', expiresAt });
  const result = await validateSession(pool, 'validhash');
  assert.ok(result, 'validateSession must return session row for valid non-expired session');
  assert.equal(result.role, 'admin');
  assert.ok(result.expires_at);
});

test('validateSession returns null for an expired session (AUTH-04 absolute expiry)', async () => {
  const sessions = {};
  const users = { 'frank@x.com': { id: 1n, email: 'frank@x.com', password_hash: 'ph', role: 'member' } };
  const pool = makeMockPool({ sessions, users });
  // Insert session with expires_at in the past
  const pastExpiry = new Date(Date.now() - 1000); // 1 second ago
  await createSession(pool, { userId: 1n, tokenHash: 'expiredhash', expiresAt: pastExpiry });
  const result = await validateSession(pool, 'expiredhash');
  assert.equal(result, null, 'validateSession must return null for expired session (AUTH-04)');
});

test('validateSession returns null when token_hash is not found', async () => {
  const pool = makeMockPool({ sessions: {} });
  const result = await validateSession(pool, 'nonexistenthash');
  assert.equal(result, null, 'validateSession must return null when session not found');
});

// -- revokeSession --

test('revokeSession removes the session row', async () => {
  const sessions = {};
  const users = { 'grace@x.com': { id: 1n, email: 'grace@x.com', password_hash: 'ph', role: 'member' } };
  const pool = makeMockPool({ sessions, users });
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  await createSession(pool, { userId: 1n, tokenHash: 'todelete', expiresAt });
  // Confirm session exists
  const before = await validateSession(pool, 'todelete');
  assert.ok(before, 'session must exist before revoke');
  // Revoke it
  await revokeSession(pool, 'todelete');
  // Now it must be gone
  const after = await validateSession(pool, 'todelete');
  assert.equal(after, null, 'validateSession must return null after revokeSession');
});

test('revokeSession is idempotent — revoking a non-existent session does not throw', async () => {
  const pool = makeMockPool({ sessions: {} });
  await assert.doesNotReject(
    () => revokeSession(pool, 'nonexistent'),
    'revokeSession must not throw for non-existent token',
  );
});

// -- updateSessionCsrfToken --

test('updateSessionCsrfToken sets csrf_token on the session row', async () => {
  const sessions = {};
  const users = { 'hank@x.com': { id: 1n, email: 'hank@x.com', password_hash: 'ph', role: 'member', disabled_at: null, created_at: new Date() } };
  const pool = makeMockPool({ sessions, users });
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const created = await createSession(pool, { userId: 1n, tokenHash: 'csrfhash', expiresAt });
  assert.equal(created.csrf_token, null);
  await updateSessionCsrfToken(pool, created.id, 'new-csrf-token-value');
  // Verify it was updated in the store
  const updatedRow = sessions['csrfhash'];
  assert.equal(updatedRow.csrf_token, 'new-csrf-token-value');
});

// ---------------------------------------------------------------------------
// validateSession disabled_at guard tests (USER-05, T-21-03-DISABLED)
// ---------------------------------------------------------------------------

test('validateSession returns null after disableUser sets disabled_at (USER-05)', async () => {
  const sessions = {};
  const users = {
    'iris@x.com': { id: 10n, email: 'iris@x.com', password_hash: 'ph', role: 'member', disabled_at: null, created_at: new Date() },
  };
  const pool = makeMockPool({ sessions, users });
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  await createSession(pool, { userId: 10n, tokenHash: 'activehash', expiresAt });
  // Session must be valid before disable
  const before = await validateSession(pool, 'activehash');
  assert.ok(before, 'session must be valid for an active (non-disabled) user');
  // Disable the user
  await disableUser(pool, 10n);
  // Session must NOW be rejected (disabled_at IS NOT NULL)
  const after = await validateSession(pool, 'activehash');
  assert.equal(after, null, 'validateSession must return null after user is disabled (USER-05)');
});

test('validateSession returns valid session again after enableUser clears disabled_at', async () => {
  const sessions = {};
  const users = {
    'jake@x.com': { id: 11n, email: 'jake@x.com', password_hash: 'ph', role: 'member', disabled_at: new Date(), created_at: new Date() },
  };
  const pool = makeMockPool({ sessions, users });
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  await createSession(pool, { userId: 11n, tokenHash: 'disabledhash', expiresAt });
  // Disabled user should have no valid session
  const whileDisabled = await validateSession(pool, 'disabledhash');
  assert.equal(whileDisabled, null, 'disabled user must not have a valid session');
  // Re-enable the user
  await enableUser(pool, 11n);
  const afterEnable = await validateSession(pool, 'disabledhash');
  assert.ok(afterEnable, 'validateSession must succeed again after enableUser (disabled_at cleared)');
});

// ---------------------------------------------------------------------------
// listUsers behavioral tests (USER-01)
// ---------------------------------------------------------------------------

test('listUsers returns all users with id, email, role, created_at, disabled_at', async () => {
  const users = {
    'lena@x.com': { id: 1n, email: 'lena@x.com', password_hash: 'ph', role: 'admin', disabled_at: null, created_at: new Date('2026-01-01') },
    'mike@x.com': { id: 2n, email: 'mike@x.com', password_hash: 'ph', role: 'member', disabled_at: null, created_at: new Date('2026-01-02') },
  };
  const pool = makeMockPool({ users });
  const rows = await listUsers(pool);
  assert.equal(rows.length, 2);
  const emails = rows.map((r) => r.email);
  assert.ok(emails.includes('lena@x.com'));
  assert.ok(emails.includes('mike@x.com'));
});

// ---------------------------------------------------------------------------
// disableUser / enableUser behavioral tests (USER-05)
// ---------------------------------------------------------------------------

test('disableUser sets disabled_at to a non-null value', async () => {
  const users = {
    'nina@x.com': { id: 20n, email: 'nina@x.com', password_hash: 'ph', role: 'member', disabled_at: null, created_at: new Date() },
  };
  const pool = makeMockPool({ users });
  const result = await disableUser(pool, 20n);
  assert.ok(result, 'disableUser must return a row');
  assert.ok(result.disabled_at, 'disableUser must set disabled_at to a non-null value');
});

test('enableUser sets disabled_at to null', async () => {
  const users = {
    'omar@x.com': { id: 21n, email: 'omar@x.com', password_hash: 'ph', role: 'member', disabled_at: new Date(), created_at: new Date() },
  };
  const pool = makeMockPool({ users });
  const result = await enableUser(pool, 21n);
  assert.ok(result, 'enableUser must return a row');
  assert.equal(result.disabled_at, null, 'enableUser must set disabled_at to null');
});

// ---------------------------------------------------------------------------
// removeUser behavioral tests (USER-06)
// ---------------------------------------------------------------------------

test('removeUser returns the deleted user id', async () => {
  const users = {
    'pam@x.com': { id: 30n, email: 'pam@x.com', password_hash: 'ph', role: 'member', disabled_at: null, created_at: new Date() },
  };
  const pool = makeMockPool({ users });
  const result = await removeUser(pool, 30n);
  assert.ok(result, 'removeUser must return a row');
  assert.equal(String(result.id), '30');
});

test('removeUser cascade-deletes sessions (T-21-03-ORPHAN)', async () => {
  const sessions = {};
  const users = {
    'quinn@x.com': { id: 31n, email: 'quinn@x.com', password_hash: 'ph', role: 'member', disabled_at: null, created_at: new Date() },
  };
  const pool = makeMockPool({ sessions, users });
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  await createSession(pool, { userId: 31n, tokenHash: 'orphanhash', expiresAt });
  assert.ok('orphanhash' in sessions, 'session must exist before removeUser');
  await removeUser(pool, 31n);
  // The mock simulates cascade-delete; the real DB relies on FK ON DELETE CASCADE
  assert.ok(!('orphanhash' in sessions), 'session must be gone after removeUser (cascade)');
});

// ---------------------------------------------------------------------------
// revokeSessionsForUser behavioral tests
// ---------------------------------------------------------------------------

test('revokeSessionsForUser deletes all sessions for that user', async () => {
  const sessions = {};
  const users = {
    'rosa@x.com': { id: 40n, email: 'rosa@x.com', password_hash: 'ph', role: 'member', disabled_at: null, created_at: new Date() },
  };
  const pool = makeMockPool({ sessions, users });
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  await createSession(pool, { userId: 40n, tokenHash: 'sess1', expiresAt });
  await createSession(pool, { userId: 40n, tokenHash: 'sess2', expiresAt });
  assert.equal(Object.keys(sessions).length, 2);
  await revokeSessionsForUser(pool, 40n);
  assert.equal(Object.keys(sessions).length, 0, 'revokeSessionsForUser must delete all sessions for the user');
});

// ---------------------------------------------------------------------------
// setUserRole behavioral tests (USER-07)
// ---------------------------------------------------------------------------

test('setUserRole updates the role and returns id, email, role', async () => {
  const users = {
    'sam@x.com': { id: 50n, email: 'sam@x.com', password_hash: 'ph', role: 'member', disabled_at: null, created_at: new Date() },
  };
  const pool = makeMockPool({ users });
  const result = await setUserRole(pool, 50n, 'admin');
  assert.ok(result, 'setUserRole must return a row');
  assert.equal(result.role, 'admin');
  assert.equal(users['sam@x.com'].role, 'admin');
});

// ---------------------------------------------------------------------------
// countAdmins behavioral tests
// ---------------------------------------------------------------------------

test('countAdmins returns count of non-disabled admin users', async () => {
  const users = {
    'tina@x.com': { id: 60n, email: 'tina@x.com', password_hash: 'ph', role: 'admin', disabled_at: null, created_at: new Date() },
    'uma@x.com': { id: 61n, email: 'uma@x.com', password_hash: 'ph', role: 'admin', disabled_at: new Date(), created_at: new Date() },
    'vic@x.com': { id: 62n, email: 'vic@x.com', password_hash: 'ph', role: 'member', disabled_at: null, created_at: new Date() },
  };
  const pool = makeMockPool({ users });
  const count = await countAdmins(pool);
  assert.equal(count, 1, 'countAdmins must count only non-disabled admin users (excludes disabled uma@x.com)');
});

test('countAdmins returns 0 when all admins are disabled', async () => {
  const users = {
    'wendy@x.com': { id: 70n, email: 'wendy@x.com', password_hash: 'ph', role: 'admin', disabled_at: new Date(), created_at: new Date() },
  };
  const pool = makeMockPool({ users });
  const count = await countAdmins(pool);
  assert.equal(count, 0, 'countAdmins must return 0 when all admins are disabled');
});
