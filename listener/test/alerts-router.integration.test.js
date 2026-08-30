import test from 'node:test';
import assert from 'node:assert/strict';
import { createAlertsRouter } from '../src/alerts-router.js';

function getRouteHandler(router, method, path) {
  for (const layer of router.stack) {
    if (!layer.route) continue;
    if (layer.route.path !== path) continue;
    if (!layer.route.methods[method.toLowerCase()]) continue;
    return layer.route.stack.at(-1).handle;
  }
  throw new Error(`Route not found: ${method} ${path}`);
}

// hcSession option sets req.hcSession so owner-scoped handlers can read the
// calling user's identity. Omit hcSession to simulate a service-token-only
// caller (no session).
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

// createMockPool returns a lightweight in-memory pool stub.
//
// Options:
//   initialRules  – pre-seeded rule rows (each must have id, user_id, etc.)
//   deliveries    – override the default delivery rows
//
// INSERT is now a 12-param operation (user_id added as $12):
//   $1=name, $2=enabled, $3=scope_type, $4=scope_value,
//   $5=characteristic, $6=operator, $7=match_value, $8=channel,
//   $9=target_url, $10=target_email, $11=quiet_minutes, $12=user_id
//
// GET /rules: when SQL contains 'WHERE user_id = $1', filters rows by params[0].
// PATCH:      when SQL contains 'AND user_id =', uses params.at(-2)=ruleId,
//             params.at(-1)=user_id for IDOR-safe lookup.
// DELETE:     when SQL contains 'AND user_id =', params[0]=ruleId, params[1]=user_id.
// GET /deliveries: when SQL contains 'r.user_id', filters via rule ownership.
function createMockPool({ initialRules = [], deliveries: initialDeliveries } = {}) {
  const rules = [...initialRules];
  const deliveries = initialDeliveries ?? [{
    id: 1,
    rule_id: 1,
    event_id: 90,
    status: 'sent',
    target_url: 'https://example.test/hook',
    response_code: 200,
    error: null,
    sent_at: '2026-02-26T10:00:00.000Z',
    rule_name: 'Door Opened',
  }];
  // Delivery rule metadata used for join-based owner filtering
  const deliveryRules = [{ id: 1, user_id: 1, name: 'Door Opened' }];
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

      // -- GET /rules --
      if (sql.includes('FROM alert_rules') && sql.includes('ORDER BY updated_at DESC')) {
        const hasUserScope = sql.includes('WHERE user_id = $1');
        let rows = [...rules].sort((a, b) => b.id - a.id);
        if (hasUserScope) {
          const uid = params[0];
          rows = rows.filter((r) => r.user_id === uid);
        }
        return { rows };
      }

      // -- POST /rules pre-insert cap check (M-3) --
      if (sql.includes('COUNT(*)::int AS total') && sql.includes('FROM alert_rules')) {
        const owner = params[0];
        const mine = rules.filter((r) => r.user_id === owner).length;
        return { rows: [{ total: rules.length, mine }] };
      }

      // -- POST /rules (INSERT) --
      if (sql.startsWith('INSERT INTO alert_rules')) {
        // 12-param INSERT: $1=name, $2=enabled, $3=scope_type, $4=scope_value,
        // $5=characteristic, $6=operator, $7=match_value, $8=channel,
        // $9=target_url, $10=target_email, $11=quiet_minutes, $12=user_id
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

      // -- PATCH /rules/:id (UPDATE) --
      if (sql.startsWith('UPDATE alert_rules')) {
        const hasUserScope = sql.includes('AND user_id =');
        let existing;
        if (hasUserScope) {
          // IDOR-safe: params.at(-2) = ruleId, params.at(-1) = user_id
          const ruleId = params.at(-2);
          const uid = params.at(-1);
          existing = rules.find((r) => r.id === ruleId && r.user_id === uid);
        } else {
          // Legacy (pre-scoping): params.at(-1) = ruleId
          const id = params.at(-1);
          existing = rules.find((r) => r.id === id);
        }
        if (!existing) return { rows: [] };
        if (sql.includes('enabled = $1')) {
          existing.enabled = params[0];
        }
        // Apply channel and target_email changes (for email-lock tests in Task 3)
        const channelIdx = sql.indexOf('channel = $');
        if (channelIdx !== -1) {
          const paramNum = parseInt(sql.slice(channelIdx + 'channel = $'.length), 10);
          existing.channel = params[paramNum - 1];
        }
        const targetEmailIdx = sql.indexOf('target_email = $');
        if (targetEmailIdx !== -1) {
          const paramNum = parseInt(sql.slice(targetEmailIdx + 'target_email = $'.length), 10);
          existing.target_email = params[paramNum - 1];
        }
        existing.updated_at = '2026-02-26T11:00:00.000Z';
        return { rows: [existing] };
      }

      // -- DELETE /rules/:id --
      if (sql.startsWith('DELETE FROM alert_rules')) {
        const hasUserScope = sql.includes('AND user_id =');
        const before = rules.length;
        let next;
        if (hasUserScope) {
          // params[0] = ruleId, params[1] = user_id
          next = rules.filter((r) => !(r.id === params[0] && r.user_id === params[1]));
        } else {
          next = rules.filter((r) => r.id !== params[0]);
        }
        rules.length = 0;
        rules.push(...next);
        return { rowCount: before - next.length };
      }

      // -- GET /deliveries COUNT --
      if (sql.includes('COUNT(*)::int AS total') && sql.includes('alert_deliveries')) {
        const hasUserScope = sql.includes('r.user_id');
        if (hasUserScope) {
          const uid = params[0];
          const ownedRuleIds = new Set(
            deliveryRules.filter((r) => r.user_id === uid).map((r) => r.id)
          );
          return { rows: [{ total: deliveries.filter((d) => ownedRuleIds.has(d.rule_id)).length }] };
        }
        return { rows: [{ total: deliveries.length }] };
      }

      // -- GET /deliveries SELECT --
      if (sql.includes('FROM alert_deliveries d')) {
        const hasUserScope = sql.includes('r.user_id');
        if (hasUserScope) {
          const uid = params[0];
          const ownedRuleIds = new Set(
            deliveryRules.filter((r) => r.user_id === uid).map((r) => r.id)
          );
          const scoped = deliveries.filter((d) => ownedRuleIds.has(d.rule_id));
          return { rows: scoped };
        }
        return { rows: deliveries };
      }

      throw new Error(`Unexpected SQL: ${sql}`);
    },
  };
}

// Default hcSession for existing tests that don't assert session behavior
const ADMIN_SESSION = { user_id: 1, role: 'admin', email: 'admin@test.com' };

test('/api/alerts/rules supports create/list/patch/delete', async () => {
  const router = createAlertsRouter({ pool: createMockPool() });
  const post = getRouteHandler(router, 'POST', '/rules');
  const list = getRouteHandler(router, 'GET', '/rules');
  const patch = getRouteHandler(router, 'PATCH', '/rules/:id');
  const del = getRouteHandler(router, 'DELETE', '/rules/:id');

  const created = await invoke(post, {
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
  assert.equal(created.statusCode, 201);
  assert.equal(created.jsonBody.name, 'Door opened');

  const listed = await invoke(list, { hcSession: ADMIN_SESSION });
  assert.equal(listed.statusCode, 200);
  assert.equal(listed.jsonBody.length, 1);
  assert.equal(listed.jsonBody[0].targetUrl, undefined, 'GET /rules must not expose targetUrl');

  const updated = await invoke(patch, {
    hcSession: ADMIN_SESSION,
    params: { id: String(created.jsonBody.id) },
    body: { enabled: false },
  });
  assert.equal(updated.statusCode, 200);
  assert.equal(updated.jsonBody.enabled, false);

  const deleted = await invoke(del, {
    hcSession: ADMIN_SESSION,
    params: { id: String(created.jsonBody.id) },
  });
  assert.equal(deleted.statusCode, 200);
  assert.equal(deleted.jsonBody.success, true);
});

test('/api/alerts/rules POST and GET list both redact targetUrl (L-1)', async () => {
  const router = createAlertsRouter({ pool: createMockPool() });
  const post = getRouteHandler(router, 'POST', '/rules');
  const list = getRouteHandler(router, 'GET', '/rules');

  const created = await invoke(post, {
    hcSession: ADMIN_SESSION,
    body: {
      name: 'Webhook test',
      scopeType: 'all',
      operator: 'equals',
      matchValue: 'true',
      targetUrl: 'https://secret.example.com/webhook/abc123',
    },
  });
  assert.equal(created.statusCode, 201);
  // POST response must NOT echo the raw webhook URL (L-1)
  assert.equal(created.jsonBody.targetUrl, undefined, 'POST response must redact targetUrl');

  // GET list must also NOT expose the raw URL
  const listed = await invoke(list, { hcSession: ADMIN_SESSION });
  assert.equal(listed.statusCode, 200);
  assert.equal(listed.jsonBody[0].targetUrl, undefined);
});

test('/api/alerts/rules validates bad payloads', async () => {
  const router = createAlertsRouter({ pool: createMockPool() });
  const post = getRouteHandler(router, 'POST', '/rules');

  const invalid = await invoke(post, {
    hcSession: ADMIN_SESSION,
    body: {
      name: 'Bad rule',
      scopeType: 'all',
      operator: 'bogus',
      matchValue: 'true',
      targetUrl: 'https://example.test/hook',
    },
  });
  assert.equal(invalid.statusCode, 400);
  assert.match(invalid.jsonBody.error, /operator/i);

  const blockedTarget = await invoke(post, {
    hcSession: ADMIN_SESSION,
    body: {
      name: 'Loopback target',
      scopeType: 'all',
      operator: 'equals',
      matchValue: 'true',
      targetUrl: 'http://127.0.0.1:9999/hook',
    },
  });
  assert.equal(blockedTarget.statusCode, 400);
  assert.match(blockedTarget.jsonBody.error, /loopback/i);
});

test('PATCH switching an email rule to webhook without a URL returns 400, not 500 (CR-01)', async () => {
  // Reproduces the channel-field CHECK violation: an existing email rule has
  // target_url = NULL, so switching it to the webhook channel without supplying
  // a target URL leaves the row invalid. The DB rejects it via
  // chk_alert_channel_fields (SQLSTATE 23514); the router must surface that as a
  // 400 client error rather than an opaque 500.
  const channelConstraintPool = {
    async query(sql) {
      if (sql.startsWith('UPDATE alert_rules')) {
        const err = new Error(
          'new row for relation "alert_rules" violates check constraint "chk_alert_channel_fields"'
        );
        err.code = '23514';
        err.constraint = 'chk_alert_channel_fields';
        throw err;
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    },
  };
  const router = createAlertsRouter({ pool: channelConstraintPool });
  const patch = getRouteHandler(router, 'PATCH', '/rules/:id');

  const result = await invoke(patch, {
    hcSession: ADMIN_SESSION,
    params: { id: '1' },
    body: { channel: 'webhook' },
  });

  assert.equal(result.statusCode, 400, 'channel-field violation must be a 400, not 500');
  assert.match(result.jsonBody.error, /target URL|recipient email/i);
});

test('/api/alerts/deliveries returns paginated response', async () => {
  const router = createAlertsRouter({ pool: createMockPool() });
  const handler = getRouteHandler(router, 'GET', '/deliveries');

  const response = await invoke(handler, {
    hcSession: ADMIN_SESSION,
    query: { page: '1', limit: '50' },
  });
  assert.equal(response.statusCode, 200);
  assert.equal(response.jsonBody.total, 1);
  assert.equal(response.jsonBody.deliveries.length, 1);
  assert.equal(response.jsonBody.deliveries[0].status, 'sent');
});

// -- Owner-scoping, IDOR, and auth tests (MALERT-01, MALERT-02, MALERT-04) --
// These tests are written in RED: they assert behavior the router does not yet
// implement. They MUST fail on the current router and pass after Task 2 (GREEN).

test('GET /rules own-only: session user A sees only their own rules, not user B (MALERT-01)', async () => {
  // Pre-seed two rules: one owned by user 1 (admin A), one by user 2 (member B)
  const pool = createMockPool({
    initialRules: [
      {
        id: 10,
        user_id: 1,
        name: 'A-rule',
        enabled: true,
        scope_type: 'all',
        scope_value: null,
        characteristic: null,
        operator: 'equals',
        match_value: 'true',
        channel: 'webhook',
        target_url: 'https://example.test/hook',
        target_email: null,
        quiet_minutes: 0,
        created_at: '2026-02-26T10:00:00.000Z',
        updated_at: '2026-02-26T10:00:00.000Z',
      },
      {
        id: 11,
        user_id: 2,
        name: 'B-rule',
        enabled: true,
        scope_type: 'all',
        scope_value: null,
        characteristic: null,
        operator: 'equals',
        match_value: 'true',
        channel: 'webhook',
        target_url: 'https://example.test/hook-b',
        target_email: null,
        quiet_minutes: 0,
        created_at: '2026-02-26T10:00:00.000Z',
        updated_at: '2026-02-26T10:00:00.000Z',
      },
    ],
  });
  const router = createAlertsRouter({ pool });
  const list = getRouteHandler(router, 'GET', '/rules');

  // User A (user_id=1) should see only their own rule
  const responseA = await invoke(list, { hcSession: { user_id: 1, role: 'admin', email: 'a@test.com' } });
  assert.equal(responseA.statusCode, 200);
  assert.equal(responseA.jsonBody.length, 1, 'User A must see only 1 rule (their own)');
  assert.equal(responseA.jsonBody[0].name, 'A-rule', 'User A must see A-rule, not B-rule');
});

test('POST /rules session scope: member (non-admin) can create own rule (MALERT-02)', async () => {
  const pool = createMockPool();
  const router = createAlertsRouter({ pool });
  const post = getRouteHandler(router, 'POST', '/rules');

  const result = await invoke(post, {
    hcSession: { user_id: 2, role: 'member', email: 'member@test.com' },
    body: {
      name: 'Member rule',
      scopeType: 'all',
      operator: 'equals',
      matchValue: 'true',
      targetUrl: 'https://example.test/hook',
    },
  });
  assert.equal(result.statusCode, 201, 'member POST /rules must return 201');
  assert.equal(result.jsonBody.name, 'Member rule');
});

test('POST /rules no-session: service-token-only caller is rejected 401/403 (MALERT-02, T-26-NOSESS)', async () => {
  const pool = createMockPool();
  const router = createAlertsRouter({ pool });
  const post = getRouteHandler(router, 'POST', '/rules');

  // No hcSession set — simulates API_TOKEN-only caller
  const result = await invoke(post, {
    body: {
      name: 'Service-token rule',
      scopeType: 'all',
      operator: 'equals',
      matchValue: 'true',
      targetUrl: 'https://example.test/hook',
    },
  });
  assert.ok(
    result.statusCode === 401 || result.statusCode === 403,
    `POST /rules without session must return 401 or 403, got ${result.statusCode}`
  );
});

test('PATCH /rules/:id IDOR: user A cannot patch user B rule — returns 404 (MALERT-04, T-26-IDOR)', async () => {
  // Pre-seed a rule owned by user B (user_id=2)
  const pool = createMockPool({
    initialRules: [
      {
        id: 20,
        user_id: 2,
        name: 'B-rule',
        enabled: true,
        scope_type: 'all',
        scope_value: null,
        characteristic: null,
        operator: 'equals',
        match_value: 'true',
        channel: 'webhook',
        target_url: 'https://example.test/hook-b',
        target_email: null,
        quiet_minutes: 0,
        created_at: '2026-02-26T10:00:00.000Z',
        updated_at: '2026-02-26T10:00:00.000Z',
      },
    ],
  });
  const router = createAlertsRouter({ pool });
  const patch = getRouteHandler(router, 'PATCH', '/rules/:id');

  // User A (user_id=1) attempts to PATCH B's rule (id=20)
  const result = await invoke(patch, {
    hcSession: { user_id: 1, role: 'admin', email: 'a@test.com' },
    params: { id: '20' },
    body: { enabled: false },
  });
  assert.equal(result.statusCode, 404, 'PATCH targeting another user rule must return 404 (IDOR guard)');
});

test('DELETE /rules/:id IDOR: user A cannot delete user B rule — returns 404 (MALERT-04, T-26-IDOR)', async () => {
  // Pre-seed a rule owned by user B (user_id=2)
  const pool = createMockPool({
    initialRules: [
      {
        id: 30,
        user_id: 2,
        name: 'B-rule-del',
        enabled: true,
        scope_type: 'all',
        scope_value: null,
        characteristic: null,
        operator: 'equals',
        match_value: 'true',
        channel: 'webhook',
        target_url: 'https://example.test/hook-b',
        target_email: null,
        quiet_minutes: 0,
        created_at: '2026-02-26T10:00:00.000Z',
        updated_at: '2026-02-26T10:00:00.000Z',
      },
    ],
  });
  const router = createAlertsRouter({ pool });
  const del = getRouteHandler(router, 'DELETE', '/rules/:id');

  // User A (user_id=1, member role) attempts to DELETE B's rule (id=30).
  // Role is deliberately 'member', not 'admin': M-1 intentionally grants
  // admins a cross-owner DELETE override (see the dedicated admin-delete
  // test above), so the IDOR guard is now scoped to non-admin callers.
  const result = await invoke(del, {
    hcSession: { user_id: 1, role: 'member', email: 'a@test.com' },
    params: { id: '30' },
  });
  assert.equal(result.statusCode, 404, 'DELETE targeting another user rule must return 404 (IDOR guard)');
});

// -- M-1: admin all-rules view and admin delete override --

test('GET /rules?scope=all as admin returns rules from every owner, including legacy NULL-owner rows', async () => {
  const pool = createMockPool({
    initialRules: [
      {
        id: 70,
        user_id: 1,
        owner_email: 'a@test.com',
        owner_disabled: false,
        name: 'A-rule',
        enabled: true,
        scope_type: 'all',
        scope_value: null,
        characteristic: null,
        operator: 'equals',
        match_value: 'true',
        channel: 'webhook',
        target_url: 'https://example.test/hook-a',
        target_email: null,
        quiet_minutes: 0,
        created_at: '2026-02-26T10:00:00.000Z',
        updated_at: '2026-02-26T10:00:00.000Z',
      },
      {
        id: 71,
        user_id: 2,
        owner_email: 'b@test.com',
        owner_disabled: true,
        name: 'B-rule (disabled owner)',
        enabled: true,
        scope_type: 'all',
        scope_value: null,
        characteristic: null,
        operator: 'equals',
        match_value: 'true',
        channel: 'webhook',
        target_url: 'https://example.test/hook-b',
        target_email: null,
        quiet_minutes: 0,
        created_at: '2026-02-26T10:00:00.000Z',
        updated_at: '2026-02-26T10:00:00.000Z',
      },
      {
        id: 72,
        user_id: null,
        owner_email: null,
        owner_disabled: false,
        name: 'Legacy rule',
        enabled: true,
        scope_type: 'all',
        scope_value: null,
        characteristic: null,
        operator: 'equals',
        match_value: 'true',
        channel: 'webhook',
        target_url: 'https://example.test/hook-legacy',
        target_email: null,
        quiet_minutes: 0,
        created_at: '2026-02-26T10:00:00.000Z',
        updated_at: '2026-02-26T10:00:00.000Z',
      },
    ],
  });
  const router = createAlertsRouter({ pool });
  const list = getRouteHandler(router, 'GET', '/rules');

  const result = await invoke(list, { hcSession: ADMIN_SESSION, query: { scope: 'all' } });
  assert.equal(result.statusCode, 200);
  assert.equal(result.jsonBody.length, 3, 'scope=all must return every rule, including legacy and disabled-owner rows');
  const bRule = result.jsonBody.find((r) => r.name === 'B-rule (disabled owner)');
  assert.equal(bRule.ownerDisabled, true, 'disabled owner must be flagged');
  assert.equal(bRule.ownerEmail, 'b@test.com');
  const legacyRule = result.jsonBody.find((r) => r.name === 'Legacy rule');
  assert.equal(legacyRule.ownerUserId, null, 'legacy rule has no owner');
  assert.equal(legacyRule.ownerEmail, null, 'legacy rule has no owner email');
});

test('DELETE /rules/:id as admin removes another user\'s rule (M-1)', async () => {
  const pool = createMockPool({
    initialRules: [
      {
        id: 80,
        user_id: 2,
        name: 'Member-owned rule',
        enabled: true,
        scope_type: 'all',
        scope_value: null,
        characteristic: null,
        operator: 'equals',
        match_value: 'true',
        channel: 'webhook',
        target_url: 'https://example.test/hook',
        target_email: null,
        quiet_minutes: 0,
        created_at: '2026-02-26T10:00:00.000Z',
        updated_at: '2026-02-26T10:00:00.000Z',
      },
    ],
  });
  const router = createAlertsRouter({ pool });
  const del = getRouteHandler(router, 'DELETE', '/rules/:id');

  // Admin (user_id=1) deletes a rule owned by member (user_id=2).
  const result = await invoke(del, {
    hcSession: { user_id: 1, role: 'admin', email: 'a@test.com' },
    params: { id: '80' },
  });
  assert.equal(result.statusCode, 200, 'admin must be able to delete another user\'s rule');
  assert.equal(result.jsonBody.success, true);
});

// -- Member email lock + SMTP-off rejection tests (MALERT-05, MALERT-06) --
// Task 3: RED tests for email channel enforcement. Added in the same commit as
// implementation because the lock and SMTP guard were implemented together
// with the owner-scoping in Task 2. Tests verify the correct behavior.

test('POST email: member target_email forced to session email regardless of body (MALERT-05, T-26-EMAIL-SPOOF)', async () => {
  const pool = createMockPool();
  const router = createAlertsRouter({ pool });
  const post = getRouteHandler(router, 'POST', '/rules');

  // Member submits attacker@y as targetEmail but session email is m@x
  const result = await invoke(post, {
    hcSession: { user_id: 2, role: 'member', email: 'm@x.com' },
    body: {
      name: 'Email rule',
      scopeType: 'all',
      operator: 'equals',
      matchValue: 'true',
      channel: 'email',
      targetEmail: 'attacker@y.com',
    },
  });
  assert.equal(result.statusCode, 201, 'member email POST must return 201');
  // Server must override attacker email with the member's own session email (D-08)
  assert.equal(result.jsonBody.targetEmail, 'm@x.com', 'target_email must be session email, not submitted value');
});

test('POST email: admin keeps submitted recipient unchanged (MALERT-05)', async () => {
  const pool = createMockPool();
  const router = createAlertsRouter({ pool });
  const post = getRouteHandler(router, 'POST', '/rules');

  // Admin submits other@y; must be preserved unchanged
  const result = await invoke(post, {
    hcSession: { user_id: 1, role: 'admin', email: 'a@x.com' },
    body: {
      name: 'Admin email rule',
      scopeType: 'all',
      operator: 'equals',
      matchValue: 'true',
      channel: 'email',
      targetEmail: 'other@y.com',
    },
  });
  assert.equal(result.statusCode, 201, 'admin email POST must return 201');
  // Admin recipient must be preserved (D-08: lock only applies to members)
  assert.equal(result.jsonBody.targetEmail, 'other@y.com', 'admin target_email must be kept as submitted');
});

test('POST channel=email rejected with 400 when smtp isEmailEnabled() is false (MALERT-06, T-26-SMTP-DOS)', async () => {
  const pool = createMockPool();
  // Inject isEmailEnabled: () => false to simulate SMTP not configured (D-09)
  const router = createAlertsRouter({ pool, isEmailEnabled: () => false });
  const post = getRouteHandler(router, 'POST', '/rules');

  const result = await invoke(post, {
    hcSession: { user_id: 1, role: 'admin', email: 'a@x.com' },
    body: {
      name: 'Email when SMTP off',
      scopeType: 'all',
      operator: 'equals',
      matchValue: 'true',
      channel: 'email',
      targetEmail: 'someone@example.com',
    },
  });
  assert.equal(result.statusCode, 400, 'email channel must return 400 when SMTP unavailable');
  assert.match(result.jsonBody.error, /smtp|email.*unavailable|not configured/i,
    'error must convey SMTP is not configured');
});

test('PATCH email lock: member switching to email gets target_email forced to session email (MALERT-05)', async () => {
  // Pre-seed an existing rule owned by user 2
  const pool = createMockPool({
    initialRules: [
      {
        id: 50,
        user_id: 2,
        name: 'Existing webhook rule',
        enabled: true,
        scope_type: 'all',
        scope_value: null,
        characteristic: null,
        operator: 'equals',
        match_value: 'true',
        channel: 'webhook',
        target_url: null,
        target_email: null,
        quiet_minutes: 0,
        created_at: '2026-02-26T10:00:00.000Z',
        updated_at: '2026-02-26T10:00:00.000Z',
      },
    ],
  });
  const router = createAlertsRouter({ pool });
  const patch = getRouteHandler(router, 'PATCH', '/rules/:id');

  // Member switches rule to email with a foreign targetEmail
  const result = await invoke(patch, {
    hcSession: { user_id: 2, role: 'member', email: 'member@x.com' },
    params: { id: '50' },
    body: {
      channel: 'email',
      targetEmail: 'foreign@attacker.com',
    },
  });
  assert.equal(result.statusCode, 200, 'PATCH must succeed for member switching to email');
  // Server must override with session email (D-08)
  assert.equal(result.jsonBody.targetEmail, 'member@x.com', 'PATCH target_email must be locked to session email for member');
});

test('PATCH email lock bypass: member patching targetEmail without channel on existing email rule is still locked (MALERT-05, T-26-EMAIL-SPOOF)', async () => {
  // Pre-seed a member-owned rule that is ALREADY channel=email.
  // The attack: member sends PATCH { targetEmail: 'attacker@evil.com' } with NO channel field.
  // Without the fix, effectiveChannel is undefined so the lock never fires — attacker wins.
  const pool = createMockPool({
    initialRules: [
      {
        id: 60,
        user_id: 2,
        name: 'Existing email rule',
        enabled: true,
        scope_type: 'all',
        scope_value: null,
        characteristic: null,
        operator: 'equals',
        match_value: 'true',
        channel: 'email',
        target_url: null,
        target_email: 'member@x.com',
        quiet_minutes: 0,
        created_at: '2026-02-26T10:00:00.000Z',
        updated_at: '2026-02-26T10:00:00.000Z',
      },
    ],
  });
  const router = createAlertsRouter({ pool });
  const patch = getRouteHandler(router, 'PATCH', '/rules/:id');

  // Member sends ONLY targetEmail — no channel field in body
  const result = await invoke(patch, {
    hcSession: { user_id: 2, role: 'member', email: 'member@x.com' },
    params: { id: '60' },
    body: { targetEmail: 'attacker@evil.com' },  // no channel field
  });
  assert.equal(result.statusCode, 200, 'PATCH targetEmail-only must succeed');
  // Lock must fire even without channel in body — target_email must stay as session email
  assert.equal(
    result.jsonBody.targetEmail,
    'member@x.com',
    'PATCH target_email must be locked to session email even when channel is not in body'
  );
});
