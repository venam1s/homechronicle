import express from 'express';
import rateLimit from 'express-rate-limit';
import { log } from './logger.js';
import { rateLimitKeyGenerator, generateToken, hashToken } from './security.js';
import {
  listUsers,
  disableUser,
  enableUser,
  removeUser,
  revokeSessionsForUser,
  setUserRole,
  countAdmins,
  createInvite,
  findInviteByEmail,
  listInvites,
  revokeInvite,
  findUserByEmail,
} from './db.js';

// Advisory lock key for admin-guard operations (Pitfall 7 / T-21-06-LASTADMIN).
// Two concurrent admin mutations (disable/remove/demote last admin) serialize behind
// this transaction-scoped advisory lock — only one passes the count check.
const ADMIN_GUARD_LOCK_KEY = 20_240_002;

// Valid roles for invite
const VALID_ROLES = new Set(['admin', 'member']);

// Invite TTL (72 hours per D-11)
const INVITE_TTL_MS = 72 * 3_600_000;

/**
 * createUsersRouter — admin-only /api/users surface.
 *
 * Routes:
 *   GET  /                   — list all users (USER-01)
 *   GET  /invites            — list pending invites (USER-07)
 *   POST /invite             — create invite + email link (USER-02, D-10)
 *   DELETE /invites/:id      — revoke invite (USER-04)
 *   POST /invites/:id/resend — re-mint token + re-email (D-13)
 *   PATCH /:id               — disable/enable/setRole (USER-05, USER-06, D-06, D-09)
 *   DELETE /:id              — remove user (USER-06, D-06)
 *
 * @param {object} deps
 * @param {import('pg').Pool} deps.pool
 * @param {Function} deps.sendInvite — async (email, inviteUrl, opts) → void
 * @param {Function} deps.isEmailEnabled — () → boolean
 * @param {string} deps.appBaseUrl — base URL for invite links (e.g. 'https://app.example.com')
 */
export function createUsersRouter({ pool, sendInvite, isEmailEnabled, appBaseUrl }) {
  const router = express.Router();

  // Per-router write limiter for admin mutations (T-21-06-INVITEFLOOD)
  const usersWriteLimiter = rateLimit({
    windowMs: 60_000,
    max: 60,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: rateLimitKeyGenerator,
  });

  // -- requireAdmin helper --
  // Returns true and continues if the session is admin.
  // Returns false after sending 401/403 — caller must return immediately.
  function requireAdmin(req, res) {
    if (!req.hcSession) {
      res.status(401).json({ error: 'Unauthorized' });
      return false;
    }
    if (req.hcSession.role !== 'admin') {
      res.status(403).json({ error: 'Forbidden' });
      return false;
    }
    return true;
  }

  // -- GET / — list all users (USER-01) --
  router.get('/', async (req, res) => {
    try {
      if (!requireAdmin(req, res)) return;
      const rows = await listUsers(pool);
      res.json(rows.map((row) => ({
        id: row.id,
        email: row.email,
        role: row.role,
        status: row.disabled_at ? 'disabled' : 'active',
      })));
    } catch (err) {
      log.error('[api] GET /api/users error:', err.message ?? err.stack ?? err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // -- GET /invites — list pending invites (USER-07) --
  router.get('/invites', async (req, res) => {
    try {
      if (!requireAdmin(req, res)) return;
      const rows = await listInvites(pool);
      res.json(rows.map((row) => ({
        id: row.id,
        email: row.email,
        role: row.role,
        status: row.status,
        expiresAt: row.expires_at,
      })));
    } catch (err) {
      log.error('[api] GET /api/users/invites error:', err.message ?? err.stack ?? err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // -- POST /invite — create invite (USER-02, D-10, D-11) --
  router.post('/invite', usersWriteLimiter, async (req, res) => {
    try {
      if (!requireAdmin(req, res)) return;

      const email = String(req.body?.email ?? '').trim().toLowerCase();
      const role = String(req.body?.role ?? 'member').trim().toLowerCase();

      if (!email) {
        return res.status(400).json({ error: 'email is required' });
      }
      if (!VALID_ROLES.has(role)) {
        return res.status(400).json({ error: 'role must be admin or member' });
      }

      // Check for existing account
      const existingUser = await findUserByEmail(pool, email);
      if (existingUser) {
        return res.status(400).json({ error: 'An account with this email already exists.' });
      }

      // Check for existing pending invite
      const existingInvite = await findInviteByEmail(pool, email);
      if (existingInvite) {
        return res.status(400).json({
          error: 'A pending invite for this email already exists. You can resend or revoke it.',
        });
      }

      // Mint a fresh token (raw stays in URL; hash stored in DB — T-21-06-TOKENLEAK)
      const raw = generateToken();
      const tokenHash = hashToken(raw);
      const expiresAt = new Date(Date.now() + INVITE_TTL_MS);

      await createInvite(pool, {
        email,
        tokenHash,
        role,
        invitedBy: req.hcSession.userId,
        expiresAt,
      });

      const inviteUrl = `${appBaseUrl}/accept-invite?token=${raw}`;

      // Email the invite — fire-and-forget with caught failure (D-10: link ALWAYS returned)
      let emailed = false;
      if (isEmailEnabled()) {
        try {
          await sendInvite(email, inviteUrl, { from: undefined });
          emailed = true;
        } catch (emailErr) {
          log.error('[api] POST /api/users/invite sendInvite failed:', emailErr.message ?? emailErr);
        }
      }

      // Always return the copyable link (D-10 / EMAIL-03 degradation)
      res.json({ inviteUrl, emailed, email });
    } catch (err) {
      log.error('[api] POST /api/users/invite error:', err.message ?? err.stack ?? err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // -- DELETE /invites/:id — revoke invite (USER-04) --
  router.delete('/invites/:id', usersWriteLimiter, async (req, res) => {
    try {
      if (!requireAdmin(req, res)) return;
      const inviteId = Number(req.params.id);
      const result = await revokeInvite(pool, inviteId);
      if (!result) {
        return res.status(404).json({ error: 'Invite not found or already handled' });
      }
      res.json({ ok: true });
    } catch (err) {
      log.error('[api] DELETE /api/users/invites/:id error:', err.message ?? err.stack ?? err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // -- POST /invites/:id/resend — re-mint token + re-email (D-13) --
  router.post('/invites/:id/resend', usersWriteLimiter, async (req, res) => {
    try {
      if (!requireAdmin(req, res)) return;
      const inviteId = Number(req.params.id);

      // Revoke the old invite and get its email/role for the new one
      const old = await revokeInvite(pool, inviteId);
      if (!old) {
        return res.status(404).json({ error: 'Invite not found or already handled' });
      }

      // Mint a fresh token with reset expiry (D-13)
      const raw = generateToken();
      const tokenHash = hashToken(raw);
      const expiresAt = new Date(Date.now() + INVITE_TTL_MS);

      await createInvite(pool, {
        email: old.email,
        tokenHash,
        role: old.role,
        invitedBy: req.hcSession.userId,
        expiresAt,
      });

      const inviteUrl = `${appBaseUrl}/accept-invite?token=${raw}`;

      let emailed = false;
      if (isEmailEnabled()) {
        try {
          await sendInvite(old.email, inviteUrl, { from: undefined });
          emailed = true;
        } catch (emailErr) {
          log.error('[api] POST /api/users/invites/:id/resend sendInvite failed:', emailErr.message ?? emailErr);
        }
      }

      res.json({ inviteUrl, emailed, email: old.email });
    } catch (err) {
      log.error('[api] POST /api/users/invites/:id/resend error:', err.message ?? err.stack ?? err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // -- PATCH /:id — disable/enable/setRole (USER-05, USER-06, D-06, D-09) --
  router.patch('/:id', usersWriteLimiter, async (req, res) => {
    try {
      if (!requireAdmin(req, res)) return;
      const targetId = Number(req.params.id);
      const action = String(req.body?.action ?? '').trim();

      // Self guard — acting admin cannot disable/remove self (D-06)
      if (action === 'disable' || action === 'setRole') {
        // For disable: self-modification blocked entirely
        // For setRole: self-demotion allowed only when another admin exists (handled below)
        if (action === 'disable' && req.hcSession.userId === targetId) {
          return res.status(400).json({ error: 'You cannot disable your own account.' });
        }
      }

      if (action === 'enable') {
        // enable: no guard needed — re-enable a disabled user
        const updated = await enableUser(pool, targetId);
        return res.json({ ok: true, user: updated });
      }

      if (action === 'disable') {
        // Disable + revoke sessions — guarded by advisory lock + last-admin check
        const client = await pool.connect();
        try {
          await client.query('BEGIN');
          await client.query('SELECT pg_advisory_xact_lock($1)', [ADMIN_GUARD_LOCK_KEY]);

          // Last-admin guard applies ONLY when the target is itself an admin —
          // disabling a member must never be blocked by the admin count.
          const targetRow = await client.query(
            `SELECT role FROM users WHERE id = $1`,
            [targetId],
          );
          if ((targetRow.rows[0]?.role) === 'admin') {
            const countResult = await client.query(
              `SELECT COUNT(*)::int AS count FROM users WHERE role = 'admin' AND disabled_at IS NULL`,
            );
            const adminCount = countResult.rows[0]?.count ?? 0;
            if (adminCount <= 1) {
              await client.query('ROLLBACK').catch(() => {});
              return res.status(400).json({ error: 'Cannot disable the only admin account.' });
            }
          }

          const updated = await client.query(
            `UPDATE users SET disabled_at = NOW() WHERE id = $1 RETURNING id, role, disabled_at`,
            [targetId],
          );
          await client.query(
            `DELETE FROM sessions WHERE user_id = $1`,
            [targetId],
          );
          await client.query('COMMIT');
          return res.json({ ok: true, user: updated.rows[0] ?? null });
        } catch (txErr) {
          await client.query('ROLLBACK').catch(() => {});
          throw txErr;
        } finally {
          client.release();
        }
      }

      if (action === 'setRole') {
        const newRole = String(req.body?.role ?? '').trim().toLowerCase();
        if (!VALID_ROLES.has(newRole)) {
          return res.status(400).json({ error: 'role must be admin or member' });
        }

        if (newRole === 'member') {
          // Demoting — need to check last-admin guard under lock
          const client = await pool.connect();
          try {
            await client.query('BEGIN');
            await client.query('SELECT pg_advisory_xact_lock($1)', [ADMIN_GUARD_LOCK_KEY]);

            const countResult = await client.query(
              `SELECT COUNT(*)::int AS count FROM users WHERE role = 'admin' AND disabled_at IS NULL`,
            );
            const adminCount = countResult.rows[0]?.count ?? 0;
            if (adminCount <= 1) {
              await client.query('ROLLBACK').catch(() => {});
              return res.status(400).json({ error: 'Cannot demote the only admin account.' });
            }

            const updated = await client.query(
              `UPDATE users SET role = $1 WHERE id = $2 RETURNING id, email, role`,
              [newRole, targetId],
            );
            await client.query('COMMIT');
            return res.json({ ok: true, user: updated.rows[0] ?? null });
          } catch (txErr) {
            await client.query('ROLLBACK').catch(() => {});
            throw txErr;
          } finally {
            client.release();
          }
        }

        // Promoting to admin — no guard needed
        const updated = await setUserRole(pool, targetId, newRole);
        return res.json({ ok: true, user: updated });
      }

      return res.status(400).json({ error: 'action must be disable, enable, or setRole' });
    } catch (err) {
      log.error('[api] PATCH /api/users/:id error:', err.message ?? err.stack ?? err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // -- DELETE /:id — remove user (USER-06, D-06) --
  router.delete('/:id', usersWriteLimiter, async (req, res) => {
    try {
      if (!requireAdmin(req, res)) return;
      const targetId = Number(req.params.id);

      // Self guard — acting admin cannot remove self (D-06)
      if (req.hcSession.userId === targetId) {
        return res.status(400).json({ error: 'You cannot remove your own account.' });
      }

      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query('SELECT pg_advisory_xact_lock($1)', [ADMIN_GUARD_LOCK_KEY]);

        // Last-admin guard applies ONLY when the target is itself an admin —
        // removing a member must never be blocked by the admin count.
        const targetRow = await client.query(
          `SELECT role FROM users WHERE id = $1`,
          [targetId],
        );
        if ((targetRow.rows[0]?.role) === 'admin') {
          const countResult = await client.query(
            `SELECT COUNT(*)::int AS count FROM users WHERE role = 'admin' AND disabled_at IS NULL`,
          );
          const adminCount = countResult.rows[0]?.count ?? 0;
          if (adminCount <= 1) {
            await client.query('ROLLBACK').catch(() => {});
            return res.status(400).json({ error: 'Cannot remove the only admin account.' });
          }
        }

        await client.query(`DELETE FROM users WHERE id = $1`, [targetId]);
        await client.query('COMMIT');
        return res.json({ ok: true });
      } catch (txErr) {
        await client.query('ROLLBACK').catch(() => {});
        throw txErr;
      } finally {
        client.release();
      }
    } catch (err) {
      log.error('[api] DELETE /api/users/:id error:', err.message ?? err.stack ?? err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  return router;
}
