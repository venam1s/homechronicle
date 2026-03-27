#!/usr/bin/env node

/**
 * add-pairing.js — register a new HomeChronicle instance as an additional HAP controller.
 *
 * Uses an existing paired instance's credentials to call addPairing on each accessory,
 * registering the target instance with its own Ed25519 identity.
 *
 * Usage:
 *   node src/add-pairing.js --source /path/to/production/pairings.json \
 *                           --target /path/to/beta/pairings.json
 *
 * Options:
 *   --iface <name>    mDNS discovery interface (default: DISCOVER_IFACE env var)
 *   --timeout <ms>    per-device discovery timeout (default: 10000)
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { IPDiscovery, HttpClient } from 'hap-controller';
import {
  resolveControllerIdentity,
  buildTargetPairing,
} from './add-pairing-helpers.js';

// --- Arg parsing -----------------------------------------------------------

function parseArgs(argv) {
  const args = { iface: process.env.DISCOVER_IFACE || null, timeout: 10_000 };
  for (let i = 2; i < argv.length; i++) {
    switch (argv[i]) {
      case '--source': args.source = argv[++i]; break;
      case '--target': args.target = argv[++i]; break;
      case '--iface':  args.iface = argv[++i]; break;
      case '--timeout': args.timeout = Number(argv[++i]); break;
      default:
        console.error(`Unknown flag: ${argv[i]}`);
        process.exit(1);
    }
  }
  return args;
}

const args = parseArgs(process.argv);

if (!args.source || !args.target) {
  console.error('Usage: node src/add-pairing.js --source <path> --target <path> [--iface <name>] [--timeout <ms>]');
  process.exit(1);
}

// --- Load pairings ----------------------------------------------------------

let sourcePairings;
try {
  sourcePairings = JSON.parse(readFileSync(args.source, 'utf8'));
} catch (err) {
  console.error(`Failed to read source pairings: ${err.message}`);
  process.exit(1);
}

const homeKitEntries = Object.entries(sourcePairings).filter(
  ([, v]) => v.protocol === 'homekit' && v.longTermData,
);

if (homeKitEntries.length === 0) {
  console.error('No HomeKit pairings with longTermData found in source file.');
  process.exit(1);
}

const targetPairings = existsSync(args.target)
  ? JSON.parse(readFileSync(args.target, 'utf8'))
  : {};

const identity = resolveControllerIdentity(targetPairings);

console.log(`Source: ${homeKitEntries.length} HomeKit accessory/accessories`);
console.log(`Target identity: ${identity.uuid}`);
console.log();

// --- Discovery helper -------------------------------------------------------

function discoverDevice(deviceId, iface, timeout) {
  return new Promise((resolve) => {
    const discovery = new IPDiscovery(iface);
    const timer = setTimeout(() => {
      discovery.stop();
      resolve(null);
    }, timeout);

    discovery.on('serviceUp', (service) => {
      if (service.id !== deviceId) return;
      clearTimeout(timer);
      discovery.stop();
      resolve(service);
    });

    discovery.start();
  });
}

// --- HAP error formatting ---------------------------------------------------

function formatHapError(err) {
  const msg = err.message || String(err);
  if (/Error:\s*4/.test(msg)) {
    return 'max peers — remove a controller from Apple Home first';
  }
  if (/Error:\s*2/.test(msg)) {
    return 'authentication failed — source pairing may be stale';
  }
  if (/Error:\s*6/.test(msg)) {
    return 'unavailable — accessory may be busy or not accepting pairings';
  }
  return msg;
}

// --- Main loop --------------------------------------------------------------

const results = [];

for (const [deviceId, source] of homeKitEntries) {
  process.stdout.write(`${source.name} (${deviceId}) ... `);

  // 1. Discover
  const discovered = await discoverDevice(deviceId, args.iface, args.timeout);
  if (!discovered) {
    console.log('SKIP (not found on network)');
    results.push({ deviceId, name: source.name, ok: false, reason: 'not found' });
    continue;
  }

  // 2. Authenticate with source credentials and call addPairing
  try {
    const client = new HttpClient(
      deviceId,
      discovered.address,
      discovered.port,
      source.longTermData,
    );

    const ltpkBuffer = Buffer.from(identity.ltpkHex, 'hex');
    await client.addPairing(identity.uuid, ltpkBuffer, true);

    // 3. Build and store target pairing
    targetPairings[deviceId] = buildTargetPairing(source, discovered, identity);

    console.log('OK');
    results.push({ deviceId, name: source.name, ok: true });
  } catch (err) {
    const reason = formatHapError(err);
    console.log(`FAIL (${reason})`);
    results.push({ deviceId, name: source.name, ok: false, reason });
  }
}

// --- Write target and summarize ---------------------------------------------

writeFileSync(args.target, JSON.stringify(targetPairings, null, 2));

const passed = results.filter((r) => r.ok).length;
const failed = results.filter((r) => !r.ok).length;

console.log();
console.log(`Done: ${passed} succeeded, ${failed} failed`);

if (failed > 0) {
  console.log('\nFailed:');
  for (const r of results.filter((r) => !r.ok)) {
    console.log(`  ${r.name} (${r.deviceId}): ${r.reason}`);
  }
  process.exit(1);
}

process.exit(0);
