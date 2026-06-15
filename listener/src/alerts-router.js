import express from 'express';
import rateLimit from 'express-rate-limit';
import { parseIntInRange } from './utils.js';
import { log } from './logger.js';
import { validateWebhookTargetUrl, rateLimitKeyGenerator, requireAdminSession } from './security.js';

const VALID_SCOPE_TYPES = new Set(['all', 'room', 'accessory', 'characteristic']);
const VALID_OPERATORS = new Set(['equals', 'not_equals', 'contains']);
const VALID_EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function parseScopeType(value) {
  const scopeType = String(value ?? 'all').trim().toLowerCase();
  return VALID_SCOPE_TYPES.has(scopeType) ? scopeType : null;
}

function parseOperator(value) {
  const operator = String(value ?? 'equals').trim().toLowerCase();
  return VALID_OPERATORS.has(operator) ? operator : null;
}

function validateTargetEmail(value) {
  const email = String(value ?? '').trim().toLowerCase();
  if (!email) return { error: 'target_email is required for channel=email' };
  // Length check before regex to avoid ReDoS on megabyte-length strings (L-12b)
  if (email.length > 254) return { error: 'target_email is too long' };
  if (!VALID_EMAIL_RE.test(email)) return { error: 'target_email must be a valid email address' };
  return { value: email };
}

function parseQuietMinutes(value, fallback = 0) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed)) return fallback;
  if (parsed < 0 || parsed > 10080) return null;
  return parsed;
}

const ALERTS_ALLOW_PRIVATE_TARGETS = /^(1|true|yes|on)$/i.test(
  process.env.ALERTS_ALLOW_PRIVATE_TARGETS ?? 'true'
);

const ALERTS_READ_RATE_LIMIT_WINDOW_MS = parseIntInRange(
  process.env.ALERTS_READ_RATE_LIMIT_WINDOW_MS,
  60_000,
  1_000,
  24 * 60 * 60 * 1000
);
const ALERTS_READ_RATE_LIMIT_MAX = parseIntInRange(
  process.env.ALERTS_READ_RATE_LIMIT_MAX,
  180,
  1,
  100_000
);
const ALERTS_WRITE_RATE_LIMIT_WINDOW_MS = parseIntInRange(
  process.env.ALERTS_WRITE_RATE_LIMIT_WINDOW_MS,
  60_000,
  1_000,
  24 * 60 * 60 * 1000
);
const ALERTS_WRITE_RATE_LIMIT_MAX = parseIntInRange(
  process.env.ALERTS_WRITE_RATE_LIMIT_MAX,
  60,
  1,
  100_000
);

function validateCreate(body = {}) {
  const name = String(body.name ?? '').trim();
  if (!name) return { error: 'name is required' };

  const scopeType = parseScopeType(body.scopeType);
  if (!scopeType) return { error: 'scopeType must be one of: all, room, accessory, characteristic' };

  const scopeValue = String(body.scopeValue ?? '').trim();
  if (scopeType !== 'all' && !scopeValue) return { error: 'scopeValue is required for this scopeType' };

  const characteristic = String(body.characteristic ?? '').trim() || null;
  const operator = parseOperator(body.operator);
  if (!operator) return { error: 'operator must be one of: equals, not_equals, contains' };

  const matchValue = String(body.matchValue ?? '').trim();
  if (!matchValue) return { error: 'matchValue is required' };

  const channel = String(body.channel ?? 'webhook').trim().toLowerCase();
  if (channel !== 'webhook' && channel !== 'email') {
    return { error: 'channel must be webhook or email' };
  }

  let targetUrl = null;
  let targetEmail = null;

  if (channel === 'webhook') {
    const target = validateWebhookTargetUrl(body.targetUrl, {
      allowPrivateTargets: ALERTS_ALLOW_PRIVATE_TARGETS,
    });
    if (!target.ok) return { error: target.error };
    targetUrl = target.normalizedUrl;
  } else {
    const emailResult = validateTargetEmail(body.targetEmail);
    if (emailResult.error) return { error: emailResult.error };
    targetEmail = emailResult.value;
  }

  const quietMinutes = parseQuietMinutes(body.quietMinutes, 0);
  if (quietMinutes === null) return { error: 'quietMinutes must be an integer between 0 and 10080' };

  const enabled = body.enabled === undefined ? true : Boolean(body.enabled);
  return {
    value: {
      name,
      enabled,
      scopeType,
      scopeValue: scopeType === 'all' ? null : scopeValue,
      characteristic,
      operator,
      matchValue,
      channel,
      targetUrl,
      targetEmail,
      quietMinutes,
    },
  };
}

function validatePatch(body = {}) {
  const updates = {};
  if ('name' in body) {
    const name = String(body.name ?? '').trim();
    if (!name) return { error: 'name cannot be empty' };
    updates.name = name;
  }
  if ('enabled' in body) {
    updates.enabled = Boolean(body.enabled);
  }
  if ('scopeType' in body) {
    const scopeType = parseScopeType(body.scopeType);
    if (!scopeType) return { error: 'scopeType must be one of: all, room, accessory, characteristic' };
    updates.scopeType = scopeType;
  }
  if ('scopeValue' in body) {
    updates.scopeValue = String(body.scopeValue ?? '').trim();
  }
  if ('characteristic' in body) {
    updates.characteristic = String(body.characteristic ?? '').trim() || null;
  }
  if ('operator' in body) {
    const operator = parseOperator(body.operator);
    if (!operator) return { error: 'operator must be one of: equals, not_equals, contains' };
    updates.operator = operator;
  }
  if ('matchValue' in body) {
    const matchValue = String(body.matchValue ?? '').trim();
    if (!matchValue) return { error: 'matchValue cannot be empty' };
    updates.matchValue = matchValue;
  }
  if ('targetUrl' in body) {
    const target = validateWebhookTargetUrl(body.targetUrl, {
      allowPrivateTargets: ALERTS_ALLOW_PRIVATE_TARGETS,
    });
    if (!target.ok) return { error: target.error };
    updates.targetUrl = target.normalizedUrl;
  }
  if ('channel' in body) {
    const channel = String(body.channel ?? '').trim().toLowerCase();
    if (channel !== 'webhook' && channel !== 'email') {
      return { error: 'channel must be webhook or email' };
    }
    updates.channel = channel;
  }
  if ('targetEmail' in body) {
    const emailResult = validateTargetEmail(body.targetEmail);
    if (emailResult.error) return { error: emailResult.error };
    updates.targetEmail = emailResult.value;
  }
  if ('quietMinutes' in body) {
    const quietMinutes = parseQuietMinutes(body.quietMinutes, 0);
    if (quietMinutes === null) return { error: 'quietMinutes must be an integer between 0 and 10080' };
    updates.quietMinutes = quietMinutes;
  }

  const nextScopeType = updates.scopeType;
  const nextScopeValue = updates.scopeValue;
  if (nextScopeType && nextScopeType !== 'all' && nextScopeValue !== undefined && !nextScopeValue.trim()) {
    return { error: 'scopeValue is required for this scopeType' };
  }
  if (nextScopeType === 'all') {
    updates.scopeValue = null;
  }

  // Channel-switch field clearing: keep chk_alert_channel_fields satisfiable on PATCH
  if (updates.channel === 'email') {
    updates.targetUrl = null;
    if (!updates.targetEmail) {
      return { error: 'target_email is required when switching to email channel' };
    }
  }
  if (updates.channel === 'webhook') {
    updates.targetEmail = null;
  }

  if (!Object.keys(updates).length) return { error: 'No valid fields provided to update' };
  return { value: updates };
}

function toApiRule(row) {
  return {
    id: row.id,
    name: row.name,
    enabled: row.enabled,
    scopeType: row.scope_type,
    scopeValue: row.scope_value,
    characteristic: row.characteristic,
    operator: row.operator,
    matchValue: row.match_value,
    targetUrl: row.target_url,
    channel: row.channel ?? 'webhook',
    targetEmail: row.target_email ?? null,
    quietMinutes: row.quiet_minutes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// A Postgres CHECK-constraint violation (SQLSTATE 23514) on the per-channel
// field rules means the client supplied an invalid channel/field combination —
// e.g. switching an existing email rule (whose target_url is NULL) to the
// webhook channel without supplying a target URL. The blind partial UPDATE in
// PATCH (and the INSERT in POST) cannot see the row's prior state, so the DB is
// the authoritative validator here. Map it to a 400 instead of leaking a 500.
function isChannelFieldViolation(err) {
  return Boolean(
    err &&
      err.code === '23514' &&
      (err.constraint === 'chk_alert_channel_fields' || err.constraint === 'chk_alert_channel')
  );
}

const CHANNEL_FIELD_ERROR =
  'Webhook rules require a target URL and email rules require a recipient email';

export function createAlertsRouter({ pool, isEmailEnabled = () => true }) {
  const router = express.Router();
  const alertsReadLimiter = rateLimit({
    windowMs: ALERTS_READ_RATE_LIMIT_WINDOW_MS,
    max: ALERTS_READ_RATE_LIMIT_MAX,
    standardHeaders: true,
    legacyHeaders: false,
    validate: false,
    keyGenerator: rateLimitKeyGenerator,
    message: { error: 'Too many requests' },
  });
  const alertsWriteLimiter = rateLimit({
    windowMs: ALERTS_WRITE_RATE_LIMIT_WINDOW_MS,
    max: ALERTS_WRITE_RATE_LIMIT_MAX,
    standardHeaders: true,
    legacyHeaders: false,
    validate: false,
    keyGenerator: rateLimitKeyGenerator,
    message: { error: 'Too many requests' },
  });

  // GET /rules — returns only the calling session's own rules (D-07, MALERT-01)
  router.get('/rules', alertsReadLimiter, async (req, res) => {
    const uid = req.hcSession?.user_id;
    if (!uid) return res.json([]);
    try {
      const result = await pool.query(
        `SELECT id, name, enabled, scope_type, scope_value, characteristic,
                operator, match_value, target_url, target_email, channel,
                quiet_minutes, created_at, updated_at
         FROM alert_rules
         WHERE user_id = $1
         ORDER BY updated_at DESC, id DESC`,
        [uid]
      );
      res.json(result.rows.map((row) => {
        const rule = toApiRule(row);
        delete rule.targetUrl; // webhook URL redaction preserved (L-1)
        // targetEmail NOT deleted — returned in plaintext (D-08)
        return rule;
      }));
    } catch (err) {
      log.error('[api] /api/alerts/rules error:', err.message ?? err.stack ?? err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // POST /rules — any authenticated session; user_id sourced from session (D-07)
  router.post('/rules', alertsWriteLimiter, async (req, res) => {
    // Inline session guard (D-06): reject service-token-only callers (no req.hcSession)
    if (!req.hcSession?.user_id) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const parsed = validateCreate(req.body);
    if (parsed.error) return res.status(400).json({ error: parsed.error });

    // SMTP guard (D-09): reject email channel when SMTP is not configured
    if (parsed.value.channel === 'email' && !isEmailEnabled()) {
      return res.status(400).json({ error: 'Email channel unavailable — SMTP is not configured' });
    }

    // Member email lock (D-08): force target_email to session email for every
    // non-admin role (fail-closed — a future non-admin role must not be able to
    // set an arbitrary recipient; today the role universe is {admin, member}).
    if (req.hcSession.role !== 'admin' && parsed.value.channel === 'email') {
      parsed.value.targetEmail = req.hcSession.email;
    }

    try {
      const result = await pool.query(
        `INSERT INTO alert_rules
           (name, enabled, scope_type, scope_value, characteristic, operator, match_value,
            channel, target_url, target_email, quiet_minutes, user_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
         RETURNING id, name, enabled, scope_type, scope_value, characteristic,
                   operator, match_value, channel, target_url, target_email,
                   quiet_minutes, created_at, updated_at`,
        [
          parsed.value.name,
          parsed.value.enabled,
          parsed.value.scopeType,
          parsed.value.scopeValue,
          parsed.value.characteristic,
          parsed.value.operator,
          parsed.value.matchValue,
          parsed.value.channel,
          parsed.value.targetUrl,
          parsed.value.targetEmail,
          parsed.value.quietMinutes,
          req.hcSession.user_id, // $12 — owner; never sourced from req.body (D-07)
        ]
      );
      const created = toApiRule(result.rows[0]);
      delete created.targetUrl; // redact webhook URL from write response (L-1)
      res.status(201).json(created);
    } catch (err) {
      if (isChannelFieldViolation(err)) {
        return res.status(400).json({ error: CHANNEL_FIELD_ERROR });
      }
      log.error('[api] /api/alerts/rules create error:', err.message ?? err.stack ?? err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // PATCH /rules/:id — IDOR-safe: WHERE id=$N AND user_id=$M (D-07, MALERT-04)
  router.patch('/rules/:id', alertsWriteLimiter, async (req, res) => {
    // Inline session guard (D-06): reject service-token-only callers (no req.hcSession)
    if (!req.hcSession?.user_id) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const ruleId = Number.parseInt(String(req.params.id ?? ''), 10);
    if (!Number.isFinite(ruleId) || ruleId < 1) {
      return res.status(400).json({ error: 'Invalid rule id' });
    }

    const parsed = validatePatch(req.body);
    if (parsed.error) return res.status(400).json({ error: parsed.error });

    // SMTP guard (D-09): reject email channel when SMTP is not configured
    const effectiveChannel = parsed.value.channel;
    if (effectiveChannel === 'email' && !isEmailEnabled()) {
      return res.status(400).json({ error: 'Email channel unavailable — SMTP is not configured' });
    }

    // Member email lock (D-08): force target_email to session email for members.
    // Lock fires when channel is being set to 'email' OR when targetEmail is in the
    // patch body (even without a channel field). A member can never set any address
    // but their own — patching targetEmail on an already-email rule without re-sending
    // the channel field is the bypass vector that T-26-EMAIL-SPOOF covers.
    if (req.hcSession.role !== 'admin' && (effectiveChannel === 'email' || 'targetEmail' in parsed.value)) {
      parsed.value.targetEmail = req.hcSession.email;
    }

    const fields = [];
    const params = [];
    const map = {
      name: 'name',
      enabled: 'enabled',
      scopeType: 'scope_type',
      scopeValue: 'scope_value',
      characteristic: 'characteristic',
      operator: 'operator',
      matchValue: 'match_value',
      targetUrl: 'target_url',
      channel: 'channel',
      targetEmail: 'target_email',
      quietMinutes: 'quiet_minutes',
    };
    for (const [key, value] of Object.entries(parsed.value)) {
      params.push(value);
      fields.push(`${map[key]} = $${params.length}`);
    }
    // IDOR-safe WHERE: require both id match AND ownership (D-07)
    params.push(ruleId);
    const idParam = params.length;
    params.push(req.hcSession.user_id);
    const uidParam = params.length;

    try {
      const result = await pool.query(
        `UPDATE alert_rules
         SET ${fields.join(', ')}, updated_at = NOW()
         WHERE id = $${idParam} AND user_id = $${uidParam}
         RETURNING id, name, enabled, scope_type, scope_value, characteristic,
                   operator, match_value, channel, target_url, target_email,
                   quiet_minutes, created_at, updated_at`,
        params
      );
      if (!result.rows.length) return res.status(404).json({ error: 'Rule not found' });
      const patched = toApiRule(result.rows[0]);
      delete patched.targetUrl; // redact webhook URL from write response (L-1)
      res.json(patched);
    } catch (err) {
      if (isChannelFieldViolation(err)) {
        return res.status(400).json({ error: CHANNEL_FIELD_ERROR });
      }
      log.error('[api] /api/alerts/rules patch error:', err.message ?? err.stack ?? err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // DELETE /rules/:id — IDOR-safe: WHERE id=$1 AND user_id=$2 (D-07, MALERT-04)
  router.delete('/rules/:id', alertsWriteLimiter, async (req, res) => {
    // Inline session guard (D-06): reject service-token-only callers (no req.hcSession)
    if (!req.hcSession?.user_id) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const ruleId = Number.parseInt(String(req.params.id ?? ''), 10);
    if (!Number.isFinite(ruleId) || ruleId < 1) {
      return res.status(400).json({ error: 'Invalid rule id' });
    }
    try {
      const result = await pool.query(
        'DELETE FROM alert_rules WHERE id = $1 AND user_id = $2',
        [ruleId, req.hcSession.user_id]
      );
      if (!result.rowCount) return res.status(404).json({ error: 'Rule not found' });
      res.json({ success: true });
    } catch (err) {
      log.error('[api] /api/alerts/rules delete error:', err.message ?? err.stack ?? err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // GET /deliveries — scoped to deliveries whose rule is owned by the session user (D-05, D-07)
  router.get('/deliveries', alertsReadLimiter, async (req, res) => {
    const uid = req.hcSession?.user_id;
    const page = parseIntInRange(req.query.page, 1, 1, 1_000_000);
    const limit = parseIntInRange(req.query.limit, 50, 1, 200);
    const offset = (page - 1) * limit;

    try {
      const countResult = await pool.query(
        `SELECT COUNT(*)::int AS total
         FROM alert_deliveries d
         JOIN alert_rules r ON r.id = d.rule_id
         WHERE r.user_id = $1`,
        [uid]
      );
      const total = countResult.rows[0]?.total ?? 0;
      const result = await pool.query(
        `SELECT d.id, d.rule_id, d.event_id, d.status, d.target_url, d.channel, d.recipient,
                d.response_code, d.error, d.sent_at, r.name AS rule_name
         FROM alert_deliveries d
         JOIN alert_rules r ON r.id = d.rule_id
         WHERE r.user_id = $1
         ORDER BY d.sent_at DESC, d.id DESC
         LIMIT $2 OFFSET $3`,
        [uid, limit, offset]
      );
      res.json({
        total,
        page,
        limit,
        pages: Math.ceil(total / limit),
        deliveries: result.rows.map((row) => ({
          id: row.id,
          ruleId: row.rule_id,
          ruleName: row.rule_name,
          eventId: row.event_id,
          status: row.status,
          channel: row.channel ?? 'webhook',
          // targetUrl intentionally omitted: webhook URLs may contain secrets (L-1)
          recipient: row.recipient ?? null,
          responseCode: row.response_code,
          error: row.error,
          sentAt: row.sent_at,
        })),
      });
    } catch (err) {
      log.error('[api] /api/alerts/deliveries error:', err.message ?? err.stack ?? err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  return router;
}
