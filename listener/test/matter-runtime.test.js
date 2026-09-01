import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createMatterRuntime, nextPollDelayMs } from '../src/matter-runtime.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(__dirname, '../src/matter-runtime.js'), 'utf8');

// --- Factory helper ---

function makeRuntime(overrides = {}) {
  const events = [];
  const rooms = overrides.rooms ?? {};
  const runtime = createMatterRuntime({
    insertEvent: async (evt) => {
      events.push(evt);
      return { id: events.length, timestamp: new Date().toISOString() };
    },
    loadRooms: () => rooms,
    ...overrides,
  });
  return { runtime, events };
}

// --- Status tests ---

test('getStatus returns initial state with correct shape', () => {
  const { runtime } = makeRuntime();
  const status = runtime.getStatus();
  assert.equal(status.pollingConfigured, true);
  assert.equal(status.commissionConfigured, true);
  assert.equal(typeof status.pollIntervalMs, 'number');
  assert.equal(typeof status.subscriptionEnabled, 'boolean');
  assert.ok(Array.isArray(status.nodes));
  assert.equal(status.nodes.length, 0);
  assert.ok(Array.isArray(status.missingConfig));
});

// --- syncPairings tests ---

test('syncPairings ignores non-matter pairings', () => {
  const { runtime } = makeRuntime();
  runtime.syncPairings({
    'abc-123': { protocol: 'homekit', name: 'HAP Bridge' },
    'def-456': { name: 'No Protocol Specified' }, // defaults to homekit
  });
  const status = runtime.getStatus();
  assert.equal(status.nodes.length, 0);
});

test('syncPairings ignores pairings with invalid nodeId', () => {
  const { runtime } = makeRuntime();
  runtime.syncPairings({
    '': { protocol: 'matter', name: 'Empty ID' },
  });
  const status = runtime.getStatus();
  assert.equal(status.nodes.length, 0);
});

// --- stopNode tests ---

test('stopNode on non-existent node does not throw', () => {
  const { runtime } = makeRuntime();
  assert.doesNotThrow(() => runtime.stopNode('99999'));
  assert.doesNotThrow(() => runtime.stopNode(''));
  assert.doesNotThrow(() => runtime.stopNode(null));
});

// --- commission tests ---

test('commission rejects missing setupCode', async () => {
  const { runtime } = makeRuntime();
  await assert.rejects(
    () => runtime.commission({}),
    { message: 'setupCode is required' },
  );
});

test('commission rejects empty setupCode', async () => {
  const { runtime } = makeRuntime();
  await assert.rejects(
    () => runtime.commission({ setupCode: '   ' }),
    { message: 'setupCode is required' },
  );
});

test('commission rejects null setupCode', async () => {
  const { runtime } = makeRuntime();
  await assert.rejects(
    () => runtime.commission({ setupCode: null }),
    { message: 'setupCode is required' },
  );
});

// --- Exponential backoff validation ---

test('exponential backoff is implemented with cap', () => {
  assert.ok(
    source.includes('MAX_SUBSCRIBE_BACKOFF_MS'),
    'Should define max backoff constant',
  );
  assert.ok(
    source.includes('2 ** attempt'),
    'Should use exponential backoff formula',
  );
  assert.ok(
    source.includes('Math.min('),
    'Should cap backoff with Math.min',
  );
  assert.ok(
    source.includes('subscribeAttempts = 0'),
    'Should reset attempts on successful subscription',
  );
});

test('backoff cap is 5 minutes', () => {
  const match = source.match(/MAX_SUBSCRIBE_BACKOFF_MS\s*=\s*([\d_*\s]+)/);
  assert.ok(match, 'Should define MAX_SUBSCRIBE_BACKOFF_MS');
  // eslint-disable-next-line no-eval
  const value = Function(`return ${match[1].trim()}`)();
  assert.equal(value, 300_000, 'Max backoff should be 5 minutes (300000ms)');
});

// --- Cache cleanup validation ---

test('cache cleanup is implemented with size limit', () => {
  assert.ok(
    source.includes('MAX_CACHE_SIZE'),
    'Should define max cache size',
  );
  assert.ok(
    source.includes('pruneCache()'),
    'Should call pruneCache',
  );
});

test('cache size limit is 10000', () => {
  const match = source.match(/MAX_CACHE_SIZE\s*=\s*([\d_]+)/);
  assert.ok(match, 'Should define MAX_CACHE_SIZE');
  assert.equal(Number(match[1].replace(/_/g, '')), 10000);
});

test('pruneCache removes entries for inactive sessions first', () => {
  assert.ok(
    source.includes('activePrefixes'),
    'pruneCache should track active session prefixes',
  );
});

// --- Consecutive error tracking ---

// M-4: polling is never permanently disabled after the consecutive-error
// threshold — it backs off with capped exponential backoff instead. This
// test is a deliberate rewrite of the prior "disable polling" assertion,
// which asserted on `session.pollingEnabled = false` — a string M-4 removes.
test('consecutive errors trigger capped backoff instead of disabling polling', () => {
  assert.ok(
    source.includes('MAX_CONSECUTIVE_ERRORS'),
    'Should define MAX_CONSECUTIVE_ERRORS',
  );
  const match = source.match(/MAX_CONSECUTIVE_ERRORS\s*=\s*(\d+)/);
  assert.ok(match);
  assert.equal(Number(match[1]), 10, 'Threshold should still be 10 consecutive errors');
  assert.ok(
    !source.includes('session.pollingEnabled = false'),
    'Should NOT permanently disable polling (M-4)',
  );
  assert.ok(
    source.includes('export function nextPollDelayMs'),
    'Should export nextPollDelayMs',
  );
  assert.ok(
    source.includes('MAX_POLL_BACKOFF_MS'),
    'Should define MAX_POLL_BACKOFF_MS',
  );
  assert.ok(
    source.includes('schedulePoll') && source.includes('nextPollDelayMs('),
    'schedulePoll should compute its delay via nextPollDelayMs(',
  );
});

test('consecutive errors reset on successful poll', () => {
  assert.ok(
    source.includes('session.consecutiveErrors = 0'),
    'Should reset consecutiveErrors on success',
  );
});

// --- nextPollDelayMs behavioural tests (M-4) ---

test('nextPollDelayMs returns the base interval below the error threshold', () => {
  assert.equal(nextPollDelayMs(0, 5000), 5000);
  assert.equal(nextPollDelayMs(9, 5000), 5000);
});

test('nextPollDelayMs doubles per error at and above the threshold', () => {
  assert.equal(nextPollDelayMs(10, 5000), 10000); // 5000 * 2^1
  assert.equal(nextPollDelayMs(11, 5000), 20000); // 5000 * 2^2
  assert.equal(nextPollDelayMs(12, 5000), 40000); // 5000 * 2^3
});

test('nextPollDelayMs never exceeds MAX_POLL_BACKOFF_MS (cap is exactly 600000, reached not exceeded)', () => {
  const cap = nextPollDelayMs(30, 5000);
  assert.equal(cap, 600000, '10 minutes should be reached exactly, not exceeded');
  const wayBeyond = nextPollDelayMs(100, 5000);
  assert.equal(wayBeyond, 600000, 'Should still be capped at 600000 far beyond the threshold');
});

test('nextPollDelayMs falls back to 30000 for a non-finite or sub-1000ms base', () => {
  assert.equal(nextPollDelayMs(0, NaN), 30000);
  assert.equal(nextPollDelayMs(0, 500), 30000);
  assert.equal(nextPollDelayMs(0, -1), 30000);
});

test('nextPollDelayMs respects a custom maxMs cap', () => {
  const result = nextPollDelayMs(20, 5000, 60000);
  assert.equal(result, 60000);
});

// --- Value deduplication logic ---

test('value dedup uses string comparison with cache key containing all dimensions', () => {
  // Cache key should include nodeId, endpointId, clusterId, attributeId, characteristic
  assert.ok(
    source.includes('`${nodeId}:${endpointId ?? 0}:${clusterId ?? 0}:${attributeId ?? 0}:${characteristic}`'),
    'Cache key should include all dimensions',
  );
  // String comparison for dedup
  assert.ok(
    source.includes('const nextValue = String(newValue)'),
    'Should convert newValue to string for comparison',
  );
  assert.ok(
    source.includes('oldValue === nextValue'),
    'Should use strict equality for dedup',
  );
});

test('first poll value is always inserted (no oldValue)', () => {
  // When oldValue is null (first time), should not skip
  assert.ok(
    source.includes('oldValue !== null && oldValue === nextValue'),
    'Should only skip when oldValue is not null AND equals nextValue',
  );
});

// --- normalizePolledEvents handling ---

test('normalizePolledEvents handles various input shapes', () => {
  assert.ok(
    source.includes('Array.isArray(raw)'),
    'Should handle array input',
  );
  assert.ok(
    source.includes('raw.events'),
    'Should handle { events: [...] } wrapper',
  );
  assert.ok(
    source.includes("typeof raw === 'object'"),
    'Should handle single event object',
  );
});

// --- suppressInsert for initial poll ---

test('initial poll suppresses inserts to avoid duplicates', () => {
  assert.ok(
    source.includes('initialPollPending'),
    'Should track initial poll state',
  );
  assert.ok(
    source.includes('suppressInsert'),
    'Should support suppressInsert option in ingestRows',
  );
});

// --- Session shape validation ---

test('session object is constructed with all required fields', () => {
  // The session object uses shorthand property names (nodeId, pairing) and
  // explicit assignments (pollingEnabled: true). Check both patterns.
  const explicitFields = [
    'pollingEnabled', 'stopped', 'timer',
    'subscription', 'subscriptionRestartTimer',
    'lastPolledAt', 'lastError', 'lastErrorAt', 'lastEventAt',
    'initialPollPending',
  ];
  for (const field of explicitFields) {
    assert.ok(
      source.includes(`${field}:`),
      `Session should include ${field}`,
    );
  }
  // Shorthand fields — check they appear in session construction context
  assert.ok(source.includes('const session = {'), 'Should construct session object');
  assert.ok(source.includes('nodeId,'), 'Session should include nodeId');
  assert.ok(source.includes('pairing,'), 'Session should include pairing');
});

// --- Poll interval validation ---

test('poll interval enforces a floor and falls back to 30s', () => {
  // There are two modes now. Polling alone keeps the 1s floor because polling
  // is the transport; the reconciliation sweep that backs a subscription gets
  // a 30s floor, because a "safety net" firing every second is just polling
  // with extra steps.
  assert.ok(
    source.includes('const floor = SUBSCRIBE_ENABLED ? 30_000 : 1000;'),
    'Should floor the poll interval in both modes',
  );
  assert.ok(
    source.includes('configured >= floor'),
    'Should validate the configured interval against that floor',
  );
  assert.ok(
    source.includes('30_000'),
    'Should fall back to 30s for invalid intervals',
  );
});

// --- Subscription is the default transport, with polling as the safety net ---

test('subscriptions are enabled by default', () => {
  assert.ok(
    source.includes("process.env.MATTER_SUBSCRIBE_ENABLED ?? 'true'"),
    'Matter should subscribe by default rather than poll every few seconds',
  );
});

test('a subscribed node is still polled, slowly, as a safety net', () => {
  // The reason subscriptions were off: startNode was either/or, so a
  // subscription that died quietly meant no events at all and nothing noticed.
  assert.ok(
    !source.includes('} else {\n        void runPollCycle(session);'),
    'startNode must not treat subscribe and poll as mutually exclusive',
  );
  assert.ok(
    source.includes('if (SUBSCRIBE_ENABLED) void startSubscription(session);')
    && source.includes('void runPollCycle(session);'),
    'startNode should subscribe AND schedule the reconciliation poll',
  );
  assert.ok(
    source.includes('MATTER_RECONCILE_INTERVAL_MS'),
    'The reconciliation interval should be configurable',
  );
});

test('the first poll seeds the cache in both modes rather than logging a snapshot', () => {
  assert.ok(
    source.includes('initialPollPending: true,'),
    'A seeding poll must never insert its whole first read as change events',
  );
});

// --- Event payload shape ---

test('event payload includes all required fields for DB insertion', () => {
  // The eventPayload object uses explicit key-value pairs.
  // Some use shorthand (characteristic,) and some are explicit (accessoryId,).
  const requiredFields = [
    'accessoryId', 'accessoryName', 'roomName', 'serviceType',
    'characteristic', 'oldValue', 'protocol',
    'transport', 'endpointId', 'clusterId', 'attributeId', 'rawIid',
  ];
  // Check within the eventPayload block specifically
  const payloadBlock = source.match(/const eventPayload = \{[\s\S]*?\};/);
  assert.ok(payloadBlock, 'Should construct eventPayload');
  for (const field of requiredFields) {
    // Check for either "field:" or "field," (shorthand)
    const hasField = payloadBlock[0].includes(`${field}:`) || payloadBlock[0].includes(`${field},`);
    assert.ok(hasField, `Event payload should include ${field}`);
  }
});

test('event protocol is always set to matter', () => {
  assert.ok(
    source.includes("protocol: 'matter'"),
    'Protocol should always be matter',
  );
});

// --- Edge case: accessoryId construction ---

test('accessoryId uses nodeId when no endpointId', () => {
  assert.ok(
    source.includes('endpointId == null ? nodeId : `${nodeId}:${endpointId}`'),
    'Should construct accessoryId correctly',
  );
});

// --- Alerts run for Matter events too ---
//
// processAlertsForEvent was called from exactly one place: subscriber.js, the
// HomeKit path. matter-runtime inserted events but never ran alert rules, so
// every rule was silently HomeKit-only and no Matter device could trigger one.
test('matter-runtime accepts an injected alert processor', () => {
  assert.ok(
    source.includes('processAlerts = async () => {}'),
    'createMatterRuntime should take a processAlerts dependency with an inert default',
  );
});

test('a Matter event runs alert rules after it is inserted', () => {
  assert.ok(
    source.includes('await processAlerts({'),
    'ingestRows should run alert rules for each inserted event',
  );
  assert.ok(
    source.includes('eventId: inserted?.id'),
    'Alerts need the inserted row id, as the HomeKit path passes',
  );
});

test('an alert failure does not abort the rest of the batch', () => {
  // Same reasoning as the per-row insert isolation (M-5): one slow webhook
  // must not cost us the remaining events in a poll cycle.
  assert.ok(
    source.includes("log.error('[alerts] Matter alert processing failed:'"),
    'Alert failures should be caught and logged, not thrown',
  );
});
