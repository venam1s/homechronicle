import * as matterController from './matter-controller.js';
import { log } from './logger.js';
import { toOptionalText, toOptionalInt, normalizeNodeId, isMatterPairing } from './matter-utils.js';

const POLL_INTERVAL_MS = Number.parseInt(process.env.MATTER_POLL_INTERVAL_MS ?? '5000', 10);
const SUBSCRIBE_ENABLED = !/^(0|false|no|off)$/i.test(process.env.MATTER_SUBSCRIBE_ENABLED ?? 'false');
const SUBSCRIBE_RESTART_DELAY_MS = Number.parseInt(process.env.MATTER_SUBSCRIBE_RESTART_DELAY_MS ?? '2000', 10);
const DISCOVER_TIMEOUT_MS = Number.parseInt(process.env.MATTER_SCAN_TIMEOUT_MS ?? '15000', 10);
const MAX_CONSECUTIVE_ERRORS = 10;
const MAX_POLL_BACKOFF_MS = 10 * 60_000;

/**
 * M-4: Matter polling must never be permanently disabled — a rebooted or
 * sleepy node has to recover without a listener restart. Below the
 * consecutive-error threshold, poll at the normal base interval. At and
 * above the threshold, stretch the interval with capped exponential backoff
 * (max ~10 min) so a persistently unreachable node is polled far less
 * often, but polling never stops.
 *
 * @param {number} consecutiveErrors - session.consecutiveErrors
 * @param {number} baseMs - the configured poll interval (POLL_INTERVAL_MS)
 * @param {number} [maxMs=MAX_POLL_BACKOFF_MS] - backoff cap
 * @returns {number} delay in milliseconds before the next poll
 */
export function nextPollDelayMs(consecutiveErrors, baseMs, maxMs = MAX_POLL_BACKOFF_MS) {
  const base = Number.isFinite(baseMs) && baseMs >= 1000 ? baseMs : 30_000;
  if (consecutiveErrors < MAX_CONSECUTIVE_ERRORS) return base;
  return Math.min(base * 2 ** (consecutiveErrors - MAX_CONSECUTIVE_ERRORS + 1), maxMs);
}

function nowIso() {
  return new Date().toISOString();
}

function normalizePolledEvents(raw) {
  if (Array.isArray(raw)) return raw;
  if (raw && Array.isArray(raw.events)) return raw.events;
  if (raw && typeof raw === 'object') return [raw];
  return [];
}

export function createMatterRuntime({
  insertEvent,
  loadRooms,
}) {
  const sessions = new Map();
  const valueCache = new Map();
  const MAX_CACHE_SIZE = 10_000;

  function pruneCache() {
    if (valueCache.size <= MAX_CACHE_SIZE) return;
    // Keep only entries for active sessions
    const activePrefixes = new Set([...sessions.keys()].map((id) => `${id}:`));
    for (const key of valueCache.keys()) {
      const prefix = key.slice(0, key.indexOf(':') + 1);
      if (!activePrefixes.has(prefix)) valueCache.delete(key);
    }
    // If still over limit, drop oldest entries (Map preserves insertion order)
    if (valueCache.size > MAX_CACHE_SIZE) {
      const excess = valueCache.size - MAX_CACHE_SIZE;
      let removed = 0;
      for (const key of valueCache.keys()) {
        if (removed >= excess) break;
        valueCache.delete(key);
        removed += 1;
      }
    }
  }

  function getStatus() {
    const controllerStatus = matterController.getStatus();
    const nodes = [];
    for (const [nodeId, session] of sessions.entries()) {
      nodes.push({
        nodeId,
        active: !session.stopped,
        pollingEnabled: session.pollingEnabled,
        subscriptionActive: Boolean(session.subscription),
        lastPolledAt: session.lastPolledAt,
        lastError: session.lastError,
        lastErrorAt: session.lastErrorAt,
        lastEventAt: session.lastEventAt,
      });
    }
    return {
      pollingConfigured: true,
      commissionConfigured: true,
      controllerReady: controllerStatus.ready,
      missingConfig: [],
      pollIntervalMs: POLL_INTERVAL_MS,
      subscriptionEnabled: SUBSCRIBE_ENABLED,
      nodes,
    };
  }

  async function commission(payload = {}) {
    const setupCode = toOptionalText(payload.setupCode);
    if (!setupCode) throw new Error('setupCode is required');

    return matterController.commission(setupCode, {
      address: toOptionalText(payload.address),
      port: toOptionalInt(payload.port),
    });
  }

  function setSessionError(session, nodeId, err, mode = 'poll') {
    session.lastError = err?.message ?? String(err);
    session.lastErrorAt = nowIso();
    session.consecutiveErrors = (session.consecutiveErrors ?? 0) + 1;
    log.warn(`[matter] ${mode} failed for ${nodeId}: ${session.lastError}`);
    if (session.consecutiveErrors >= MAX_CONSECUTIVE_ERRORS && !session.stopped) {
      // M-4: polling is NEVER permanently disabled — stretch the interval
      // with capped exponential backoff instead. A rebooted or sleepy node
      // recovers without a listener restart.
      const nextDelay = nextPollDelayMs(session.consecutiveErrors, POLL_INTERVAL_MS);
      log.warn(
        `[matter] ${nodeId}: ${session.consecutiveErrors} consecutive errors, ` +
        `polling continues with backoff (next attempt in ${Math.round(nextDelay / 1000)}s)`
      );
    }
  }

  async function ingestRows(session, rows, options = {}) {
    const { suppressInsert = false } = options;
    const { nodeId, pairing } = session;
    const polledEvents = normalizePolledEvents(rows);
    if (!polledEvents.length) return;

    const rooms = loadRooms();
    session.lastPolledAt = nowIso();

    for (const row of polledEvents) {
      const endpointId = toOptionalInt(row.endpointId);
      const clusterId = toOptionalInt(row.clusterId);
      const attributeId = toOptionalInt(row.attributeId);
      const characteristic = toOptionalText(row.characteristic)
        ?? ((clusterId != null && attributeId != null)
          ? `cluster:${clusterId}/attribute:${attributeId}`
          : null);
      if (!characteristic) continue;

      const accessoryId = toOptionalText(row.accessoryId)
        ?? (endpointId == null ? nodeId : `${nodeId}:${endpointId}`);
      const cacheKey = `${nodeId}:${endpointId ?? 0}:${clusterId ?? 0}:${attributeId ?? 0}:${characteristic}`;
      const newValue = row.newValue === undefined ? row.value : row.newValue;
      if (newValue === undefined) continue;
      const oldValue = valueCache.get(cacheKey) ?? null;
      const nextValue = String(newValue);
      valueCache.set(cacheKey, nextValue);
      if (oldValue !== null && oldValue === nextValue) continue;
      if (suppressInsert) continue;

      const eventPayload = {
        accessoryId,
        accessoryName: toOptionalText(row.accessoryName) ?? pairing?.name ?? nodeId,
        roomName: rooms[accessoryId] ?? rooms[nodeId] ?? toOptionalText(row.roomName) ?? null,
        serviceType: toOptionalText(row.serviceType) ?? toOptionalText(pairing?.deviceType) ?? null,
        characteristic,
        oldValue,
        newValue: nextValue,
        protocol: 'matter',
        transport: toOptionalText(row.transport) ?? pairing?.transport ?? null,
        endpointId,
        clusterId,
        attributeId,
        rawIid: null,
      };

      // eslint-disable-next-line no-await-in-loop
      try {
        await insertEvent(eventPayload);
        session.lastEventAt = nowIso();
      } catch (err) {
        // Isolate per-row DB failures: a single bad insert must not abort
        // the remaining events in the polling batch (M-5).
        log.warn('[matter] ingestRows insert failed for row:', err.message);
      }
    }

    pruneCache();
  }

  function stopNode(nodeId) {
    const session = sessions.get(nodeId);
    if (!session) return;
    session.stopped = true;
    if (session.timer) {
      clearTimeout(session.timer);
      session.timer = null;
    }
    if (session.subscriptionRestartTimer) {
      clearTimeout(session.subscriptionRestartTimer);
      session.subscriptionRestartTimer = null;
    }
    if (session.subscription) {
      try { session.subscription.stop(); } catch (err) { log.debug('[matter-runtime] subscription stop error:', err.message); }
      session.subscription = null;
    }
    sessions.delete(nodeId);

    void matterController.stopNode(nodeId).catch(() => { /* ignore */ });

    for (const key of valueCache.keys()) {
      if (key.startsWith(`${nodeId}:`)) valueCache.delete(key);
    }
  }

  function schedulePoll(session) {
    if (session.stopped) return;
    const baseDelayMs = Number.isFinite(POLL_INTERVAL_MS) && POLL_INTERVAL_MS >= 1000 ? POLL_INTERVAL_MS : 30_000;
    const delayMs = nextPollDelayMs(session.consecutiveErrors ?? 0, baseDelayMs);
    session.timer = setTimeout(() => {
      void runPollCycle(session);
    }, delayMs);
  }

  const MAX_SUBSCRIBE_BACKOFF_MS = 5 * 60_000; // 5 minutes

  function scheduleSubscriptionRestart(session) {
    if (session.stopped || !session.pollingEnabled) return;
    if (session.subscriptionRestartTimer) {
      clearTimeout(session.subscriptionRestartTimer);
    }
    const baseDelay = Number.isFinite(SUBSCRIBE_RESTART_DELAY_MS) && SUBSCRIBE_RESTART_DELAY_MS >= 250
      ? SUBSCRIBE_RESTART_DELAY_MS
      : 2_000;
    const attempt = session.subscribeAttempts ?? 0;
    session.subscribeAttempts = attempt + 1;
    const delayMs = Math.min(baseDelay * 2 ** attempt, MAX_SUBSCRIBE_BACKOFF_MS);
    log.debug(`[matter] Scheduling subscription restart for ${session.nodeId} in ${delayMs}ms (attempt ${attempt + 1})`);
    session.subscriptionRestartTimer = setTimeout(() => {
      session.subscriptionRestartTimer = null;
      void startSubscription(session);
    }, delayMs);
  }

  async function runPollCycle(session) {
    if (session.stopped || !session.pollingEnabled) return;

    const { nodeId } = session;
    const suppressInsert = Boolean(session.initialPollPending);
    try {
      const events = await matterController.poll(nodeId);
      session.consecutiveErrors = 0;
      await ingestRows(session, events, { suppressInsert });
      session.initialPollPending = false;
    } catch (err) {
      setSessionError(session, nodeId, err, 'poll');
    } finally {
      schedulePoll(session);
    }
  }

  async function startSubscription(session) {
    if (session.stopped || !session.pollingEnabled) return;
    const { nodeId } = session;

    try {
      const sub = await matterController.subscribe(nodeId, (events) => {
        void ingestRows(session, events).catch((err) => {
          setSessionError(session, nodeId, err, 'subscribe');
        });
      });
      session.subscription = sub;
      session.subscribeAttempts = 0;
    } catch (err) {
      setSessionError(session, nodeId, err, 'subscribe');
      scheduleSubscriptionRestart(session);
    }
  }

  function startNode(pairing, nodeId) {
    stopNode(nodeId);
    const session = {
      nodeId,
      pairing,
      pollingEnabled: true,
      stopped: false,
      timer: null,
      subscription: null,
      subscriptionRestartTimer: null,
      lastPolledAt: null,
      lastError: null,
      lastErrorAt: null,
      lastEventAt: null,
      initialPollPending: !SUBSCRIBE_ENABLED,
    };
    sessions.set(nodeId, session);

    if (session.pollingEnabled) {
      if (SUBSCRIBE_ENABLED) {
        void startSubscription(session);
      } else {
        void runPollCycle(session);
      }
    }
  }

  function syncPairings(pairings) {
    const nextMatter = new Map();
    const controllerStatus = matterController.getStatus();
    const commissionedNodes = new Set(
      (controllerStatus.commissionedNodes ?? [])
        .map((id) => normalizeNodeId(id))
        .filter(Boolean)
    );

    for (const [id, pairing] of Object.entries(pairings ?? {})) {
      if (!isMatterPairing(pairing)) continue;
      const nodeId = normalizeNodeId(pairing?.nodeId ?? id);
      if (!nodeId) continue;
      if (commissionedNodes.size > 0 && !commissionedNodes.has(nodeId) && !pairing.manualImport) {
        continue;
      }
      nextMatter.set(nodeId, { ...pairing, nodeId });
    }

    for (const nodeId of sessions.keys()) {
      if (!nextMatter.has(nodeId)) stopNode(nodeId);
    }

    for (const [nodeId, pairing] of nextMatter.entries()) {
      const existing = sessions.get(nodeId);
      if (!existing) {
        startNode(pairing, nodeId);
        continue;
      }
      existing.pairing = pairing;
    }
  }

  async function scan() {
    return matterController.discover(DISCOVER_TIMEOUT_MS);
  }

  /**
   * Stop every active Matter node session (M-6: graceful shutdown).
   */
  function stopAll() {
    for (const nodeId of [...sessions.keys()]) stopNode(nodeId);
  }

  return {
    commission,
    scan,
    syncPairings,
    stopNode,
    stopAll,
    getStatus,
  };
}
