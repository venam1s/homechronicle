import { resolveAndValidateWebhookTarget } from './security.js';
import { sendAlertEmail, isEmailEnabled } from './emails.js';

const ALERTS_WEBHOOK_TIMEOUT_MS = (() => {
  const parsed = Number.parseInt(process.env.ALERTS_WEBHOOK_TIMEOUT_MS ?? '5000', 10);
  if (!Number.isFinite(parsed) || parsed < 500) return 5000;
  return parsed;
})();
const ALERTS_ALLOW_PRIVATE_TARGETS = /^(1|true|yes|on)$/i.test(
  process.env.ALERTS_ALLOW_PRIVATE_TARGETS ?? 'true'
);

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
    return normalizeLower(event.accessoryName) === target || normalizeLower(event.accessoryId) === target;
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

function eventMatchesOperator(rule, event) {
  const op = normalizeLower(rule.operator || 'equals');
  const actual = normalizeString(event.newValue);
  const expected = normalizeString(rule.match_value);

  if (op === 'equals') return actual === expected;
  if (op === 'not_equals') return actual !== expected;
  if (op === 'contains') return normalizeLower(actual).includes(normalizeLower(expected));
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

async function sendWebhook(rule, event) {
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
  const timeoutId = setTimeout(() => controller.abort(), ALERTS_WEBHOOK_TIMEOUT_MS);

  try {
    const firedAt = new Date().toISOString();
    const payload = buildPayload(rule, event, firedAt);
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
        ? `Webhook timeout after ${ALERTS_WEBHOOK_TIMEOUT_MS}ms`
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

export async function processAlertsForEvent(pool, event, emailFrom) {
  if (!event?.eventId) return;

  const rulesResult = await pool.query(
    `SELECT id, name, enabled, scope_type, scope_value, characteristic,
            operator, match_value, target_url, target_email, channel, quiet_minutes
     FROM alert_rules
     WHERE enabled = TRUE
     ORDER BY id ASC`
  );
  if (!rulesResult.rows.length) return;

  // Filter to matching rules first
  const matchingRules = rulesResult.rows.filter(
    (rule) =>
      eventMatchesScope(rule, event) &&
      eventMatchesCharacteristic(rule, event) &&
      eventMatchesOperator(rule, event)
  );
  if (!matchingRules.length) return;

  // Batch-load last delivery times for all matching rules in one query
  const ruleIds = matchingRules.map((r) => r.id);
  const suppressionResult = await pool.query(
    `SELECT DISTINCT ON (rule_id) rule_id, sent_at
     FROM alert_deliveries
     WHERE rule_id = ANY($1)
       AND status = 'sent'
     ORDER BY rule_id, sent_at DESC`,
    [ruleIds]
  );
  const lastSentByRule = new Map(
    suppressionResult.rows.map((r) => [r.rule_id, new Date(r.sent_at).getTime()])
  );

  const now = Date.now();

  for (const rule of matchingRules) {
    // Check suppression using batch-loaded data
    const quietMs = (Number.parseInt(String(rule.quiet_minutes ?? 0), 10) || 0) * 60_000;
    const lastSent = lastSentByRule.get(rule.id);
    const suppressed = quietMs > 0 && Number.isFinite(lastSent) && (now - lastSent) < quietMs;

    if (suppressed) {
      await createDelivery(pool, {
        ruleId: rule.id,
        eventId: event.eventId,
        status: 'suppressed',
        targetUrl: rule.channel === 'webhook' ? rule.target_url : null,
        channel: rule.channel ?? 'webhook',
        recipient: rule.channel === 'email' ? rule.target_email : null,
        error: `Suppressed by quiet period (${rule.quiet_minutes} minute(s))`,
      });
      continue;
    }

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
  }
}
