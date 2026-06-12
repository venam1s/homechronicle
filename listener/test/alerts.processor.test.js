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
        return {
          rows: [makeRule({ channel: 'email', target_email: 'alert@example.com', target_url: null, quiet_minutes: 10 })],
        };
      }
      if (sql.includes('DISTINCT ON (rule_id)')) {
        // Return a prior sent delivery within the quiet period
        return { rows: [{ rule_id: 1, sent_at: new Date().toISOString() }] };
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
