import { resolveAndValidateWebhookTarget } from './security.js';
import { sendAlertEmail, isEmailEnabled } from './emails.js';
import { log } from './logger.js';

// Webhook timeout precedence: ALERTS_WEBHOOK_TIMEOUT_MS when it is set (it
// predates the Settings field, and existing .env configs must keep working);
// otherwise the value saved in Settings › Configuration › Data management,
// which index.js applies through setWebhookTimeoutMs().
export const WEBHOOK_TIMEOUT_FROM_ENV = String(process.env.ALERTS_WEBHOOK_TIMEOUT_MS ?? '').trim() !== '';
export const ALERTS_WEBHOOK_TIMEOUT_MS = (() => {
  const parsed = Number.parseInt(process.env.ALERTS_WEBHOOK_TIMEOUT_MS ?? '5000', 10);
  if (!Number.isFinite(parsed) || parsed < 500) return 5000;
  return parsed;
})();
let webhookTimeoutMs = ALERTS_WEBHOOK_TIMEOUT_MS;

/** Set the timeout for outbound webhook deliveries. Ignores anything under 500ms. */
export function setWebhookTimeoutMs(ms) {
  const parsed = Number.parseInt(String(ms ?? ''), 10);
  if (Number.isFinite(parsed) && parsed >= 500) webhookTimeoutMs = parsed;
}

export function getWebhookTimeoutMs() {
  return webhookTimeoutMs;
}
const ALERTS_ALLOW_PRIVATE_TARGETS = /^(1|true|yes|on)$/i.test(
  process.env.ALERTS_ALLOW_PRIVATE_TARGETS ?? 'true'
);
// M-3: bound concurrent outbound sends per processAlertsForEvent call.
const ALERTS_FANOUT_CONCURRENCY = (() => {
  const parsed = Number.parseInt(process.env.ALERTS_FANOUT_CONCURRENCY ?? '4', 10);
  if (!Number.isFinite(parsed)) return 4;
  return Math.min(32, Math.max(1, parsed));
})();
// M-3: module-global ceiling on concurrent in-flight sends across ALL
// processAlertsForEvent invocations (bounds concurrent calls from separate
// subscriber.js events, not just one call's own fan-out).
const ALERTS_MAX_INFLIGHT = (() => {
  const parsed = Number.parseInt(process.env.ALERTS_MAX_INFLIGHT ?? '50', 10);
  if (!Number.isFinite(parsed)) return 50;
  return Math.min(1000, Math.max(1, parsed));
})();
// M-3: minimum backoff applied after a failed attempt, even when
// quiet_minutes is 0, so a permanently broken target is not retried on
// every single matching event.
const ALERTS_FAILURE_BACKOFF_MS = (() => {
  const parsed = Number.parseInt(process.env.ALERTS_FAILURE_BACKOFF_MS ?? '60000', 10);
  if (!Number.isFinite(parsed)) return 60_000;
  return Math.min(86_400_000, Math.max(1_000, parsed));
})();

// Module-global in-flight counter — bounds concurrent outbound sends across
// every processAlertsForEvent call in this process (M-3).
let inFlight = 0;
// Module-global suppressed-row dedupe: at most one 'suppressed' delivery row
// is written per rule per suppression window, so a chatty sensor does not
// grow alert_deliveries by one row per event while suppressed (M-3).
const lastSuppressedRowAt = new Map();
// "Goes quiet" rules (operator silent_for): rule id -> ms timestamp of the
// last event that matched the rule's scope. Fed by processAlertsForEvent so
// quiet rules use exactly the same scope matching as every other rule; read
// by the quiet-alert scheduler (quiet-alerts.js).
const quietRuleActivity = new Map();

export const QUIET_OPERATOR = 'silent_for';

export function getQuietRuleActivity(ruleId) {
  return quietRuleActivity.get(ruleId) ?? null;
}

export function recordQuietRuleActivity(ruleId, atMs) {
  const prev = quietRuleActivity.get(ruleId) ?? 0;
  if (atMs > prev) quietRuleActivity.set(ruleId, atMs);
}

function normalizeString(value) {
  return String(value ?? '').trim();
}

function normalizeLower(value) {
  return normalizeString(value).toLowerCase();
}

function eventMatchesScope(rule, event) {
  const scopeType = normalizeLower(rule.scope_type || 'all');
  const scopeValue = normalizeString(rule.scope_value);

  if (scopeType === 'all') return true;

  if (scopeType === 'room') {
    return normalizeLower(event.roomName) === normalizeLower(scopeValue);
  }
  if (scopeType === 'accessory') {
    const target = normalizeLower(scopeValue);
    // Before the HAP UUID map fix, HomeKit events were named "<name> · <service>";
    // rules saved with that name must keep matching the plain name.
    const legacyName = event.accessoryName && event.serviceType
      ? `${event.accessoryName} · ${event.serviceType}`
      : null;
    return normalizeLower(event.accessoryName) === target
      || (event.reportedName != null && normalizeLower(event.reportedName) === target)
      || normalizeLower(event.accessoryId) === target
      || (legacyName !== null && normalizeLower(legacyName) === target);
  }
  if (scopeType === 'characteristic') {
    return normalizeLower(event.characteristic) === normalizeLower(scopeValue);
  }
  return false;
}

function eventMatchesCharacteristic(rule, event) {
  const expected = normalizeString(rule.characteristic);
  if (!expected) return true;
  return normalizeLower(event.characteristic) === normalizeLower(expected);
}

// Strict numeric parse: Number('') is 0 and parseFloat('20abc') is 20, so
// only a non-empty string that Number() reads in full counts as a number.
export function parseNumericValue(value) {
  const text = normalizeString(value);
  if (!text) return null;
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : null;
}

function eventMatchesOperator(rule, event) {
  const op = normalizeLower(rule.operator || 'equals');
  const actual = normalizeString(event.newValue);
  const expected = normalizeString(rule.match_value);

  if (op === 'equals') return actual === expected;
  if (op === 'not_equals') return actual !== expected;
  if (op === 'contains') return normalizeLower(actual).includes(normalizeLower(expected));
  if (op === 'above' || op === 'below') {
    // Edge-triggered: fire when the reading crosses the threshold, not on
    // every report while it stays past it. A missing or non-numeric previous
    // value (first reading, or after a restart) counts as a crossing.
    const threshold = parseNumericValue(expected);
    const next = parseNumericValue(actual);
    if (threshold === null || next === null) return false;
    const prev = parseNumericValue(event.oldValue);
    const isPast = (value) => (op === 'above' ? value > threshold : value < threshold);
    return isPast(next) && (prev === null || !isPast(prev));
  }
  return false;
}

function buildPayload(rule, event, firedAt) {
  return {
    type: 'homechronicle.alert',
    firedAt,
    rule: {
      id: rule.id,
      name: rule.name,
      scopeType: rule.scope_type,
      scopeValue: rule.scope_value,
      characteristic: rule.characteristic,
      operator: rule.operator,
      matchValue: rule.match_value,
      quietMinutes: rule.quiet_minutes,
      targetUrl: rule.target_url,
    },
    event: {
      id: event.eventId,
      timestamp: event.timestamp,
      accessoryId: event.accessoryId,
      accessoryName: event.accessoryName,
      roomName: event.roomName,
      serviceType: event.serviceType,
      characteristic: event.characteristic,
      oldValue: event.oldValue,
      newValue: event.newValue,
      rawIid: event.rawIid,
    },
  };
}

function buildAlertBody(rule, event) {
  const ts = new Date().toISOString();
  const lines = [
    `Rule:           ${rule.name}`,
    `Accessory:      ${event.accessoryName ?? ''} (${event.accessoryId ?? ''})`,
    `Room:           ${event.roomName ?? '(no room)'}`,
    `Characteristic: ${event.characteristic ?? ''}`,
    `Change:         ${event.oldValue ?? '(none)'} → ${event.newValue ?? ''}`,
    `Time:           ${event.timestamp ?? ts}`,
  ];
  return lines.join('\n');
}

async function createDelivery(pool, data) {
  await pool.query(
    `INSERT INTO alert_deliveries
       (rule_id, event_id, status, target_url, channel, recipient, response_code, error)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      data.ruleId,
      data.eventId ?? null,
      data.status,
      data.targetUrl ?? null,
      data.channel ?? 'webhook',
      data.recipient ?? null,
      data.responseCode ?? null,
      data.error ?? null,
    ]
  );
}

async function sendWebhook(rule, event, payloadOverride = null) {
  const target = await resolveAndValidateWebhookTarget(rule.target_url, {
    allowPrivateTargets: ALERTS_ALLOW_PRIVATE_TARGETS,
  });
  if (!target.ok) {
    return {
      status: 'failed',
      error: `Blocked webhook target: ${target.error}`,
    };
  }

  const controller = new AbortController();
  const timeoutMs = webhookTimeoutMs;
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const firedAt = new Date().toISOString();
    const payload = payloadOverride ?? buildPayload(rule, event, firedAt);
    // Pin the resolved IP to prevent DNS rebinding (TOCTOU between validation
    // and fetch). Set the Host header to the original hostname for TLS/SNI.
    const fetchUrl = new URL(target.normalizedUrl);
    const originalHost = fetchUrl.host;
    if (target.resolvedAddresses?.length) {
      const ip = target.resolvedAddresses[0];
      fetchUrl.hostname = ip.includes(':') ? `[${ip}]` : ip;
    }
    const response = await fetch(fetchUrl.toString(), {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'host': originalHost },
      body: JSON.stringify(payload),
      signal: controller.signal,
      redirect: 'manual',
    });

    if (!response.ok) {
      const text = (await response.text().catch(() => '')).slice(0, 300);
      return {
        status: 'failed',
        responseCode: response.status,
        error: text || `HTTP ${response.status}`,
      };
    }

    return { status: 'sent', responseCode: response.status };
  } catch (err) {
    return {
      status: 'failed',
      error: err?.name === 'AbortError'
        ? `Webhook timeout after ${timeoutMs}ms`
        : (err?.message ?? 'Webhook request failed'),
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

async function sendEmailAlertForRule(rule, event, emailFrom) {
  if (!isEmailEnabled()) {
    return { status: 'failed', error: 'Email not configured' };
  }
  try {
    const accessoryName = String(event.accessoryName ?? event.accessoryId ?? 'Unknown');
    const characteristic = String(event.characteristic ?? '');
    const newValue = String(event.newValue ?? '');
    const subject = (accessoryName && characteristic && newValue)
      ? `[HomeChronicle] ${accessoryName} ${characteristic} = ${newValue}`.slice(0, 200)
      : `[HomeChronicle] ${String(rule.name ?? 'Alert').slice(0, 180)}`;
    const body = buildAlertBody(rule, event);
    await sendAlertEmail(rule.target_email, subject, body, { from: emailFrom });
    return { status: 'sent' };
  } catch (err) {
    return {
      status: 'failed',
      error: err?.message === 'Email not configured'
        ? 'Email not configured'
        : (err?.message ?? 'Email send failed'),
    };
  }
}

function buildQuietPayload(rule, quiet, firedAt) {
  return {
    type: 'homechronicle.alert',
    kind: 'quiet',
    firedAt,
    rule: {
      id: rule.id,
      name: rule.name,
      scopeType: rule.scope_type,
      scopeValue: rule.scope_value,
      characteristic: rule.characteristic,
      operator: rule.operator,
      matchValue: rule.match_value,
    },
    quiet: {
      lastActivityAt: quiet.lastActivityAt,
      quietSince: quiet.quietSince,
      quietMinutes: quiet.quietMinutes,
    },
  };
}

function describeQuietScope(rule) {
  const scopeType = normalizeLower(rule.scope_type || 'all');
  const what = scopeType === 'all'
    ? 'any device'
    : scopeType === 'room'
      ? `room ${rule.scope_value}`
      : String(rule.scope_value ?? '');
  return rule.characteristic ? `${what} (${rule.characteristic})` : what;
}

export function formatQuietDuration(minutes) {
  if (minutes < 60) return `${minutes} min`;
  const hours = minutes / 60;
  return `${Number.isInteger(hours) ? hours : hours.toFixed(1)} h`;
}

/**
 * Send a "went quiet" alert for a silent_for rule and record the delivery.
 * There is no triggering event, so the delivery row has event_id NULL.
 *
 * @param {object} quiet - { lastActivityAt: ISO|null, quietSince: ISO, quietMinutes: number }
 * @returns {Promise<'sent'|'failed'>}
 */
export async function deliverQuietAlert(pool, rule, quiet, emailFrom) {
  const firedAt = new Date().toISOString();
  const scope = describeQuietScope(rule);
  const duration = formatQuietDuration(quiet.quietMinutes);
  let delivery;
  if (rule.channel === 'email') {
    if (!isEmailEnabled()) {
      delivery = { status: 'failed', error: 'Email not configured' };
    } else {
      try {
        const subject = `[HomeChronicle] No events from ${scope} for ${duration}`.slice(0, 200);
        const body = [
          `Rule:           ${rule.name}`,
          `Watching:       ${scope}`,
          `Quiet for:      ${duration}`,
          `Last activity:  ${quiet.lastActivityAt ?? '(none since the listener started)'}`,
          `Time:           ${firedAt}`,
        ].join('\n');
        await sendAlertEmail(rule.target_email, subject, body, { from: emailFrom });
        delivery = { status: 'sent' };
      } catch (err) {
        delivery = { status: 'failed', error: err?.message ?? 'Email send failed' };
      }
    }
  } else {
    delivery = await sendWebhook(rule, null, buildQuietPayload(rule, quiet, firedAt));
  }
  await createDelivery(pool, {
    ruleId: rule.id,
    eventId: null,
    status: delivery.status,
    targetUrl: rule.channel === 'webhook' ? rule.target_url : null,
    channel: rule.channel ?? 'webhook',
    recipient: rule.channel === 'email' ? rule.target_email : null,
    responseCode: delivery.responseCode,
    error: delivery.error,
  });
  return delivery.status;
}

export async function processAlertsForEvent(pool, event, emailFrom) {
  if (!event?.eventId) return;

  // M-1: LEFT JOIN users so a rule owned by a disabled user is excluded before
  // it ever reaches the match/fire pipeline — a revoked household member must
  // lose their event stream immediately. Rules with user_id IS NULL are legacy
  // backfill (migration 0008 "A1", auth-off installs with no admin at backfill
  // time) and intentionally still fire — there is no owner account to disable.
  // We deliberately do NOT cascade-disable alert_rules.enabled from
  // users-router.js when a user is disabled: this join already suppresses
  // firing, and leaving `enabled` untouched means re-enabling the user
  // restores their rules without the admin having to recreate them.
  const rulesResult = await pool.query(
    `SELECT r.id AS id, r.name AS name, r.enabled AS enabled, r.scope_type AS scope_type,
            r.scope_value AS scope_value, r.characteristic AS characteristic,
            r.operator AS operator, r.match_value AS match_value, r.target_url AS target_url,
            r.target_email AS target_email, r.channel AS channel, r.quiet_minutes AS quiet_minutes
     FROM alert_rules r
     LEFT JOIN users u ON u.id = r.user_id
     WHERE r.enabled = TRUE AND (r.user_id IS NULL OR u.disabled_at IS NULL)
     ORDER BY r.id ASC`
  );
  if (!rulesResult.rows.length) return;

  // Quiet rules never fire on an event; an event in their scope just resets
  // their silence clock.
  const eventAtMs = Date.now();
  for (const rule of rulesResult.rows) {
    if (normalizeLower(rule.operator) !== QUIET_OPERATOR) continue;
    if (eventMatchesScope(rule, event) && eventMatchesCharacteristic(rule, event)) {
      recordQuietRuleActivity(rule.id, eventAtMs);
    }
  }

  // Filter to matching rules first
  const matchingRules = rulesResult.rows.filter(
    (rule) =>
      eventMatchesScope(rule, event) &&
      eventMatchesCharacteristic(rule, event) &&
      eventMatchesOperator(rule, event)
  );
  if (!matchingRules.length) return;

  // Batch-load last delivery times AND statuses for all matching rules in one
  // query. Widened from status='sent' to status IN ('sent','failed') so a
  // rule whose most recent attempt failed can be backed off (M-3), not just
  // one that succeeded.
  const ruleIds = matchingRules.map((r) => r.id);
  const suppressionResult = await pool.query(
    `SELECT DISTINCT ON (rule_id) rule_id, sent_at, status
     FROM alert_deliveries
     WHERE rule_id = ANY($1)
       AND status IN ('sent','failed')
     ORDER BY rule_id, sent_at DESC`,
    [ruleIds]
  );
  const lastByRule = new Map(
    suppressionResult.rows.map((r) => [
      r.rule_id,
      { ts: new Date(r.sent_at).getTime(), status: r.status },
    ])
  );

  const now = Date.now();
  let droppedForCeiling = 0;

  async function processRule(rule) {
    try {
      // Check suppression using batch-loaded data. A rule whose last attempt
      // failed gets at least ALERTS_FAILURE_BACKOFF_MS of backoff even when
      // quiet_minutes is 0 — otherwise a permanently broken target would be
      // retried on every single matching event (M-3).
      const quietMs = (Number.parseInt(String(rule.quiet_minutes ?? 0), 10) || 0) * 60_000;
      const last = lastByRule.get(rule.id);
      const effectiveQuietMs = Math.max(
        quietMs,
        last?.status === 'failed' ? ALERTS_FAILURE_BACKOFF_MS : 0
      );
      const suppressed =
        effectiveQuietMs > 0 && last && Number.isFinite(last.ts) && (now - last.ts) < effectiveQuietMs;

      if (suppressed) {
        // Dedupe: write at most one 'suppressed' row per rule per window so a
        // chatty sensor does not grow alert_deliveries by one row per event
        // while suppressed (M-3).
        const lastRowAt = lastSuppressedRowAt.get(rule.id) ?? 0;
        if (now - lastRowAt >= effectiveQuietMs) {
          await createDelivery(pool, {
            ruleId: rule.id,
            eventId: event.eventId,
            status: 'suppressed',
            targetUrl: rule.channel === 'webhook' ? rule.target_url : null,
            channel: rule.channel ?? 'webhook',
            recipient: rule.channel === 'email' ? rule.target_email : null,
            error: `Suppressed by quiet period (${rule.quiet_minutes} minute(s))`,
          });
          lastSuppressedRowAt.set(rule.id, now);
          // Prune stale entries so the map cannot grow unbounded over months.
          if (lastSuppressedRowAt.size > 1000) {
            const cutoff = now - 24 * 60 * 60 * 1000;
            for (const [id, ts] of lastSuppressedRowAt) {
              if (ts < cutoff) lastSuppressedRowAt.delete(id);
            }
          }
        }
        return;
      }

      // Module-global in-flight ceiling (M-3): once at capacity, drop the
      // remaining rules with a log.warn and write NO delivery row — writing
      // one would reintroduce the row-growth this finding is about.
      if (inFlight >= ALERTS_MAX_INFLIGHT) {
        droppedForCeiling += 1;
        return;
      }
      inFlight += 1;
      try {
        const delivery = rule.channel === 'email'
          ? await sendEmailAlertForRule(rule, event, emailFrom)
          : await sendWebhook(rule, event);
        await createDelivery(pool, {
          ruleId: rule.id,
          eventId: event.eventId,
          status: delivery.status,
          targetUrl: rule.channel === 'webhook' ? rule.target_url : null,
          channel: rule.channel ?? 'webhook',
          recipient: rule.channel === 'email' ? rule.target_email : null,
          responseCode: delivery.responseCode,
          error: delivery.error,
        });
      } finally {
        inFlight -= 1;
      }
    } catch (err) {
      // Isolate per-rule failures: a broken webhook or DB error must not
      // prevent delivery attempts for the remaining rules (M-5).
      log.warn(`[alerts] rule ${rule.id} delivery failed:`, err.message);
    }
  }

  // Bounded worker pool (M-3): at most ALERTS_FANOUT_CONCURRENCY rules are
  // ever in-flight for this call, but all matchingRules are attempted.
  let nextIndex = 0;
  async function worker() {
    while (nextIndex < matchingRules.length) {
      const rule = matchingRules[nextIndex];
      nextIndex += 1;
      await processRule(rule);
    }
  }
  const workerCount = Math.min(ALERTS_FANOUT_CONCURRENCY, matchingRules.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));

  if (droppedForCeiling > 0) {
    log.warn(
      `[alerts] in-flight ceiling (${ALERTS_MAX_INFLIGHT}) reached — dropped ${droppedForCeiling} rule(s) for event ${event.eventId}`
    );
  }
}
