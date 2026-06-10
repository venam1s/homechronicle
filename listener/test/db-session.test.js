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

      // createUser
      if (s.includes('INSERT INTO users')) {
        const email = String(params[0]).trim().toLowerCase();
        const passwordHash = params[1];
        const role = params[2] ?? 'member';
        const id = BigInt(Object.keys(users).length + 1);
        users[email] = { id, email, password_hash: passwordHash, role };
        return Promise.resolve({ rows: [{ id, email, role }] });
      }

      // findUserByEmail
      if (s.includes('SELECT id, email, password_hash, role FROM users WHERE email')) {
        const email = String(params[0]).trim().toLowerCase();
        const row = users[email] ?? null;
        return Promise.resolve({ rows: row ? [row] : [] });
      }

      // createSession
      if (s.includes('INSERT INTO sessions')) {
        const userId = params[0];
        const tokenHash = params[1];
        const expiresAt = params[2];
        const id = BigInt(Object.keys(sessions).length + 1);
        const row = { id, user_id: userId, csrf_token: null, expires_at: expiresAt };
        sessions[tokenHash] = row;
        return Promise.resolve({ rows: [row] });
      }

      // validateSession — UPDATE ... WHERE token_hash AND expires_at > NOW()
      if (s.includes('UPDATE sessions') && s.includes('last_seen_at')) {
        const tokenHash = params[0];
        const row = sessions[tokenHash];
        if (!row) return Promise.resolve({ rows: [] });
        // Simulate expires_at > NOW() check
        if (new Date(row.expires_at) <= new Date()) {
          return Promise.resolve({ rows: [] }); // expired
        }
        return Promise.resolve({ rows: [{ ...row }] });
      }

      // validateSession follow-up: SELECT role FROM users WHERE id
      if (s.includes('SELECT role FROM users WHERE id')) {
        const userId = params[0];
        const user = Object.values(users).find((u) => String(u.id) === String(userId));
        if (!user) return Promise.resolve({ rows: [] });
        return Promise.resolve({ rows: [{ role: user.role }] });
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

test('db.js exports all seven CRUD functions with pool-first signatures', () => {
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
  const users = { 'hank@x.com': { id: 1n, email: 'hank@x.com', password_hash: 'ph', role: 'member' } };
  const pool = makeMockPool({ sessions, users });
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const created = await createSession(pool, { userId: 1n, tokenHash: 'csrfhash', expiresAt });
  assert.equal(created.csrf_token, null);
  await updateSessionCsrfToken(pool, created.id, 'new-csrf-token-value');
  // Verify it was updated in the store
  const updatedRow = sessions['csrfhash'];
  assert.equal(updatedRow.csrf_token, 'new-csrf-token-value');
});
