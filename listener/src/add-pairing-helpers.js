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
