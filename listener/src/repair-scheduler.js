/**
 * repair-scheduler.js — daily scheduled repair cycle for stale HomeKit pairings.
 *
 * Exports:
 *   createRepairScheduler(deps) → { start, stop, runRepairCycle }
 *   msUntilHour(targetHour) → number
 */

import { log } from './logger.js';
import { resolvePairMethod } from './setup-helpers.js';
import { addressesToTry, advertisedAddresses } from './hap-addresses.js';

/**
 * Calculate milliseconds until the next occurrence of the given UTC hour.
 * The stored repair hour is UTC (Settings converts the viewer's local hour on
 * save), so this must not depend on the container's TZ.
 * If the target hour has already passed today, returns ms until tomorrow's occurrence.
 * @param {number} targetHour - UTC hour in 0–23 range
 * @returns {number} milliseconds until next occurrence
 */
export function msUntilHour(targetHour) {
  const now = new Date();
  const next = new Date(now);
  next.setUTCHours(targetHour, 0, 0, 0);
  if (next <= now) next.setUTCDate(next.getUTCDate() + 1);
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
 * @param {function(string, object): Promise<void>} deps.savePairing — save discovered pairing (isStale path)
 * @param {function(string): void} deps.stopSubscriber — stop subscriber for a device
 * @param {function(string, object, object, function): void} deps.startSubscriber — start subscriber for a device
 * @param {function(string): boolean} deps.resetSubscriberStats — reset circuit breaker stats
 * @param {function(): object} deps.loadPairings — returns pairings map { deviceId: pairing }
 * @param {function(): object} deps.loadRooms — returns rooms map
 * @param {function(string): object|null} deps.getPairingForLookup — get pairing for a device
 * @param {function(string, string, string, number, number): Promise<{longTermData, pairing}>} deps.performPairSetupAndPersist —
 *   pre-wired closure: (deviceId, pin, address, port, pairMethod) → performs full pairSetup + persist
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
  performPairSetupAndPersist,
}) {
  let scheduledTimeout = null;
  let running = false;

  function scheduleNext(hour) {
    const delayMs = msUntilHour(hour);
    log.info(`[repair] Next scheduled repair in ${Math.round(delayMs / 60_000)} min (at ${hour}:00 local)`);
    scheduledTimeout = setTimeout(async () => {
      scheduledTimeout = null;
      try {
        await runRepairCycle();
      } catch (err) {
        // M-5: a rejected cycle (e.g. a disk-full repairStore.write) must not
        // kill the timer chain — log and fall through to the reschedule.
        log.error('[repair] Scheduled repair cycle failed:', err.message ?? err.stack ?? err);
      } finally {
        try {
          const { enabled, hour: currentHour } = getSettings();
          if (enabled) {
            scheduleNext(currentHour);
          } else {
            log.info('[repair] Scheduled repair disabled, not rescheduling');
          }
        } catch (err) {
          // A throwing getSettings() must not also kill the chain — fall
          // back to the hour this invocation was scheduled with.
          log.error('[repair] Failed to read settings for reschedule, falling back to previous hour:', err.message ?? err.stack ?? err);
          scheduleNext(hour);
        }
      }
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

    // M-5: declared before the try (and defaulted to []) so getRepairTargets()
    // can move INSIDE the try below — a throw there still reaches the finally
    // that resets `running`, and the finally's `targets.length` reference
    // stays valid even if the throw happened before targets was assigned.
    let targets = [];

    let repaired = 0;
    let skipped = 0;
    let failed = 0;

    try {
      targets = getRepairTargets();
      log.info(`[repair] Starting scheduled repair pass -- ${targets.length} device(s) targeted`);

      if (targets.length === 0) {
        return;
      }

      for (const target of targets) {
        if (target.needsRepair) {
          // Re-pair path: requires stored PIN for full pairSetup()
          const pairings = loadPairings();
          const pairing = pairings[target.deviceId] ?? null;
          if (!pairing || !pairing.pin) {
            log.warn(`[repair] ${target.pairingName}: no stored PIN, skipping — run manual Repair to restore`);
            skipped++;
            continue;
          }

          log.info(`[repair] ${target.pairingName}: re-pairing...`);
          try {
            const discovered = await discoverDevice(target.deviceId);
            if (discovered) {
              // Start from the address that last worked: discovery's first
              // address may be one this host can't reach (e.g. a macvlan).
              const addresses = addressesToTry(pairing.address, advertisedAddresses(discovered), advertisedAddresses(pairing));
              await performPairSetupAndPersist(
                target.deviceId, pairing.pin, addresses[0], discovered.port, resolvePairMethod(pairing), addresses,
              );
              resetSubscriberStats(target.deviceId);
              const updatedPairings = loadPairings();
              const updatedPairing = updatedPairings[target.deviceId] ?? null;
              if (updatedPairing) {
                stopSubscriber(target.deviceId);
                startSubscriber(target.deviceId, updatedPairing, loadRooms(), getPairingForLookup);
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
