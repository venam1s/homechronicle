/**
 * repair-helpers.js — shared primitives for the scheduled repair cycle.
 *
 * Exports:
 *   performPairSetupAndPersist(device, deps) → Promise<{ longTermData, pairing }>
 *
 * Explicit non-responsibilities:
 *   - Does NOT perform mDNS discovery (caller supplies address/port).
 *   - Does NOT shape HTTP responses or log messages (caller decides how to present errors).
 *   - Does NOT restart the subscriber (caller decides post-repair lifecycle).
 */

import { withTimeout } from './utils.js';
import { abortHapClient, mergeAddresses, tryEachAddress } from './hap-addresses.js';

/**
 * Perform a full HAP pairSetup() handshake using the stored PIN, then persist
 * the fresh longTermData (and updated address/port/pin/pairedAt) into pairings.
 *
 * Mirrors the inline pattern used by setup-router.js lines 262–276 and
 * subscriber.js lines 604–611.  All collaborators are injected for testability —
 * this module has no hap-controller import of its own.
 *
 * @param {{ deviceId: string, pin: string, address: string, port: number, pairMethod?: number, addresses?: string[] }} device
 *   pairMethod — hap-controller PairMethods value; omitted → hap-controller's default.
 *   addresses — every address the accessory announces; `address` (the one that
 *   last worked) is tried first and the others only if it can't be reached.
 * @param {{ HttpClient: Function, loadPairings: Function, savePairings: Function, timeoutMs?: number }} deps
 * @param {number} [deps.timeoutMs=60000] - H-3: bounds the pairSetup handshake so a
 *   device that accepts TCP but never answers can no longer strand the nightly
 *   repair scheduler forever. On expiry the client is closed.
 * @returns {Promise<{ longTermData: object, pairing: object }>}
 * @throws On pairSetup rejection, timeout, or savePairings rejection — caller handles.
 */
export async function performPairSetupAndPersist(
  { deviceId, pin, address, port, pairMethod, addresses = [] },
  { HttpClient, loadPairings, savePairings, timeoutMs = 60_000 }
) {
  // Callers pass the addresses in the order to try; `address` comes first.
  const candidates = mergeAddresses([address], addresses);
  const { result: longTermData, address: pairedAddress } = await tryEachAddress(candidates, async (candidate) => {
    const client = new HttpClient(deviceId, candidate, port);
    try {
      await withTimeout(
        client.pairSetup(pin, pairMethod),
        timeoutMs,
        () => abortHapClient(client),
        'pairSetup'
      );
      return client.getLongTermData();
    } finally {
      try { client.close?.(); } catch (_e) { /* ignore */ }
    }
  });

  const updated = loadPairings();
  updated[deviceId] = {
    ...updated[deviceId],
    address: pairedAddress,
    ...(candidates.length > 1 ? { addresses: candidates } : {}),
    port,
    longTermData,
    pin,
    pairedAt: new Date().toISOString(),
  };
  await savePairings(updated);

  return { longTermData, pairing: updated[deviceId] };
}
