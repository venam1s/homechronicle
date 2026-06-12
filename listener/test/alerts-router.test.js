/**
 * alerts-router.test.js — Wave 0 RED scaffolds for channel validation and API exposure.
 *
 * Tests drive behaviour through the router's POST/PATCH/GET handlers via the
 * getRouteHandler + invoke() mock pattern from alerts-router.integration.test.js.
 * validateCreate / validatePatch / toApiRule are module-local (not exported); they
 * are exercised end-to-end through the route handlers.
 *
 * Wave 0: implemented by plan 22-03
 * These tests FAIL until plan 22-03 adds channel/targetEmail validation and exposure.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { createAlertsRouter } from '../src/alerts-router.js';

// -- Helpers (copied from alerts-router.integration.test.js) --

function getRouteHandler(router, method, path) {
  for (const layer of router.stack) {
    if (!layer.route) continue;
    if (layer.route.path !== path) continue;
    if (!layer.route.methods[method.toLowerCase()]) continue;
    return layer.route.stack.at(-1).handle;
  }
  throw new Error(`Route not found: ${method} ${path}`);
}

async function invoke(handler, { query = {}, params = {}, body = {} } = {}) {
  let statusCode = 200;
  let jsonBody = null;
  const req = { query, params, body };
  const res = {
    status(code) {
      statusCode = code;
      return this;
    },
    json(payload) {
      jsonBody = payload;
      return this;
    },
  };
  await handler(req, res);
  return { statusCode, jsonBody };
}

/**
 * Create a mock pool that understands the new 11-param INSERT for alert_rules
 * (after 22-03 adds channel + target_email to the INSERT).
 * Falls back gracefully so the existing webhook SC-4 test still works against
 * the old 9-param INSERT until 22-03 lands.
 */
function createMockPool() {
  const rules = [];
  let nextRuleId = 1;

  return {
    async query(sql, params = []) {
      if (sql.includes('FROM alert_rules') && sql.includes('ORDER BY updated_at DESC')) {
        return { rows: [...rules].sort((a, b) => b.id - a.id) };
      }
      if (sql.startsWith('INSERT INTO alert_rules')) {
        // After 22-03 the INSERT has 11 params:
        //   $1=name, $2=enabled, $3=scope_type, $4=scope_value, $5=characteristic,
        //   $6=operator, $7=match_value, $8=channel, $9=target_url, $10=target_email, $11=quiet_minutes
        // Before 22-03 it has 9 params (no channel/target_email).
        // Accept either shape so SC-4 webhook test passes pre-22-03.
        const has11 = params.length >= 11;
        const row = {
          id: nextRuleId++,
          name: params[0],
          enabled: params[1],
          scope_type: params[2],
          scope_value: params[3],
          characteristic: params[4],
          operator: params[5],
          match_value: params[6],
          channel: has11 ? params[7] : 'webhook',
          target_url: has11 ? params[8] : params[7],
          target_email: has11 ? params[9] : null,
          quiet_minutes: has11 ? params[10] : params[8],
          created_at: '2026-02-26T10:00:00.000Z',
          updated_at: '2026-02-26T10:00:00.000Z',
        };
        rules.push(row);
        return { rows: [row] };
      }
      if (sql.startsWith('UPDATE alert_rules')) {
        const id = params.at(-1);
        const existing = rules.find((r) => r.id === id);
        if (!existing) return { rows: [] };
        existing.updated_at = '2026-02-26T11:00:00.000Z';
        return { rows: [existing] };
      }
      if (sql.startsWith('DELETE FROM alert_rules')) {
        const id = params[0];
        const before = rules.length;
        const next = rules.filter((r) => r.id !== id);
        rules.length = 0;
        rules.push(...next);
        return { rowCount: before - next.length };
      }
      if (sql.includes('COUNT(*)::int AS total FROM alert_deliveries')) {
        return { rows: [{ total: 0 }] };
      }
      if (sql.includes('FROM alert_deliveries d')) {
        return { rows: [] };
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    },
  };
}

// -- SC-4: Existing webhook POST is unaffected (regression guard, must stay GREEN) --

test('SC-4 regression: POST with webhook channel creates rule correctly', async () => {
  const router = createAlertsRouter({ pool: createMockPool() });
  const post = getRouteHandler(router, 'POST', '/rules');

  const result = await invoke(post, {
    body: {
      name: 'Door opened',
      scopeType: 'characteristic',
      scopeValue: 'ContactSensorState',
      operator: 'equals',
      matchValue: 'true',
      targetUrl: 'https://example.test/hook',
      quietMinutes: 5,
    },
  });
  assert.equal(result.statusCode, 201, 'webhook POST must return 201');
  assert.equal(result.jsonBody.name, 'Door opened', 'name must be set');
});

// -- Wave 0: channel validation scaffolds — implemented by plan 22-03 --
// These tests FAIL until plan 22-03 adds channel + targetEmail validation to validateCreate.

test('POST with channel=email but no targetEmail returns 400 (Wave 0 - implemented by 22-03)', async () => {
  const router = createAlertsRouter({ pool: createMockPool() });
  const post = getRouteHandler(router, 'POST', '/rules');

  const result = await invoke(post, {
    body: {
      name: 'Email rule missing address',
      scopeType: 'all',
      operator: 'equals',
      matchValue: 'true',
      channel: 'email',
      // targetEmail intentionally omitted
    },
  });
  assert.equal(result.statusCode, 400, 'must return 400 when channel=email and targetEmail absent');
  assert.ok(
    result.jsonBody?.error,
    'response must include error message',
  );
});

test('POST with channel=email and malformed targetEmail returns 400 (Wave 0 - implemented by 22-03)', async () => {
  const router = createAlertsRouter({ pool: createMockPool() });
  const post = getRouteHandler(router, 'POST', '/rules');

  const result = await invoke(post, {
    body: {
      name: 'Email rule bad address',
      scopeType: 'all',
      operator: 'equals',
      matchValue: 'true',
      channel: 'email',
      targetEmail: 'not-a-valid-email',
    },
  });
  assert.equal(result.statusCode, 400, 'must return 400 when targetEmail is malformed');
  assert.ok(
    result.jsonBody?.error,
    'response must include error message',
  );
});

test('POST with channel=email and well-formed targetEmail succeeds (Wave 0 - implemented by 22-03)', async () => {
  const router = createAlertsRouter({ pool: createMockPool() });
  const post = getRouteHandler(router, 'POST', '/rules');

  const result = await invoke(post, {
    body: {
      name: 'Motion alert email',
      scopeType: 'all',
      operator: 'equals',
      matchValue: 'true',
      channel: 'email',
      targetEmail: 'alert@example.com',
    },
  });
  assert.equal(result.statusCode, 201, 'must return 201 for valid email rule');
  assert.equal(result.jsonBody.channel, 'email', 'response must include channel=email');
  assert.equal(result.jsonBody.targetEmail, 'alert@example.com', 'response must include targetEmail');
});

test('POST with channel=email inserts channel and target_email params (Wave 0 - implemented by 22-03)', async () => {
  const insertedParams = [];
  const pool = {
    async query(sql, params = []) {
      if (sql.includes('FROM alert_rules') && sql.includes('ORDER BY updated_at DESC')) {
        return { rows: [] };
      }
      if (sql.startsWith('INSERT INTO alert_rules')) {
        insertedParams.push(...params);
        return {
          rows: [{
            id: 1,
            name: params[0],
            enabled: params[1],
            scope_type: params[2],
            scope_value: params[3],
            characteristic: params[4],
            operator: params[5],
            match_value: params[6],
            channel: params[7],
            target_url: params[8],
            target_email: params[9],
            quiet_minutes: params[10],
            created_at: '2026-02-26T10:00:00.000Z',
            updated_at: '2026-02-26T10:00:00.000Z',
          }],
        };
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    },
  };

  const router = createAlertsRouter({ pool });
  const post = getRouteHandler(router, 'POST', '/rules');

  await invoke(post, {
    body: {
      name: 'Email rule',
      scopeType: 'all',
      operator: 'equals',
      matchValue: 'true',
      channel: 'email',
      targetEmail: 'recipient@example.com',
    },
  });

  // After 22-03: INSERT has 11 params; channel at index 7, target_email at index 9
  assert.ok(insertedParams.length >= 10, 'INSERT must include channel and target_email params');
  assert.equal(insertedParams[7], 'email', 'channel param must be email');
  assert.equal(insertedParams[9], 'recipient@example.com', 'target_email param must be the email address');
});

// -- GET /rules exposes channel and targetEmail, does NOT expose targetUrl (D-08) --

test('GET /rules returns channel and targetEmail for email rule (Wave 0 - implemented by 22-03)', async () => {
  const pool = {
    async query(sql) {
      if (sql.includes('FROM alert_rules') && sql.includes('ORDER BY updated_at DESC')) {
        return {
          rows: [{
            id: 1,
            name: 'Email rule',
            enabled: true,
            scope_type: 'all',
            scope_value: null,
            characteristic: null,
            operator: 'equals',
            match_value: 'true',
            channel: 'email',
            target_url: null,
            target_email: 'alert@example.com',
            quiet_minutes: 0,
            created_at: '2026-02-26T10:00:00.000Z',
            updated_at: '2026-02-26T10:00:00.000Z',
          }],
        };
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    },
  };

  const router = createAlertsRouter({ pool });
  const list = getRouteHandler(router, 'GET', '/rules');

  const result = await invoke(list);
  assert.equal(result.statusCode, 200, 'GET /rules must return 200');
  assert.equal(result.jsonBody.length, 1, 'must return one rule');

  const rule = result.jsonBody[0];
  assert.equal(rule.channel, 'email', 'rule must expose channel=email');
  assert.equal(rule.targetEmail, 'alert@example.com', 'rule must expose targetEmail');
  assert.equal(rule.targetUrl, undefined, 'rule must NOT expose targetUrl (redaction preserved for D-08)');
});

test('GET /rules does not expose targetUrl for webhook rules either (SC-4 + D-08) (Wave 0 - implemented by 22-03)', async () => {
  const pool = {
    async query(sql) {
      if (sql.includes('FROM alert_rules') && sql.includes('ORDER BY updated_at DESC')) {
        return {
          rows: [{
            id: 1,
            name: 'Webhook rule',
            enabled: true,
            scope_type: 'all',
            scope_value: null,
            characteristic: null,
            operator: 'equals',
            match_value: 'true',
            channel: 'webhook',
            target_url: 'https://secret.example.com/hook',
            target_email: null,
            quiet_minutes: 0,
            created_at: '2026-02-26T10:00:00.000Z',
            updated_at: '2026-02-26T10:00:00.000Z',
          }],
        };
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    },
  };

  const router = createAlertsRouter({ pool });
  const list = getRouteHandler(router, 'GET', '/rules');

  const result = await invoke(list);
  assert.equal(result.statusCode, 200);
  const rule = result.jsonBody[0];
  assert.equal(rule.targetUrl, undefined, 'webhook targetUrl must be redacted from GET /rules');
  assert.equal(rule.channel, 'webhook', 'channel must be exposed as webhook');
});
