/**
 * discovery-helpers.js — factory for discovery scan and repair helpers.
 *
 * Extracted from index.js to allow the discovery functions to be tested
 * independently and to slim index.js to its 300-400 line target.
 */

import { IPDiscovery } from 'hap-controller';
import { log } from './logger.js';
import { getHomeKitPairings, isHomeKitPairing, normalizePairingRecord } from './setup-helpers.js';

/**
 * Creates discovery helper functions closed over the provided dependencies.
 *
 * @param {object} opts
 * @param {string|null} opts.discoverIface - mDNS network interface (or null for auto)
 * @param {boolean} opts.discoveryEnabled - whether DISCOVERY_SCAN_ENABLED is true
 * @param {function} opts.getDiscoveryCache - getter returning the current discoveryCache array
 * @param {function} opts.setDiscoveryCache - setter for updating the discoveryCache array
 * @param {object} opts.pairingsStore - JsonObjectStore for pairings (used for refresh + getByKey)
 * @param {function} opts.loadPairings - normalized pairings loader
 * @param {function} opts.savePairings - normalized pairings saver
 * @param {function} opts.getRetentionSettings - getter returning current retentionSettings
 * @returns {{ runDiscoveryScan, discoverDeviceForRepair, savePairingForRepair, getPairingForLookup, runScheduledDiscoveryScan }}
 */
export function createDiscoveryHelpers({
  discoverIface,
  discoveryEnabled,
  getDiscoveryCache,
  setDiscoveryCache,
  pairingsStore,
  loadPairings,
  savePairings,
  getRetentionSettings,
}) {
  function runDiscoveryScan() {
    if (!discoveryEnabled) {
      return Promise.resolve(getDiscoveryCache());
    }

    return new Promise((resolve, reject) => {
      const found = new Map();
      let discovery;
      let settled = false;

      function fail(err) {
        if (settled) return;
        settled = true;
        try { discovery?.stop?.(); } catch (err) { log.debug('[discovery] stop error:', err.message); }
        reject(err instanceof Error ? err : new Error(String(err)));
      }

      function succeed(value) {
        if (settled) return;
        settled = true;
        resolve(value);
      }

      try {
        discovery = new IPDiscovery(discoverIface);
      } catch (err) {
        return fail(err);
      }

      discovery.on('serviceUp', (service) => {
        if (!found.has(service.id)) found.set(service.id, service);
      });
      discovery.on('error', (err) => {
        fail(err);
      });

      try {
        discovery.start();
      } catch (err) {
        return fail(err);
      }

      setTimeout(() => {
        void (async () => {
          if (settled) return;
          try {
            try { discovery.stop(); } catch (err) { log.debug('[discovery] stop error:', err.message); }
            await pairingsStore.refresh();
            const allPairings = loadPairings();
            const currentPairings = getHomeKitPairings(allPairings);
            const newCache = [...found.values()].map((s) => ({
              id: s.id,
              protocol: 'homekit',
              name: s.name,
              address: s.address,
              port: s.port,
              category: s.ci ?? null,
              paired: s.sf === 0 || !!currentPairings[s.id],
              pairedElsewhere: s.sf === 0 && !currentPairings[s.id],
              alreadyPaired: !!currentPairings[s.id],
            }));
            setDiscoveryCache(newCache);
            log.info(`[discovery] Scan complete — found ${newCache.length} accessory/accessories`);

            let pairingsUpdated = false;
            for (const [id, pairing] of Object.entries(currentPairings)) {
              const seen = found.get(id);
              if (!seen) continue;
              if (seen.address !== pairing.address || seen.port !== pairing.port) {
                log.debug(
                  `[discovery] ${pairing.name}: address updated ` +
                  `${pairing.address}:${pairing.port} -> ${seen.address}:${seen.port} — pairing refreshed`
                );
                currentPairings[id] = { ...pairing, address: seen.address, port: seen.port };
                pairingsUpdated = true;
              }
            }
            if (pairingsUpdated) {
              await savePairings({
                ...allPairings,
                ...currentPairings,
              });
            }

            succeed(getDiscoveryCache());
          } catch (err) {
            fail(err);
          }
        })();
      }, 10_000);
    });
  }

  function safeDiscoveryScan() {
    return runDiscoveryScan().catch((err) => {
      log.warn(`[discovery] Scan skipped: ${err.message}`);
      return [];
    });
  }

  async function discoverDeviceForRepair(deviceId) {
    if (!discoveryEnabled) return null;

    return new Promise((resolve) => {
      let discovery;
      let settled = false;

      try {
        discovery = new IPDiscovery(discoverIface);
      } catch (err) {
        log.debug(`[auto-repair] Discovery init failed: ${err.message}`);
        return resolve(null);
      }

      discovery.on('serviceUp', (service) => {
        if (service.id !== deviceId || settled) return;
        settled = true;
        try { discovery.stop(); } catch (err) {
          log.debug('[discovery] stop error on serviceUp:', err.message);
        }
        resolve({ address: service.address, port: service.port });
      });

      discovery.on('error', () => {
        if (settled) return;
        settled = true;
        try { discovery.stop(); } catch (err) {
          log.debug('[discovery] stop error on discovery error:', err.message);
        }
        resolve(null);
      });

      try {
        discovery.start();
      } catch (err) {
        log.debug('[discovery] start failed during repair:', err.message);
        return resolve(null);
      }

      setTimeout(() => {
        if (settled) return;
        settled = true;
        try { discovery.stop(); } catch (err) {
          log.debug('[discovery] stop error on timeout:', err.message);
        }
        resolve(null);
      }, 10_000);
    });
  }

  async function savePairingForRepair(deviceId, updatedFields) {
    const current = loadPairings();
    current[deviceId] = { ...current[deviceId], ...updatedFields };
    await savePairings(current);
  }

  function getPairingForLookup(id) {
    const pairing = pairingsStore.getByKey(id);
    if (!pairing || !isHomeKitPairing(pairing)) return null;
    return normalizePairingRecord(id, pairing);
  }

  function isAutoDiscoveryEnabled() {
    return discoveryEnabled && getRetentionSettings().autoScanHomeKit;
  }

  function runScheduledDiscoveryScan() {
    if (!isAutoDiscoveryEnabled()) return Promise.resolve(getDiscoveryCache());
    return safeDiscoveryScan();
  }

  return {
    runDiscoveryScan,
    discoverDeviceForRepair,
    savePairingForRepair,
    getPairingForLookup,
    runScheduledDiscoveryScan,
  };
}
