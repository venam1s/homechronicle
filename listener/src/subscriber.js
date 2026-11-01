/**
 * subscriber.js — connects to paired HomeKit accessories and subscribes
 * to characteristic value-change events.
 *
 * Exports:
 *   startSubscribers(pairings) → void
 *   stopSubscriber(deviceId)   → void
 */

import { HttpClient } from 'hap-controller';
import { insertEvent, pool } from './db.js';
import { processAlertsForEvent } from './alerts.js';
import {
  abortHapClient, addressesToTry, advertisedAddresses, nextAddress, rememberAddresses, tryEachAddress,
  isConnectionError as isHapConnectionError,
} from './hap-addresses.js';
import {
  cacheAccessoryMetadata,
  clearAccessoryMetadata,
  getAccessoryIdentity,
  nameCharacteristicKey,
} from './accessory-metadata.js';
import { log } from './logger.js';
import { resolvePairMethod } from './setup-helpers.js';
import { withTimeout, parseIntInRange } from './utils.js';

// H-3: bound every HAP round-trip so an accessory that accepts TCP but never
// answers can no longer strand a session (or the nightly repair scheduler)
// forever. Pair-setup gets its own longer budget on purpose — an SRP
// handshake against a slow accessory legitimately takes tens of seconds
// (nginx allows 300s for commissioning), and a 30s cap would break working
// re-pairs.
const HAP_REQUEST_TIMEOUT_MS = parseIntInRange(process.env.HAP_REQUEST_TIMEOUT_MS, 30_000, 1_000, 300_000);
const HAP_PAIR_TIMEOUT_MS = parseIntInRange(process.env.HAP_PAIR_TIMEOUT_MS, 60_000, 1_000, 300_000);
// A device that keeps failing and isn't announced on the network at all is
// treated as unreachable: retried this often, quietly, until it reappears.
const UNREACHABLE_AFTER_FAILURES = 5;
const HAP_UNREACHABLE_RETRY_MS = parseIntInRange(process.env.HAP_UNREACHABLE_RETRY_MS, 10 * 60_000, 60_000, 24 * 60 * 60_000);
// A connected device that has sent nothing for this long is asked for one
// value: an answer proves it is alive (a quiet sensor is not stale), no answer
// means a wedged or vanished accessory and triggers a reconnect.
const LIVENESS_PROBE_IDLE_MS = 10 * 60_000;

let alertEmailFrom = '';

/**
 * Set the SMTP `from` address threaded into the email alert send branch.
 * Called from index.js after initEmail so the alert From matches invites/resets (D-07).
 */
export function setAlertEmailFrom(value) {
  alertEmailFrom = value ?? '';
}

/**
 * The current alert "from" address.
 *
 * Exposed because alert processing is not HomeKit-specific but this module
 * owns the address: the Matter runtime needs the same value to run the same
 * rules. Reading it through a getter rather than copying it keeps one source
 * of truth, so a later SMTP config change reaches both transports at once.
 */
export function getAlertEmailFrom() {
  return alertEmailFrom;
}

// Milliseconds before attempting reconnect after a lost connection
let reconnectBaseMs = Number.parseInt(process.env.RECONNECT_BASE_MS ?? '5000', 10);
let reconnectMaxMs  = Number.parseInt(process.env.RECONNECT_MAX_MS ?? '60000', 10);
if (!Number.isFinite(reconnectBaseMs) || reconnectBaseMs < 1) reconnectBaseMs = 5_000;
if (!Number.isFinite(reconnectMaxMs) || reconnectMaxMs < reconnectBaseMs) reconnectMaxMs = 60_000;
const RUN_CYCLE_NAME_REGEX = /(run leveling|run clean cycle)/i;
const RUN_CYCLE_OFF_DELAY_MS = Number.parseInt(
  process.env.RUN_CYCLE_OFF_DELAY_MS ?? `${15 * 60_000}`,
  10
);

/**
 * Compare pre-cache firmware versions against freshly-populated identities and
 * return an array of insertEvent-compatible payload objects for any accessories
 * whose firmware_revision has changed.
 *
 * Called from connectAccessory() AFTER cacheAccessoryMetadata() updates the
 * cache. The caller iterates the returned array and calls insertEvent() for each.
 *
 * @param {object} opts
 * @param {Map<string, string>} opts.oldFirmwareByAccessoryId - effectiveId → trimmed firmware string (only non-null values)
 * @param {Map<string, object>} opts.identitiesByAccessoryId  - effectiveId → identity object from cacheAccessoryMetadata
 * @param {string} opts.deviceId      - top-level device ID (for room fallback)
 * @param {string} opts.accessoryName - display name of the top-level accessory
 * @param {Record<string, string>} opts.rooms - rooms map (effectiveId → roomName)
 * @returns {Array<object>} insertEvent payloads
 */
function detectFirmwareChanges({ oldFirmwareByAccessoryId, identitiesByAccessoryId, deviceId, accessoryName, rooms }) {
  const events = [];
  for (const [effId, identity] of identitiesByAccessoryId.entries()) {
    const newFw = identity.firmware_revision != null ? String(identity.firmware_revision).trim() : null;
    const oldFw = oldFirmwareByAccessoryId.get(effId) ?? null;
    if (oldFw !== null && newFw !== null && oldFw !== newFw) {
      const effName = identity.child_name || accessoryName;
      events.push({
        accessoryId: effId,
        accessoryName: effName,
        roomName: rooms[effId] ?? (effId.includes(':') ? rooms[deviceId] : null) ?? null,
        serviceType: 'AccessoryInformation',
        characteristic: 'FirmwareRevision',
        oldValue: oldFw,
        newValue: newFw,
        protocol: 'homekit',
        transport: 'ip',
      });
    }
  }
  return events;
}

// In-memory cache of last-seen values: "deviceId:aid.iid" → value string.
// Used to populate old_value on each event so the UI can show before→after.
// Survives reconnects within the same process; cleared on restart.
const valueCache = new Map();
const delayedOffTimers = new Map();
const subscriberSessions = new Map();
const subscriberStats = new Map();
let connectAccessoryImpl = connectAccessory;
// Factory for HAP HttpClient instances — overrideable in tests to avoid real
// network connections during auto-repair unit tests.
let httpClientFactory = (deviceId, address, port) => new HttpClient(deviceId, address, port);

function isAuthError(err) {
  const msg = err?.message ?? String(err);
  return /M[24]:\s*Error:\s*2\b/.test(msg)
    || /M2:.*Signature verification/i.test(msg);
}

function isMaxPeersError(err) {
  const msg = err?.message ?? String(err);
  return /M\d:\s*Error:\s*4\b/.test(msg) || /maxpeers/i.test(msg);
}

// Includes request timeouts (withTimeout sets err.code = 'ETIMEDOUT' but not the
// message): an address that silently drops traffic must trigger re-discovery.
function isConnectionError(err) {
  return isHapConnectionError(err);
}

async function processAlertsSafe(eventPayload, insertedRow) {
  try {
    await processAlertsForEvent(pool, {
      ...eventPayload,
      // The stored name (display name when set); rules may still name the device
      // as it reports itself.
      accessoryName: insertedRow?.accessory_name ?? eventPayload.accessoryName,
      reportedName: eventPayload.accessoryName,
      eventId: insertedRow?.id,
      timestamp: insertedRow?.timestamp ?? new Date().toISOString(),
    }, alertEmailFrom);
  } catch (err) {
    log.error('[alerts] Processing failed:', err.message ?? err.stack ?? err);
  }
}

/**
 * Start subscribers for all entries in the pairings map.
 *
 * @param {Record<string, object>} pairings  - content of pairings.json
 * @param {Record<string, string>} rooms     - content of rooms.json (accessoryId → roomName)
 * @param {(id: string) => object|null} getPairing
 *   Optional callback that returns the *current* pairing for a device ID.
 *   Used so reconnects pick up a refreshed address/port if pairings.json
 *   was updated (e.g. by a discovery scan) while we were backing off.
 */
export function startSubscribers(pairings, rooms = {}, getPairing = null, options = {}) {
  for (const [deviceId, pairing] of Object.entries(pairings)) {
    startSubscriber(deviceId, pairing, rooms, getPairing, options);
  }
}

// Discovery/save callbacks used when a caller doesn't pass its own (e.g. the
// repair scheduler restarting a session): without them a session can't
// re-discover a moved device or notice that it is gone from the network.
let defaultSubscriberOptions = {};

/** Set the discoverDevice/savePairing callbacks every session falls back to. */
export function setDefaultSubscriberOptions(options = {}) {
  defaultSubscriberOptions = { ...options };
}

export function startSubscriber(deviceId, pairing, rooms = {}, getPairing = null, options = {}) {
  stopSubscriber(deviceId);
  const stats = {
    connectAttempts: 0,
    reconnectSchedules: 0,
    disconnects: 0,
    resubscribeSuccesses: 0,
    resubscribeFailures: 0,
    subscribeFailures: 0,
    accessoriesQueryFailures: 0,
    lastConnectedAt: null,
    lastSubscribedAt: null,
    lastHealthyAt: null,
    lastError: null,
    lastErrorAt: null,
    // Auth failure tracking
    authFailures: 0,
    authFailed: false,
    needsRepair: false,
    autoRepairAttempts: 0,
    autoRepairLastError: null,
    autoRepairedAt: null,
    // M-01: explicit liveness flag — true ONLY between a successful
    // subscribeCharacteristics() and the next disconnect/failure. Used
    // (combined with a fresh lastHealthyAt) as the canonical "device is
    // really online" signal — Boolean(session.client) was too permissive
    // (covered the connection-setup window and survived hung sockets).
    subscribed: false,
  };
  const session = {
    deviceId,
    rooms,
    getPairing,
    pairingName: pairing.name,
    retryDelayMs: reconnectBaseMs,
    stopped: false,
    repairing: false,
    reconnectTimeout: null,
    client: null,
    eventHandler: null,
    disconnectHandler: null,
    stats,
    inconclusiveProbes: 0,
    discoverDevice: options.discoverDevice ?? defaultSubscriberOptions.discoverDevice ?? null,
    savePairing: options.savePairing ?? defaultSubscriberOptions.savePairing ?? null,
  };
  subscriberSessions.set(deviceId, session);
  subscriberStats.set(deviceId, stats);
  connectAccessoryImpl(session, pairing);
}

export function stopSubscriber(deviceId) {
  const session = subscriberSessions.get(deviceId);
  if (!session) return;

  session.stopped = true;
  stopLivenessProbe(session);
  if (session.reconnectTimeout) {
    clearTimeout(session.reconnectTimeout);
    session.reconnectTimeout = null;
  }
  clearRepairRetry(session);

  releaseClient(session);

  for (const [timerKey, timeoutId] of delayedOffTimers.entries()) {
    if (timerKey.startsWith(`${deviceId}:`)) {
      clearTimeout(timeoutId);
      delayedOffTimers.delete(timerKey);
    }
  }

  for (const key of valueCache.keys()) {
    if (key.startsWith(`${deviceId}:`)) valueCache.delete(key);
  }
  clearAccessoryMetadata(deviceId);
  subscriberStats.delete(deviceId);

  subscriberSessions.delete(deviceId);
}

/**
 * Stop every active subscriber session (M-6: graceful shutdown). Closes each
 * HAP session so accessories do not accumulate dead controller peers across
 * redeploys and trip the terminal 'max peers reached' path.
 */
export function stopAllSubscribers() {
  const deviceIds = [...subscriberSessions.keys()];
  for (const deviceId of deviceIds) stopSubscriber(deviceId);
  log.info(`[subscriber] Stopped ${deviceIds.length} subscriber session(s)`);
}

function connectAccessory(session, pairing) {
  if (session.stopped) return;
  if (session.repairing) {
    log.debug(`[subscriber] ${pairing.name}: skipping connect, auto re-pair in progress`);
    return;
  }

  stopLivenessProbe(session);
  session.inconclusiveProbes = 0; // a new connection starts with a clean slate
  // This connect supersedes any pending one: a stale timer firing later would
  // tear down the client this call is about to set up.
  if (session.reconnectTimeout) {
    clearTimeout(session.reconnectTimeout);
    session.reconnectTimeout = null;
  }
  // Close any existing client to prevent duplicate event handlers and
  // leaked TCP connections (CR-02).
  releaseClient(session);

  const { deviceId, rooms, getPairing, stats } = session;
  const { name: accessoryName, address, port, longTermData } = pairing;
  session.pairingName = accessoryName;
  stats.connectAttempts += 1;

  attemptLog(session).info(`[subscriber] Connecting to ${accessoryName} (${address}:${port})`);

  const client = new HttpClient(deviceId, address, port, longTermData);
  session.client = client;

  withTimeout(
    client.getAccessories(),
    HAP_REQUEST_TIMEOUT_MS,
    () => { try { client.close?.(); } catch (e) { /* ignore */ } },
    'getAccessories'
  ).then(async (accessories) => {
    // Snapshot old firmware versions before cacheAccessoryMetadata() clears the cache
    const oldFirmwareByAccessoryId = new Map();
    for (const acc of accessories?.accessories ?? []) {
      const effId = acc.aid > 1 ? `${deviceId}:${acc.aid}` : deviceId;
      const prev = getAccessoryIdentity(effId);
      if (prev?.firmware_revision != null) {
        oldFirmwareByAccessoryId.set(effId, String(prev.firmware_revision).trim());
      }
    }

    session.probeKey = nameCharacteristicKey(accessories);

    const { iidMetaMap: iidMeta, identitiesByAccessoryId } = cacheAccessoryMetadata({
      deviceId,
      pairingName: accessoryName,
      accessories,
    });

    // Detect and log firmware version changes (skipped on first connect — oldFirmwareByAccessoryId is empty)
    const firmwareEvents = detectFirmwareChanges({
      oldFirmwareByAccessoryId,
      identitiesByAccessoryId,
      deviceId,
      accessoryName,
      rooms,
    });
    for (const payload of firmwareEvents) {
      insertEvent(payload).then(() => {
        log.info(`[firmware] ${payload.accessoryName}: ${payload.oldValue} -> ${payload.newValue}`);
      }).catch((err) => {
        log.error(`[firmware] Failed to log version change for ${payload.accessoryName}:`, err.message ?? err);
      });
    }
    stats.lastConnectedAt = new Date().toISOString();
    stats.lastHealthyAt = stats.lastConnectedAt;
    stats.authFailures = 0;
    session.lastFailedAddress = null;
    // The device answers with valid keys again: any re-pair episode is over
    // (unless a re-pair is running right now; it settles its own counters).
    if (!session.repairing) {
      clearRepairRetry(session);
      stats.authFailed = false;
      stats.autoRepairAttempts = 0;
    }
    markReachable(session, accessoryName);

    // subscribeCharacteristics() expects an array of "aid.iid" strings
    const watchedKeys = [...iidMeta.keys()];

    if (watchedKeys.length === 0) {
      // Nothing to subscribe to (e.g. a Homebridge main bridge whose devices are
      // paired as their own child bridges): healthy, just idle — not stale.
      stats.nothingToWatch = true;
      stats.needsRepair = false; // connected and answering
      session.retryDelayMs = reconnectBaseMs; // connected: start the backoff over
      log.info(`[subscriber] ${accessoryName}: no watched characteristics found`);
      startLivenessProbe(session, client, pairing, accessoryName);
      return;
    }
    stats.nothingToWatch = false;

    // HAP events are emitted on the client instance itself (HttpClient extends
    // EventEmitter). subscribeCharacteristics() returns Promise<void|null> —
    // NOT an EventEmitter — so .on() must be called on `client`, not on the
    // return value.
    const handleEvent = async (event) => {
      if (session.stopped) return;
      // Refresh the heartbeat once per event batch (not per change in the loop).
      // This is the canonical signal that the HAP subscription is actively producing data.
      stats.lastHealthyAt = new Date().toISOString();
      session.inconclusiveProbes = 0; // an event is proof of life
      const changes = event?.characteristics ?? (Array.isArray(event) ? event : [event]);
      for (const change of changes) {
        const key  = `${change.aid}.${change.iid}`;
        const meta = iidMeta.get(key);
        if (!meta) {
          log.debug(`[event-skip] ${accessoryName} aid=${change.aid} iid=${change.iid} value=${change.value} (not in watched list)`);
          continue;
        }

        // Use a component-specific label when an accessory exposes multiple
        // watched services (e.g. switch + sensor under the same parent name).
        const effectiveName = meta.componentName || meta.childName || accessoryName;
        // For bridges, suffix the deviceId with the aid so each child is distinct
        const effectiveId = change.aid > 1 ? `${deviceId}:${change.aid}` : deviceId;

        // Look up (and then update) the cached previous value for this characteristic
        const cacheKey = `${effectiveId}:${change.aid}.${change.iid}`;
        const oldValue = valueCache.get(cacheKey) ?? null;
        const newValue = String(change.value);
        valueCache.set(cacheKey, newValue);

        // Skip inserting if the value hasn't actually changed
        // (some accessories re-broadcast the same value on reconnect)
        if (oldValue !== null && oldValue === newValue) {
          log.debug(`[event-skip] ${effectiveName} → ${meta.characteristicName}: unchanged (${newValue})`);
          continue;
        }

        const eventPayload = {
          accessoryId:    effectiveId,
          accessoryName:  effectiveName,
          // rooms.json stores child overrides keyed by effectiveId.
          // If the child has no override, fall back to the top-level bridge entry
          // so setting a room on the bridge automatically covers all its children.
          roomName:       rooms[effectiveId] ?? (change.aid > 1 ? rooms[deviceId] : null) ?? null,
          serviceType:    meta.serviceType,
          characteristic: meta.characteristicName,
          oldValue,
          newValue,
          protocol:       'homekit',
          transport:      'ip',
          rawIid:         change.iid,
        };

        // Run-cycle switches often auto-reset immediately. Delay OFF logging so
        // users see completion later rather than an instant auto-off.
        const timerKey = `${effectiveId}:${change.aid}.${change.iid}`;
        const isRunCycleSwitch =
          meta.characteristicName === 'On' &&
          RUN_CYCLE_NAME_REGEX.test(effectiveName) &&
          Number.isFinite(RUN_CYCLE_OFF_DELAY_MS) &&
          RUN_CYCLE_OFF_DELAY_MS > 0;

        if (isRunCycleSwitch && newValue === 'true') {
          const pending = delayedOffTimers.get(timerKey);
          if (pending) {
            clearTimeout(pending);
            delayedOffTimers.delete(timerKey);
          }
        }

        if (isRunCycleSwitch && newValue === 'false' && oldValue === 'true') {
          const pending = delayedOffTimers.get(timerKey);
          if (pending) clearTimeout(pending);

          const timeoutId = setTimeout(async () => {
            delayedOffTimers.delete(timerKey);
            if (session.stopped) return;
            try {
              const inserted = await insertEvent(eventPayload);
              await processAlertsSafe(eventPayload, inserted);
              log.debug(
                `[event-delayed] ${effectiveName} → ${meta.characteristicName}: ${change.value} ` +
                `(delayed ${Math.round(RUN_CYCLE_OFF_DELAY_MS / 1000)}s)`
              );
            } catch (err) {
              log.error(`[subscriber] Delayed DB insert failed:`, err.message ?? err.stack ?? err);
            }
          }, RUN_CYCLE_OFF_DELAY_MS);

          delayedOffTimers.set(timerKey, timeoutId);
          log.debug(
            `[event-delay] ${effectiveName} → ${meta.characteristicName}: ${change.value} ` +
            `queued for ${Math.round(RUN_CYCLE_OFF_DELAY_MS / 1000)}s`
          );
          continue;
        }

        try {
          const inserted = await insertEvent(eventPayload);
          await processAlertsSafe(eventPayload, inserted);
          log.info(`[event] ${effectiveName} → ${meta.characteristicName}: ${change.value}`);
        } catch (err) {
          log.error(`[subscriber] DB insert failed:`, err.message ?? err.stack ?? err);
        }
      }
    };

    session.eventHandler = handleEvent;
    client.on('event', handleEvent);

    // 'event-disconnect' fires when the HAP subscription connection drops.
    // The argument is the previously-subscribed list — pass it straight back
    // to resubscribe without needing to rebuild the key list.
    const disconnectHandler = async (formerSubscribes) => {
      if (session.stopped) return;
      // M-01: clear the liveness flag at handler entry — the socket is gone
      // until a successful resubscribe. Anything that asks "is this device
      // really up?" between now and the resubscribe success must see false.
      stats.subscribed = false;
      stats.disconnects += 1;
      log.warn(`[subscriber] ${accessoryName}: disconnected, resubscribing…`);
      try {
        await withTimeout(
          client.subscribeCharacteristics(formerSubscribes),
          HAP_REQUEST_TIMEOUT_MS,
          () => { try { client.close?.(); } catch (e) { /* ignore */ } },
          'subscribeCharacteristics (resubscribe)'
        );
        stats.resubscribeSuccesses += 1;
        stats.lastSubscribedAt = new Date().toISOString();
        stats.lastHealthyAt = stats.lastSubscribedAt;
        stats.subscribed = true;
        startLivenessProbe(session, client, pairing, accessoryName);
        log.info(`[subscriber] ${accessoryName}: resubscribed to ${formerSubscribes.length} characteristic(s)`);
      } catch (err) {
        // The client may have been replaced meanwhile (a failed liveness probe
        // or a reconnect already took over): leave recovery to that path.
        if (session.stopped || session.client !== client) return;
        stats.resubscribeFailures += 1;
        // stats.subscribed already false (set at handler entry)
        stats.lastError = err.message ?? String(err);
        stats.lastErrorAt = new Date().toISOString();

        if (isAuthError(err)) {
          stats.authFailures += 1;
          if (stats.authFailures >= 3) {
            stats.authFailed = true;
            log.warn(`[subscriber] ${accessoryName}: resubscribe auth failed ${stats.authFailures} times, attempting auto re-pair…`);
            attemptAutoRepair(session, pairing);
            return;
          }
          log.warn(`[subscriber] ${accessoryName}: resubscribe auth failed (${stats.authFailures}/3):`, err.message ?? err.stack ?? err);
        } else {
          log.error(`[subscriber] ${accessoryName}: resubscribe failed:`, err.message ?? err.stack ?? err);
        }

        if (isConnectionError(err) && session.discoverDevice) {
          log.info(`[subscriber] ${accessoryName}: resubscribe connection failed, re-discovering…`);
          rediscoverAndReconnect(session, pairing, err);
          return;
        }

        scheduleReconnect(session, pairing);
      }
    };
    session.disconnectHandler = disconnectHandler;
    client.on('event-disconnect', disconnectHandler);

    try {
      await withTimeout(
        client.subscribeCharacteristics(watchedKeys),
        HAP_REQUEST_TIMEOUT_MS,
        () => { try { client.close?.(); } catch (e) { /* ignore */ } },
        'subscribeCharacteristics'
      );
      session.retryDelayMs = reconnectBaseMs;
      stats.lastSubscribedAt = new Date().toISOString();
      stats.lastHealthyAt = stats.lastSubscribedAt;
      stats.subscribed = true; // M-01: enter the live state
      stats.needsRepair = false; // subscribed: whatever needed repair is fixed
      startLivenessProbe(session, client, pairing, accessoryName);
      log.info(`[subscriber] ${accessoryName}: subscribed to ${watchedKeys.length} characteristic(s)`);
    } catch (err) {
      if (session.stopped || session.client !== client) return; // superseded by another connect
      stats.subscribeFailures += 1;
      stats.subscribed = false; // M-01: defensive — already false from init, explicit on every failure path
      stats.lastError = err.message ?? String(err);
      stats.lastErrorAt = new Date().toISOString();
      log.error(`[subscriber] ${accessoryName}: subscribe failed:`, err.message ?? err.stack ?? err);
      scheduleReconnect(session, pairing);
    }

    // Seed the valueCache with current values so the first real change event
    // has a correct old_value.  We intentionally do NOT insert these into the
    // DB — they aren't real activity and would flood the timeline with
    // hundreds of simultaneous old_value=null entries on every restart.
    try {
      // Deliberately no close-on-expiry here: by this point the client owns
      // the live event subscription just established above, and closing it
      // on a slow seed read would kill that subscription. A failed/slow seed
      // is cosmetic (see the debug-level catch below).
      const result = await withTimeout(
        client.getCharacteristics(watchedKeys),
        HAP_REQUEST_TIMEOUT_MS,
        null,
        'getCharacteristics (seed)'
      );
      const values = result?.characteristics ?? [];
      for (const ch of values) {
        const meta = iidMeta.get(`${ch.aid}.${ch.iid}`);
        if (!meta) continue;
        const effectiveId = ch.aid > 1 ? `${deviceId}:${ch.aid}` : deviceId;
        const cacheKey = `${effectiveId}:${ch.aid}.${ch.iid}`;
        valueCache.set(cacheKey, String(ch.value));
      }
      if (values.length > 0) {
        log.info(`[subscriber] ${accessoryName}: seeded ${values.length} initial value(s)`);
      }
    } catch (err) {
      log.debug(`[subscriber] ${accessoryName}: initial poll failed: ${err.message ?? err}`);
    }

  }).catch((err) => {
    if (session.stopped || session.client !== client) return; // superseded by another connect
    stats.accessoriesQueryFailures += 1;
    stats.lastError = err.message ?? String(err);
    stats.lastErrorAt = new Date().toISOString();

    if (isMaxPeersError(err)) {
      stats.needsRepair = true;
      log.error(`[subscriber] ${accessoryName}: max peers reached, re-pair required (remove a pairing in Apple Home first)`);
      return; // Terminal — do not retry or auto-re-pair
    }

    if (isAuthError(err)) {
      stats.authFailures += 1;
      if (stats.authFailures >= 3) {
        stats.authFailed = true;
        log.warn(`[subscriber] ${accessoryName}: authentication failed ${stats.authFailures} times, attempting auto re-pair…`);
        attemptAutoRepair(session, pairing);
        return;
      }
      log.warn(`[subscriber] ${accessoryName}: getAccessories auth failed (${stats.authFailures}/3):`, err.message ?? err.stack ?? err);
    } else if (session.stats.unreachable) {
      log.debug(`[subscriber] ${accessoryName}: getAccessories failed:`, err.message ?? err);
    } else {
      log.error(`[subscriber] ${accessoryName}: getAccessories failed:`, err.message ?? err.stack ?? err);
    }

    if (isConnectionError(err) && session.discoverDevice) {
      attemptLog(session).info(`[subscriber] ${accessoryName}: connection failed, re-discovering device…`);
      rediscoverAndReconnect(session, pairing, err);
      return;
    }

    scheduleReconnect(session, pairing);
  });
}

// -- Liveness probe --
// Event age alone can't tell a quiet sensor from a wedged accessory, and an
// open TCP socket can't either (the kernel answers keepalives for a hung
// process). So LIVENESS_PROBE_IDLE_MS after the last sign of life the device
// is asked for its own name (aid 1 AccessoryInformation.Name: answered by the
// HAP server itself, no plugin or cloud call). A value, or an HTTP error
// status (the HAP server responded), proves it is alive and refreshes
// lastHealthyAt.
//
// What a failure means depends on what there is to lose. With a live event
// subscription, only "no answer at all" (timeout, unreachable) tears it down:
// a dead HAP process closes the subscription socket by itself (handled by the
// disconnect path), while a refused extra connection (slot-limited devices) or
// a transient pair-verify error is ambiguous — it just doesn't count as proof
// of life, so the device shows as not connected after HUNG_SOCKET_THRESHOLD_MS
// without losing its subscription. Only an authentication failure (a revoked
// pairing failing pair-verify) escalates: it reconnects after
// MAX_INCONCLUSIVE_PROBES in a row, and the connect's auth handling takes
// over. Everything else where the host answered keeps the subscription. A bridge with nothing subscribed has nothing to lose, so any failure
// reconnects it.
//
// Limit: the probe runs on its own connection, so it proves the accessory is
// alive, not that it still sends events on the subscription socket.

let livenessIdleMs = LIVENESS_PROBE_IDLE_MS;

// Inconclusive probes in a row before the subscription is reconnected anyway
// (e.g. a pairing revoked while the old event socket stays open).
const MAX_INCONCLUSIVE_PROBES = 3;

const PROBE = Object.freeze({
  ALIVE: 'alive', // answered: proof of life recorded
  INCONCLUSIVE: 'inconclusive', // ambiguous error: subscription kept, no proof recorded
  DEAD: 'dead', // reconnect started
  SKIPPED: 'skipped', // no longer applies (stopped, replaced, not subscribed)
  BUSY: 'busy', // a probe on this client was already running
});

function lastHealthyMs(stats) {
  const ms = stats.lastHealthyAt ? Date.parse(stats.lastHealthyAt) : NaN;
  return Number.isFinite(ms) ? ms : null;
}

function stopLivenessProbe(session) {
  if (session.livenessTimer) {
    clearTimeout(session.livenessTimer);
    session.livenessTimer = null;
  }
  session.livenessDelayMs = null; // armed delay, for diagnostics and tests
}

/**
 * Arm the probe for LIVENESS_PROBE_IDLE_MS after the last sign of life (or
 * after `delayMs` when given). Events refresh lastHealthyAt, so a timer that
 * fires early just re-arms from the newer time.
 */
function startLivenessProbe(session, client, pairing, name, delayMs = null) {
  stopLivenessProbe(session);
  if (session.stopped || session.client !== client) return;
  const last = lastHealthyMs(session.stats) ?? Date.now();
  const delay = delayMs ?? Math.max(1_000, last + livenessIdleMs - Date.now());
  session.livenessTimer = setTimeout(async () => {
    session.livenessTimer = null;
    const since = Date.now() - (lastHealthyMs(session.stats) ?? 0);
    if (since < livenessIdleMs) {
      startLivenessProbe(session, client, pairing, name);
      return;
    }
    const result = await probeLiveness(session, client, pairing, name);
    if (result === PROBE.ALIVE) startLivenessProbe(session, client, pairing, name);
    // No new proof of life to arm from: check again a full interval later
    // (re-arming from the stale lastHealthyAt would fire every second).
    else if (result === PROBE.INCONCLUSIVE || result === PROBE.BUSY) {
      startLivenessProbe(session, client, pairing, name, livenessIdleMs);
    }
  }, delay);
  session.livenessDelayMs = delay;
  session.livenessTimer.unref?.();
}

function clearRepairRetry(session) {
  if (session.repairRetryTimeout) {
    clearTimeout(session.repairRetryTimeout);
    session.repairRetryTimeout = null;
  }
}

/** Detach and close the session's client without stopping the session. */
function releaseClient(session) {
  const { client } = session;
  if (!client) return;
  if (session.eventHandler) client.off?.('event', session.eventHandler);
  if (session.disconnectHandler) client.off?.('event-disconnect', session.disconnectHandler);
  abortHapClient(client);
  session.client = null;
  session.eventHandler = null;
  session.disconnectHandler = null;
}

// The HAP server sent an HTTP response, just not a success. (hap-controller
// also sets statusCode on pairing errors, but to the TLV code, 1–7.)
function isHttpStatusError(err) {
  return Number(err?.statusCode) >= 100;
}

/** Probe once; returns a PROBE result. */
async function probeLiveness(session, client, pairing, name, probeKey = session.probeKey) {
  const { stats } = session;
  if (session.stopped || session.client !== client) return PROBE.SKIPPED;
  if (!stats.subscribed && !stats.nothingToWatch) return PROBE.SKIPPED;
  if (session.probingClient === client) return PROBE.BUSY;
  session.probingClient = client;
  try {
    const read = probeKey ? client.getCharacteristics([probeKey]) : client.getAccessories();
    await withTimeout(read, HAP_REQUEST_TIMEOUT_MS, null, 'liveness probe');
    return recordAlive(session, client);
  } catch (err) {
    if (session.stopped || session.client !== client) return PROBE.SKIPPED;
    if (isHttpStatusError(err)) {
      log.debug(`[subscriber] ${name}: liveness probe answered with an error status (${err.message ?? err})`);
      return recordAlive(session, client);
    }
    stats.lastError = err.message ?? String(err);
    stats.lastErrorAt = new Date().toISOString();
    const noAnswer = isConnectionError(err) && !hostAnswered(err);
    if (stats.subscribed && !noAnswer) {
      // The host answered somehow. Only an authentication failure (a revoked
      // pairing) counts toward escalation, in a row; anything else — busy,
      // unavailable, refused or reset extra connection, broken pipe — is
      // what a healthy slot-limited device can do, and never escalates.
      session.inconclusiveProbes = isAuthError(err) ? session.inconclusiveProbes + 1 : 0;
      if (session.inconclusiveProbes < MAX_INCONCLUSIVE_PROBES) {
        log.debug(`[subscriber] ${name}: liveness probe inconclusive (${err.message ?? err}) — keeping the subscription`);
        return PROBE.INCONCLUSIVE;
      }
      log.warn(`[subscriber] ${name}: pair-verify failed on ${session.inconclusiveProbes} probes in a row (${err.message ?? err}) — reconnecting`);
    } else {
      log.warn(`[subscriber] ${name}: not answering (${err.message ?? err}) — reconnecting`);
    }
    stats.subscribed = false;
    stats.nothingToWatch = false;
    releaseClient(session);
    // The pairing in use, with the latest stored keys and PIN when present (a
    // manual re-pair may have replaced them). Re-discovery starts from the
    // address in use; a scheduled reconnect re-reads the stored pairing.
    const stored = session.getPairing?.(session.deviceId);
    const latest = {
      ...pairing,
      ...(stored?.longTermData ? { longTermData: stored.longTermData } : {}),
      ...(stored?.pin ? { pin: stored.pin } : {}),
    };
    if (isConnectionError(err) && session.discoverDevice) rediscoverAndReconnect(session, latest, err);
    else scheduleReconnect(session, latest);
    return PROBE.DEAD;
  } finally {
    if (session.probingClient === client) session.probingClient = null;
  }
}

function recordAlive(session, client) {
  if (session.client === client) {
    session.stats.lastHealthyAt = new Date().toISOString();
    session.inconclusiveProbes = 0;
  }
  return PROBE.ALIVE;
}

// -- Unreachable devices --
// A paired device that keeps failing while discovery can't find it on the
// network at all (unplugged, retired, moved to another network) is retried
// every HAP_UNREACHABLE_RETRY_MS instead of every minute, and its attempts are
// logged at debug: one line when it becomes unreachable, one when it is back.

let unreachableRetryMs = HAP_UNREACHABLE_RETRY_MS;

/** Logger for per-attempt connection lines: quiet once a device is unreachable. */
function attemptLog(session) {
  return session?.stats?.unreachable ? { info: log.debug, warn: log.debug } : log;
}

/** Record whether re-discovery found the device; flips the unreachable state. */
function noteDiscovery(session, name, found) {
  const { stats } = session;
  if (found) {
    session.unannouncedFailures = 0;
    if (stats.unreachable) {
      stats.unreachable = false;
      session.retryDelayMs = reconnectBaseMs;
      log.info(`[subscriber] ${name}: announced on the network again — reconnecting`);
    }
    return;
  }
  session.unannouncedFailures = (session.unannouncedFailures ?? 0) + 1;
  if (!stats.unreachable && session.unannouncedFailures >= UNREACHABLE_AFTER_FAILURES) {
    stats.unreachable = true;
    log.warn(
      `[subscriber] ${name}: not found on the network after ${session.unannouncedFailures} attempts — ` +
      `retrying every ${Math.round(unreachableRetryMs / 60_000)} min until it reappears`
    );
  }
}

/** A successful connection ends the unreachable state. */
function markReachable(session, name) {
  session.unannouncedFailures = 0;
  if (session.stats.unreachable) {
    session.stats.unreachable = false;
    log.info(`[subscriber] ${name}: reachable again`);
  }
}

// The address reached the device's host, which refused or dropped the connection.
const HOST_ANSWERED_RE = /ECONNREFUSED|ECONNRESET/;
function hostAnswered(err) {
  return HOST_ANSWERED_RE.test(`${err?.code ?? ''} ${err?.message ?? ''}`);
}

/**
 * After a connection failure: re-discover the accessory and decide which
 * address to try next. An accessory can announce several addresses (e.g. a
 * Homebridge container on a Docker bridge and a macvlan) of which only some
 * reach this host, and discovery may report only part of them, so what it
 * finds is merged into the addresses already known rather than replacing them.
 *
 * A refused or reset connection means the address reaches the device's host
 * (e.g. Homebridge restarting), so that address is retried after the usual
 * backoff and never abandoned for it. Otherwise (timeout, unreachable) the
 * first failure on an address retries it after backoff and a second
 * consecutive one moves straight to the next known address: an unreachable
 * address is abandoned after two attempts, with no tight loop.
 */
function rediscoverAndReconnect(session, pairing, err = null) {
  const { deviceId } = session;
  const name = pairing.name ?? deviceId;
  const discover = session.discoverDevice ? session.discoverDevice(deviceId) : Promise.resolve(null);
  Promise.resolve(discover).then((discovered) => {
    if (session.stopped) return;
    noteDiscovery(session, name, Boolean(discovered));
    // Known = announced now or stored from earlier announcements; the in-use
    // address alone doesn't count (it may be a stale DHCP lease).
    const known = Array.isArray(pairing.addresses) ? pairing.addresses : [];
    const candidates = rememberAddresses(known, advertisedAddresses(discovered), pairing.address);
    const port = discovered?.port ?? pairing.port;

    // …unless discovery now announces the device elsewhere: a stale address
    // can be refused by whatever host took it over.
    const stillAnnounced = !discovered || advertisedAddresses(discovered).includes(pairing.address);
    const refused = stillAnnounced && hostAnswered(err);
    const failedBefore = session.lastFailedAddress === pairing.address;
    session.lastFailedAddress = refused ? null : pairing.address;
    const retryCurrent = (refused || !failedBefore) && candidates.includes(pairing.address);
    const address = retryCurrent ? pairing.address : (nextAddress(pairing.address, candidates) ?? pairing.address);

    const updatedPairing = { ...pairing, address, port, addresses: candidates };
    const changed = address !== pairing.address || port !== pairing.port
      || candidates.length !== known.length || candidates.some((a, i) => a !== known[i]);
    if (changed && session.savePairing) {
      session.savePairing(deviceId, updatedPairing)
        .catch((e) => log.debug(`[subscriber] ${name}: failed to save updated address: ${e.message}`));
    }

    if (address === pairing.address && port === pairing.port) {
      scheduleReconnect(session, updatedPairing);
      return;
    }
    const others = candidates.filter((a) => a !== address);
    attemptLog(session).info(
      `[subscriber] ${name}: trying ${address}:${port} (was ${pairing.address}:${pairing.port}` +
      `${others.length ? `; also announced at ${others.join(', ')}` : ''})`
    );
    connectAccessoryImpl(session, updatedPairing);
  }).catch(() => scheduleReconnect(session, pairing));
}

function scheduleReconnect(session, pairing) {
  if (session.stopped) return;
  const { deviceId, getPairing } = session;
  if (session.stats) session.stats.reconnectSchedules += 1;
  // An unreachable device (not announced, failing repeatedly) waits longer.
  const nextDelay = session.stats?.unreachable
    ? unreachableRetryMs
    : Math.min(session.retryDelayMs * 2, reconnectMaxMs);
  session.retryDelayMs = nextDelay;
  log.debug(`[subscriber] ${pairing.name}: retrying in ${nextDelay / 1000}s`);
  // One pending reconnect per session: two would each replace the other's client.
  if (session.reconnectTimeout) clearTimeout(session.reconnectTimeout);
  session.reconnectTimeout = setTimeout(() => {
    if (session.stopped) return;
    if (session.repairing) {
      log.debug(`[subscriber] ${pairing.name}: skipping reconnect, auto re-pair in progress`);
      return;
    }
    session.reconnectTimeout = null;
    // Re-read the pairing so reconnects pick up any address/port changes
    // that occurred (e.g. from a discovery scan) while we were backing off.
    const latestPairing = (getPairing && getPairing(deviceId)) ?? pairing;
    if (latestPairing.address !== pairing.address || latestPairing.port !== pairing.port) {
      log.debug(
        `[subscriber] ${pairing.name}: using refreshed address ` +
        `${latestPairing.address}:${latestPairing.port}`
      );
    }
    connectAccessoryImpl(session, latestPairing);
  }, nextDelay);
}

async function attemptAutoRepair(session, pairing) {
  const { stats, discoverDevice, savePairing } = session;
  const accessoryName = pairing.name ?? session.pairingName;

  // No PIN — can't auto-re-pair
  if (!pairing.pin) {
    stats.needsRepair = true;
    log.warn(`[subscriber] ${accessoryName}: pairing expired, re-pair required (no PIN stored)`);
    return;
  }

  // Circuit breaker — stop after 3 auto-re-pair attempts
  if (stats.autoRepairAttempts >= 3) {
    stats.needsRepair = true;
    return;
  }

  // No callbacks — can't auto-re-pair
  if (!discoverDevice || !savePairing) {
    stats.needsRepair = true;
    log.warn(`[subscriber] ${accessoryName}: pairing expired, re-pair required (auto re-pair not configured)`);
    return;
  }

  // Concurrency guard
  if (session.repairing) return;
  session.repairing = true;
  stats.autoRepairAttempts += 1;
  clearRepairRetry(session);

  // Track whether repair succeeded so the finally block can skip scheduling
  // a retry on the success path. Without this flag, resetting autoRepairAttempts
  // to 0 on success makes the guard (!stats.needsRepair && autoRepairAttempts < 3)
  // trivially true, causing an infinite 60s retry loop even after success.
  let succeeded = false;
  try {
    log.info(`[subscriber] ${accessoryName}: attempting auto re-pair (attempt ${stats.autoRepairAttempts}/3)…`);

    // Discover the device's current address/port
    const discovered = await discoverDevice(session.deviceId);
    if (!discovered) {
      stats.autoRepairLastError = 'Device not found on network';
      log.error(`[subscriber] ${accessoryName}: auto re-pair failed — device not found on network`);
      if (stats.autoRepairAttempts >= 3) {
        stats.needsRepair = true;
        log.warn(`[subscriber] ${accessoryName}: auto re-pair exhausted (3/3), manual re-pair required`);
      }
      return;
    }

    // Attempt pair-setup with stored PIN (uses httpClientFactory for testability),
    // from the address that last worked: discovery's first address may be one
    // this host can't reach (e.g. a Homebridge container's macvlan).
    const addresses = addressesToTry(pairing.address, advertisedAddresses(discovered), advertisedAddresses(pairing));
    const { result: longTermData, address: pairedAddress } = await tryEachAddress(addresses, async (address) => {
      const repairClient = httpClientFactory(session.deviceId, address, discovered.port);
      try {
        await withTimeout(
          repairClient.pairSetup(pairing.pin, resolvePairMethod(pairing)),
          HAP_PAIR_TIMEOUT_MS,
          () => abortHapClient(repairClient),
          'pairSetup'
        );
        return repairClient.getLongTermData();
      } finally {
        try { repairClient.close?.(); } catch (e) { /* ignore */ }
      }
    }, (address, err, next) => {
      log.info(`[subscriber] ${accessoryName}: re-pair via ${address} failed (${err.message}) — trying ${next}`);
    });

    // The new keys, on the address the re-pair worked on.
    const updatedPairing = {
      ...pairing,
      address: pairedAddress,
      addresses: rememberAddresses(pairing.addresses, advertisedAddresses(discovered), pairedAddress),
      port: discovered.port,
      longTermData,
    };
    await savePairing(session.deviceId, { ...updatedPairing, pairedAt: new Date().toISOString() });

    log.info(`[subscriber] ${accessoryName}: auto re-paired successfully`);
    stats.autoRepairedAt = new Date().toISOString();
    stats.autoRepairAttempts = 0;
    stats.authFailures = 0;
    stats.authFailed = false;
    succeeded = true;

    // Resume the normal connection. Clear the repairing flag first:
    // connectAccessory skips while a re-pair is in progress, which left the
    // device unsubscribed. A failure here is a connect failure, not a failed
    // re-pair (the new keys are saved), so it goes through the reconnect path.
    session.repairing = false;
    try {
      connectAccessoryImpl(session, updatedPairing);
    } catch (connectErr) {
      log.error(`[subscriber] ${accessoryName}: reconnect after re-pair failed:`, connectErr.message ?? connectErr);
      scheduleReconnect(session, updatedPairing);
    }
  } catch (err) {
    stats.autoRepairLastError = err.message ?? String(err);
    log.error(`[subscriber] ${accessoryName}: auto re-pair failed:`, err.message ?? err.stack ?? err);
    if (stats.autoRepairAttempts >= 3) {
      stats.needsRepair = true;
      log.warn(`[subscriber] ${accessoryName}: auto re-pair exhausted (3/3), manual re-pair required`);
    }
  } finally {
    session.repairing = false;
    // Only schedule a retry on the failure path. On success, connectAccessoryImpl
    // has already resumed the normal subscription — no retry needed.
    if (!succeeded && !stats.needsRepair && stats.autoRepairAttempts < 3) {
      log.info(`[subscriber] ${accessoryName}: retrying auto re-pair in 60s…`);
      // Its own timer: a reconnect scheduled meanwhile must not cancel it.
      session.repairRetryTimeout = setTimeout(() => {
        session.repairRetryTimeout = null;
        if (session.stopped) return;
        if (isLive(session, stats)) {
          // Recovered meanwhile (a connect succeeded during the re-pair).
          stats.authFailed = false;
          stats.autoRepairAttempts = 0;
          return;
        }
        attemptAutoRepair(session, pairing);
      }, 60_000);
    }
  }
}

// M-01: a hung HAP socket is reported as "online" if any single one of the
// underlying signals is loose. The strict liveness AND requires (a) a live
// HttpClient instance, (b) an active subscription, and (c) a fresh heartbeat
// in the last 30 minutes. Drop any one and the device falls back to the
// timestamp/needsRepair rescue paths.
const HUNG_SOCKET_THRESHOLD_MS = 30 * 60_000;

/** The socket hap-controller keeps open for event notifications, if any. */
function subscriptionSocket(session) {
  return session?.client?.subscriptionConnection?.socket ?? null;
}

// Connected = subscribed (or connected with nothing to watch), the event
// socket — if any — still open, AND recent proof of life: an event or a
// liveness-probe answer within HUNG_SOCKET_THRESHOLD_MS. The probe keeps that
// proof fresh for a quiet device, so only a device that stopped answering
// (wedged, gone) drops out. The one place "connected" is decided.
function isLive(session, stats) {
  if (!session?.client) return false;
  if (stats.subscribed !== true && stats.nothingToWatch !== true) return false;
  if (stats.subscribed) {
    const socket = subscriptionSocket(session);
    if (socket && (socket.destroyed || socket.readyState !== 'open')) return false;
  }
  if (!stats.lastHealthyAt) return false;
  return (Date.now() - new Date(stats.lastHealthyAt).getTime()) < HUNG_SOCKET_THRESHOLD_MS;
}

export function getSubscriberStats(deviceId) {
  const stats = subscriberStats.get(deviceId);
  if (!stats) return null;
  const session = subscriberSessions.get(deviceId);
  return {
    ...stats,
    connected: isLive(session, stats),
    reconnectAttempts: Math.max(0, stats.connectAttempts - 1),
  };
}

/**
 * Return an aggregate health summary across all subscriber sessions.
 */
export function getSubscriberHealth() {
  let total = 0;
  let connected = 0;
  let stale = 0;
  let idle = 0;
  let unreachable = 0;
  let needsRepair = 0;
  let lastConnectedAt = null;
  const staleThresholdMs = 10 * 60_000; // 10 minutes not connected
  const now = Date.now();

  for (const [, session] of subscriberSessions) {
    const { stats } = session;
    total += 1;
    if (stats.needsRepair) needsRepair += 1;
    if (stats.unreachable) unreachable += 1;
    const lc = stats.lastConnectedAt;
    if (lc && (!lastConnectedAt || lc > lastConnectedAt)) lastConnectedAt = lc;
    // M-01: mirror the strict liveness used by getSubscriberStats.connected.
    if (isLive(session, stats)) {
      connected += 1;
      // idle is a subset of connected: answering, but nothing to subscribe to.
      if (stats.nothingToWatch) idle += 1;
    } else if (!stats.unreachable) {
      // Stale = not connected for a while; unreachable devices have their own count.
      const lastHealthy = stats.lastHealthyAt;
      if (!lastHealthy || now - new Date(lastHealthy).getTime() > staleThresholdMs) stale += 1;
    }
  }

  return { total, connected, idle, stale, unreachable, needsRepair, lastConnectedAt };
}

/**
 * Return per-device repair targets for the scheduled repair cycle.
 * @param {number} staleThresholdMs — devices with no subscribe success in this window are stale (default 10 min)
 * @returns {Array<{ deviceId: string, pairingName: string, needsRepair: boolean, isStale: boolean }>}
 */
export function getRepairTargets(staleThresholdMs = 10 * 60_000) {
  const now = Date.now();
  const targets = [];
  for (const [deviceId, session] of subscriberSessions) {
    const { stats } = session;
    const isNeedsRepair = Boolean(stats.needsRepair);
    const lastHealthy = stats.lastHealthyAt;
    // M-01: a quiet motion sensor in an empty room can trivially go >10 min
    // without a heartbeat while still actively subscribed — those are healthy
    // and must NOT be reconnected nightly. Only flag as stale when the
    // subscription is also not live.
    // A device with nothing to watch never subscribes; that is not stale either.
    // An unreachable one is already on its slow retry; a restart would only
    // reset that and log again.
    const isStale = !stats.subscribed && !stats.nothingToWatch && !stats.unreachable &&
      (!lastHealthy || now - new Date(lastHealthy).getTime() > staleThresholdMs);
    if (isNeedsRepair || isStale) {
      targets.push({
        deviceId,
        pairingName: session.pairing?.name ?? session.pairingName ?? deviceId,
        needsRepair: isNeedsRepair,
        isStale,
      });
    }
  }
  return targets;
}

export function resetSubscriberStats(deviceId) {
  const session = subscriberSessions.get(deviceId);
  if (!session) return false;
  session.stats.authFailures = 0;
  session.stats.authFailed = false;
  session.stats.needsRepair = false;
  session.stats.autoRepairAttempts = 0;
  session.stats.autoRepairLastError = null;
  return true;
}

export const __testHooks = {
  processAlertsSafe,
  scheduleReconnect,
  isAuthError,
  isMaxPeersError,
  isConnectionError,
  rediscoverAndReconnect,
  attemptAutoRepair,
  detectFirmwareChanges,
  getSession(deviceId) {
    return subscriberSessions.get(deviceId) ?? null;
  },
  setReconnectWindow(baseMs, maxMs) {
    reconnectBaseMs = baseMs;
    reconnectMaxMs = maxMs;
  },
  setConnectAccessoryImpl(fn) {
    connectAccessoryImpl = fn;
  },
  setHttpClientFactory(fn) {
    httpClientFactory = fn;
  },
  setUnreachableRetryMs(ms) {
    unreachableRetryMs = ms;
  },
  setLivenessIdleMs(ms) {
    livenessIdleMs = ms;
  },
  probeLiveness,
  startLivenessProbe,
  PROBE,
  resetState() {
    for (const [deviceId] of subscriberSessions) {
      stopSubscriber(deviceId);
    }
    connectAccessoryImpl = connectAccessory;
    httpClientFactory = (deviceId, address, port) => new HttpClient(deviceId, address, port);
    reconnectBaseMs = 5_000;
    reconnectMaxMs = 60_000;
    unreachableRetryMs = HAP_UNREACHABLE_RETRY_MS;
    livenessIdleMs = LIVENESS_PROBE_IDLE_MS;
    defaultSubscriberOptions = {};
  },
};
