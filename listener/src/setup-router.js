import express from 'express';
import rateLimit from 'express-rate-limit';
import { log, getLevel, setLevel } from './logger.js';
import { rateLimitKeyGenerator, requireAdminSession } from './security.js';
import { parseIntInRange, withTimeout } from './utils.js';
import { advertisedAddresses, isConnectionError } from './hap-addresses.js';
import { renameAccessoryEvents } from './display-names.js';
import { shortUuid } from './accessory-metadata.js';
import { CATEGORIES, isValidCategory } from './categories.js';
import { resolveControllerIdentity, runAddPairing } from './add-pairing-helpers.js';
import {
  isHomeKitPairing,
  getHomeKitPairings,
  normalizePairingRecord,
  pairMethodForFeatureFlags,
  pairSetupWithFallback,
  resolvePairMethod,
} from './setup-helpers.js';

const SETUP_WRITE_RATE_LIMIT_WINDOW_MS = parseIntInRange(
  process.env.API_WRITE_RATE_LIMIT_WINDOW_MS, 60_000, 1_000, 24 * 60 * 60 * 1000
);
const SETUP_WRITE_RATE_LIMIT_MAX = parseIntInRange(
  process.env.API_WRITE_RATE_LIMIT_MAX, 60, 1, 100_000
);

// Per-address deadline when an accessory announces more than one address, so an
// unreachable one fails over to the next instead of waiting out the OS TCP timeout.
const HAP_PAIR_ADDRESS_TIMEOUT_MS = parseIntInRange(process.env.HAP_PAIR_TIMEOUT_MS, 60_000, 1_000, 300_000);

export function createSetupRouter({
  pool,
  getDiscoveryCache,
  setDiscoveryCache,
  runDiscoveryScan,
  loadPairings,
  savePairings,
  loadRooms,
  saveRooms,
  loadDisplayNames,
  saveDisplayNames,
  loadNotes,
  saveNotes,
  loadCategories = () => ({}),
  saveCategories = async () => {},
  discoverDeviceForRepair,
  savePairingForRepair,
  startSubscribers,
  stopSubscriber,
  resetSubscriberStats,
  getPairingForLookup,
  HttpClient,
}) {
  const router = express.Router();
  const setupWriteLimiter = rateLimit({
    windowMs: SETUP_WRITE_RATE_LIMIT_WINDOW_MS,
    max: SETUP_WRITE_RATE_LIMIT_MAX,
    standardHeaders: true,
    legacyHeaders: false,
    validate: false,
    keyGenerator: rateLimitKeyGenerator,
    message: { error: 'Too many requests' },
  });

  // -- Discovery --

  router.get('/discovered', (_req, res) => {
    const currentPairings = getHomeKitPairings(loadPairings());
    const results = getDiscoveryCache().map((s) => ({
      ...s,
      paired: s.paired || !!currentPairings[s.id],
      pairedElsewhere: s.pairedElsewhere && !currentPairings[s.id],
      alreadyPaired: !!currentPairings[s.id],
    }));
    res.json({ accessories: results, cachedAt: new Date().toISOString() });
  });

  router.post('/scan', requireAdminSession, setupWriteLimiter, async (_req, res) => {
    try {
      log.info('[setup] Manual scan triggered from UI');
      const results = await runDiscoveryScan();
      res.json({ accessories: results, cachedAt: new Date().toISOString() });
    } catch (err) {
      log.error('[setup] Scan error:', err.message ?? err.stack ?? err);
      res.status(502).json({
        accessories: getDiscoveryCache(),
        cachedAt: new Date().toISOString(),
        warning: 'mDNS scan failed. Check DISCOVER_IFACE setting.',
      });
    }
  });

  // -- Pairing (HomeKit) --

  router.post('/pair', requireAdminSession, setupWriteLimiter, async (req, res) => {
    const { deviceId, pin, protocol = 'homekit' } = req.body ?? {};
    if (String(protocol).toLowerCase() !== 'homekit') {
      return res.status(400).json({ error: 'Unsupported protocol for this endpoint. Use /api/setup/matter/pair.' });
    }
    if (!deviceId || !pin) {
      return res.status(400).json({ error: 'deviceId and pin are required' });
    }

    const cache = getDiscoveryCache();
    const cached = cache.find((s) => s.id === deviceId);
    if (!cached) {
      return res.status(404).json({
        error: 'Accessory not found in last scan. Run a new scan first.',
      });
    }

    if (cached.pairedElsewhere) {
      log.warn(`[setup] ${cached.name} appears paired to another controller (sf=0) — attempting anyway`);
    }

    const preferredMethod = pairMethodForFeatureFlags(cached.ff);
    log.info(`[setup] Pairing ${cached.name} (${deviceId})`);
    log.debug(`[setup] ${cached.name}: ff=${cached.ff ?? 'unknown'} → pair method ${preferredMethod}`);

    try {
      // An accessory can announce several addresses, not all reachable from this
      // host (a Homebridge container's macvlan address can't be reached from its
      // own Docker host). Try each in turn on a connection failure; any other
      // error (wrong PIN, already paired) is the answer and stops here.
      const addresses = advertisedAddresses(cached);
      let paired = null;
      let pairedAddress = null;
      for (const [i, candidate] of addresses.entries()) {
        const attempt = pairSetupWithFallback({
          HttpClient, deviceId, address: candidate, port: cached.port, pin, pairMethod: preferredMethod,
        });
        try {
          paired = addresses.length > 1
            ? await withTimeout(attempt, HAP_PAIR_ADDRESS_TIMEOUT_MS, null, `pair-setup via ${candidate}`)
            : await attempt;
          pairedAddress = candidate;
          break;
        } catch (err) {
          if (!isConnectionError(err) || i === addresses.length - 1) throw err;
          log.info(`[setup] ${cached.name}: ${candidate} not reachable (${err.message}) — trying ${addresses[i + 1]}`);
        }
      }
      const { client, pairMethod } = paired;
      const longTermData = client.getLongTermData();

      const updatedPairings = loadPairings();
      updatedPairings[deviceId] = {
        protocol: 'homekit',
        name: cached.name,
        address: pairedAddress,
        addresses,
        port: cached.port,
        category: cached.category,
        pairedAt: new Date().toISOString(),
        pin,
        pairMethod,
        longTermData,
      };
      await savePairings(updatedPairings);

      const item = getDiscoveryCache().find((s) => s.id === deviceId);
      if (item) { item.paired = true; item.alreadyPaired = true; }

      startSubscribers(
        { [deviceId]: updatedPairings[deviceId] },
        loadRooms(),
        getPairingForLookup,
        { discoverDevice: discoverDeviceForRepair, savePairing: savePairingForRepair }
      );

      log.info(`[setup] Paired successfully: ${cached.name}`);
      res.json({ success: true, name: cached.name });
    } catch (err) {
      log.error(`[setup] Pairing failed for ${deviceId}:`, err.message ?? err.stack ?? err);
      const msg = err.message ?? '';
      let friendly = 'Pairing failed: ' + err.message;
      // hap-controller reports TLV errors as "M<step>: Error: <code>" (decimal)
      // or older hex forms like 0x02. Match both.
      if (msg.includes('0x02') || /Error:\s*2\b/.test(msg) || /authentication/i.test(msg))
        friendly = 'Wrong PIN — double-check the code on the device label and try again.';
      else if (msg.includes('0x03') || /Error:\s*3\b/.test(msg) || /backoff/i.test(msg))
        friendly = 'Device asked to slow down (backoff) — wait 30 seconds and try again.';
      else if (msg.includes('0x04') || /Error:\s*4\b/.test(msg) || /maxpeers/i.test(msg))
        friendly = 'This device has reached its pairing limit. In Apple Home, long-press the accessory -> remove it, then re-add it to free a slot, then try pairing here again.';
      else if (msg.includes('0x05') || /Error:\s*5\b/.test(msg) || /maxtries/i.test(msg))
        friendly = 'Too many failed attempts — wait a few minutes before trying again.';
      else if (msg.includes('0x06') || /Error:\s*6\b/.test(msg) || /unavailable/i.test(msg))
        friendly = 'This device is already paired to another controller (e.g. Apple Home). Remove it from the other controller first, or use Add Pairing if the device supports multiple controllers.';
      else if (msg.includes('0x07') || /Error:\s*7\b/.test(msg) || /busy/i.test(msg))
        friendly = 'Device is busy — wait a moment and try again.';
      else if (msg.includes('0x01') || /Error:\s*1\b/.test(msg))
        friendly = 'Device returned an unknown error. Try again — if it persists, restart the device.';
      else if (/ECONNREFUSED|ETIMEDOUT|ENOTFOUND|EHOSTUNREACH|ENETUNREACH|timed out/i.test(msg))
        friendly = 'Could not reach the device. Run a new scan to refresh its address, then try again.';
      else if (/M4: Empty TLV/.test(msg))
        friendly = 'The device ended pairing at the setup-code check without giving a reason. Double-check the 8-digit HomeKit setup code, power-cycle the device, then try again.';
      res.status(400).json({ error: friendly });
    }
  });

  router.get('/bridge-children/:deviceId', async (req, res) => {
    const { deviceId } = req.params;
    const currentPairings = loadPairings();
    const pairing = currentPairings[deviceId];
    if (!pairing) return res.status(404).json({ error: 'Pairing not found' });
    if (!isHomeKitPairing(pairing)) {
      return res.status(400).json({ error: 'Bridge children are only available for HomeKit pairings' });
    }

    try {
      const client = new HttpClient(deviceId, pairing.address, pairing.port, pairing.longTermData);
      const result = await client.getAccessories();
      const children = [];
      for (const acc of result?.accessories ?? []) {
        if (acc.aid === 1) continue;
        const infoService = acc.services?.find((s) => shortUuid(s.type) === '3E');
        const nameProp = infoService?.characteristics?.find((c) => shortUuid(c.type) === '23');
        const name = nameProp?.value ?? `Device ${acc.aid}`;
        children.push({ childId: `${deviceId}:${acc.aid}`, name, aid: acc.aid });
      }
      log.debug(`[setup] bridge-children: ${pairing.name} -> ${children.length} child(ren)`);
      res.json(children);
    } catch (err) {
      log.error(`[setup] bridge-children error for ${deviceId}:`, err.message ?? err.stack ?? err);
      res.status(500).json({ error: 'Could not query bridge accessories' });
    }
  });

  router.get('/pairings', (_req, res) => {
    const currentPairings = getHomeKitPairings(loadPairings());
    const list = Object.entries(currentPairings).map(([id, p]) => ({
      id,
      protocol: 'homekit',
      name: p.name,
      address: p.address,
      port: p.port,
      category: p.category,
      pairedAt: p.pairedAt,
    }));
    res.json(list);
  });

  router.delete('/pairing/:deviceId', requireAdminSession, setupWriteLimiter, async (req, res) => {
    const { deviceId } = req.params;
    const currentPairings = loadPairings();

    if (!currentPairings[deviceId]) {
      return res.status(404).json({ error: 'Pairing not found' });
    }
    if (!isHomeKitPairing(currentPairings[deviceId])) {
      return res.status(400).json({ error: 'Use /api/setup/matter/pairing/:nodeId for Matter pairings' });
    }

    const name = currentPairings[deviceId].name;
    stopSubscriber(deviceId);
    delete currentPairings[deviceId];
    await savePairings(currentPairings);

    const cached = getDiscoveryCache().find((s) => s.id === deviceId);
    if (cached) { cached.paired = false; cached.alreadyPaired = false; }

    log.info(`[setup] Removed pairing for ${name} (${deviceId})`);
    res.json({ success: true, name });
  });

  router.post('/repair/:deviceId', requireAdminSession, setupWriteLimiter, async (req, res) => {
    const { deviceId } = req.params;
    const { pin: overridePin } = req.body ?? {};
    const currentPairings = loadPairings();
    const pairing = currentPairings[deviceId];

    if (!pairing) {
      return res.status(404).json({ error: 'Pairing not found', code: 'NOT_FOUND', guidance: 'This device is not paired. Go to Add Devices to pair it.' });
    }
    if (!isHomeKitPairing(pairing)) {
      return res.status(400).json({ error: 'Repair is only available for HomeKit pairings', code: 'NOT_HOMEKIT' });
    }

    const pin = overridePin?.trim() || pairing.pin;
    if (!pin) {
      return res.status(400).json({
        error: 'No PIN available',
        code: 'NO_PIN',
        guidance: 'No PIN on file for this device. Enter the device\'s HomeKit setup code to repair.',
      });
    }

    log.info(`[setup] Repair requested for ${pairing.name} (${deviceId})`);

    try {
      // Discover current address/port (5s timeout for interactive use)
      const discovered = await Promise.race([
        discoverDeviceForRepair(deviceId),
        new Promise((resolve) => setTimeout(() => resolve(null), 5000)),
      ]);

      if (!discovered) {
        return res.status(404).json({
          error: 'Device not found on network',
          code: 'NOT_FOUND_NETWORK',
          guidance: 'Make sure the device is powered on and on the same network, then try again.',
        });
      }

      const client = new HttpClient(deviceId, discovered.address, discovered.port);
      await client.pairSetup(pin, resolvePairMethod(pairing));
      const longTermData = client.getLongTermData();

      // Save updated pairing
      const updatedPairings = loadPairings();
      updatedPairings[deviceId] = {
        ...updatedPairings[deviceId],
        address: discovered.address,
        port: discovered.port,
        longTermData,
        pin,
        pairedAt: new Date().toISOString(),
      };
      await savePairings(updatedPairings);

      // Reset subscriber stats and restart
      resetSubscriberStats(deviceId);
      stopSubscriber(deviceId);
      startSubscribers(
        { [deviceId]: updatedPairings[deviceId] },
        loadRooms(),
        getPairingForLookup,
        { discoverDevice: discoverDeviceForRepair, savePairing: savePairingForRepair }
      );

      log.info(`[setup] Repair successful: ${pairing.name}`);
      res.json({ success: true, name: pairing.name });
    } catch (err) {
      log.error(`[setup] Repair failed for ${deviceId}:`, err.message ?? err.stack ?? err);
      const msg = err.message ?? '';
      let code = 'UNKNOWN';
      let guidance = 'Repair failed: ' + msg;

      if (/Error:\s*6\b/.test(msg) || /unavailable/i.test(msg)) {
        code = 'UNAVAILABLE';
        guidance = 'This device rejected the pairing. It may be at its pairing limit or not accepting new pairings. Check the device\'s admin interface to remove stale pairings, then try again.';
      } else if (/Error:\s*2\b/.test(msg) || /authentication/i.test(msg)) {
        code = 'WRONG_PIN';
        guidance = 'The PIN was rejected. Double-check the code on the device or in its admin interface.';
      } else if (/Error:\s*4\b/.test(msg) || /maxpeers/i.test(msg)) {
        code = 'MAX_PEERS';
        guidance = 'This device has reached its pairing limit. Remove a pairing from the device first, then try again.';
      } else if (/ECONNREFUSED|ETIMEDOUT|ENOTFOUND/i.test(msg)) {
        code = 'UNREACHABLE';
        guidance = 'Could not reach the device. Make sure it\'s powered on and on the same network.';
      }

      res.status(400).json({ error: guidance, code, guidance });
    }
  });

  router.post('/add-pairing', requireAdminSession, setupWriteLimiter, async (req, res) => {
    const { sourcePairings } = req.body ?? {};
    if (!sourcePairings || typeof sourcePairings !== 'object') {
      return res.status(400).json({ error: 'sourcePairings object is required' });
    }

    const homeKitEntries = Object.entries(sourcePairings).filter(
      ([, v]) => v.protocol === 'homekit' && v.longTermData,
    );
    if (homeKitEntries.length === 0) {
      return res.status(400).json({ error: 'No HomeKit pairings with longTermData found in sourcePairings' });
    }

    log.info(`[setup] Add-pairing requested for ${homeKitEntries.length} device(s)`);

    const identity = resolveControllerIdentity(loadPairings());

    const { results } = await runAddPairing({
      sourcePairings,
      identity,
      discoverDevice: async (deviceId) => {
        return Promise.race([
          discoverDeviceForRepair(deviceId),
          new Promise((resolve) => setTimeout(() => resolve(null), 10_000)),
        ]);
      },
      createClient: (deviceId, address, port, longTermData) =>
        new HttpClient(deviceId, address, port, longTermData),
    });

    // Save all successful pairings
    const updatedPairings = loadPairings();
    const newPairings = {};
    for (const r of results.filter((r) => r.ok)) {
      updatedPairings[r.deviceId] = r.pairing;
      newPairings[r.deviceId] = r.pairing;
    }
    if (Object.keys(newPairings).length > 0) {
      await savePairings(updatedPairings);
      startSubscribers(
        newPairings,
        loadRooms(),
        getPairingForLookup,
        { discoverDevice: discoverDeviceForRepair, savePairing: savePairingForRepair }
      );
    }

    const succeeded = results.filter((r) => r.ok).length;
    const failed = results.filter((r) => !r.ok).length;
    log.info(`[setup] Add-pairing complete: ${succeeded} succeeded, ${failed} failed`);

    const safeResults = results.map(({ pairing, ...rest }) => rest);
    res.json({ results: safeResults, summary: { total: results.length, succeeded, failed } });
  });

  // -- Rooms --

  router.patch('/room', setupWriteLimiter, async (req, res) => {
    const { accessoryId, roomName } = req.body ?? {};
    if (!accessoryId) return res.status(400).json({ error: 'accessoryId is required' });

    const rooms = loadRooms();
    if (roomName && roomName.trim()) {
      rooms[accessoryId] = roomName.trim();
    } else {
      delete rooms[accessoryId];
    }
    await saveRooms(rooms);
    log.info(`[setup] Room for ${accessoryId} set to ${roomName?.trim() || '(cleared)'}`);
    res.json({ success: true });
  });

  router.get('/rooms', (_req, res) => {
    res.json(loadRooms());
  });

  // -- Device categories --

  // An empty or missing category clears the override, so the device goes back
  // to the category its service types imply.
  router.patch('/category', setupWriteLimiter, async (req, res) => {
    const { accessoryId } = req.body ?? {};
    const category = String(req.body?.category ?? '').trim();
    if (!accessoryId) return res.status(400).json({ error: 'accessoryId is required' });
    if (category && !isValidCategory(category)) {
      return res.status(400).json({ error: `category must be one of: ${CATEGORIES.map((c) => c.id).join(', ')}` });
    }

    const overrides = loadCategories();
    if (category) {
      overrides[accessoryId] = category;
    } else {
      delete overrides[accessoryId];
    }
    await saveCategories(overrides);
    log.info(`[setup] Category for ${accessoryId} set to ${category || '(automatic)'}`);
    res.json({ success: true });
  });

  router.get('/categories', (_req, res) => {
    res.json({ categories: CATEGORIES, overrides: loadCategories() });
  });

  // -- Display Names --

  router.patch('/display-name', setupWriteLimiter, async (req, res) => {
    const { accessoryId, displayName } = req.body ?? {};
    if (!accessoryId) return res.status(400).json({ error: 'accessoryId is required' });

    if (displayName != null && typeof displayName !== 'string') {
      return res.status(400).json({ error: 'displayName must be a string' });
    }

    const names = loadDisplayNames();
    const previousName = names[accessoryId];
    const name = displayName?.trim() ?? '';
    if (name) {
      names[accessoryId] = name;
    } else {
      delete names[accessoryId];
    }
    // Store first, then rewrite history: an event inserted in between already
    // picks up the new name from the store.
    await saveDisplayNames(names);
    try {
      const updated = await renameAccessoryEvents(pool, accessoryId, name);
      log.info(`[setup] Display name for ${accessoryId} set to ${name || '(cleared)'} — ${updated} past event(s) updated`);
      res.json({ success: true, eventsUpdated: updated });
    } catch (err) {
      log.error(`[setup] Display name for ${accessoryId}: renaming past events failed:`, err.message ?? err.stack ?? err);
      if (name) {
        // The name is saved and applies to new events; past live events are
        // renamed at the next listener start.
        return res.json({ success: true, eventsUpdated: null });
      }
      // A failed clear would leave history on the old name with nothing left
      // to restore it: keep the name and report the failure.
      const restored = loadDisplayNames();
      if (typeof previousName === 'string') restored[accessoryId] = previousName;
      await saveDisplayNames(restored).catch(() => {});
      res.status(500).json({ error: 'Could not restore past events — the display name was kept. Try again.' });
    }
  });

  router.get('/display-names', (_req, res) => {
    res.json(loadDisplayNames());
  });

  // -- Notes --

  router.patch('/note', setupWriteLimiter, async (req, res) => {
    const { accessoryId, note } = req.body ?? {};
    if (!accessoryId) return res.status(400).json({ error: 'accessoryId is required' });

    const notes = loadNotes();
    if (note && note.trim()) {
      notes[accessoryId] = note.trim();
    } else {
      delete notes[accessoryId];
    }
    await saveNotes(notes);
    log.info(`[setup] Note for ${accessoryId} set to ${note?.trim() || '(cleared)'}`);
    res.json({ success: true });
  });

  router.get('/notes', (_req, res) => {
    res.json(loadNotes());
  });

  // -- Log Level --

  router.get('/log-level', (_req, res) => {
    res.json({ level: getLevel() });
  });

  router.patch('/log-level', requireAdminSession, setupWriteLimiter, (req, res) => {
    const { level } = req.body ?? {};
    try {
      setLevel(level);
      log.info(`[setup] Log level set to: ${getLevel()}`);
      res.json({ level: getLevel() });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  return router;
}
