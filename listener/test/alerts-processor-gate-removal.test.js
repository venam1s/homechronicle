/**
 * alerts-processor-gate-removal.test.js
 *
 * MALERT-07 behavioral gate-removal test.
 *
 * Verifies that processAlertsSafe — the function that previously held the
 * household master-toggle short-circuit — fires a matching per-rule-ENABLED
 * alert WITHOUT any household enable plumbing (no isAlertsEnabled, no
 * setAlertsEnabledFn). The household gate removal is the only concern here;
 * per-rule semantics (WHERE enabled = TRUE) are a regression guard.
 *
 * RED phase: this file imports __testHooks.processAlertsSafe which does not
 * exist on __testHooks until Task 2 adds it → non-zero exit confirms RED.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

// processAlertsSafe calls processAlertsForEvent(pool, …) using the module-level
// pool singleton imported from db.js. We monkeypatch pool.query on that shared
// object so the function under test uses our mock without any production change.
import { pool } from '../src/db.js';

// processAlertsSafe is exposed via __testHooks after Task 2.
// Accessing an undefined property and calling it produces TypeError → RED.
import { __testHooks } from '../src/subscriber.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRule(overrides = {}) {
  return {
    id: 1,
    name: 'Door opened',
    enabled: true,
    scope_type: 'characteristic',
    scope_value: 'ContactSensorState',
    characteristic: null,
    operator: 'equals',
    match_value: '1',
    target_url: 'https://203.0.113.10/hook',
    target_email: null,
    channel: 'webhook',
    quiet_minutes: 0,
    ...overrides,
  };
}

function makeEvent(overrides = {}) {
  return {
    eventId: 42,
    timestamp: '2026-06-15T10:00:00.000Z',
    accessoryId: 'door-1',
    accessoryName: 'Front Door',
    roomName: 'Entry',
    serviceType: 'ContactSensor',
    characteristic: 'ContactSensorState',
    oldValue: '0',
    newValue: '1',
    rawIid: 5,
    ...overrides,
  };
}

function makeRow(overrides = {}) {
  return {
    id: 42,
    timestamp: new Date().toISOString(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Test 1 (MALERT-07): matching per-rule-ENABLED rule fires via processAlertsSafe
// No household enable plumbing exists — the gate is gone.
// ---------------------------------------------------------------------------

test('processAlertsSafe fires a matching per-rule-ENABLED webhook rule (household gate removed)', async () => {
  const deliveries = [];
  const originalQuery = pool.query.bind(pool);
  const originalFetch = global.fetch;

  // Seed the mock: one matching ENABLED rule
  pool.query = async (sql, params) => {
    if (sql.includes('FROM alert_rules')) {
      // The real SQL has WHERE enabled = TRUE; we return one enabled rule.
      return { rows: [makeRule()] };
    }
    if (sql.includes('DISTINCT ON (rule_id)')) {
      return { rows: [] }; // no suppression
    }
    if (sql.startsWith('INSERT INTO alert_deliveries')) {
      deliveries.push({ ruleId: params[0], eventId: params[1], status: params[2] });
      return { rowCount: 1 };
    }
    throw new Error(`Unexpected SQL in gate-removal test: ${sql}`);
  };

  global.fetch = async () => ({ ok: true, status: 200 });

  try {
    // processAlertsSafe is on __testHooks after Task 2.
    // Before Task 2 this property is undefined → calling it throws TypeError → RED.
    await __testHooks.processAlertsSafe(makeEvent(), makeRow());

    assert.equal(deliveries.length, 1, 'one delivery row must be inserted');
    assert.equal(deliveries[0].status, 'sent', 'delivery status must be sent');
    assert.equal(deliveries[0].ruleId, 1, 'delivery must reference rule id 1');
    assert.equal(deliveries[0].eventId, 42, 'delivery must reference the event id');
  } finally {
    pool.query = originalQuery;
    global.fetch = originalFetch;
  }
});

// ---------------------------------------------------------------------------
// Test 2 (D-02 regression guard): per-rule-DISABLED rule does NOT fire.
// The WHERE enabled = TRUE filter in alerts.js must remain intact.
// We prove this by making the mock ENFORCE the filter semantically:
// if the SQL contains WHERE enabled = TRUE we return no rows (simulating a
// disabled rule being excluded by the DB); if it is ABSENT we return the row
// (which would cause a delivery and trip the assertion below).
// ---------------------------------------------------------------------------

test('processAlertsSafe does NOT fire a per-rule-DISABLED rule (per-rule filter intact)', async () => {
  const deliveries = [];
  const originalQuery = pool.query.bind(pool);
  const originalFetch = global.fetch;
  let fetchCalls = 0;

  // Semantics-aware mock: enforce the WHERE enabled = TRUE filter.
  // If the SELECT omits the filter, we return the disabled rule → assertion fails.
  // If the SELECT includes the filter (correct), we return no rows → no delivery.
  pool.query = async (sql, params) => {
    if (sql.includes('FROM alert_rules')) {
      // M-1 (quick-260830-1qj) qualified the column as `r.enabled` when the
      // rule SELECT gained a LEFT JOIN users; match the substring without a
      // leading WHERE/table-alias assumption so this guard survives either form.
      if (sql.includes('enabled = TRUE') || sql.includes('enabled=TRUE')) {
        // Filter present (correct) → no matching rows for a disabled rule
        return { rows: [] };
      }
      // Filter absent → return the disabled rule, causing a delivery → reveals regression
      return { rows: [makeRule({ enabled: false })] };
    }
    if (sql.includes('DISTINCT ON (rule_id)')) {
      return { rows: [] };
    }
    if (sql.startsWith('INSERT INTO alert_deliveries')) {
      deliveries.push({ ruleId: params[0], status: params[2] });
      return { rowCount: 1 };
    }
    throw new Error(`Unexpected SQL in gate-removal disabled test: ${sql}`);
  };

  global.fetch = async () => { fetchCalls += 1; return { ok: true, status: 200 }; };

  try {
    await __testHooks.processAlertsSafe(makeEvent(), makeRow());

    assert.equal(fetchCalls, 0, 'fetch must not be called for a disabled rule');
    assert.equal(deliveries.length, 0, 'no delivery row must be inserted for a disabled rule');
  } finally {
    pool.query = originalQuery;
    global.fetch = originalFetch;
  }
});
