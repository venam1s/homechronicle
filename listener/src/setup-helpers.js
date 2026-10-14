/**
 * setup-helpers.js — pure helper functions for pairing normalization and store helpers.
 *
 * Pure functions: no closures over module-level state, safe to import directly by any router.
 * createStoreHelpers: factory for store wrapper functions (closes over injected store instances).
 */

import { PairMethods } from 'hap-controller';

// -- Pairing normalization --

export function normalizeMatterNodeId(value) {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  if (!text) return null;
  try {
    return BigInt(text).toString();
  } catch { // flow-control catch — BigInt parse fails for non-numeric strings
    return text.toUpperCase();
  }
}

export function normalizePairingRecord(id, pairing = {}) {
  const protocol = String(pairing?.protocol ?? 'homekit').toLowerCase() === 'matter'
    ? 'matter'
    : 'homekit';
  if (protocol === 'matter') {
    const nodeId = normalizeMatterNodeId(pairing?.nodeId ?? id) ?? String(id);
    return {
      ...pairing,
      protocol: 'matter',
      nodeId,
      name: pairing?.name ?? nodeId,
    };
  }
  return {
    ...pairing,
    protocol: 'homekit',
  };
}

export function normalizePairingsMap(input = {}) {
  const output = {};
  for (const [id, pairing] of Object.entries(input ?? {})) {
    const normalized = normalizePairingRecord(id, pairing);
    const key = normalized.protocol === 'matter' ? normalized.nodeId : id;
    output[key] = normalized;
  }
  return output;
}

export function isHomeKitPairing(pairing) {
  return String(pairing?.protocol ?? 'homekit').toLowerCase() === 'homekit';
}

export function getHomeKitPairings(pairings = {}) {
  return Object.fromEntries(
    Object.entries(pairings).filter(([, pairing]) => isHomeKitPairing(pairing))
  );
}

// -- HAP pair-setup method --

// mDNS `ff` bit 0x01: accessory has an Apple authentication coprocessor.
const FF_AUTH_COPROCESSOR = 0x01;

/**
 * Pick the pair-setup method from the accessory's advertised feature flags,
 * mirroring hap-controller's IPDiscovery.getPairMethod(). Accessories without
 * an auth coprocessor (e.g. Kasa, ff=0/2) can reject PairSetupWithAuth with a
 * malformed M4 response ("M4: Empty TLV").
 */
export function pairMethodForFeatureFlags(ff) {
  return (Number(ff) & FF_AUTH_COPROCESSOR)
    ? PairMethods.PairSetupWithAuth
    : PairMethods.PairSetup;
}

/**
 * Pair method to reuse when re-pairing a stored HomeKit pairing. Records saved
 * before pairMethod was persisted keep hap-controller's historical default.
 */
export function resolvePairMethod(pairing) {
  return Number.isInteger(pairing?.pairMethod)
    ? pairing.pairMethod
    : PairMethods.PairSetupWithAuth;
}

// -- Reliability stats mapping --

export function mapReliabilityStats(reliability) {
  if (!reliability) return null;
  return {
    connect_attempts: reliability.connectAttempts,
    reconnect_attempts: reliability.reconnectAttempts,
    reconnect_schedules: reliability.reconnectSchedules,
    disconnects: reliability.disconnects,
    resubscribe_successes: reliability.resubscribeSuccesses,
    resubscribe_failures: reliability.resubscribeFailures,
    subscribe_failures: reliability.subscribeFailures,
    accessories_query_failures: reliability.accessoriesQueryFailures,
    last_connected_at: reliability.lastConnectedAt,
    last_subscribed_at: reliability.lastSubscribedAt,
    last_healthy_at: reliability.lastHealthyAt,
    connected: reliability.connected ?? false,
    last_error: reliability.lastError,
    last_error_at: reliability.lastErrorAt,
    auth_failures: reliability.authFailures,
    auth_failed: reliability.authFailed,
    needs_repair: reliability.needsRepair,
    auto_repair_attempts: reliability.autoRepairAttempts,
    auto_repair_last_error: reliability.autoRepairLastError,
    auto_repaired_at: reliability.autoRepairedAt,
  };
}

// -- Store helpers factory --

/**
 * Creates load/save wrappers for all JSON stores.
 *
 * @param {object} opts
 * @param {object} opts.pairingsStore - JsonObjectStore for pairings
 * @param {object} opts.roomsStore - JsonObjectStore for rooms
 * @param {object} opts.displayNamesStore - JsonObjectStore for display names
 * @param {object} opts.notesStore - JsonObjectStore for notes
 * @param {object} opts.retentionStore - JsonObjectStore for retention settings
 * @param {function} opts.getMatterRuntime - getter returning current matterRuntime (or null)
 * @param {function} opts.normalizeRetentionSettings - normalizer from retention-router.js
 * @returns {{ loadPairings, savePairings, loadRooms, saveRooms, loadDisplayNames, saveDisplayNames, loadNotes, saveNotes, loadRetentionSettings, saveRetentionSettings }}
 */
export function createStoreHelpers({
  pairingsStore,
  roomsStore,
  displayNamesStore,
  notesStore,
  retentionStore,
  getMatterRuntime,
  normalizeRetentionSettings,
}) {
  function loadPairings() {
    return normalizePairingsMap(pairingsStore.getSnapshot());
  }

  async function savePairings(pairings) {
    const normalized = normalizePairingsMap(pairings);

    // Guard: never discard existing longTermData during a save.
    // A discovery rescan or store-refresh race could produce entries without
    // longTermData; writing those would silently break all HomeKit pairings.
    const existing = pairingsStore.getSnapshot();
    for (const [id, entry] of Object.entries(normalized)) {
      if (entry.protocol !== 'homekit') continue;
      const prev = existing[id];
      if (prev?.longTermData && !entry.longTermData) {
        normalized[id] = { ...entry, longTermData: prev.longTermData };
      }
    }

    await pairingsStore.write(normalized);
    const mr = getMatterRuntime();
    if (mr) mr.syncPairings(normalized);
  }

  function loadRooms() {
    return roomsStore.getSnapshot();
  }

  async function saveRooms(rooms) {
    await roomsStore.write(rooms);
  }

  function loadDisplayNames() {
    return displayNamesStore.getSnapshot();
  }

  async function saveDisplayNames(names) {
    await displayNamesStore.write(names);
  }

  function loadNotes() {
    return notesStore.getSnapshot();
  }

  async function saveNotes(notes) {
    await notesStore.write(notes);
  }

  function loadRetentionSettings() {
    return normalizeRetentionSettings(retentionStore.getSnapshot());
  }

  async function saveRetentionSettings(settings) {
    await retentionStore.write(normalizeRetentionSettings(settings));
  }

  return {
    loadPairings,
    savePairings,
    loadRooms,
    saveRooms,
    loadDisplayNames,
    saveDisplayNames,
    loadNotes,
    saveNotes,
    loadRetentionSettings,
    saveRetentionSettings,
  };
}
