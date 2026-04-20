/**
 * repair-scheduler.js — daily scheduled repair cycle for stale HomeKit pairings.
 *
 * Exports:
 *   createRepairScheduler(deps) → { start, stop, runRepairCycle }
 *   msUntilHour(targetHour) → number
 */

import { log } from './logger.js';

/**
 * Calculate milliseconds until the next occurrence of the given hour (local time).
 * If the target hour has already passed today, returns ms until tomorrow's occurrence.
 * @param {number} targetHour - hour in 0–23 range
 * @returns {number} milliseconds until next occurrence
 */
export function msUntilHour(targetHour) {
  const now = new Date();
  const next = new Date(now);
  next.setHours(targetHour, 0, 0, 0);
  if (next <= now) next.setDate(next.getDate() + 1);
  return next.getTime() - now.getTime();
}

/**
 * Create a scheduled repair instance.
 *
 * @param {object} deps
 * @param {function(): object} deps.getSettings — returns { enabled, hour, lastRunAt, lastRunResult }
 * @param {function(object): Promise<void>} deps.saveSettings — persists updated settings
 * @param {function(number=): Array} deps.getRepairTargets — returns [{deviceId, pairingName, needsRepair, isStale}]
 * @param {function(string): Promise<object|null>} deps.discoverDevice — discover device for re-pair
 * @param {function(string, object): Promise<void>} deps.savePairing — save discovered pairing
 * @param {function(string): void} deps.stopSubscriber — stop subscriber for a device
 * @param {function(string, object, object, function): void} deps.startSubscriber — start subscriber for a device
 * @param {function(string): boolean} deps.resetSubscriberStats — reset circuit breaker stats
 * @param {function(): object} deps.loadPairings — returns pairings map { deviceId: pairing }
 * @param {function(): object} deps.loadRooms — returns rooms map
 * @param {function(string): object|null} deps.getPairingForLookup — get pairing for a device
 * @returns {{ start: function, stop: function, runRepairCycle: function }}
 */
export function createRepairScheduler({
  getSettings,
  saveSettings,
  getRepairTargets,
  discoverDevice,
  savePairing,
  stopSubscriber,
  startSubscriber,
  resetSubscriberStats,
  loadPairings,
  loadRooms,
  getPairingForLookup,
}) {
  let scheduledTimeout = null;
  let running = false;

  function scheduleNext(hour) {
    const delayMs = msUntilHour(hour);
    log.info(`[repair] Next scheduled repair in ${Math.round(delayMs / 60_000)} min (at ${hour}:00 local)`);
    scheduledTimeout = setTimeout(async () => {
      scheduledTimeout = null;
      await runRepairCycle();
      const { hour: currentHour } = getSettings();
      scheduleNext(currentHour);
    }, delayMs);
  }

  function start() {
    const { enabled, hour } = getSettings();
    if (!enabled) return;
    scheduleNext(hour);
  }

  function stop() {
    if (scheduledTimeout) {
      clearTimeout(scheduledTimeout);
      scheduledTimeout = null;
    }
  }

  async function runRepairCycle() {
    if (running) {
      log.warn('[repair] Repair cycle already in progress, skipping');
      return;
    }
    running = true;

    const targets = getRepairTargets();
    log.info(`[repair] Starting scheduled repair pass -- ${targets.length} device(s) targeted`);

    let repaired = 0;
    let skipped = 0;
    let failed = 0;

    try {
      if (targets.length === 0) {
        return;
      }

      for (const target of targets) {
        if (target.needsRepair) {
          // Re-pair path: discover device and save new pairing
          log.info(`[repair] ${target.pairingName}: re-pairing...`);
          try {
            const discovered = await discoverDevice(target.deviceId);
            if (discovered) {
              await savePairing(target.deviceId, discovered);
              resetSubscriberStats(target.deviceId);
              const pairings = loadPairings();
              const pairing = pairings[target.deviceId] ?? null;
              if (pairing) {
                stopSubscriber(target.deviceId);
                startSubscriber(target.deviceId, pairing, loadRooms(), getPairingForLookup);
              }
              repaired++;
              log.info(`[repair] ${target.pairingName}: repaired successfully`);
            } else {
              skipped++;
              log.info(`[repair] ${target.pairingName}: not discoverable, skipped`);
            }
          } catch (err) {
            failed++;
            log.warn(`[repair] ${target.pairingName}: repair failed -- ${err.message}`);
          }
        } else if (target.isStale) {
          // Reconnect path: stop + restart subscriber
          log.info(`[repair] ${target.pairingName}: reconnecting (stale)...`);
          try {
            const pairings = loadPairings();
            const pairing = pairings[target.deviceId] ?? null;
            if (!pairing) {
              skipped++;
              log.info(`[repair] ${target.pairingName}: no pairing found, skipped`);
            } else {
              resetSubscriberStats(target.deviceId);
              stopSubscriber(target.deviceId);
              startSubscriber(target.deviceId, pairing, loadRooms(), getPairingForLookup);
              repaired++;
              log.info(`[repair] ${target.pairingName}: reconnected`);
            }
          } catch (err) {
            failed++;
            log.warn(`[repair] ${target.pairingName}: reconnect failed -- ${err.message}`);
          }
        }
      }

      log.info(`[repair] Pass complete -- ${repaired} repaired, ${skipped} skipped, ${failed} failed`);
    } finally {
      try {
        await saveSettings({
          ...getSettings(),
          lastRunAt: new Date().toISOString(),
          lastRunResult: { targeted: targets.length, repaired, skipped, failed },
        });
      } finally {
        running = false;
      }
    }
  }

  return { start, stop, runRepairCycle };
}
