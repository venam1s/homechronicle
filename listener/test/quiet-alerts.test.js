import test from 'node:test';
import assert from 'node:assert/strict';
import { createQuietAlertScheduler } from '../src/quiet-alerts.js';
import { processAlertsForEvent, getQuietRuleActivity, recordQuietRuleActivity } from '../src/alerts.js';

const HOUR = 60 * 60 * 1000;
const T0 = Date.parse('2026-10-24T00:00:00.000Z');

// The activity map is module-global, so every test uses its own rule ids.
function makeRule(overrides = {}) {
  return {
    id: 1,
    name: 'Freezer sensor quiet',
    enabled: true,
    scope_type: 'accessory',
    scope_value: 'Freezer',
    characteristic: null,
    operator: 'silent_for',
    match_value: '6',
    channel: 'webhook',
    target_url: 'https://203.0.113.10/hook',
    target_email: null,
    quiet_minutes: 0,
    updated_at: new Date(T0 - 48 * HOUR).toISOString(),
    ...overrides,
  };
}

function makePool({ rules, lastEventTs = null, deliveries = [] }) {
  const queries = [];
  return {
    deliveries,
    queries,
    async query(sql, params = []) {
      queries.push({ sql, params });
      if (sql.includes('FROM alert_rules')) return { rows: rules };
      if (sql.includes('FROM event_logs')) return { rows: [{ ts: lastEventTs }] };
      if (sql.includes('FROM alert_deliveries')) {
        const mine = deliveries
          .filter((d) => d.rule_id === params[0] && ['sent', 'failed'].includes(d.status))
          .sort((a, b) => Date.parse(b.sent_at) - Date.parse(a.sent_at));
        return { rows: mine.slice(0, 1) };
      }
      if (sql.startsWith('INSERT INTO alert_deliveries')) {
        deliveries.push({ rule_id: params[0], event_id: params[1], status: params[2], sent_at: new Date(clock.now).toISOString() });
        return { rowCount: 1 };
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    },
  };
}

const clock = { now: T0 };

async function withFetch(fn, impl = async () => ({ ok: true, status: 200 })) {
  const original = global.fetch;
  const calls = [];
  global.fetch = async (url, opts) => {
    calls.push({ url, body: JSON.parse(opts.body) });
    return impl();
  };
  try {
    await fn(calls);
  } finally {
    global.fetch = original;
  }
}

function scheduler(pool) {
  return createQuietAlertScheduler({ pool, now: () => clock.now, startedAt: T0 });
}

test('quiet rule fires once the scope has been silent past the threshold, measured from listener start', async () => {
  const pool = makePool({ rules: [makeRule({ id: 101 })] });
  const s = scheduler(pool);
  await withFetch(async (calls) => {
    clock.now = T0 + 5 * HOUR;
    await s.tick();
    assert.equal(pool.deliveries.length, 0, 'not quiet long enough yet');

    clock.now = T0 + 6 * HOUR + 1000;
    await s.tick();
    assert.equal(pool.deliveries.length, 1);
    assert.equal(pool.deliveries[0].status, 'sent');
    assert.equal(pool.deliveries[0].event_id, null);
    assert.equal(calls[0].body.kind, 'quiet');
    assert.equal(calls[0].body.quiet.lastActivityAt, null);
    assert.equal(calls[0].body.quiet.quietMinutes, 360);
  });
});

test('quiet rule fires only once per quiet stretch, and again after new activity then silence', async () => {
  const pool = makePool({ rules: [makeRule({ id: 102 })] });
  const s = scheduler(pool);
  await withFetch(async () => {
    clock.now = T0 + 7 * HOUR;
    await s.tick();
    clock.now = T0 + 9 * HOUR;
    await s.tick();
    assert.equal(pool.deliveries.length, 1, 'still the same quiet stretch');

    recordQuietRuleActivity(102, T0 + 10 * HOUR);
    clock.now = T0 + 15 * HOUR;
    await s.tick();
    assert.equal(pool.deliveries.length, 1, 'only 5 h since the device spoke');

    clock.now = T0 + 16 * HOUR + 1000;
    await s.tick();
    assert.equal(pool.deliveries.length, 2);
  });
});

test('quiet rule seeds last activity from the event log so a restart does not forget it', async () => {
  const pool = makePool({
    rules: [makeRule({ id: 103 })],
    lastEventTs: new Date(T0 + 3 * HOUR).toISOString(),
  });
  const s = scheduler(pool);
  await withFetch(async () => {
    clock.now = T0 + 7 * HOUR;
    await s.tick();
    assert.equal(pool.deliveries.length, 0, 'last event 4 h ago');
    clock.now = T0 + 9 * HOUR + 1000;
    await s.tick();
    assert.equal(pool.deliveries.length, 1);
  });
  const seedQuery = pool.queries.find((q) => q.sql.includes('FROM event_logs'));
  assert.match(seedQuery.sql, /accessory_id = \$1/);
  assert.match(seedQuery.sql, /accessory_name = \$2/);
  assert.deepEqual(seedQuery.params, ['Freezer', 'Freezer']);
  assert.equal(pool.queries.filter((q) => q.sql.includes('FROM event_logs')).length, 1, 'seeded once');
});

test('editing a quiet rule restarts its clock', async () => {
  const pool = makePool({ rules: [makeRule({ id: 104, updated_at: new Date(T0 + 4 * HOUR).toISOString() })] });
  const s = scheduler(pool);
  await withFetch(async () => {
    clock.now = T0 + 8 * HOUR;
    await s.tick();
    assert.equal(pool.deliveries.length, 0);
    clock.now = T0 + 10 * HOUR + 1000;
    await s.tick();
    assert.equal(pool.deliveries.length, 1);
  });
});

test('a failed quiet alert is retried, but not more than once an hour', async () => {
  const pool = makePool({ rules: [makeRule({ id: 105 })] });
  const s = scheduler(pool);
  await withFetch(async () => {
    clock.now = T0 + 7 * HOUR;
    await s.tick();
    clock.now = T0 + 7.5 * HOUR;
    await s.tick();
    assert.deepEqual(pool.deliveries.map((d) => d.status), ['failed']);
    clock.now = T0 + 8 * HOUR + 1000;
    await s.tick();
    assert.deepEqual(pool.deliveries.map((d) => d.status), ['failed', 'failed']);
  }, async () => ({ ok: false, status: 500, text: async () => 'boom' }));
});

test('quiet rule with an out-of-range or non-numeric threshold never fires', async () => {
  const pool = makePool({ rules: [makeRule({ id: 106, match_value: 'soon' }), makeRule({ id: 107, match_value: '0.1' })] });
  const s = scheduler(pool);
  await withFetch(async () => {
    clock.now = T0 + 100 * HOUR;
    await s.tick();
    assert.equal(pool.deliveries.length, 0);
  });
});

test('processAlertsForEvent records activity for a matching quiet rule without delivering', async () => {
  const deliveries = [];
  const pool = {
    async query(sql) {
      if (sql.includes('FROM alert_rules')) {
        return {
          rows: [
            makeRule({ id: 108, scope_value: 'freezer' }),
            makeRule({ id: 109, scope_value: 'Garage Door' }),
          ],
        };
      }
      if (sql.startsWith('INSERT INTO alert_deliveries')) {
        deliveries.push(sql);
        return { rowCount: 1 };
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    },
  };
  const before = Date.now();
  await processAlertsForEvent(pool, {
    eventId: 1,
    accessoryId: 'dev-9',
    accessoryName: 'Freezer',
    characteristic: 'CurrentTemperature',
    oldValue: '-18',
    newValue: '-17.5',
  });
  assert.equal(deliveries.length, 0);
  assert.ok(getQuietRuleActivity(108) >= before, 'case-insensitive scope match records activity');
  assert.equal(getQuietRuleActivity(109), null);
});
