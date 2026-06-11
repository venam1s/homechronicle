/**
 * db-invites.test.js — Unit tests for invite + password-reset-token CRUD in db.js
 *
 * Requirements covered:
 *   USER-01 — listInvites() returns pending invite records for the admin panel
 *   USER-03 — redeemInvite() is atomic (UPDATE WHERE used_at IS NULL RETURNING);
 *             second call on same token returns null (no double-use)
 *   USER-04 — revokeInvite() sets status='revoked'; redeeming afterward returns null
 *   PWD-03  — redeemResetToken() is atomic; second call returns null;
 *             expired token returns null (1h TTL enforced by expires_at>NOW())
 *
 * Uses mock pools (no live DB) following the db-session.test.js pattern.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  createInvite,
  findInviteByEmail,
  listInvites,
  revokeInvite,
  redeemInvite,
  createPasswordResetToken,
  redeemResetToken,
} from '../src/db.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dbSource = readFileSync(join(__dirname, '../src/db.js'), 'utf8');
const migrationSource = readFileSync(
  join(__dirname, '../migrations/0004_invites_reset_tokens.sql'),
  'utf8',
);

// ---------------------------------------------------------------------------
// Helper: build a mock pool for invite + reset-token CRUD
// ---------------------------------------------------------------------------

/**
 * Returns a mock pool that handles SQL patterns for invite and
 * password_reset_token tables. In-memory stores keyed for easy lookup.
 */
function makeMockPool({ invites = {}, resetTokens = {} } = {}) {
  let nextInviteId = BigInt(Object.keys(invites).length + 1);
  let nextTokenId = BigInt(Object.keys(resetTokens).length + 1);

  return {
    query(sql, params) {
      const s = sql.trim();

      // createInvite
      if (s.includes('INSERT INTO invites')) {
        const email = params[0];
        const tokenHash = params[1];
        const role = params[2] ?? 'member';
        const invitedBy = params[3] ?? null;
        const expiresAt = params[4];
        const id = nextInviteId++;
        const row = {
          id,
          email,
          token_hash: tokenHash,
          role,
          status: 'pending',
          invited_by: invitedBy,
          created_at: new Date(),
          expires_at: expiresAt,
          used_at: null,
        };
        invites[tokenHash] = row;
        return Promise.resolve({
          rows: [{ id: row.id, email: row.email, role: row.role, expires_at: row.expires_at }],
        });
      }

      // findInviteByEmail
      if (s.includes('SELECT') && s.includes('FROM invites') && s.includes('WHERE email')) {
        const email = params[0];
        const rows = Object.values(invites).filter(
          (r) => r.email === email && r.status === 'pending',
        );
        return Promise.resolve({ rows });
      }

      // listInvites
      if (
        s.includes('SELECT') &&
        s.includes('FROM invites') &&
        !s.includes('WHERE') &&
        s.includes('ORDER BY')
      ) {
        const rows = Object.values(invites)
          .filter((r) => r.status === 'pending' && new Date(r.expires_at) > new Date())
          .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
        return Promise.resolve({ rows });
      }

      // revokeInvite — UPDATE invites SET status='revoked' WHERE id=$1 AND status='pending'
      if (s.includes('UPDATE invites') && s.includes("status='revoked'")) {
        const inviteId = params[0];
        const row = Object.values(invites).find(
          (r) => String(r.id) === String(inviteId) && r.status === 'pending',
        );
        if (!row) return Promise.resolve({ rows: [] });
        row.status = 'revoked';
        return Promise.resolve({ rows: [{ id: row.id }] });
      }

      // redeemInvite — atomic UPDATE WHERE status='pending' AND expires_at>NOW() AND used_at IS NULL
      if (s.includes('UPDATE invites') && s.includes('used_at IS NULL')) {
        const tokenHash = params[0];
        const row = invites[tokenHash];
        if (!row) return Promise.resolve({ rows: [] });
        if (row.status !== 'pending') return Promise.resolve({ rows: [] });
        if (new Date(row.expires_at) <= new Date()) return Promise.resolve({ rows: [] });
        if (row.used_at !== null) return Promise.resolve({ rows: [] });
        // Atomic: set used_at + status
        row.used_at = new Date();
        row.status = 'accepted';
        return Promise.resolve({ rows: [{ id: row.id, email: row.email, role: row.role }] });
      }

      // createPasswordResetToken
      if (s.includes('INSERT INTO password_reset_tokens')) {
        const userId = params[0];
        const tokenHash = params[1];
        const expiresAt = params[2];
        const id = nextTokenId++;
        const row = {
          id,
          user_id: userId,
          token_hash: tokenHash,
          created_at: new Date(),
          expires_at: expiresAt,
          used_at: null,
        };
        resetTokens[tokenHash] = row;
        return Promise.resolve({ rows: [{ id: row.id }] });
      }

      // redeemResetToken — atomic UPDATE WHERE expires_at>NOW() AND used_at IS NULL
      if (s.includes('UPDATE password_reset_tokens') && s.includes('used_at IS NULL')) {
        const tokenHash = params[0];
        const row = resetTokens[tokenHash];
        if (!row) return Promise.resolve({ rows: [] });
        if (new Date(row.expires_at) <= new Date()) return Promise.resolve({ rows: [] });
        if (row.used_at !== null) return Promise.resolve({ rows: [] });
        // Atomic: set used_at
        row.used_at = new Date();
        return Promise.resolve({ rows: [{ id: row.id, user_id: row.user_id }] });
      }

      return Promise.reject(new Error(`Unexpected SQL in mock pool: ${s.slice(0, 80)}`));
    },
  };
}

// ---------------------------------------------------------------------------
// Source-inspection tests
// ---------------------------------------------------------------------------

test('db.js exports createInvite with pool-first signature', () => {
  assert.ok(
    dbSource.includes('export async function createInvite(pool'),
    'db.js must export createInvite(pool, ...) with pool as first arg',
  );
});

test('db.js exports redeemInvite with pool-first signature', () => {
  assert.ok(
    dbSource.includes('export async function redeemInvite(pool'),
    'db.js must export redeemInvite(pool, ...) with pool as first arg',
  );
});

test('db.js exports redeemResetToken with pool-first signature', () => {
  assert.ok(
    dbSource.includes('export async function redeemResetToken(pool'),
    'db.js must export redeemResetToken(pool, ...) with pool as first arg',
  );
});

test('redeemInvite SQL uses used_at IS NULL (atomic single-use guard, USER-03)', () => {
  assert.ok(
    dbSource.includes('used_at IS NULL'),
    'redeemInvite must guard with used_at IS NULL for atomic single-use (USER-03)',
  );
});

test('redeemResetToken SQL uses used_at IS NULL (atomic single-use guard, PWD-03)', () => {
  // Verified via the presence of used_at IS NULL in the source (both functions share this guard)
  const count = (dbSource.match(/used_at IS NULL/g) ?? []).length;
  assert.ok(
    count >= 2,
    'Both redeemInvite and redeemResetToken must use used_at IS NULL (PWD-03)',
  );
});

test('db.js never calls generateToken — token hashing happens in callers, not db (T-21-03-TOKENLEAK)', () => {
  assert.equal(
    (dbSource.match(/generateToken/g) ?? []).length,
    0,
    'db.js must NOT call generateToken — raw tokens must never touch the db layer',
  );
});

test('migration 0004 invites table has token_hash UNIQUE (T-21-03-TOKENLEAK)', () => {
  assert.ok(
    migrationSource.includes('token_hash') && migrationSource.includes('UNIQUE'),
    'migration 0004 must declare token_hash UNIQUE on invites table',
  );
});

test('migration 0004 password_reset_tokens has used_at column', () => {
  assert.ok(
    migrationSource.includes('used_at'),
    'migration 0004 password_reset_tokens must include used_at column',
  );
});

test('migration 0004 password_reset_tokens has ON DELETE CASCADE for user_id (T-21-03-ORPHAN)', () => {
  assert.ok(
    migrationSource.includes('ON DELETE CASCADE'),
    'migration 0004 password_reset_tokens must declare ON DELETE CASCADE on user_id FK',
  );
});

// ---------------------------------------------------------------------------
// createInvite behavioral tests
// ---------------------------------------------------------------------------

test('createInvite inserts and returns id, email, role', async () => {
  const pool = makeMockPool();
  const expiresAt = new Date(Date.now() + 72 * 60 * 60 * 1000);
  const result = await createInvite(pool, {
    email: 'alice@example.com',
    tokenHash: 'sha256hashoftoken',
    role: 'member',
    invitedBy: 1n,
    expiresAt,
  });
  assert.ok(result.id, 'createInvite must return id');
  assert.equal(result.email, 'alice@example.com');
  assert.equal(result.role, 'member');
});

test('createInvite defaults role to member when not specified', async () => {
  const pool = makeMockPool();
  const expiresAt = new Date(Date.now() + 72 * 60 * 60 * 1000);
  const result = await createInvite(pool, {
    email: 'bob@example.com',
    tokenHash: 'anotherhash',
    expiresAt,
  });
  assert.equal(result.role, 'member');
});

// ---------------------------------------------------------------------------
// findInviteByEmail behavioral tests
// ---------------------------------------------------------------------------

test('findInviteByEmail returns pending invite when found', async () => {
  const invites = {};
  const pool = makeMockPool({ invites });
  const expiresAt = new Date(Date.now() + 72 * 60 * 60 * 1000);
  await createInvite(pool, { email: 'carol@example.com', tokenHash: 'hash1', expiresAt });
  const result = await findInviteByEmail(pool, 'carol@example.com');
  assert.ok(result, 'findInviteByEmail must return the pending invite');
});

test('findInviteByEmail returns null when no pending invite exists', async () => {
  const pool = makeMockPool({ invites: {} });
  const result = await findInviteByEmail(pool, 'nobody@example.com');
  assert.equal(result, null, 'findInviteByEmail must return null when not found');
});

// ---------------------------------------------------------------------------
// listInvites behavioral tests (USER-01)
// ---------------------------------------------------------------------------

test('listInvites returns pending non-expired invites', async () => {
  const pool = makeMockPool();
  const expiresAt = new Date(Date.now() + 72 * 60 * 60 * 1000);
  await createInvite(pool, { email: 'dave@example.com', tokenHash: 'h1', expiresAt });
  await createInvite(pool, { email: 'eve@example.com', tokenHash: 'h2', expiresAt });
  const rows = await listInvites(pool);
  assert.equal(rows.length, 2);
});

test('listInvites excludes expired invites', async () => {
  const pool = makeMockPool();
  const futureExpiry = new Date(Date.now() + 72 * 60 * 60 * 1000);
  const pastExpiry = new Date(Date.now() - 1000);
  await createInvite(pool, { email: 'future@example.com', tokenHash: 'hfuture', expiresAt: futureExpiry });
  await createInvite(pool, { email: 'past@example.com', tokenHash: 'hpast', expiresAt: pastExpiry });
  const rows = await listInvites(pool);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].email, 'future@example.com');
});

// ---------------------------------------------------------------------------
// revokeInvite behavioral tests (USER-04)
// ---------------------------------------------------------------------------

test('revokeInvite sets status=revoked on a pending invite', async () => {
  const invites = {};
  const pool = makeMockPool({ invites });
  const expiresAt = new Date(Date.now() + 72 * 60 * 60 * 1000);
  const created = await createInvite(pool, { email: 'frank@example.com', tokenHash: 'htok1', expiresAt });
  const result = await revokeInvite(pool, created.id);
  assert.ok(result, 'revokeInvite must return the invite row when successful');
  assert.equal(String(result.id), String(created.id));
  // Verify status changed in store
  const inv = Object.values(invites).find((r) => String(r.id) === String(created.id));
  assert.equal(inv.status, 'revoked');
});

test('revokeInvite returns null when invite is already revoked', async () => {
  const invites = {};
  const pool = makeMockPool({ invites });
  const expiresAt = new Date(Date.now() + 72 * 60 * 60 * 1000);
  const created = await createInvite(pool, { email: 'grace@example.com', tokenHash: 'htok2', expiresAt });
  await revokeInvite(pool, created.id);
  // Second revoke attempt
  const result = await revokeInvite(pool, created.id);
  assert.equal(result, null, 'revokeInvite must return null when invite is not pending');
});

// ---------------------------------------------------------------------------
// redeemInvite atomic single-use tests (USER-03)
// ---------------------------------------------------------------------------

test('redeemInvite first call on valid pending token returns id, email, role', async () => {
  const pool = makeMockPool();
  const expiresAt = new Date(Date.now() + 72 * 60 * 60 * 1000);
  await createInvite(pool, { email: 'hank@example.com', tokenHash: 'redeemhash1', expiresAt });
  const result = await redeemInvite(pool, 'redeemhash1');
  assert.ok(result, 'redeemInvite must return {id, email, role} on first redemption');
  assert.equal(result.email, 'hank@example.com');
  assert.ok(result.id);
  assert.ok(result.role);
});

test('redeemInvite SECOND call on same token returns null (atomic single-use proof, USER-03)', async () => {
  const pool = makeMockPool();
  const expiresAt = new Date(Date.now() + 72 * 60 * 60 * 1000);
  await createInvite(pool, { email: 'ida@example.com', tokenHash: 'redeemhash2', expiresAt });
  const first = await redeemInvite(pool, 'redeemhash2');
  assert.ok(first, 'first redemption must succeed');
  const second = await redeemInvite(pool, 'redeemhash2');
  assert.equal(second, null, 'SECOND redeemInvite on same token MUST return null (atomic single-use)');
});

test('redeemInvite on expired token returns null', async () => {
  const pool = makeMockPool();
  const pastExpiry = new Date(Date.now() - 1000);
  await createInvite(pool, { email: 'jack@example.com', tokenHash: 'expiredinvite', expiresAt: pastExpiry });
  const result = await redeemInvite(pool, 'expiredinvite');
  assert.equal(result, null, 'redeemInvite on expired token must return null');
});

test('redeemInvite on revoked invite returns null', async () => {
  const invites = {};
  const pool = makeMockPool({ invites });
  const expiresAt = new Date(Date.now() + 72 * 60 * 60 * 1000);
  const created = await createInvite(pool, { email: 'kate@example.com', tokenHash: 'revokedinvite', expiresAt });
  await revokeInvite(pool, created.id);
  const result = await redeemInvite(pool, 'revokedinvite');
  assert.equal(result, null, 'redeemInvite on revoked invite must return null');
});

test('redeemInvite on unknown token returns null', async () => {
  const pool = makeMockPool({ invites: {} });
  const result = await redeemInvite(pool, 'nonexistenttoken');
  assert.equal(result, null, 'redeemInvite on unknown token must return null');
});

// ---------------------------------------------------------------------------
// createPasswordResetToken behavioral tests
// ---------------------------------------------------------------------------

test('createPasswordResetToken inserts and returns id', async () => {
  const pool = makeMockPool();
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1h TTL
  const result = await createPasswordResetToken(pool, {
    userId: 1n,
    tokenHash: 'resethash1',
    expiresAt,
  });
  assert.ok(result.id, 'createPasswordResetToken must return id');
});

// ---------------------------------------------------------------------------
// redeemResetToken atomic single-use tests (PWD-03)
// ---------------------------------------------------------------------------

test('redeemResetToken first call on valid token returns id, user_id', async () => {
  const pool = makeMockPool();
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
  await createPasswordResetToken(pool, { userId: 1n, tokenHash: 'redeemreset1', expiresAt });
  const result = await redeemResetToken(pool, 'redeemreset1');
  assert.ok(result, 'redeemResetToken must return {id, user_id} on first redemption');
  assert.ok(result.id);
  assert.equal(String(result.user_id), '1');
});

test('redeemResetToken SECOND call on same token returns null (atomic single-use proof, PWD-03)', async () => {
  const pool = makeMockPool();
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
  await createPasswordResetToken(pool, { userId: 2n, tokenHash: 'redeemreset2', expiresAt });
  const first = await redeemResetToken(pool, 'redeemreset2');
  assert.ok(first, 'first reset token redemption must succeed');
  const second = await redeemResetToken(pool, 'redeemreset2');
  assert.equal(second, null, 'SECOND redeemResetToken on same token MUST return null (atomic single-use)');
});

test('redeemResetToken on already-expired token returns null (PWD-03 1h TTL)', async () => {
  const pool = makeMockPool();
  const pastExpiry = new Date(Date.now() - 1000); // expired 1 second ago
  await createPasswordResetToken(pool, { userId: 3n, tokenHash: 'expiredreset', expiresAt: pastExpiry });
  const result = await redeemResetToken(pool, 'expiredreset');
  assert.equal(result, null, 'redeemResetToken on expired token must return null (1h TTL enforcement)');
});

test('redeemResetToken on unknown token returns null', async () => {
  const pool = makeMockPool({ resetTokens: {} });
  const result = await redeemResetToken(pool, 'nonexistentresettoken');
  assert.equal(result, null, 'redeemResetToken on unknown token must return null');
});
