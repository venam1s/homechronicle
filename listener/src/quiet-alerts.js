import { log } from './logger.js';
import {
  QUIET_OPERATOR,
  deliverQuietAlert,
  getQuietRuleActivity,
  parseNumericValue,
  recordQuietRuleActivity,
} from './alerts.js';

// "Goes quiet" alert rules (operator silent_for, match_value = hours) fire
// when the events in a rule's scope stop for longer than the threshold — a
// sensor with a dead battery, a bridge that dropped off the network.
//
// Silence is measured from the latest of: the last matching event, the
// listener's start (events while it was down were never seen, so downtime
// must not count as device silence) and the rule's last edit. A rule fires
// once per quiet stretch: a 'sent' delivery newer than the last activity (or
// the rule's last edit) means the user already knows, across restarts too.

export const QUIET_MIN_HOURS = 0.25;
export const QUIET_MAX_HOURS = 720;

const DEFAULT_TICK_MS = 60_000;
// A failed delivery is retried, but no more often than this.
const FAILED_RETRY_MS = 60 * 60 * 1000;

function toMs(value) {
  if (value == null) return null;
  const ms = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isFinite(ms) ? ms : null;
}

/**
 * Best-effort seed of a rule's last activity from the event log, so a restart
 * does not forget when a device last spoke. Exact matches only (each branch
 * is one index probe); a miss just leaves the listener start as the baseline.
 */
async function seedLastActivity(pool, rule) {
  const scopeType = String(rule.scope_type ?? 'all').toLowerCase();
  const scopeValue = rule.scope_value ?? '';
  const params = [];
  const charFilter = () => {
    if (!rule.characteristic) return '';
    params.push(rule.characteristic);
    return ` AND characteristic = $${params.length}`;
  };
  const latest = (column) => {
    params.push(scopeValue);
    const where = `${column} = $${params.length}${charFilter()}`;
    return `(SELECT timestamp FROM event_logs WHERE ${where} ORDER BY timestamp DESC LIMIT 1)`;
  };

  let sql;
  if (scopeType === 'accessory') {
    sql = `SELECT GREATEST(${latest('accessory_id')}, ${latest('accessory_name')}) AS ts`;
  } else if (scopeType === 'room') {
    sql = `SELECT ${latest('room_name')} AS ts`;
  } else if (scopeType === 'characteristic') {
    sql = `SELECT ${latest('characteristic')} AS ts`;
  } else {
    const where = rule.characteristic ? `WHERE TRUE${charFilter()}` : '';
    sql = `SELECT (SELECT timestamp FROM event_logs ${where} ORDER BY timestamp DESC LIMIT 1) AS ts`;
  }
  const result = await pool.query(sql, params);
  return toMs(result.rows[0]?.ts);
}

export function createQuietAlertScheduler({
  pool,
  getEmailFrom = () => '',
  tickMs = DEFAULT_TICK_MS,
  now = () => Date.now(),
  startedAt = now(),
} = {}) {
  let timer = null;
  let running = false;
  const seeded = new Set();

  async function checkRule(rule) {
    const hours = parseNumericValue(rule.match_value);
    if (hours === null || hours < QUIET_MIN_HOURS || hours > QUIET_MAX_HOURS) return;
    const thresholdMs = hours * 60 * 60 * 1000;

    if (!seeded.has(rule.id)) {
      seeded.add(rule.id);
      const seededAt = await seedLastActivity(pool, rule);
      if (seededAt !== null) recordQuietRuleActivity(rule.id, seededAt);
    }

    const lastActivity = getQuietRuleActivity(rule.id);
    const quietSince = Math.max(
      lastActivity ?? 0,
      startedAt,
      toMs(rule.updated_at) ?? 0,
    );
    const nowMs = now();
    if (nowMs - quietSince < thresholdMs) return;

    const last = await pool.query(
      `SELECT status, sent_at FROM alert_deliveries
       WHERE rule_id = $1 AND status IN ('sent','failed')
       ORDER BY sent_at DESC LIMIT 1`,
      [rule.id],
    );
    // The quiet stretch began at the last activity (or the rule's last edit),
    // not at the listener start: a device alerted on before a restart that is
    // still silent afterwards must not alert again.
    const stretchStart = Math.max(lastActivity ?? 0, toMs(rule.updated_at) ?? 0);
    const lastDelivery = last.rows[0];
    const lastDeliveryMs = toMs(lastDelivery?.sent_at);
    if (lastDeliveryMs !== null && lastDeliveryMs >= stretchStart) {
      if (lastDelivery.status === 'sent') return;
      if (nowMs - lastDeliveryMs < FAILED_RETRY_MS) return;
    }

    const status = await deliverQuietAlert(pool, rule, {
      lastActivityAt: lastActivity ? new Date(lastActivity).toISOString() : null,
      quietSince: new Date(quietSince).toISOString(),
      quietMinutes: Math.floor((nowMs - quietSince) / 60_000),
    }, getEmailFrom());
    log.info(`[alerts] quiet rule ${rule.id} (${rule.name}): ${status}`);
  }

  async function tick() {
    if (running) return;
    running = true;
    try {
      // Same owner gate as event-driven rules: a disabled user's rules stay quiet.
      const result = await pool.query(
        `SELECT r.id, r.name, r.scope_type, r.scope_value, r.characteristic, r.operator,
                r.match_value, r.channel, r.target_url, r.target_email, r.updated_at
         FROM alert_rules r
         LEFT JOIN users u ON u.id = r.user_id
         WHERE r.enabled = TRUE AND r.operator = $1
           AND (r.user_id IS NULL OR u.disabled_at IS NULL)
         ORDER BY r.id ASC`,
        [QUIET_OPERATOR],
      );
      for (const rule of result.rows) {
        try {
          // eslint-disable-next-line no-await-in-loop
          await checkRule(rule);
        } catch (err) {
          log.warn(`[alerts] quiet rule ${rule.id} check failed:`, err.message ?? err);
        }
      }
    } catch (err) {
      log.warn('[alerts] quiet rule scan failed:', err.message ?? err);
    } finally {
      running = false;
    }
  }

  return {
    tick,
    start() {
      if (timer) return;
      timer = setInterval(() => { void tick(); }, tickMs);
      timer.unref?.();
    },
    stop() {
      if (timer) clearInterval(timer);
      timer = null;
    },
  };
}
