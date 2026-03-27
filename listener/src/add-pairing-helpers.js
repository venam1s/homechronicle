import { randomUUID, generateKeyPairSync } from 'node:crypto';

/**
 * Generate a fresh Ed25519 controller identity for HAP addPairing.
 * Returns { uuid, ltpkHex, ltskHex } where hex values match hap-controller PairingData format.
 */
export function generateControllerIdentity() {
  const uuid = randomUUID();
  const { publicKey, privateKey } = generateKeyPairSync('ed25519', {
    publicKeyEncoding: { type: 'spki', format: 'der' },
    privateKeyEncoding: { type: 'pkcs8', format: 'der' },
  });
  // Raw Ed25519 public key is last 32 bytes of SPKI DER
  const ltpkRaw = publicKey.subarray(-32);
  // Raw Ed25519 private key seed is bytes 16-48 of PKCS8 DER
  const ltskSeed = privateKey.subarray(16, 48);
  // hap-controller stores ltsk as seed (32 bytes) + pubkey (32 bytes) = 64 bytes
  const ltskRaw = Buffer.concat([ltskSeed, ltpkRaw]);

  return {
    uuid,
    ltpkHex: ltpkRaw.toString('hex'),
    ltskHex: ltskRaw.toString('hex'),
  };
}

/**
 * Resolve a controller identity from existing target pairings, or generate a new one.
 * @param {object} targetPairings - contents of target pairings.json
 * @returns {{ uuid: string, ltpkHex: string, ltskHex: string }}
 */
export function resolveControllerIdentity(targetPairings) {
  for (const entry of Object.values(targetPairings)) {
    if (entry.protocol !== 'homekit' || !entry.longTermData?.iOSDevicePairingID) continue;
    const { iOSDevicePairingID, iOSDeviceLTSK, iOSDeviceLTPK } = entry.longTermData;
    return {
      uuid: Buffer.from(iOSDevicePairingID, 'hex').toString('utf8'),
      ltskHex: iOSDeviceLTSK,
      ltpkHex: iOSDeviceLTPK,
    };
  }
  return generateControllerIdentity();
}

/**
 * Build a target pairing record from source metadata, discovered address, and beta identity.
 */
export function buildTargetPairing(source, discovered, identity) {
  return {
    protocol: 'homekit',
    name: source.name,
    address: discovered.address,
    port: discovered.port,
    category: source.category,
    pin: source.pin,
    pairedAt: new Date().toISOString(),
    longTermData: {
      AccessoryPairingID: source.longTermData.AccessoryPairingID,
      AccessoryLTPK: source.longTermData.AccessoryLTPK,
      iOSDevicePairingID: Buffer.from(identity.uuid).toString('hex'),
      iOSDeviceLTSK: identity.ltskHex,
      iOSDeviceLTPK: identity.ltpkHex,
    },
  };
}
