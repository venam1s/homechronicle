/**
 * index.js — entry point.
 *
 * 1. Loads cached pairing/room metadata and starts HomeKit subscribers.
 * 2. Starts an Express REST API for the web frontend.
 */

import { networkInterfaces } from 'os';
import express from 'express';
import cors from 'cors';
import { HttpClient } from 'hap-controller'; // injected into setup-router and accessories-router for testability
import { insertEvent, pool, migrateDb, runRetentionSweep, runAlertDeliveriesRetentionSweep } from './db.js';
import { startSubscribers, stopSubscriber, startSubscriber, getSubscriberStats, getSubscriberHealth, resetSubscriberStats, getRepairTargets } from './subscriber.js';
import { JsonObjectStore } from './store.js';
import { createEventsRouter } from './events-router.js';
import { isLoopbackHostname, extractBearerToken, parseIntInRange } from './utils.js';
import { createAlertsRouter } from './alerts-router.js';
import { createMatterRouter } from './matter-router.js';
import { createRetentionRouter, normalizeRetentionSettings } from './retention-router.js';
import { createArchiveRouter } from './archive-router.js';
import { createStatsRouter } from './stats-router.js';
import { createAccessoriesRouter } from './accessories-router.js';
import { createHealthRouter } from './health-router.js';
import { createSetupRouter } from './setup-router.js';
import { createRepairScheduler } from './repair-scheduler.js';
import { createRepairRouter } from './repair-router.js';
import { createMatterRuntime } from './matter-runtime.js';
import { initController as initMatterController } from './matter-controller.js';
import { cached } from './query-cache.js';
import { log } from './logger.js';
import { secureTokenEquals } from './security.js';
import {
  cacheAccessoryMetadata,
  getAllDiscoveredAccessories,
  getAccessoryCapabilities,
  getAccessoryIdentity,
} from './accessory-metadata.js';
import { getHomeKitPairings, createStoreHelpers } from './setup-helpers.js';
import { createDiscoveryHelpers } from './discovery-helpers.js';

// ─── Process-level error handlers — registered before any async operations ───
// D-01: Log rejection but do NOT exit — exiting kills HAP subscriptions
process.on('unhandledRejection', (reason, _promise) => {
  log.error('[process] Unhandled promise rejection:', reason?.message ?? reason?.stack ?? reason);
});
// D-02: Log exception and exit — Docker restart policy handles recovery
process.on('uncaughtException', (err) => {
  log.error('[process] Uncaught exception — exiting for clean Docker restart:', err.message ?? err.stack ?? err);
  process.exit(1);
});

const PAIRINGS_FILE = process.env.PAIRINGS_FILE
  || (process.env.NODE_ENV === 'production' ? '/app/data/pairings.json' : './data/pairings.json');

const ROOMS_FILE = process.env.ROOMS_FILE
  || (process.env.NODE_ENV === 'production' ? '/app/data/rooms.json' : './data/rooms.json');
const DISPLAY_NAMES_FILE = process.env.DISPLAY_NAMES_FILE
  || (process.env.NODE_ENV === 'production' ? '/app/data/display-names.json' : './data/display-names.json');
const NOTES_FILE = process.env.NOTES_FILE
  || (process.env.NODE_ENV === 'production' ? '/app/data/notes.json' : './data/notes.json');
const RETENTION_FILE = process.env.RETENTION_FILE
  || (process.env.NODE_ENV === 'production' ? '/app/data/retention.json' : './data/retention.json');
const REPAIR_FILE = process.env.REPAIR_FILE
  || (process.env.NODE_ENV === 'production' ? '/app/data/repair.json' : './data/repair.json');
const REPAIR_HOUR_DEFAULT = parseIntInRange(process.env.REPAIR_HOUR, 3, 0, 23);

const PORT = Number(process.env.API_PORT ?? 3001);
const RESCAN_INTERVAL_MS = 60 * 60 * 1000; // 1 hour
const STORE_REFRESH_INTERVAL_MS = Number.parseInt(process.env.STORE_REFRESH_INTERVAL_MS ?? '30000', 10);
const API_TOKEN = (process.env.API_TOKEN ?? '').trim();
const API_TOKEN_READS_ENABLED = /^(1|true|yes|on)$/i.test(process.env.API_TOKEN_READS_ENABLED ?? 'false');
const API_JSON_LIMIT = (process.env.API_JSON_LIMIT ?? '256kb').trim() || '256kb';
const CORS_ALLOWED_ORIGINS = (process.env.CORS_ALLOWED_ORIGINS ?? '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);
const CORS_ALLOW_LOCALHOST = /^(1|true|yes|on)$/i.test(process.env.CORS_ALLOW_LOCALHOST ?? 'true');
const ALERTS_ENABLED = !/^(0|false|no|off)$/i.test(process.env.ALERTS_ENABLED ?? 'false');
const DISCOVERY_SCAN_ENABLED = !/^(0|false|no|off)$/i.test(process.env.DISCOVERY_SCAN_ENABLED ?? 'true');
const IS_PRODUCTION = String(process.env.NODE_ENV ?? 'production').trim().toLowerCase() === 'production';

const RETENTION_SWEEP_MS = Number.parseInt(process.env.RETENTION_SWEEP_MS ?? `${24 * 60 * 60 * 1000}`, 10);
const RETENTION_DAYS_DEFAULT = Number.parseInt(process.env.RETENTION_DAYS ?? '365', 10);
const ALERT_RETENTION_DAYS = Number.parseInt(process.env.ALERT_RETENTION_DAYS ?? '90', 10);
const RETENTION_ARCHIVE_DEFAULT = /^(1|true|yes|on)$/i.test(process.env.RETENTION_ARCHIVE ?? 'true');
const STALE_THRESHOLD_HOURS_DEFAULT = Number.parseInt(process.env.STALE_THRESHOLD_HOURS ?? '12', 10);

if (IS_PRODUCTION && !API_TOKEN) {
  log.error('[api] API_TOKEN is required when NODE_ENV=production');
  process.exit(1);
}
if (IS_PRODUCTION && CORS_ALLOW_LOCALHOST && !process.env.CORS_ALLOW_LOCALHOST) {
  log.warn('[api] CORS_ALLOW_LOCALHOST defaults to true — set to false in production if not needed');
}

const pairingsStore = new JsonObjectStore(PAIRINGS_FILE, {});
const roomsStore = new JsonObjectStore(ROOMS_FILE, {});
const displayNamesStore = new JsonObjectStore(DISPLAY_NAMES_FILE, {});
const notesStore = new JsonObjectStore(NOTES_FILE, {});
const retentionStore = new JsonObjectStore(RETENTION_FILE, {
  retentionDays: RETENTION_DAYS_DEFAULT,
  archiveBeforeDelete: RETENTION_ARCHIVE_DEFAULT,
  staleThresholdHours: STALE_THRESHOLD_HOURS_DEFAULT,
  autoScanHomeKit: DISCOVERY_SCAN_ENABLED,
  toastsEnabled: true,
  liveEventToastsEnabled: false,
  toastAccessories: [],
  toastPosition: 'bottom-right',
  toastDuration: 3,
  toastMaxVisible: 3,
});
const repairStore = new JsonObjectStore(REPAIR_FILE, {
  enabled: false,
  hour: REPAIR_HOUR_DEFAULT,
  lastRunAt: null,
  lastRunResult: null,
});
let matterRuntime = null;

const {
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
} = createStoreHelpers({
  pairingsStore,
  roomsStore,
  displayNamesStore,
  notesStore,
  retentionStore,
  getMatterRuntime: () => matterRuntime,
  normalizeRetentionSettings,
});

// Resolve the mDNS network interface.
// If DISCOVER_IFACE is set but doesn't exist on this machine, log the
// available interfaces and fall back to null (= let the OS choose).
const DISCOVER_IFACE = (() => {
  const requested = process.env.DISCOVER_IFACE || null;
  if (!requested) return null;
  const available = Object.keys(networkInterfaces());
  if (available.includes(requested)) return requested;
  log.warn(
    `[discovery] Interface '${requested}' not found on this machine.\n` +
    `            Available: ${available.join(', ')}\n` +
    `            Set DISCOVER_IFACE to one of the above, or unset it to auto-select.`
  );
  return null; // fall back — dnssd will pick the default interface
})();

// ---------------------------------------------------------------------------
// 0. Ensure runtime state exists
// ---------------------------------------------------------------------------

await migrateDb();
await pairingsStore.init();
await roomsStore.init();
await displayNamesStore.init();
await notesStore.init();
await retentionStore.init();
await repairStore.init();
await initMatterController();
matterRuntime = createMatterRuntime({
  insertEvent,
  loadRooms,
});

let retentionSettings = loadRetentionSettings();

if (Number.isFinite(STORE_REFRESH_INTERVAL_MS) && STORE_REFRESH_INTERVAL_MS >= 5_000) {
  setInterval(() => {
    void pairingsStore.refresh().catch((err) => {
      log.warn('[store] pairings refresh failed:', err.message ?? err.stack ?? err);
    });
    if (matterRuntime) {
      try {
        matterRuntime.syncPairings(loadPairings());
      } catch (err) {
        log.warn('[matter] pairing sync failed:', err.message ?? err.stack ?? err);
      }
    }
    void roomsStore.refresh().catch((err) => {
      log.warn('[store] rooms refresh failed:', err.message ?? err.stack ?? err);
    });
    void displayNamesStore.refresh().catch((err) => {
      log.warn('[store] display-names refresh failed:', err.message ?? err.stack ?? err);
    });
    void notesStore.refresh().catch((err) => {
      log.warn('[store] notes refresh failed:', err.message ?? err.stack ?? err);
    });
    void retentionStore.refresh()
      .then(() => { retentionSettings = loadRetentionSettings(); })
      .catch((err) => {
        log.warn('[store] retention refresh failed:', err.message ?? err.stack ?? err);
      });
    void repairStore.refresh().catch((err) => {
      log.warn('[store] repair refresh failed:', err.message ?? err.stack ?? err);
    });
  }, STORE_REFRESH_INTERVAL_MS);
}

// ---------------------------------------------------------------------------
// 2. Discovery helpers (must be created before subscriber startup)
// ---------------------------------------------------------------------------

let discoveryCache = []; // last scan results

const {
  runDiscoveryScan,
  discoverDeviceForRepair,
  savePairingForRepair,
  getPairingForLookup,
  runScheduledDiscoveryScan,
} = createDiscoveryHelpers({
  discoverIface: DISCOVER_IFACE,
  discoveryEnabled: DISCOVERY_SCAN_ENABLED,
  getDiscoveryCache: () => discoveryCache,
  setDiscoveryCache: (cache) => { discoveryCache = cache; },
  pairingsStore,
  loadPairings,
  savePairings,
  getRetentionSettings: () => retentionSettings,
});

// ---------------------------------------------------------------------------
// 1. Start HomeKit subscribers
// ---------------------------------------------------------------------------

const pairings = loadPairings();
const homeKitPairings = getHomeKitPairings(pairings);
const pairedCount = Object.keys(homeKitPairings).length;
matterRuntime.syncPairings(pairings);

if (pairedCount > 0) {
  log.info(`[init] Loaded ${pairedCount} pairing(s) from ${PAIRINGS_FILE}`);
  const missingPinCount = Object.entries(homeKitPairings)
    .filter(([, p]) => !p.pin)
    .length;
  if (missingPinCount > 0) {
    const names = Object.entries(homeKitPairings)
      .filter(([, p]) => !p.pin)
      .map(([, p]) => p.name)
      .join(', ');
    log.warn(`[init] ${missingPinCount} pairing(s) missing PIN (auto-repair will be limited): ${names}`);
  }
  startSubscribers(homeKitPairings, loadRooms(), getPairingForLookup, {
    discoverDevice: discoverDeviceForRepair,
    savePairing: savePairingForRepair,
  });
} else {
  log.warn('[init] No pairings found — use the Setup tab in the web UI to discover and pair accessories.');
}

const repairScheduler = createRepairScheduler({
  getSettings: () => repairStore.getSnapshot(),
  saveSettings: async (s) => repairStore.write(s),
  getRepairTargets,
  discoverDevice: discoverDeviceForRepair,
  savePairing: savePairingForRepair,
  stopSubscriber,
  startSubscriber,
  resetSubscriberStats,
  loadPairings: () => pairingsStore.getSnapshot(),
  loadRooms: () => roomsStore.getSnapshot(),
  getPairingForLookup: (id) => pairingsStore.getSnapshot()[id] ?? null,
});
repairScheduler.start();

if (DISCOVERY_SCAN_ENABLED) {
  void runScheduledDiscoveryScan();
  setInterval(() => {
    void runScheduledDiscoveryScan();
  }, RESCAN_INTERVAL_MS);
} else {
  log.info('[discovery] Disabled via DISCOVERY_SCAN_ENABLED=false');
}

// ---------------------------------------------------------------------------
// 2b. Retention / archival sweep
// ---------------------------------------------------------------------------

async function runRetentionSweepSafe() {
  if (!Number.isFinite(retentionSettings.retentionDays) || retentionSettings.retentionDays <= 0) {
    return;
  }
  try {
    const result = await runRetentionSweep({
      retentionDays: retentionSettings.retentionDays,
      archiveBeforeDelete: retentionSettings.archiveBeforeDelete,
    });
    if (result.deleted > 0 || result.archived > 0) {
      log.info(
        `[retention] cutoff=${result.cutoffDays}d archived=${result.archived} deleted=${result.deleted}`
      );
    }
  } catch (err) {
    log.error('[retention] sweep failed:', err.message ?? err.stack ?? err);
  }

  // alert_deliveries retention (delete-only, no archive)
  if (Number.isFinite(ALERT_RETENTION_DAYS) && ALERT_RETENTION_DAYS > 0) {
    try {
      const alertResult = await runAlertDeliveriesRetentionSweep({
        retentionDays: ALERT_RETENTION_DAYS,
      });
      if (alertResult.deleted > 0) {
        log.info(`[retention] alert_deliveries cutoff=${alertResult.cutoffDays}d deleted=${alertResult.deleted}`);
      }
    } catch (err) {
      log.error('[retention] alert_deliveries sweep failed:', err.message ?? err.stack ?? err);
    }
  }
}

void runRetentionSweepSafe();
if (Number.isFinite(RETENTION_SWEEP_MS) && RETENTION_SWEEP_MS >= 60_000) {
  setInterval(() => {
    void runRetentionSweepSafe();
  }, RETENTION_SWEEP_MS);
}

// ---------------------------------------------------------------------------
// 3. REST API
// ---------------------------------------------------------------------------

const app = express();
app.disable('x-powered-by');
app.use(cors({
  origin(origin, callback) {
    if (!origin) return callback(null, true);
    if (CORS_ALLOWED_ORIGINS.length > 0) return callback(null, CORS_ALLOWED_ORIGINS.includes(origin));
    if (!CORS_ALLOW_LOCALHOST) return callback(null, false);
    try {
      const parsed = new URL(origin);
      callback(null, isLoopbackHostname(parsed.hostname));
    } catch { // flow-control catch — URL parse fails for malformed origins
      callback(null, false);
    }
  },
  methods: ['GET', 'HEAD', 'OPTIONS', 'POST', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Token'],
  maxAge: 600,
}));
app.use(express.json({ limit: API_JSON_LIMIT }));
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  next();
});
// Audit logging for mutating requests
app.use((req, res, next) => {
  if (req.method !== 'GET' && req.method !== 'HEAD' && req.method !== 'OPTIONS') {
    const start = Date.now();
    res.on('finish', () => {
      log.info(
        `[audit] ${req.method} ${req.originalUrl} → ${res.statusCode} (${Date.now() - start}ms)`
      );
    });
  }
  next();
});
app.use((req, res, next) => {
  if (!API_TOKEN) return next();
  if (req.method === 'OPTIONS') return next();

  const isReadMethod = req.method === 'GET' || req.method === 'HEAD';
  if (isReadMethod && !API_TOKEN_READS_ENABLED) return next();

  const providedToken = String(
    req.get('x-api-token') ?? extractBearerToken(req.get('authorization'))
  ).trim();

  if (secureTokenEquals(API_TOKEN, providedToken)) return next();
  res.setHeader('WWW-Authenticate', 'Bearer realm="homechronicle-api"');
  return res.status(401).json({ error: 'Unauthorized' });
});

// Setup routes (discovery, pairing, rooms, display names, notes, log level)
app.use('/api/setup', createSetupRouter({
  pool,
  getDiscoveryCache: () => discoveryCache,
  setDiscoveryCache: (cache) => { discoveryCache = cache; },
  runDiscoveryScan,
  loadPairings,
  savePairings,
  loadRooms,
  saveRooms,
  loadDisplayNames,
  saveDisplayNames,
  loadNotes,
  saveNotes,
  discoverDeviceForRepair,
  savePairingForRepair,
  startSubscribers,
  stopSubscriber,
  resetSubscriberStats,
  getPairingForLookup,
  HttpClient,
}));

app.use('/api/setup', createRetentionRouter({
  getSettings: loadRetentionSettings,
  saveSettings: async (settings) => {
    await saveRetentionSettings(settings);
    retentionSettings = loadRetentionSettings();
  },
  sweepMs: RETENTION_SWEEP_MS,
}));

app.use('/api/setup', createRepairRouter({
  getSettings: () => repairStore.getSnapshot(),
  saveSettings: async (s) => repairStore.write(s),
  onSettingsChange: (next) => {
    repairScheduler.stop();
    if (next.enabled) repairScheduler.start();
  },
}));

// Event API routes
app.use('/api', createEventsRouter({
  pool,
  getRooms: loadRooms,
}));
if (ALERTS_ENABLED) {
  app.use('/api/alerts', createAlertsRouter({ pool }));
}
let matterDiscoveryCache = [];
app.use('/api', createMatterRouter({
  insertEvent,
  loadPairings,
  savePairings,
  loadRooms,
  saveRooms,
  loadNotes,
  saveNotes,
  matterRuntime,
  getMatterDiscoveryCache: () => matterDiscoveryCache,
  setMatterDiscoveryCache: (cache) => { matterDiscoveryCache = cache; },
}));
app.use('/api', createArchiveRouter({
  pool,
  loadRooms,
  saveRooms,
  loadDisplayNames,
  saveDisplayNames,
  loadNotes,
  saveNotes,
}));
app.use('/api', createStatsRouter({
  pool,
  cached,
  getRooms: loadRooms,
  getRetentionSettings: () => retentionSettings,
}));
app.use('/api', createAccessoriesRouter({
  pool,
  loadPairings,
  loadRooms,
  getRetentionSettings: () => retentionSettings,
  getSubscriberStats,
  getAccessoryCapabilities,
  getAccessoryIdentity,
  getAllDiscoveredAccessories,
  cacheAccessoryMetadata,
  HttpClient,
}));





app.use('/api', createHealthRouter({
  pool,
  getSubscriberHealth,
  getMatterRuntime: () => matterRuntime,
  loadPairings,
  alertsEnabled: ALERTS_ENABLED,
}));

// ─── Global error handler — MUST remain the final app.use() in index.js ───
// D-03: Returns { error: 'Internal server error' } — matches existing route handler pattern
// D-06: Safety net only; existing route try/catch blocks are preserved
app.use(function globalExpressErrorHandler(err, req, res, _next) {
  log.error(`[express] Unhandled route error ${req.method} ${req.path}:`, err.message ?? err.stack ?? err);
  if (res.headersSent) return;
  res.status(500).json({ error: 'Internal server error' });
});

const API_BIND_ADDRESS = (process.env.API_BIND_ADDRESS ?? '').trim() || '0.0.0.0';

app.listen(PORT, API_BIND_ADDRESS, () => {
  log.info(`[api] Listening on ${API_BIND_ADDRESS}:${PORT}`);
  if (API_TOKEN) {
    log.info('[api] Write auth enabled for POST/PATCH/DELETE routes');
    if (API_TOKEN_READS_ENABLED) {
      log.info('[api] Read auth enabled for GET/HEAD routes');
    }
  }
  if (CORS_ALLOWED_ORIGINS.length > 0) {
    log.info(`[api] CORS allow-list enabled for ${CORS_ALLOWED_ORIGINS.length} origin(s)`);
  } else if (CORS_ALLOW_LOCALHOST) {
    log.info('[api] CORS restricted to localhost origins');
  } else {
    log.warn('[api] CORS denies all browser origins (CORS_ALLOW_LOCALHOST=false and no allow-list)');
  }
  if (!ALERTS_ENABLED) {
    log.info('[api] Alerts feature disabled (ALERTS_ENABLED=false)');
  }
});
