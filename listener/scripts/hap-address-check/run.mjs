// End-to-end check of HomeKit multi-address handling against a real HAP
// accessory (HAP-NodeJS), for the listener code that unit tests can only mock:
// pairing (/pair), the subscriber's reconnect, and scheduled re-pair.
//
// The accessory runs on this machine and is "announced" at two addresses:
// 192.0.2.1 (TEST-NET-1, which silently drops traffic — like a Homebridge
// container's macvlan address seen from its own Docker host) and 127.0.0.1.
//
// usage (from listener/; needs a throwaway Postgres — it inserts and then
// deletes events for its own test accessory ids):
//   DATABASE_URL=postgresql://homekit:changeme@localhost:5432/homekit_events npm run check:hap-addresses
//
// Exits 1 if any check fails. See docs/guide/testing.md.
import { spawn, execSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DEAD = '192.0.2.1';
const LIVE = '127.0.0.1';
const PIN = '031-45-154';
const PORT_A = Number(process.env.HAP_CHECK_PORT ?? 51826);
const PORT_D = PORT_A + 1;
const ID_A = 'CC:22:3D:E3:CE:A1';
const ID_D = 'CC:22:3D:E3:CE:D4';

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is required (a throwaway or dev database).');
  process.exit(2);
}
if (process.env.NODE_ENV === 'production') {
  console.error('Refusing to run with NODE_ENV=production.');
  process.exit(2);
}
// Short timeouts so failover is quick; read by the listener modules at import.
process.env.HAP_PAIR_TIMEOUT_MS ??= '3000';
process.env.HAP_REQUEST_TIMEOUT_MS ??= '3000';
process.env.LOG_LEVEL ??= 'info';
const TIMEOUT_MS = Number(process.env.HAP_REQUEST_TIMEOUT_MS);

// Record every connection attempt the subscriber logs ("Connecting to X (addr:port)").
const attempts = [];
for (const level of ['log', 'info', 'warn']) {
  const original = console[level].bind(console);
  console[level] = (...args) => {
    const match = /Connecting to .* \(([\d.]+):\d+\)/.exec(args.join(' '));
    if (match) attempts.push(match[1]);
    original(...args);
  };
}

const { HttpClient } = await import('hap-controller');
const { pool, migrateDb } = await import('../../src/db.js');
const { createSetupRouter } = await import('../../src/setup-router.js');
const subscriber = await import('../../src/subscriber.js');
const { performPairSetupAndPersist } = await import('../../src/repair-helpers.js');

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function waitFor(predicate, ms, label) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    // eslint-disable-next-line no-await-in-loop
    if (await predicate()) return true;
    // eslint-disable-next-line no-await-in-loop
    await sleep(100);
  }
  console.log(`  (gave up waiting for ${label})`);
  return false;
}

let lsofMissing = false;
function deadSockets() {
  try {
    return execSync(`lsof -nP -a -p ${process.pid} -iTCP@${DEAD}`, { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString().split('\n').filter((line) => line.includes(DEAD)).length;
  } catch (err) {
    if (err.status === 1) return 0; // lsof: nothing matched
    lsofMissing = true;
    return 0;
  }
}

const children = new Set();
const storageDirs = [];
function startAccessory(username, port, dir) {
  const storage = dir ?? mkdtempSync(path.join(os.tmpdir(), 'hc-hap-check-'));
  if (!dir) storageDirs.push(storage);
  const child = spawn(process.execPath, [path.join(HERE, 'accessory.mjs'), storage, username, String(port), PIN], {
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  children.add(child);
  child.on('exit', () => children.delete(child));
  const ready = new Promise((resolve, reject) => {
    child.stdout.on('data', (data) => { if (String(data).includes('published')) resolve(); });
    child.on('exit', (code) => reject(new Error(`accessory exited (${code}) before publishing`)));
  });
  return { child, ready, storage };
}
function cleanup() {
  for (const child of children) child.kill('SIGTERM');
  for (const dir of storageDirs) rmSync(dir, { recursive: true, force: true });
}
process.on('exit', cleanup);

// The checks assume 192.0.2.1 drops traffic (a connect hangs) on this machine.
const deadHangs = await new Promise((resolve) => {
  const socket = net.connect({ host: DEAD, port: 9 });
  const done = (hangs) => { socket.destroy(); resolve(hangs); };
  socket.on('connect', () => done(false));
  socket.on('error', () => done(false));
  setTimeout(() => done(true), 1500);
});
if (!deadHangs) {
  console.warn(`WARN ${DEAD} does not silently drop traffic here; the timeout checks below may not apply.`);
}

await migrateDb();
await pool.query("DELETE FROM event_logs WHERE accessory_id LIKE 'CC:22:3D:E3:CE:%'");

// -- A. Pairing a new accessory ---------------------------------------------
console.log(`\nA. Pairing a new accessory announced at [${DEAD}, ${LIVE}]`);
const accA = startAccessory(ID_A, PORT_A);
await accA.ready;
const pairings = {};
const router = createSetupRouter({
  pool,
  getDiscoveryCache: () => [{
    id: ID_A, name: 'Addr Check Sensor', address: DEAD, addresses: [DEAD, LIVE], port: PORT_A,
    category: 10, ff: 0, paired: false, pairedElsewhere: false,
  }],
  setDiscoveryCache: () => {},
  runDiscoveryScan: async () => [],
  loadPairings: () => ({ ...pairings }),
  savePairings: async (next) => { Object.assign(pairings, next); },
  loadRooms: () => ({}),
  saveRooms: async () => {},
  loadDisplayNames: () => ({}),
  saveDisplayNames: async () => {},
  loadNotes: () => ({}),
  saveNotes: async () => {},
  discoverDeviceForRepair: async () => null,
  savePairingForRepair: async () => {},
  startSubscribers: () => {},
  stopSubscriber: () => {},
  resetSubscriberStats: () => {},
  getPairingForLookup: () => null,
  HttpClient,
});
// The route's last handler, past the admin-session middleware.
const pairHandler = router.stack.find((layer) => layer.route?.path === '/pair' && layer.route.methods.post).route.stack.at(-1).handle;
let status = 200;
let body = null;
const pairStart = Date.now();
await pairHandler({ body: { deviceId: ID_A, pin: PIN } }, {
  status(code) { status = code; return this; },
  json(payload) { body = payload; return this; },
});
const pairMs = Date.now() - pairStart;
const saved = pairings[ID_A];
check('A1 pairing succeeds via the second address', status === 200 && body?.success === true, `status ${status}, ${pairMs} ms`);
check('A2 the address that worked is stored', saved?.address === LIVE, `address=${saved?.address} addresses=${JSON.stringify(saved?.addresses)}`);
check('A3 failover came after the per-address timeout, not the OS one', pairMs >= TIMEOUT_MS - 100 && pairMs < TIMEOUT_MS * 5, `${pairMs} ms`);
await sleep(300);
check('A4 no socket left open to the dead address', deadSockets() === 0, `${deadSockets()} open`);

// -- B. Subscriber stored on the dead address --------------------------------
console.log('\nB. Subscriber stored on the dead address');
subscriber.__testHooks.setReconnectWindow(500, 2000);
const stored = { ...saved, address: DEAD, addresses: [DEAD, LIVE] };
const subscribeStart = new Date();
subscriber.startSubscriber(ID_A, stored, {}, () => stored, {
  discoverDevice: async () => null, // nothing announced: rely on the stored addresses
  savePairing: async (_id, next) => { Object.assign(stored, next); },
});
const connected = await waitFor(() => subscriber.getSubscriberStats(ID_A)?.connected, TIMEOUT_MS * 10, 'subscriber connected');
check('B1 the subscriber ends up connected', connected, `${Date.now() - subscribeStart} ms`);
check('B2 it moved to the live address and stored it', stored.address === LIVE, `address=${stored.address}`);
check('B3 the dead address was tried twice, then the live one', JSON.stringify(attempts.slice(0, 3)) === JSON.stringify([DEAD, DEAD, LIVE]), JSON.stringify(attempts));
const logged = await waitFor(async () => (await pool.query(
  "SELECT count(*)::int AS n FROM event_logs WHERE accessory_id LIKE $1 AND timestamp >= $2", [`${ID_A}%`, subscribeStart],
)).rows[0].n >= 2, 10_000, 'events');
check('B4 occupancy events are logged', logged);
check('B5 no socket left open to the dead address', deadSockets() === 0, `${deadSockets()} open`);

// -- C. Device restart on the working address --------------------------------
console.log('\nC. Accessory restarts (connections refused while it is down)');
const attemptsBefore = attempts.length;
accA.child.kill('SIGTERM');
await sleep(1500);
const accA2 = startAccessory(ID_A, PORT_A, accA.storage);
await accA2.ready;
const restartedAt = new Date().toISOString();
const back = await waitFor(() => {
  const stats = subscriber.getSubscriberStats(ID_A);
  return stats?.connected && stats.lastConnectedAt >= restartedAt;
}, TIMEOUT_MS * 10, 'reconnected');
const since = attempts.slice(attemptsBefore);
check('C1 the subscriber reconnects after the restart', back);
check('C2 it stayed on the working address', stored.address === LIVE && !since.includes(DEAD), `attempts since restart: ${JSON.stringify(since)}`);
// -- E. Liveness probe on a quiet / wedged accessory --------------------------
console.log('\nE. Liveness probe: a quiet accessory answers; a frozen one is reconnected');
const session = subscriber.__testHooks.getSession(ID_A);
check('E1 the probe target is the accessory\'s own Name characteristic', /^1\.\d+$/.test(session.probeKey ?? ''), `probeKey=${session.probeKey}`);
session.stats.lastHealthyAt = new Date(Date.now() - 2 * 3_600_000).toISOString(); // pretend quiet for 2 h
const answered = await subscriber.__testHooks.probeLiveness(session, session.client, stored, 'Addr Check Sensor');
check('E2 a quiet accessory answers and stays connected', answered === true && subscriber.getSubscriberStats(ID_A)?.connected === true);
const reconnectsBefore = subscriber.getSubscriberStats(ID_A).connectAttempts;
accA2.child.kill('SIGSTOP'); // wedged: TCP stays open, nothing answers
session.stats.lastHealthyAt = new Date(Date.now() - 2 * 3_600_000).toISOString();
const frozen = await subscriber.__testHooks.probeLiveness(session, session.client, stored, 'Addr Check Sensor');
check('E3 a frozen accessory fails the probe and is no longer reported connected', frozen === false && subscriber.getSubscriberStats(ID_A)?.connected === false);
accA2.child.kill('SIGCONT');
const recovered = await waitFor(() => subscriber.getSubscriberStats(ID_A)?.connected && subscriber.getSubscriberStats(ID_A).connectAttempts > reconnectsBefore, TIMEOUT_MS * 10, 'reconnect after resume');
check('E4 it reconnects once the accessory answers again', recovered);

subscriber.stopSubscriber(ID_A);
accA2.child.kill('SIGTERM');

// -- D. Scheduled re-pair ----------------------------------------------------
console.log('\nD. Scheduled re-pair of a pairing stored on the dead address');
const accD = startAccessory(ID_D, PORT_D);
await accD.ready;
const repairPairings = { [ID_D]: { name: 'Addr Check D', address: DEAD, port: PORT_D, addresses: [DEAD, LIVE] } };
const repairStart = Date.now();
let repairError = null;
try {
  await performPairSetupAndPersist(
    { deviceId: ID_D, pin: PIN, address: DEAD, port: PORT_D, pairMethod: 0, addresses: [DEAD, LIVE] },
    {
      HttpClient,
      loadPairings: () => ({ ...repairPairings }),
      savePairings: async (next) => { Object.assign(repairPairings, next); },
      timeoutMs: Number(process.env.HAP_PAIR_TIMEOUT_MS),
    },
  );
} catch (err) {
  repairError = err;
}
const repaired = repairPairings[ID_D];
check('D1 re-pair succeeds via the second address', !repairError && Boolean(repaired.longTermData), repairError ? repairError.message : `${Date.now() - repairStart} ms`);
check('D2 re-pair stores the address that worked', repaired.address === LIVE, `address=${repaired.address}`);
await sleep(300);
check('D3 no socket left open to the dead address', deadSockets() === 0, `${deadSockets()} open`);
accD.child.kill('SIGTERM');

await pool.query("DELETE FROM event_logs WHERE accessory_id LIKE 'CC:22:3D:E3:CE:%'");
await pool.end();
if (lsofMissing) console.warn('WARN lsof is not available; the open-socket checks were skipped.');
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
