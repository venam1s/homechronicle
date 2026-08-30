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

async function invoke(handler, { query = {}, params = {}, body = {}, hcSession } = {}) {
  let statusCode = 200;
  let jsonBody = null;
  const req = { query, params, body };
  if (hcSession !== undefined) req.hcSession = hcSession;
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

// Default hcSession for tests that don't assert session behaviour
const ADMIN_SESSION = { user_id: 1, role: 'admin', email: 'admin@test.com' };

/**
 * Create a mock pool that understands the 12-param INSERT for alert_rules
 * (after 26-02 adds user_id as $12 to the INSERT).
 *
 * INSERT params: $1=name, $2=enabled, $3=scope_type, $4=scope_value,
 *   $5=characteristic, $6=operator, $7=match_value, $8=channel,
 *   $9=target_url, $10=target_email, $11=quiet_minutes, $12=user_id
 */
function createMockPool({ initialRules = [] } = {}) {
  const rules = [...initialRules];
  let nextRuleId = initialRules.length
    ? Math.max(...initialRules.map((r) => r.id)) + 1
    : 1;

  return {
    async query(sql, params = []) {
      // -- GET /rules?scope=all (admin all-rules view, M-1) --
      if (sql.includes('FROM alert_rules') && sql.includes('LEFT JOIN users')) {
        const rows = [...rules].sort((a, b) => b.id - a.id).map((r) => ({
          ...r,
          owner_user_id: r.user_id ?? null,
          owner_email: r.owner_email ?? null,
          owner_disabled: r.owner_disabled ?? false,
        }));
        return { rows };
      }
      if (sql.includes('FROM alert_rules') && sql.includes('ORDER BY updated_at DESC')) {
        let rows = [...rules].sort((a, b) => b.id - a.id);
        if (sql.includes('WHERE user_id = $1')) {
          rows = rows.filter((r) => r.user_id === params[0]);
        }
        return { rows };
      }
      // -- POST /rules pre-insert cap check (M-3) --
      if (sql.includes('COUNT(*)::int AS total') && sql.includes('FROM alert_rules')) {
        const owner = params[0];
        const mine = rules.filter((r) => r.user_id === owner).length;
        return { rows: [{ total: rules.length, mine }] };
      }
      if (sql.startsWith('INSERT INTO alert_rules')) {
        const row = {
          id: nextRuleId++,
          name: params[0],
          enabled: params[1],
          scope_type: params[2],
          scope_value: params[3],
          characteristic: params[4],
          operator: params[5],
          match_value: params[6],
          channel: params[7] ?? 'webhook',
          target_url: params[8],
          target_email: params[9] ?? null,
          quiet_minutes: params[10],
          user_id: params[11] ?? null,
          created_at: '2026-02-26T10:00:00.000Z',
          updated_at: '2026-02-26T10:00:00.000Z',
        };
        rules.push(row);
        return { rows: [row] };
      }
      if (sql.startsWith('UPDATE alert_rules')) {
        const hasUserScope = sql.includes('AND user_id =');
        const id = hasUserScope ? params.at(-2) : params.at(-1);
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
      if (sql.includes('COUNT(*)::int AS total') && sql.includes('alert_deliveries')) {
        return { rows: [{ total: 0 }] };
      }
      if (sql.includes('FROM alert_deliveries d')) {
        return { rows: [] };
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    },
  };
}

function seedRule(id, userId, overrides = {}) {
  return {
    id,
    user_id: userId,
    name: `seed-${id}`,
    enabled: true,
    scope_type: 'all',
    scope_value: null,
    characteristic: null,
    operator: 'equals',
    match_value: 'true',
    channel: 'webhook',
    target_url: `https://example.test/hook-${id}`,
    target_email: null,
    quiet_minutes: 0,
    created_at: '2026-02-26T10:00:00.000Z',
    updated_at: '2026-02-26T10:00:00.000Z',
    ...overrides,
  };
}

// -- M-3: per-user and household rule caps --

test('POST /rules returns 400 when the session already owns ALERTS_MAX_RULES_PER_USER rules (M-3)', async () => {
  const initialRules = Array.from({ length: 25 }, (_, i) => seedRule(i + 1, 1));
  const pool = createMockPool({ initialRules });
  const router = createAlertsRouter({ pool });
  const post = getRouteHandler(router, 'POST', '/rules');

  const result = await invoke(post, {
    hcSession: ADMIN_SESSION,
    body: {
      name: 'One too many',
      scopeType: 'all',
      operator: 'equals',
      matchValue: 'true',
      targetUrl: 'https://example.test/hook-new',
    },
  });
  assert.equal(result.statusCode, 400, 'the 26th rule for one user must be rejected');
  assert.match(result.jsonBody.error, /rule limit/i);
});

test('POST /rules returns 201 when the session owns exactly one fewer than the per-user cap (M-3 boundary)', async () => {
  const initialRules = Array.from({ length: 24 }, (_, i) => seedRule(i + 1, 1));
  const pool = createMockPool({ initialRules });
  const router = createAlertsRouter({ pool });
  const post = getRouteHandler(router, 'POST', '/rules');

  const result = await invoke(post, {
    hcSession: ADMIN_SESSION,
    body: {
      name: 'The 25th rule',
      scopeType: 'all',
      operator: 'equals',
      matchValue: 'true',
      targetUrl: 'https://example.test/hook-25',
    },
  });
  assert.equal(result.statusCode, 201, 'the 25th rule (at the cap boundary) must be accepted');
});

test('POST /rules returns 400 when the household already holds ALERTS_MAX_RULES_TOTAL rules (M-3)', async () => {
  // 100 rules spread across many owners so no single per-user cap trips first.
  const initialRules = Array.from({ length: 100 }, (_, i) => seedRule(i + 1, (i % 50) + 1));
  const pool = createMockPool({ initialRules });
  const router = createAlertsRouter({ pool });
  const post = getRouteHandler(router, 'POST', '/rules');

  const result = await invoke(post, {
    hcSession: { user_id: 999, role: 'admin', email: 'admin@test.com' },
    body: {
      name: 'Household is full',
      scopeType: 'all',
      operator: 'equals',
      matchValue: 'true',
      targetUrl: 'https://example.test/hook-household',
    },
  });
  assert.equal(result.statusCode, 400, 'a 101st household rule must be rejected even for a fresh owner');
  assert.match(result.jsonBody.error, /household rule limit/i);
});

// -- API-L-4: 200-character caps on name / scopeValue / matchValue / characteristic --

test('POST /rules rejects name over 200 characters', async () => {
  const router = createAlertsRouter({ pool: createMockPool() });
  const post = getRouteHandler(router, 'POST', '/rules');
  const result = await invoke(post, {
    hcSession: ADMIN_SESSION,
    body: {
      name: 'x'.repeat(201),
      scopeType: 'all',
      operator: 'equals',
      matchValue: 'true',
      targetUrl: 'https://example.test/hook',
    },
  });
  assert.equal(result.statusCode, 400);
  assert.match(result.jsonBody.error, /name.*200/i);
});

test('POST /rules rejects scopeValue over 200 characters', async () => {
  const router = createAlertsRouter({ pool: createMockPool() });
  const post = getRouteHandler(router, 'POST', '/rules');
  const result = await invoke(post, {
    hcSession: ADMIN_SESSION,
    body: {
      name: 'Long scope value',
      scopeType: 'room',
      scopeValue: 'x'.repeat(201),
      operator: 'equals',
      matchValue: 'true',
      targetUrl: 'https://example.test/hook',
    },
  });
  assert.equal(result.statusCode, 400);
  assert.match(result.jsonBody.error, /scopeValue.*200/i);
});

test('POST /rules rejects matchValue over 200 characters', async () => {
  const router = createAlertsRouter({ pool: createMockPool() });
  const post = getRouteHandler(router, 'POST', '/rules');
  const result = await invoke(post, {
    hcSession: ADMIN_SESSION,
    body: {
      name: 'Long match value',
      scopeType: 'all',
      operator: 'equals',
      matchValue: 'x'.repeat(201),
      targetUrl: 'https://example.test/hook',
    },
  });
  assert.equal(result.statusCode, 400);
  assert.match(result.jsonBody.error, /matchValue.*200/i);
});

test('POST /rules rejects characteristic over 200 characters', async () => {
  const router = createAlertsRouter({ pool: createMockPool() });
  const post = getRouteHandler(router, 'POST', '/rules');
  const result = await invoke(post, {
    hcSession: ADMIN_SESSION,
    body: {
      name: 'Long characteristic',
      scopeType: 'all',
      characteristic: 'x'.repeat(201),
      operator: 'equals',
      matchValue: 'true',
      targetUrl: 'https://example.test/hook',
    },
  });
  assert.equal(result.statusCode, 400);
  assert.match(result.jsonBody.error, /characteristic.*200/i);
});

test('POST /rules accepts name at exactly 200 characters', async () => {
  const router = createAlertsRouter({ pool: createMockPool() });
  const post = getRouteHandler(router, 'POST', '/rules');
  const result = await invoke(post, {
    hcSession: ADMIN_SESSION,
    body: {
      name: 'x'.repeat(200),
      scopeType: 'all',
      operator: 'equals',
      matchValue: 'true',
      targetUrl: 'https://example.test/hook',
    },
  });
  assert.equal(result.statusCode, 201, 'a name of exactly 200 characters must be accepted');
});

test('PATCH /rules/:id rejects name over 200 characters', async () => {
  const pool = createMockPool({ initialRules: [seedRule(1, 1)] });
  const router = createAlertsRouter({ pool });
  const patch = getRouteHandler(router, 'PATCH', '/rules/:id');
  const result = await invoke(patch, {
    hcSession: ADMIN_SESSION,
    params: { id: '1' },
    body: { name: 'x'.repeat(201) },
  });
  assert.equal(result.statusCode, 400);
  assert.match(result.jsonBody.error, /name.*200/i);
});

// -- SC-4: Existing webhook POST is unaffected (regression guard, must stay GREEN) --

test('SC-4 regression: POST with webhook channel creates rule correctly', async () => {
  const router = createAlertsRouter({ pool: createMockPool() });
  const post = getRouteHandler(router, 'POST', '/rules');

  const result = await invoke(post, {
    hcSession: ADMIN_SESSION,
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
    hcSession: ADMIN_SESSION,
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
    hcSession: ADMIN_SESSION,
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
    hcSession: ADMIN_SESSION,
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
      if (sql.includes('COUNT(*)::int AS total') && sql.includes('FROM alert_rules')) {
        return { rows: [{ total: 0, mine: 0 }] };
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
    hcSession: ADMIN_SESSION,
    body: {
      name: 'Email rule',
      scopeType: 'all',
      operator: 'equals',
      matchValue: 'true',
      channel: 'email',
      targetEmail: 'recipient@example.com',
    },
  });

  // After 26-02: INSERT has 12 params (user_id=$12 added); channel at index 7, target_email at index 9
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

  const result = await invoke(list, { hcSession: ADMIN_SESSION });
  assert.equal(result.statusCode, 200, 'GET /rules must return 200');
  assert.equal(result.jsonBody.length, 1, 'must return one rule');

  const rule = result.jsonBody[0];
  assert.equal(rule.channel, 'email', 'rule must expose channel=email');
  assert.equal(rule.targetEmail, 'alert@example.com', 'rule must expose targetEmail');
  assert.equal(rule.targetUrl, undefined, 'rule must NOT expose targetUrl (redaction preserved for D-08)');
});

// -- M-1: admin scope=all view --

test('GET /rules?scope=all as admin returns every rule with owner metadata', async () => {
  const pool = createMockPool();
  const router = createAlertsRouter({ pool });
  const post = getRouteHandler(router, 'POST', '/rules');
  const list = getRouteHandler(router, 'GET', '/rules');

  await invoke(post, {
    hcSession: { user_id: 1, role: 'admin', email: 'admin@test.com' },
    body: {
      name: 'Admin rule',
      scopeType: 'all',
      operator: 'equals',
      matchValue: 'true',
      targetUrl: 'https://example.test/hook',
    },
  });
  await invoke(post, {
    hcSession: { user_id: 2, role: 'member', email: 'member@test.com' },
    body: {
      name: 'Member rule',
      scopeType: 'all',
      operator: 'equals',
      matchValue: 'true',
      targetUrl: 'https://example.test/hook-2',
    },
  });

  const result = await invoke(list, {
    hcSession: ADMIN_SESSION,
    query: { scope: 'all' },
  });
  assert.equal(result.statusCode, 200, 'scope=all admin request must return 200');
  assert.equal(result.jsonBody.length, 2, 'scope=all must return every rule regardless of owner');
  for (const rule of result.jsonBody) {
    assert.ok('ownerUserId' in rule, 'each rule must carry ownerUserId');
    assert.ok('ownerEmail' in rule, 'each rule must carry ownerEmail');
    assert.ok('ownerDisabled' in rule, 'each rule must carry ownerDisabled');
    assert.equal(rule.targetUrl, undefined, 'scope=all must still redact targetUrl');
  }
});

test('GET /rules?scope=all as member returns 403 Forbidden', async () => {
  const pool = createMockPool();
  const router = createAlertsRouter({ pool });
  const list = getRouteHandler(router, 'GET', '/rules');

  const result = await invoke(list, {
    hcSession: { user_id: 2, role: 'member', email: 'member@test.com' },
    query: { scope: 'all' },
  });
  assert.equal(result.statusCode, 403, 'member scope=all request must return 403');
  assert.equal(result.jsonBody.error, 'Forbidden');
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

  const result = await invoke(list, { hcSession: ADMIN_SESSION });
  assert.equal(result.statusCode, 200);
  const rule = result.jsonBody[0];
  assert.equal(rule.targetUrl, undefined, 'webhook targetUrl must be redacted from GET /rules');
  assert.equal(rule.channel, 'webhook', 'channel must be exposed as webhook');
});
