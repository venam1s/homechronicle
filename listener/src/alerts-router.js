import express from 'express';
import rateLimit from 'express-rate-limit';
import { parseIntInRange } from './utils.js';
import { log } from './logger.js';
import { validateWebhookTargetUrl, rateLimitKeyGenerator, requireAdminSession } from './security.js';
import { parseNumericValue, QUIET_OPERATOR } from './alerts.js';
import { QUIET_MIN_HOURS, QUIET_MAX_HOURS } from './quiet-alerts.js';

const VALID_SCOPE_TYPES = new Set(['all', 'room', 'accessory', 'characteristic']);
const VALID_OPERATORS = new Set(['equals', 'not_equals', 'contains', 'above', 'below', 'silent_for']);
const THRESHOLD_OPERATORS = new Set(['above', 'below']);
const OPERATOR_ERROR = 'operator must be one of: equals, not_equals, contains, above, below, silent_for';
const THRESHOLD_NUMBER_ERROR = 'matchValue must be a number for above/below rules';
const QUIET_HOURS_ERROR = `matchValue must be a number of hours between ${QUIET_MIN_HOURS} and ${QUIET_MAX_HOURS} for silent_for rules`;

function isValidQuietHours(value) {
  const hours = parseNumericValue(value);
  return hours !== null && hours >= QUIET_MIN_HOURS && hours <= QUIET_MAX_HOURS;
}

/**
 * Rules the operator puts on the rest of the rule — shared by create and by
 * PATCH, which checks the stored row merged with the patch.
 * @returns {string|null} error message, or null when the shape is valid
 */
function ruleShapeError({ operator, matchValue, characteristic, scopeType }) {
  if (THRESHOLD_OPERATORS.has(operator)) {
    if (parseNumericValue(matchValue) === null) return THRESHOLD_NUMBER_ERROR;
    // Without a characteristic the rule would compare every numeric reading
    // (battery %, brightness, light level) against the same threshold.
    if (!characteristic && scopeType !== 'characteristic') {
      return 'above/below rules need a characteristic to compare (e.g. CurrentTemperature)';
    }
  }
  if (operator === QUIET_OPERATOR && !isValidQuietHours(matchValue)) return QUIET_HOURS_ERROR;
  return null;
}

// Fields whose combination ruleShapeError checks.
const SHAPE_FIELDS = ['operator', 'matchValue', 'characteristic', 'scopeType'];
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

// API-L-4: name / scopeValue / matchValue / characteristic flow into the
// outbound webhook payload and email subject; cap all four so a household
// member cannot stuff an oversized string into either channel.
const MAX_TEXT_LEN = 200;

// M-3: per-user and household ceilings on the number of alert rules, so a
// single member cannot turn the listener into an unbounded outbound POST
// relay or a delivery-row firehose simply by creating enough rules.
const ALERTS_MAX_RULES_PER_USER = parseIntInRange(
  process.env.ALERTS_MAX_RULES_PER_USER,
  25,
  1,
  10_000
);
const ALERTS_MAX_RULES_TOTAL = parseIntInRange(
  process.env.ALERTS_MAX_RULES_TOTAL,
  100,
  1,
  100_000
);

function textCapError(field) {
  return { error: `${field} must be ${MAX_TEXT_LEN} characters or fewer` };
}

function validateCreate(body = {}, { defaultQuietMinutes = 0 } = {}) {
  const name = String(body.name ?? '').trim();
  if (!name) return { error: 'name is required' };
  if (name.length > MAX_TEXT_LEN) return textCapError('name');

  const scopeType = parseScopeType(body.scopeType);
  if (!scopeType) return { error: 'scopeType must be one of: all, room, accessory, characteristic' };

  const scopeValue = String(body.scopeValue ?? '').trim();
  if (scopeType !== 'all' && !scopeValue) return { error: 'scopeValue is required for this scopeType' };
  if (scopeValue.length > MAX_TEXT_LEN) return textCapError('scopeValue');

  const characteristic = String(body.characteristic ?? '').trim() || null;
  if (characteristic && characteristic.length > MAX_TEXT_LEN) return textCapError('characteristic');
  const operator = parseOperator(body.operator);
  if (!operator) return { error: OPERATOR_ERROR };

  const matchValue = String(body.matchValue ?? '').trim();
  if (!matchValue) return { error: 'matchValue is required' };
  if (matchValue.length > MAX_TEXT_LEN) return textCapError('matchValue');

  const shapeError = ruleShapeError({ operator, matchValue, characteristic, scopeType });
  if (shapeError) return { error: shapeError };

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

  // A rule created without a quiet period gets the household default from
  // Settings › Configuration › Data management.
  const quietMinutes = parseQuietMinutes(body.quietMinutes, defaultQuietMinutes);
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
    if (name.length > MAX_TEXT_LEN) return textCapError('name');
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
    const scopeValue = String(body.scopeValue ?? '').trim();
    if (scopeValue.length > MAX_TEXT_LEN) return textCapError('scopeValue');
    updates.scopeValue = scopeValue;
  }
  if ('characteristic' in body) {
    const characteristic = String(body.characteristic ?? '').trim() || null;
    if (characteristic && characteristic.length > MAX_TEXT_LEN) return textCapError('characteristic');
    updates.characteristic = characteristic;
  }
  if ('operator' in body) {
    const operator = parseOperator(body.operator);
    if (!operator) return { error: OPERATOR_ERROR };
    updates.operator = operator;
  }
  if ('matchValue' in body) {
    const matchValue = String(body.matchValue ?? '').trim();
    if (!matchValue) return { error: 'matchValue cannot be empty' };
    if (matchValue.length > MAX_TEXT_LEN) return textCapError('matchValue');
    updates.matchValue = matchValue;
  }
  // The operator/threshold/characteristic combination is checked in the route,
  // against the stored row merged with this patch (ruleShapeError).
  if ('targetUrl' in body) {
    const target = validateWebhookTargetUrl(body.targetUrl, {
      allowPrivateTargets: ALERTS_ALLOW_PRIVATE_TARGETS,
    });
    if (!target.ok) return { error: target.error };
    updates.targetUrl = target.normalizedUrl;
  }
  // AUTH-L-4: resolve channel BEFORE targetEmail so the webhook branch below
  // can see it. Order matters: previously targetEmail was validated before
  // the channel-switch clearing at the bottom of this function ran, so a
  // stray or malformed targetEmail 400'd a request that was about to null
  // the field out anyway (e.g. {channel:'webhook', targetEmail:'x@y.z'}).
  if ('channel' in body) {
    const channel = String(body.channel ?? '').trim().toLowerCase();
    if (channel !== 'webhook' && channel !== 'email') {
      return { error: 'channel must be webhook or email' };
    }
    updates.channel = channel;
  }
  if ('targetEmail' in body) {
    if (updates.channel === 'webhook') {
      // Switching to webhook clears target_email unconditionally — do not
      // validate a value that is about to be discarded (AUTH-L-4).
      updates.targetEmail = null;
    } else {
      const emailResult = validateTargetEmail(body.targetEmail);
      if (emailResult.error) return { error: emailResult.error };
      updates.targetEmail = emailResult.value;
    }
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

export function createAlertsRouter({ pool, isEmailEnabled = () => true, getDefaultQuietMinutes = () => 0 }) {
  const router = express.Router();

  // AUTH-L-2: a caller with no req.hcSession is either an AUTH_ENABLED=false
  // legacy token-only deployment, or a service-token-only caller under
  // AUTH_ENABLED=true. requireAdminSession (security.js:108-113) already
  // treats a sessionless caller as admin-grade on every other admin-gated
  // router (setup, matter, archive, retention, repair); with AUTH_ENABLED=true
  // nginx injects no X-API-Token (SEC-07 gating in
  // web/docker-entrypoint.d/15-compute-api-token.envsh), so a sessionless
  // token caller is by construction the deployment owner. This deliberately
  // supersedes Phase 26's D-06 "reject service-token-only callers with 401"
  // for the alerts router specifically — see quick-260830-1qj SUMMARY for
  // the full rationale.
  const isLegacyAdmin = (req) => !req.hcSession?.user_id;

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

  // GET /rules — returns only the calling session's own rules (D-07, MALERT-01),
  // or every rule in the household when ?scope=all is requested by an admin (M-1).
  router.get('/rules', alertsReadLimiter, async (req, res) => {
    const scopeAll = String(req.query.scope ?? '').toLowerCase() === 'all';
    const legacy = isLegacyAdmin(req);
    if (scopeAll || legacy) {
      // Inline admin guard (mirrors requireAdminSession semantics from
      // security.js:108-113) rather than route middleware: the unit tests
      // invoke the last route handler directly, so middleware would be
      // invisible to them, and mounting it as middleware would also gate the
      // owner-scoped branch below.
      if (req.hcSession && req.hcSession.role !== 'admin') {
        return res.status(403).json({ error: 'Forbidden' });
      }
      try {
        const result = await pool.query(
          `SELECT r.id AS id, r.name AS name, r.enabled AS enabled, r.scope_type AS scope_type,
                  r.scope_value AS scope_value, r.characteristic AS characteristic,
                  r.operator AS operator, r.match_value AS match_value, r.target_url AS target_url,
                  r.target_email AS target_email, r.channel AS channel, r.quiet_minutes AS quiet_minutes,
                  r.created_at AS created_at, r.updated_at AS updated_at,
                  r.user_id AS owner_user_id, u.email AS owner_email,
                  (u.disabled_at IS NOT NULL) AS owner_disabled
           FROM alert_rules r
           LEFT JOIN users u ON u.id = r.user_id
           ORDER BY r.updated_at DESC, r.id DESC`
        );
        return res.json(result.rows.map((row) => {
          const rule = toApiRule(row);
          delete rule.targetUrl; // webhook URL redaction preserved (L-1)
          rule.ownerUserId = row.owner_user_id ?? null;
          rule.ownerEmail = row.owner_email ?? null;
          rule.ownerDisabled = Boolean(row.owner_disabled);
          return rule;
        }));
      } catch (err) {
        log.error('[api] /api/alerts/rules?scope=all error:', err.message ?? err.stack ?? err);
        return res.status(500).json({ error: 'Internal server error' });
      }
    }

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

  // POST /rules — any authenticated session, or a legacy/service-token caller
  // (AUTH-L-2); user_id sourced from session (D-07), NULL for legacy callers
  router.post('/rules', alertsWriteLimiter, async (req, res) => {
    const legacy = isLegacyAdmin(req);
    const ownerId = legacy ? null : req.hcSession.user_id;

    const parsed = validateCreate(req.body, { defaultQuietMinutes: getDefaultQuietMinutes() });
    if (parsed.error) return res.status(400).json({ error: parsed.error });

    // SMTP guard (D-09): reject email channel when SMTP is not configured
    if (parsed.value.channel === 'email' && !isEmailEnabled()) {
      return res.status(400).json({ error: 'Email channel unavailable — SMTP is not configured' });
    }

    // Member email lock (D-08): force target_email to session email for every
    // non-admin role (fail-closed — a future non-admin role must not be able to
    // set an arbitrary recipient; today the role universe is {admin, member}).
    // Guarded on req.hcSession so a legacy/sessionless caller is never treated
    // as a member here (AUTH-L-2).
    if (req.hcSession && req.hcSession.role !== 'admin' && parsed.value.channel === 'email') {
      parsed.value.targetEmail = req.hcSession.email;
    }

    try {
      // M-3: per-user and household rule caps, checked in the same round trip
      // to keep POST /rules a single extra query. Caps apply to admins too.
      // IS NOT DISTINCT FROM (not =) so the per-user cap also applies to the
      // legacy NULL-owner bucket (AUTH-L-2) — plain `=` never matches NULL.
      const capCheck = await pool.query(
        `SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE user_id IS NOT DISTINCT FROM $1)::int AS mine
         FROM alert_rules`,
        [ownerId]
      );
      const { total, mine } = capCheck.rows[0];
      if (mine >= ALERTS_MAX_RULES_PER_USER) {
        return res.status(400).json({
          error: `Rule limit reached (max ${ALERTS_MAX_RULES_PER_USER} rules per user)`,
        });
      }
      if (total >= ALERTS_MAX_RULES_TOTAL) {
        return res.status(400).json({
          error: `Household rule limit reached (max ${ALERTS_MAX_RULES_TOTAL} rules)`,
        });
      }

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
          ownerId, // $12 — owner; never sourced from req.body (D-07); NULL for legacy callers (AUTH-L-2)
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

  // PATCH /rules/:id — IDOR-safe: WHERE id=$N AND user_id=$M (D-07, MALERT-04),
  // or ownerless for a legacy/service-token caller (AUTH-L-2)
  router.patch('/rules/:id', alertsWriteLimiter, async (req, res) => {
    const legacy = isLegacyAdmin(req);

    const ruleId = Number.parseInt(String(req.params.id ?? ''), 10);
    if (!Number.isFinite(ruleId) || ruleId < 1) {
      return res.status(400).json({ error: 'Invalid rule id' });
    }

    const parsed = validatePatch(req.body);
    if (parsed.error) return res.status(400).json({ error: parsed.error });

    // A patch that touches the operator, threshold, characteristic or scope must
    // leave a valid rule: check the stored row with the patch applied, so e.g.
    // {operator:'above'} alone can't produce a threshold rule with no
    // characteristic. Same ownership scope as the UPDATE below.
    if (SHAPE_FIELDS.some((field) => field in parsed.value)) {
      try {
        const current = legacy
          ? await pool.query(
              'SELECT operator, match_value, characteristic, scope_type FROM alert_rules WHERE id = $1',
              [ruleId]
            )
          : await pool.query(
              'SELECT operator, match_value, characteristic, scope_type FROM alert_rules WHERE id = $1 AND user_id = $2',
              [ruleId, req.hcSession.user_id]
            );
        const row = current.rows[0];
        if (!row) return res.status(404).json({ error: 'Rule not found' });
        const shapeError = ruleShapeError({
          operator: parsed.value.operator ?? row.operator,
          matchValue: parsed.value.matchValue ?? row.match_value,
          characteristic: 'characteristic' in parsed.value ? parsed.value.characteristic : row.characteristic,
          scopeType: parsed.value.scopeType ?? row.scope_type,
        });
        if (shapeError) return res.status(400).json({ error: shapeError });
      } catch (err) {
        log.error('[api] /api/alerts/rules patch error:', err.message ?? err.stack ?? err);
        return res.status(500).json({ error: 'Internal server error' });
      }
    }

    // SMTP guard (D-09): reject email channel when SMTP is not configured
    const effectiveChannel = parsed.value.channel;
    if (effectiveChannel === 'email' && !isEmailEnabled()) {
      return res.status(400).json({ error: 'Email channel unavailable — SMTP is not configured' });
    }

    // Member email lock (D-08): force target_email to session email for members.
    // Lock fires when the effective channel IS or REMAINS email: either the
    // channel is being set to 'email', or no channel field was sent but
    // targetEmail is in the patch body (T-26-EMAIL-SPOOF bypass vector).
    // Deliberately excludes effectiveChannel === 'webhook' (AUTH-L-4): when
    // switching to webhook, validatePatch already forced targetEmail to null
    // to satisfy chk_alert_channel_fields, and this lock must not overwrite
    // that null back to the session email. Guarded on req.hcSession so a
    // legacy/sessionless caller is never treated as a member (AUTH-L-2).
    if (
      req.hcSession && req.hcSession.role !== 'admin' &&
      (effectiveChannel === 'email' || (effectiveChannel === undefined && 'targetEmail' in parsed.value))
    ) {
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
    const scopeChanges = [];
    for (const [key, value] of Object.entries(parsed.value)) {
      params.push(value);
      fields.push(`${map[key]} = $${params.length}`);
      if (key === 'scopeValue' || key === 'scopeType') {
        scopeChanges.push(`${map[key]} IS DISTINCT FROM $${params.length}`);
      }
    }
    // A scope edited by hand is no longer one a display name moved: a later
    // clear of that name must not put the old scope back.
    if (scopeChanges.length) {
      const changed = scopeChanges.join(' OR ');
      fields.push(
        `renamed_by_accessory_id = CASE WHEN ${changed} THEN NULL ELSE renamed_by_accessory_id END`,
        `scope_value_before_rename = CASE WHEN ${changed} THEN NULL ELSE scope_value_before_rename END`,
      );
    }
    // IDOR-safe WHERE: require both id match AND ownership (D-07). A legacy/
    // service-token caller reaches any rule by id alone (AUTH-L-2).
    params.push(ruleId);
    const idParam = params.length;
    let whereClause = `id = $${idParam}`;
    if (!legacy) {
      params.push(req.hcSession.user_id);
      const uidParam = params.length;
      whereClause += ` AND user_id = $${uidParam}`;
    }

    try {
      const result = await pool.query(
        `UPDATE alert_rules
         SET ${fields.join(', ')}, updated_at = NOW()
         WHERE ${whereClause}
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

  // DELETE /rules/:id — IDOR-safe: WHERE id=$1 AND user_id=$2 (D-07, MALERT-04),
  // or ownerless for admin / a legacy-service-token caller (M-1, AUTH-L-2)
  router.delete('/rules/:id', alertsWriteLimiter, async (req, res) => {
    const ruleId = Number.parseInt(String(req.params.id ?? ''), 10);
    if (!Number.isFinite(ruleId) || ruleId < 1) {
      return res.status(400).json({ error: 'Invalid rule id' });
    }
    try {
      // Admins (and legacy/service-token callers, AUTH-L-2) may remove any
      // rule (including orphaned / legacy-NULL-owner rows) so revoked/legacy
      // rules do not become unmanageable (M-1). Members keep the IDOR-safe
      // owner-scoped WHERE.
      const isAdminGrade = isLegacyAdmin(req) || req.hcSession.role === 'admin';
      const result = isAdminGrade
        ? await pool.query('DELETE FROM alert_rules WHERE id = $1', [ruleId])
        : await pool.query(
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

  // GET /deliveries — scoped to deliveries whose rule is owned by the session
  // user (D-05, D-07), or every delivery for a legacy/service-token caller (AUTH-L-2)
  router.get('/deliveries', alertsReadLimiter, async (req, res) => {
    const legacy = isLegacyAdmin(req);
    const uid = req.hcSession?.user_id;
    const page = parseIntInRange(req.query.page, 1, 1, 1_000_000);
    const limit = parseIntInRange(req.query.limit, 50, 1, 200);
    const offset = (page - 1) * limit;

    try {
      const countResult = legacy
        ? await pool.query(
            `SELECT COUNT(*)::int AS total
             FROM alert_deliveries d
             JOIN alert_rules r ON r.id = d.rule_id`
          )
        : await pool.query(
            `SELECT COUNT(*)::int AS total
             FROM alert_deliveries d
             JOIN alert_rules r ON r.id = d.rule_id
             WHERE r.user_id = $1`,
            [uid]
          );
      const total = countResult.rows[0]?.total ?? 0;
      const result = legacy
        ? await pool.query(
            `SELECT d.id, d.rule_id, d.event_id, d.status, d.target_url, d.channel, d.recipient,
                    d.response_code, d.error, d.sent_at, r.name AS rule_name
             FROM alert_deliveries d
             JOIN alert_rules r ON r.id = d.rule_id
             ORDER BY d.sent_at DESC, d.id DESC
             LIMIT $1 OFFSET $2`,
            [limit, offset]
          )
        : await pool.query(
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
