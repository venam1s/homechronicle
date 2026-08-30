import test from 'node:test';
import assert from 'node:assert/strict';
import { processAlertsForEvent } from '../src/alerts.js';
import { initEmail } from '../src/emails.js';

function makeRule(overrides = {}) {
  return {
    id: 1,
    name: 'Motion detected',
    enabled: true,
    scope_type: 'characteristic',
    scope_value: 'MotionDetected',
    characteristic: null,
    operator: 'equals',
    match_value: 'true',
    target_url: 'https://203.0.113.10/hook',
    quiet_minutes: 0,
    ...overrides,
  };
}

function makeEvent(overrides = {}) {
  return {
    eventId: 100,
    timestamp: '2026-02-26T12:00:00.000Z',
    accessoryId: 'dev-1',
    accessoryName: 'Hallway Motion',
    roomName: 'Hallway',
    serviceType: 'MotionSensor',
    characteristic: 'MotionDetected',
    oldValue: 'false',
    newValue: 'true',
    rawIid: 12,
    ...overrides,
  };
}

test('processAlertsForEvent records sent delivery for matching rule', async () => {
  const deliveries = [];
  const pool = {
    async query(sql, params = []) {
      if (sql.includes('FROM alert_rules')) return { rows: [makeRule()] };
      if (sql.includes('DISTINCT ON (rule_id)')) return { rows: [] };
      if (sql.startsWith('INSERT INTO alert_deliveries')) {
        deliveries.push({ ruleId: params[0], eventId: params[1], status: params[2], responseCode: params[6] });
        return { rowCount: 1 };
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    },
  };

  const originalFetch = global.fetch;
  global.fetch = async () => ({ ok: true, status: 200 });
  try {
    await processAlertsForEvent(pool, makeEvent());
    assert.equal(deliveries.length, 1);
    assert.equal(deliveries[0].status, 'sent');
    assert.equal(deliveries[0].responseCode, 200);
  } finally {
    global.fetch = originalFetch;
  }
});

test('processAlertsForEvent records suppressed delivery when within quiet period', async () => {
  const deliveries = [];
  const pool = {
    async query(sql, params = []) {
      if (sql.includes('FROM alert_rules')) return { rows: [makeRule({ quiet_minutes: 10 })] };
      if (sql.includes('DISTINCT ON (rule_id)')) {
        return { rows: [{ rule_id: 1, sent_at: new Date().toISOString() }] };
      }
      if (sql.startsWith('INSERT INTO alert_deliveries')) {
        deliveries.push({ status: params[2], error: params[7] });
        return { rowCount: 1 };
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    },
  };

  const originalFetch = global.fetch;
  let fetchCalls = 0;
  global.fetch = async () => {
    fetchCalls += 1;
    return { ok: true, status: 200 };
  };
  try {
    await processAlertsForEvent(pool, makeEvent());
    assert.equal(fetchCalls, 0);
    assert.equal(deliveries.length, 1);
    assert.equal(deliveries[0].status, 'suppressed');
  } finally {
    global.fetch = originalFetch;
  }
});

test('processAlertsForEvent records failed delivery for non-2xx response', async () => {
  const deliveries = [];
  const pool = {
    async query(sql, params = []) {
      if (sql.includes('FROM alert_rules')) return { rows: [makeRule()] };
      if (sql.includes('DISTINCT ON (rule_id)')) return { rows: [] };
      if (sql.startsWith('INSERT INTO alert_deliveries')) {
        deliveries.push({ status: params[2], responseCode: params[6], error: params[7] });
        return { rowCount: 1 };
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    },
  };

  const originalFetch = global.fetch;
  global.fetch = async () => ({
    ok: false,
    status: 500,
    text: async () => 'upstream failed',
  });
  try {
    await processAlertsForEvent(pool, makeEvent());
    assert.equal(deliveries.length, 1);
    assert.equal(deliveries[0].status, 'failed');
    assert.equal(deliveries[0].responseCode, 500);
  } finally {
    global.fetch = originalFetch;
  }
});

test('processAlertsForEvent blocks localhost webhook targets', async () => {
  const deliveries = [];
  const pool = {
    async query(sql, params = []) {
      if (sql.includes('FROM alert_rules')) {
        return { rows: [makeRule({ target_url: 'http://127.0.0.1:8080/hook' })] };
      }
      if (sql.includes('DISTINCT ON (rule_id)')) return { rows: [] };
      if (sql.startsWith('INSERT INTO alert_deliveries')) {
        deliveries.push({ status: params[2], error: params[7] });
        return { rowCount: 1 };
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    },
  };

  const originalFetch = global.fetch;
  let fetchCalls = 0;
  global.fetch = async () => {
    fetchCalls += 1;
    return { ok: true, status: 200 };
  };
  try {
    await processAlertsForEvent(pool, makeEvent());
    assert.equal(fetchCalls, 0);
    assert.equal(deliveries.length, 1);
    assert.equal(deliveries[0].status, 'failed');
    assert.match(deliveries[0].error, /blocked webhook target/i);
  } finally {
    global.fetch = originalFetch;
  }
});

// -- Wave 0: email-branch scaffolds — implemented by plan 22-02 --
// These tests assert the INTENDED behavior of the email channel branch.
// They FAIL until plan 22-02 adds the channel==='email' send branch in alerts.js.

test('processAlertsForEvent sends email delivery for matching email rule (Wave 0 - implemented by 22-02)', async () => {
  const deliveries = [];
  const pool = {
    async query(sql, params = []) {
      if (sql.includes('FROM alert_rules')) {
        return {
          rows: [makeRule({ channel: 'email', target_email: 'alert@example.com', target_url: null })],
        };
      }
      if (sql.includes('DISTINCT ON (rule_id)')) return { rows: [] };
      if (sql.startsWith('INSERT INTO alert_deliveries')) {
        // After 22-02: params layout is
        //   [0]=ruleId, [1]=eventId, [2]=status, [3]=targetUrl,
        //   [4]=channel, [5]=recipient, [6]=responseCode, [7]=error
        deliveries.push({
          ruleId: params[0],
          eventId: params[1],
          status: params[2],
          targetUrl: params[3],
          channel: params[4],
          recipient: params[5],
        });
        return { rowCount: 1 };
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    },
  };

  // Email IS configured at fire time: the send branch gates on isEmailEnabled()
  // (transporter !== null), so a stub transport must be installed for status to
  // reach 'sent'. _testTransport avoids any real network call. Reset in finally
  // so the D-09 and suppression scaffolds below still observe email disabled.
  const originalFetch = global.fetch;
  global.fetch = async () => { throw new Error('fetch should not be called for email rules'); };
  await initEmail({
    host: 'smtp.test',
    smtpPass: 'x',
    from: 'noreply@homechronicle.test',
    _testTransport: { verify: async () => true, sendMail: async () => ({ messageId: 'test-id' }) },
  });
  try {
    await processAlertsForEvent(pool, makeEvent(), 'noreply@homechronicle.test');
    assert.equal(deliveries.length, 1, 'one delivery row expected');
    assert.equal(deliveries[0].status, 'sent', 'delivery status must be sent');
    assert.equal(deliveries[0].channel, 'email', 'delivery channel must be email');
    assert.equal(deliveries[0].recipient, 'alert@example.com', 'recipient must be target_email');
    assert.equal(deliveries[0].targetUrl, null, 'targetUrl must be null for email rules');
  } finally {
    global.fetch = originalFetch;
    await initEmail({}); // tear down transport → isEmailEnabled() false for later tests
  }
});

test('processAlertsForEvent records failed delivery when email is not configured (D-09) (Wave 0 - implemented by 22-02)', async () => {
  const deliveries = [];
  const pool = {
    async query(sql, params = []) {
      if (sql.includes('FROM alert_rules')) {
        return {
          rows: [makeRule({ channel: 'email', target_email: 'alert@example.com', target_url: null })],
        };
      }
      if (sql.includes('DISTINCT ON (rule_id)')) return { rows: [] };
      if (sql.startsWith('INSERT INTO alert_deliveries')) {
        deliveries.push({
          status: params[2],
          channel: params[4],
          error: params[7],
        });
        return { rowCount: 1 };
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    },
  };

  // Pass empty emailFrom to signal email not configured at fire time
  // (22-02 will call isEmailEnabled() which returns false when transporter is null)
  await processAlertsForEvent(pool, makeEvent(), '');
  assert.equal(deliveries.length, 1, 'one delivery row expected');
  assert.equal(deliveries[0].status, 'failed', 'delivery status must be failed');
  assert.equal(deliveries[0].channel, 'email', 'delivery channel must be email');
  assert.equal(deliveries[0].error, 'Email not configured', 'error must be Email not configured');
});

test('processAlertsForEvent suppresses rapid-fire events on email rule within quiet period (Wave 0 - implemented by 22-02)', async () => {
  const deliveries = [];
  const pool = {
    async query(sql, params = []) {
      if (sql.includes('FROM alert_rules')) {
        // Distinct rule id (2) so this test's suppressed-row dedupe state
        // (module-global lastSuppressedRowAt, added in Task 2) does not
        // collide with the id=1 suppression test earlier in this file.
        return {
          rows: [makeRule({ id: 2, channel: 'email', target_email: 'alert@example.com', target_url: null, quiet_minutes: 10 })],
        };
      }
      if (sql.includes('DISTINCT ON (rule_id)')) {
        // Return a prior sent delivery within the quiet period
        return { rows: [{ rule_id: 2, sent_at: new Date().toISOString(), status: 'sent' }] };
      }
      if (sql.startsWith('INSERT INTO alert_deliveries')) {
        deliveries.push({
          status: params[2],
          channel: params[4],
          error: params[7],
        });
        return { rowCount: 1 };
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    },
  };

  const originalFetch = global.fetch;
  let fetchCalls = 0;
  global.fetch = async () => { fetchCalls += 1; return { ok: true, status: 200 }; };
  try {
    await processAlertsForEvent(pool, makeEvent(), 'noreply@homechronicle.test');
    assert.equal(fetchCalls, 0, 'fetch must not be called for suppressed email rule');
    assert.equal(deliveries.length, 1, 'one suppressed delivery row expected');
    assert.equal(deliveries[0].status, 'suppressed', 'delivery status must be suppressed');
    assert.equal(deliveries[0].channel, 'email', 'suppressed delivery channel must be email');
  } finally {
    global.fetch = originalFetch;
  }
});

// -- M-3: bounded fan-out, in-flight ceiling, failure-aware suppression, dedupe --

test('processAlertsForEvent bounds concurrent sends to ALERTS_FANOUT_CONCURRENCY and attempts all matching rules (M-3)', async () => {
  const rules = Array.from({ length: 12 }, (_, i) =>
    makeRule({ id: i + 1, scope_type: 'all', target_url: `https://203.0.113.10/hook-${i + 1}` })
  );
  const deliveries = [];
  const pool = {
    async query(sql, params = []) {
      if (sql.includes('FROM alert_rules')) return { rows: rules };
      if (sql.includes('DISTINCT ON (rule_id)')) return { rows: [] };
      if (sql.startsWith('INSERT INTO alert_deliveries')) {
        deliveries.push({ ruleId: params[0], status: params[2] });
        return { rowCount: 1 };
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    },
  };

  let current = 0;
  let peak = 0;
  const originalFetch = global.fetch;
  global.fetch = async () => {
    current += 1;
    peak = Math.max(peak, current);
    await new Promise((resolve) => setTimeout(resolve, 15));
    current -= 1;
    return { ok: true, status: 200 };
  };
  try {
    await processAlertsForEvent(pool, makeEvent());
    assert.equal(deliveries.length, 12, 'all 12 matching rules must be attempted');
    assert.ok(peak <= 4, `peak observed concurrency ${peak} must not exceed ALERTS_FANOUT_CONCURRENCY (4)`);
    assert.ok(peak > 1, 'fan-out must run rules concurrently, not strictly sequentially');
  } finally {
    global.fetch = originalFetch;
  }
});

test('processAlertsForEvent drops rules beyond the module-global in-flight ceiling and writes no delivery row (M-3)', async () => {
  const originalEnv = process.env.ALERTS_MAX_INFLIGHT;
  process.env.ALERTS_MAX_INFLIGHT = '1';
  try {
    // Cache-busted dynamic import so this test observes a fresh module
    // instance with its own inFlight counter, isolated from the statically
    // imported alerts.js used by every other test in this file (ESM caches
    // one instance per resolved specifier; ALERTS_MAX_INFLIGHT is read once
    // at module load).
    const { processAlertsForEvent: processWithCeiling } = await import(
      `../src/alerts.js?ceiling-test=${Date.now()}-${Math.random()}`
    );
    const rules = Array.from({ length: 3 }, (_, i) =>
      makeRule({ id: i + 1, scope_type: 'all', target_url: `https://203.0.113.10/hook-ceiling-${i + 1}` })
    );
    const deliveries = [];
    const pool = {
      async query(sql, params = []) {
        if (sql.includes('FROM alert_rules')) return { rows: rules };
        if (sql.includes('DISTINCT ON (rule_id)')) return { rows: [] };
        if (sql.startsWith('INSERT INTO alert_deliveries')) {
          deliveries.push({ ruleId: params[0], status: params[2] });
          return { rowCount: 1 };
        }
        throw new Error(`Unexpected SQL: ${sql}`);
      },
    };
    const originalFetch = global.fetch;
    global.fetch = async () => {
      await new Promise((resolve) => setTimeout(resolve, 15));
      return { ok: true, status: 200 };
    };
    try {
      await processWithCeiling(pool, makeEvent());
      assert.ok(
        deliveries.length < rules.length,
        `at least one of ${rules.length} rules must be dropped by ALERTS_MAX_INFLIGHT=1`
      );
      assert.ok(deliveries.length >= 1, 'the rule under the ceiling must still be delivered');
    } finally {
      global.fetch = originalFetch;
    }
  } finally {
    if (originalEnv === undefined) delete process.env.ALERTS_MAX_INFLIGHT;
    else process.env.ALERTS_MAX_INFLIGHT = originalEnv;
  }
});

test('processAlertsForEvent suppresses a rule whose last attempt failed even when quiet_minutes is 0 (M-3 failure backoff)', async () => {
  const deliveries = [];
  const pool = {
    async query(sql, params = []) {
      if (sql.includes('FROM alert_rules')) return { rows: [makeRule({ id: 201, quiet_minutes: 0 })] };
      if (sql.includes('DISTINCT ON (rule_id)')) {
        return { rows: [{ rule_id: 201, sent_at: new Date().toISOString(), status: 'failed' }] };
      }
      if (sql.startsWith('INSERT INTO alert_deliveries')) {
        deliveries.push({ status: params[2], error: params[7] });
        return { rowCount: 1 };
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    },
  };

  const originalFetch = global.fetch;
  let fetchCalls = 0;
  global.fetch = async () => {
    fetchCalls += 1;
    return { ok: true, status: 200 };
  };
  try {
    await processAlertsForEvent(pool, makeEvent());
    assert.equal(fetchCalls, 0, 'a rule backed off after a recent failure must not be retried on the very next event');
    assert.equal(deliveries.length, 1);
    assert.equal(deliveries[0].status, 'suppressed');
  } finally {
    global.fetch = originalFetch;
  }
});

test('processAlertsForEvent writes at most one suppressed delivery row per rule per window (M-3 dedupe)', async () => {
  const deliveries = [];
  const pool = {
    async query(sql, params = []) {
      if (sql.includes('FROM alert_rules')) return { rows: [makeRule({ id: 202, quiet_minutes: 10 })] };
      if (sql.includes('DISTINCT ON (rule_id)')) {
        return { rows: [{ rule_id: 202, sent_at: new Date().toISOString(), status: 'sent' }] };
      }
      if (sql.startsWith('INSERT INTO alert_deliveries')) {
        deliveries.push({ status: params[2] });
        return { rowCount: 1 };
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    },
  };

  const originalFetch = global.fetch;
  global.fetch = async () => ({ ok: true, status: 200 });
  try {
    await processAlertsForEvent(pool, makeEvent());
    await processAlertsForEvent(pool, makeEvent());
    assert.equal(deliveries.length, 1, 'a second suppressed fire inside the same window must write no additional row');
    assert.equal(deliveries[0].status, 'suppressed');
  } finally {
    global.fetch = originalFetch;
  }
});

// -- M-1: disabled-owner rules stop firing, NULL-owner (legacy) rules still fire --
// alerts.js has no owner-state logic of its own — the gate is entirely the
// LEFT JOIN + WHERE clause in the rule SELECT. This mock simulates what a real
// Postgres LEFT JOIN would hand back (a disabled owner's row never appears in
// rulesResult.rows) so we can assert the downstream pipeline only acts on what
// the DB gives it: zero fetches and zero delivery rows for the excluded rule.
test('processAlertsForEvent fires for active-owner and NULL-owner rules, skips disabled-owner rule (M-1)', async () => {
  const activeOwnerRule = makeRule({ id: 1, target_url: 'https://203.0.113.10/hook-active' });
  const nullOwnerRule = makeRule({ id: 3, target_url: 'https://203.0.113.10/hook-null' });
  // rule id 2 (disabled-owner) is intentionally absent: a real LEFT JOIN +
  // WHERE (r.user_id IS NULL OR u.disabled_at IS NULL) would exclude it.
  const visibleRules = [activeOwnerRule, nullOwnerRule];

  const fetchedUrls = [];
  const deliveries = [];
  const pool = {
    async query(sql, params = []) {
      if (sql.includes('FROM alert_rules')) return { rows: visibleRules };
      if (sql.includes('DISTINCT ON (rule_id)')) return { rows: [] };
      if (sql.startsWith('INSERT INTO alert_deliveries')) {
        deliveries.push({ ruleId: params[0], status: params[2] });
        return { rowCount: 1 };
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    },
  };

  const originalFetch = global.fetch;
  global.fetch = async (url) => {
    fetchedUrls.push(url);
    return { ok: true, status: 200 };
  };
  try {
    await processAlertsForEvent(pool, makeEvent());
    assert.equal(deliveries.length, 2, 'only the two visible (non-disabled-owner) rules produce delivery rows');
    assert.deepEqual(deliveries.map((d) => d.ruleId).sort(), [1, 3]);
    assert.equal(
      fetchedUrls.some((u) => u.includes('hook-disabled')),
      false,
      'a disabled-owner rule must never be fetched'
    );
  } finally {
    global.fetch = originalFetch;
  }
});

// Regression (Phase 26 WR-02): the per-rule isolation catch in processAlertsForEvent
// calls log.warn(); alerts.js must import `log` or the catch itself throws
// ReferenceError, aborting delivery for every remaining rule. With the household
// alerts gate removed (Phase 26), this delivery loop now runs for all installs, so a
// missing import would crash production alert processing on the first failing rule.
test('processAlertsForEvent isolates a failing rule and still delivers the rest (WR-02)', async () => {
  const deliveries = [];
  const pool = {
    async query(sql, params = []) {
      if (sql.includes('FROM alert_rules')) {
        return { rows: [makeRule({ id: 1 }), makeRule({ id: 2 })] };
      }
      if (sql.includes('DISTINCT ON (rule_id)')) return { rows: [] };
      if (sql.startsWith('INSERT INTO alert_deliveries')) {
        // First rule's delivery write fails — its catch must log.warn and continue.
        if (params[0] === 1) throw new Error('simulated DB write failure for rule 1');
        deliveries.push({ ruleId: params[0], status: params[2] });
        return { rowCount: 1 };
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    },
  };

  const originalFetch = global.fetch;
  global.fetch = async () => ({ ok: true, status: 200 });
  try {
    // Must NOT reject — before the fix, log.warn in the catch threw ReferenceError.
    await assert.doesNotReject(() => processAlertsForEvent(pool, makeEvent()));
    assert.equal(deliveries.length, 1, 'rule 2 must still be delivered after rule 1 fails');
    assert.equal(deliveries[0].ruleId, 2, 'the surviving delivery must belong to rule 2');
  } finally {
    global.fetch = originalFetch;
  }
});
