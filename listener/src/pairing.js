/**
 * pairing.js — pair with a HomeKit accessory and save the long-term keys.
 *
 * Run once per accessory:
 *   docker compose run --rm listener node src/pairing.js <device-id> <pin>
 *
 * PIN format: 111-22-333  (the code printed on the device or shown in Apple Home)
 *
 * Keys are saved to /app/data/pairings.json (volume-mounted, persists restarts).
 * Devices already paired with Apple Home can ALSO be paired here simultaneously.
 */

import { IPDiscovery, HttpClient } from 'hap-controller';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { log } from './logger.js';
import { pairSetupWithFallback } from './setup-helpers.js';

// When running locally (outside Docker), save pairings here instead of /app/data
const PAIRINGS_FILE = process.env.PAIRINGS_FILE
  || (process.env.NODE_ENV === 'production' ? '/app/data/pairings.json' : './data/pairings.json');

const SCAN_TIMEOUT_MS = 15_000;
const iface = process.env.DISCOVER_IFACE || null;

const [, , deviceId, pin] = process.argv;

if (!deviceId || !pin) {
  console.error('Usage: node src/pairing.js <device-id> <pin>');
  console.error('Example: node src/pairing.js "AA:BB:CC:DD:EE:FF" "111-22-333"');
  console.error('\nRun discover.js first to find device IDs.');
  process.exit(1);
}

// Load existing pairings
function loadPairings() {
  if (existsSync(PAIRINGS_FILE)) {
    try {
      return JSON.parse(readFileSync(PAIRINGS_FILE, 'utf8'));
    } catch (err) {
      log.debug('[pairing] Failed to parse pairings file, using empty map:', err.message);
      return {};
    }
  }
  return {};
}

function savePairings(pairings) {
  writeFileSync(PAIRINGS_FILE, JSON.stringify(pairings, null, 2));
}

console.log(`Looking for accessory: ${deviceId}`);
console.log(`Scanning for up to ${SCAN_TIMEOUT_MS / 1000}s...\n`);

const discovery = new IPDiscovery(iface);
let paired = false;

discovery.on('serviceUp', async (service) => {
  if (service.id !== deviceId) return;
  if (paired) return;
  paired = true;

  discovery.stop();

  console.log(`Found: ${service.name} at ${service.address}:${service.port}`);
  console.log('Pairing...');

  try {
    const { client, pairMethod } = await pairSetupWithFallback({
      HttpClient, deviceId: service.id, address: service.address, port: service.port, pin,
      pairMethod: await discovery.getPairMethod(service),
    });
    const longTermData = client.getLongTermData();

    const pairings = loadPairings();
    pairings[service.id] = {
      protocol: 'homekit',
      name: service.name,
      address: service.address,
      port: service.port,
      category: service.ci,
      pairedAt: new Date().toISOString(),
      pin,
      pairMethod,
      longTermData,
    };
    savePairings(pairings);

    console.log(`\nPaired successfully with: ${service.name}`);
    console.log(`Keys saved to ${PAIRINGS_FILE}`);
    console.log('\nRestart the listener container to start receiving events:');
    console.log('  docker compose restart listener');
  } catch (err) {
    console.error('\nPairing failed:', err.message);
    console.error('Check that the PIN is correct and the device is in pairing mode.');
    process.exit(1);
  }

  process.exit(0);
});

discovery.on('error', (err) => {
  if (paired) return;
  console.error(`\nScan failed: ${err.message}`);
  console.error('Check DISCOVER_IFACE and that this machine is on the same network as the accessory.');
  process.exit(1);
});

discovery.start();

setTimeout(() => {
  if (!paired) {
    discovery.stop();
    console.error(`\nTimeout: could not find device "${deviceId}" on the network.`);
    console.error('Make sure the NAS and the accessory are on the same LAN/VLAN.');
    console.error('Run discover.js to confirm the device is visible.');
    process.exit(1);
  }
}, SCAN_TIMEOUT_MS);
