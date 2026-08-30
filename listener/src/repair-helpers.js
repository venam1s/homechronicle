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

/**
 * Perform a full HAP pairSetup() handshake using the stored PIN, then persist
 * the fresh longTermData (and updated address/port/pin/pairedAt) into pairings.
 *
 * Mirrors the inline pattern used by setup-router.js lines 262–276 and
 * subscriber.js lines 604–611.  All collaborators are injected for testability —
 * this module has no hap-controller import of its own.
 *
 * @param {{ deviceId: string, pin: string, address: string, port: number }} device
 * @param {{ HttpClient: Function, loadPairings: Function, savePairings: Function, timeoutMs?: number }} deps
 * @param {number} [deps.timeoutMs=60000] - H-3: bounds the pairSetup handshake so a
 *   device that accepts TCP but never answers can no longer strand the nightly
 *   repair scheduler forever. On expiry the client is closed.
 * @returns {Promise<{ longTermData: object, pairing: object }>}
 * @throws On pairSetup rejection, timeout, or savePairings rejection — caller handles.
 */
export async function performPairSetupAndPersist(
  { deviceId, pin, address, port },
  { HttpClient, loadPairings, savePairings, timeoutMs = 60_000 }
) {
  const client = new HttpClient(deviceId, address, port);
  let longTermData;
  try {
    await withTimeout(
      client.pairSetup(pin),
      timeoutMs,
      () => { try { client.close?.(); } catch (e) { /* ignore */ } },
      'pairSetup'
    );
    longTermData = client.getLongTermData();
  } finally {
    try { client.close?.(); } catch (_e) { /* ignore */ }
  }

  const updated = loadPairings();
  updated[deviceId] = {
    ...updated[deviceId],
    address,
    port,
    longTermData,
    pin,
    pairedAt: new Date().toISOString(),
  };
  await savePairings(updated);

  return { longTermData, pairing: updated[deviceId] };
}
