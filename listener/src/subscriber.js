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
  cacheAccessoryMetadata,
  clearAccessoryMetadata,
  getAccessoryIdentity,
} from './accessory-metadata.js';
import { log } from './logger.js';
import { withTimeout, parseIntInRange } from './utils.js';

// H-3: bound every HAP round-trip so an accessory that accepts TCP but never
// answers can no longer strand a session (or the nightly repair scheduler)
// forever. Pair-setup gets its own longer budget on purpose — an SRP
// handshake against a slow accessory legitimately takes tens of seconds
// (nginx allows 300s for commissioning), and a 30s cap would break working
// re-pairs.
const HAP_REQUEST_TIMEOUT_MS = parseIntInRange(process.env.HAP_REQUEST_TIMEOUT_MS, 30_000, 1_000, 300_000);
const HAP_PAIR_TIMEOUT_MS = parseIntInRange(process.env.HAP_PAIR_TIMEOUT_MS, 60_000, 1_000, 300_000);

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

function isConnectionError(err) {
  const msg = err?.message ?? String(err);
  return /ECONNREFUSED|ETIMEDOUT|ENOTFOUND|EHOSTUNREACH/i.test(msg);
}

async function processAlertsSafe(eventPayload, insertedRow) {
  try {
    await processAlertsForEvent(pool, {
      ...eventPayload,
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
    discoverDevice: options.discoverDevice ?? null,
    savePairing: options.savePairing ?? null,
  };
  subscriberSessions.set(deviceId, session);
  subscriberStats.set(deviceId, stats);
  connectAccessoryImpl(session, pairing);
}

export function stopSubscriber(deviceId) {
  const session = subscriberSessions.get(deviceId);
  if (!session) return;

  session.stopped = true;
  if (session.reconnectTimeout) {
    clearTimeout(session.reconnectTimeout);
    session.reconnectTimeout = null;
  }

  if (session.client) {
    if (session.eventHandler) session.client.off('event', session.eventHandler);
    if (session.disconnectHandler) session.client.off('event-disconnect', session.disconnectHandler);
    try { session.client.close?.(); } catch (e) { log.debug('[subscriber] client close error:', e.message); }
    session.client = null;
  }

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

  // Close any existing client to prevent duplicate event handlers and
  // leaked TCP connections (CR-02).
  if (session.client) {
    if (session.eventHandler) session.client.off('event', session.eventHandler);
    if (session.disconnectHandler) session.client.off('event-disconnect', session.disconnectHandler);
    try { session.client.close?.(); } catch (e) { log.debug('[subscriber] previous client close error:', e.message); }
    session.client = null;
    session.eventHandler = null;
    session.disconnectHandler = null;
  }

  const { deviceId, rooms, getPairing, stats } = session;
  const { name: accessoryName, address, port, longTermData } = pairing;
  session.pairingName = accessoryName;
  stats.connectAttempts += 1;

  log.info(`[subscriber] Connecting to ${accessoryName} (${address}:${port})`);

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

    // subscribeCharacteristics() expects an array of "aid.iid" strings
    const watchedKeys = [...iidMeta.keys()];

    if (watchedKeys.length === 0) {
      log.info(`[subscriber] ${accessoryName}: no watched characteristics found`);
      return;
    }

    // HAP events are emitted on the client instance itself (HttpClient extends
    // EventEmitter). subscribeCharacteristics() returns Promise<void|null> —
    // NOT an EventEmitter — so .on() must be called on `client`, not on the
    // return value.
    const handleEvent = async (event) => {
      if (session.stopped) return;
      // Refresh the heartbeat once per event batch (not per change in the loop).
      // This is the canonical signal that the HAP subscription is actively producing data.
      stats.lastHealthyAt = new Date().toISOString();
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
        log.info(`[subscriber] ${accessoryName}: resubscribed to ${formerSubscribes.length} characteristic(s)`);
      } catch (err) {
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
          session.discoverDevice(deviceId).then((discovered) => {
            if (!discovered || session.stopped) {
              scheduleReconnect(session, pairing);
              return;
            }
            if (discovered.address !== pairing.address || discovered.port !== pairing.port) {
              log.info(`[subscriber] ${accessoryName}: found at ${discovered.address}:${discovered.port}`);
              if (session.savePairing) {
                session.savePairing(deviceId, { ...pairing, address: discovered.address, port: discovered.port })
                  .catch((e) => log.debug(`[subscriber] ${accessoryName}: failed to save updated address: ${e.message}`));
              }
              const updatedPairing = { ...pairing, address: discovered.address, port: discovered.port };
              session.retryDelayMs = reconnectBaseMs;
              connectAccessoryImpl(session, updatedPairing);
            } else {
              scheduleReconnect(session, pairing);
            }
          }).catch(() => scheduleReconnect(session, pairing));
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
      log.info(`[subscriber] ${accessoryName}: subscribed to ${watchedKeys.length} characteristic(s)`);
    } catch (err) {
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
    } else {
      log.error(`[subscriber] ${accessoryName}: getAccessories failed:`, err.message ?? err.stack ?? err);
    }

    if (isConnectionError(err) && session.discoverDevice) {
      log.info(`[subscriber] ${accessoryName}: connection failed, re-discovering device…`);
      session.discoverDevice(deviceId).then((discovered) => {
        if (!discovered || session.stopped) {
          scheduleReconnect(session, pairing);
          return;
        }
        if (discovered.address !== pairing.address || discovered.port !== pairing.port) {
          log.info(`[subscriber] ${accessoryName}: found at ${discovered.address}:${discovered.port} (was ${address}:${port})`);
          if (session.savePairing) {
            session.savePairing(deviceId, { ...pairing, address: discovered.address, port: discovered.port })
              .catch((e) => log.debug(`[subscriber] ${accessoryName}: failed to save updated address: ${e.message}`));
          }
          const updatedPairing = { ...pairing, address: discovered.address, port: discovered.port };
          session.retryDelayMs = reconnectBaseMs;
          connectAccessoryImpl(session, updatedPairing);
        } else {
          scheduleReconnect(session, pairing);
        }
      }).catch(() => scheduleReconnect(session, pairing));
      return;
    }

    scheduleReconnect(session, pairing);
  });
}

function scheduleReconnect(session, pairing) {
  if (session.stopped) return;
  const { deviceId, getPairing } = session;
  if (session.stats) session.stats.reconnectSchedules += 1;
  const nextDelay = Math.min(session.retryDelayMs * 2, reconnectMaxMs);
  session.retryDelayMs = nextDelay;
  log.debug(`[subscriber] ${pairing.name}: retrying in ${nextDelay / 1000}s`);
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

    // Attempt pair-setup with stored PIN (uses httpClientFactory for testability)
    const repairClient = httpClientFactory(session.deviceId, discovered.address, discovered.port);
    let longTermData;
    try {
      await withTimeout(
        repairClient.pairSetup(pairing.pin),
        HAP_PAIR_TIMEOUT_MS,
        () => { try { repairClient.close?.(); } catch (e) { /* ignore */ } },
        'pairSetup'
      );
      longTermData = repairClient.getLongTermData();
    } finally {
      try { repairClient.close?.(); } catch (e) { /* ignore */ }
    }

    // Save updated pairing
    await savePairing(session.deviceId, {
      ...pairing,
      address: discovered.address,
      port: discovered.port,
      longTermData,
      pairedAt: new Date().toISOString(),
    });

    log.info(`[subscriber] ${accessoryName}: auto re-paired successfully`);
    stats.autoRepairedAt = new Date().toISOString();
    stats.autoRepairAttempts = 0;
    stats.authFailures = 0;
    stats.authFailed = false;

    // Resume normal connection with new keys
    const updatedPairing = {
      ...pairing,
      address: discovered.address,
      port: discovered.port,
      longTermData,
    };
    connectAccessoryImpl(session, updatedPairing);
    succeeded = true;
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
      session.reconnectTimeout = setTimeout(() => {
        if (session.stopped) return;
        session.reconnectTimeout = null;
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

function isLive(session, stats) {
  if (!session?.client) return false;
  if (stats.subscribed !== true) return false;
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
  let needsRepair = 0;
  let lastConnectedAt = null;
  const staleThresholdMs = 10 * 60_000; // 10 minutes with no subscribe success
  const now = Date.now();

  for (const [, session] of subscriberSessions) {
    total += 1;
    // M-01: mirror the strict liveness AND used by getSubscriberStats.connected.
    if (isLive(session, session.stats)) connected += 1;
    if (session.stats.needsRepair) needsRepair += 1;
    const lastHealthy = session.stats.lastHealthyAt;
    if (!lastHealthy || now - new Date(lastHealthy).getTime() > staleThresholdMs) {
      stale += 1;
    }
    const lc = session.stats.lastConnectedAt;
    if (lc && (!lastConnectedAt || lc > lastConnectedAt)) lastConnectedAt = lc;
  }

  return { total, connected, stale, needsRepair, lastConnectedAt };
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
    const isStale = !stats.subscribed &&
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
  resetState() {
    for (const [deviceId] of subscriberSessions) {
      stopSubscriber(deviceId);
    }
    connectAccessoryImpl = connectAccessory;
    httpClientFactory = (deviceId, address, port) => new HttpClient(deviceId, address, port);
    reconnectBaseMs = 5_000;
    reconnectMaxMs = 60_000;
  },
};
