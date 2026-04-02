/**
 * index.js — entry point.
 *
 * 1. Loads cached pairing/room metadata and starts HomeKit subscribers.
 * 2. Starts an Express REST API for the web frontend.
 */

import { networkInterfaces } from 'os';
import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { IPDiscovery, HttpClient } from 'hap-controller';
import { insertEvent, pool, migrateDb, runRetentionSweep, runAlertDeliveriesRetentionSweep } from './db.js';
import { startSubscribers, stopSubscriber, getSubscriberStats, getSubscriberHealth, resetSubscriberStats } from './subscriber.js';
import { JsonObjectStore } from './store.js';
import { createEventsRouter } from './events-router.js';
import { parentBridgeId, parseIntInRange } from './utils.js';
import { createAlertsRouter } from './alerts-router.js';
import { createMatterRouter } from './matter-router.js';
import { createRetentionRouter, normalizeRetentionSettings } from './retention-router.js';
import { createArchiveRouter } from './archive-router.js';
import { createStatsRouter } from './stats-router.js';
import { createAccessoriesRouter } from './accessories-router.js';
import { createHealthRouter } from './health-router.js';
import { createSetupRouter } from './setup-router.js';
import { createMatterRuntime } from './matter-runtime.js';
import { initController as initMatterController } from './matter-controller.js';
import { deriveDeviceHealth } from './device-health.js';
import { detectOutliers } from './anomaly-detection.js';
import { cached } from './query-cache.js';
import { log } from './logger.js';
import { secureTokenEquals, rateLimitKeyGenerator } from './security.js';
import {
  cacheAccessoryMetadata,
  getAllDiscoveredAccessories,
  getAccessoryCapabilities,
  getAccessoryIdentity,
} from './accessory-metadata.js';

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
const API_WRITE_RATE_LIMIT_WINDOW_MS = Number.parseInt(process.env.API_WRITE_RATE_LIMIT_WINDOW_MS ?? '60000', 10);
const API_WRITE_RATE_LIMIT_MAX = Number.parseInt(process.env.API_WRITE_RATE_LIMIT_MAX ?? '60', 10);
const API_STATS_RATE_LIMIT_WINDOW_MS = Number.parseInt(process.env.API_STATS_RATE_LIMIT_WINDOW_MS ?? '60000', 10);
const API_STATS_RATE_LIMIT_MAX = Number.parseInt(process.env.API_STATS_RATE_LIMIT_MAX ?? '120', 10);

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
let matterRuntime = null;

function normalizeMatterNodeId(value) {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  if (!text) return null;
  try {
    return BigInt(text).toString();
  } catch { // flow-control catch — correct, no change
    return text.toUpperCase();
  }
}

function normalizePairingRecord(id, pairing = {}) {
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

function normalizePairingsMap(input = {}) {
  const output = {};
  for (const [id, pairing] of Object.entries(input ?? {})) {
    const normalized = normalizePairingRecord(id, pairing);
    const key = normalized.protocol === 'matter' ? normalized.nodeId : id;
    output[key] = normalized;
  }
  return output;
}

function isHomeKitPairing(pairing) {
  return String(pairing?.protocol ?? 'homekit').toLowerCase() === 'homekit';
}

function getHomeKitPairings(pairings = {}) {
  return Object.fromEntries(
    Object.entries(pairings).filter(([, pairing]) => isHomeKitPairing(pairing))
  );
}


function isLoopbackHostname(hostname) {
  const normalized = String(hostname ?? '').toLowerCase();
  return normalized === 'localhost'
    || normalized === '127.0.0.1'
    || normalized === '::1'
    || normalized.endsWith('.localhost');
}

function isAllowedCorsOrigin(origin) {
  if (!origin) return true;
  if (CORS_ALLOWED_ORIGINS.length > 0) return CORS_ALLOWED_ORIGINS.includes(origin);
  if (!CORS_ALLOW_LOCALHOST) return false;
  try {
    const parsed = new URL(origin);
    return isLoopbackHostname(parsed.hostname);
  } catch { // flow-control catch — correct, no change
    return false;
  }
}

function normalizeRateLimitValue(value, fallback, min, max) {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(value)));
}

function extractBearerToken(headerValue) {
  const auth = String(headerValue ?? '').trim();
  if (!auth) return '';
  const spaceIndex = auth.indexOf(' ');
  if (spaceIndex <= 0) return '';
  const scheme = auth.slice(0, spaceIndex).toLowerCase();
  if (scheme !== 'bearer') return '';
  return auth.slice(spaceIndex + 1).trim();
}

function mapReliabilityStats(reliability) {
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
  if (matterRuntime) matterRuntime.syncPairings(normalized);
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
  }, STORE_REFRESH_INTERVAL_MS);
}

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

// ---------------------------------------------------------------------------
// 2. Background discovery scan (refreshes every hour, populates cache)
// ---------------------------------------------------------------------------

let discoveryCache = []; // last scan results

function runDiscoveryScan() {
  if (!DISCOVERY_SCAN_ENABLED) {
    return Promise.resolve(discoveryCache);
  }

  return new Promise((resolve, reject) => {
    const found = new Map();
    let discovery;
    let settled = false;

    function fail(err) {
      if (settled) return;
      settled = true;
      try { discovery?.stop?.(); } catch (err) { log.debug('[discovery] stop error:', err.message); }
      reject(err instanceof Error ? err : new Error(String(err)));
    }

    function succeed(value) {
      if (settled) return;
      settled = true;
      resolve(value);
    }

    try {
      discovery = new IPDiscovery(DISCOVER_IFACE);
    } catch (err) {
      return reject(err);
    }

    discovery.on('serviceUp', (service) => {
      if (!found.has(service.id)) found.set(service.id, service);
    });
    discovery.on('error', (err) => {
      fail(err);
    });

    try {
      discovery.start();
    } catch (err) {
      return fail(err);
    }

    setTimeout(() => {
      void (async () => {
        if (settled) return;
        try {
          try { discovery.stop(); } catch (err) { log.debug('[discovery] stop error:', err.message); }
          await pairingsStore.refresh();
          const allPairings = loadPairings();
          const currentPairings = getHomeKitPairings(allPairings);
          discoveryCache = [...found.values()].map((s) => ({
            id: s.id,
            protocol: 'homekit',
            name: s.name,
            address: s.address,
            port: s.port,
            category: s.ci ?? null,
            paired: s.sf === 0 || !!currentPairings[s.id],
            pairedElsewhere: s.sf === 0 && !currentPairings[s.id],
            alreadyPaired: !!currentPairings[s.id],
          }));
          log.info(`[discovery] Scan complete — found ${discoveryCache.length} accessory/accessories`);

          let pairingsUpdated = false;
          for (const [id, pairing] of Object.entries(currentPairings)) {
            const seen = found.get(id);
            if (!seen) continue;
            if (seen.address !== pairing.address || seen.port !== pairing.port) {
              log.debug(
                `[discovery] ${pairing.name}: address updated ` +
                `${pairing.address}:${pairing.port} -> ${seen.address}:${seen.port} — pairing refreshed`
              );
              currentPairings[id] = { ...pairing, address: seen.address, port: seen.port };
              pairingsUpdated = true;
            }
          }
          if (pairingsUpdated) {
            await savePairings({
              ...allPairings,
              ...currentPairings,
            });
          }

          succeed(discoveryCache);
        } catch (err) {
          fail(err);
        }
      })();
    }, 10_000);
  });
}

function safeDiscoveryScan() {
  return runDiscoveryScan().catch((err) => {
    log.warn(`[discovery] Scan skipped: ${err.message}`);
    return [];
  });
}

async function discoverDeviceForRepair(deviceId) {
  if (!DISCOVERY_SCAN_ENABLED) return null;

  return new Promise((resolve) => {
    let discovery;
    let settled = false;

    try {
      discovery = new IPDiscovery(DISCOVER_IFACE);
    } catch (err) {
      log.debug(`[auto-repair] Discovery init failed: ${err.message}`);
      return resolve(null);
    }

    discovery.on('serviceUp', (service) => {
      if (service.id !== deviceId || settled) return;
      settled = true;
      try { discovery.stop(); } catch (err) {
        log.debug('[discovery] stop error on serviceUp:', err.message);
      }
      resolve({ address: service.address, port: service.port });
    });

    discovery.on('error', () => {
      if (settled) return;
      settled = true;
      try { discovery.stop(); } catch (err) {
        log.debug('[discovery] stop error on discovery error:', err.message);
      }
      resolve(null);
    });

    try {
      discovery.start();
    } catch (err) {
      log.debug('[discovery] start failed during repair:', err.message);
      return resolve(null);
    }

    setTimeout(() => {
      if (settled) return;
      settled = true;
      try { discovery.stop(); } catch (err) {
        log.debug('[discovery] stop error on timeout:', err.message);
      }
      resolve(null);
    }, 10_000);
  });
}

async function savePairingForRepair(deviceId, updatedFields) {
  const current = loadPairings();
  current[deviceId] = { ...current[deviceId], ...updatedFields };
  await savePairings(current);
}

function getPairingForLookup(id) {
  const pairing = pairingsStore.getByKey(id);
  if (!pairing || !isHomeKitPairing(pairing)) return null;
  return normalizePairingRecord(id, pairing);
}

function isAutoDiscoveryEnabled() {
  return DISCOVERY_SCAN_ENABLED && retentionSettings.autoScanHomeKit;
}

function runScheduledDiscoveryScan() {
  if (!isAutoDiscoveryEnabled()) return Promise.resolve(discoveryCache);
  return safeDiscoveryScan();
}

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
const apiWriteLimiter = rateLimit({
  windowMs: normalizeRateLimitValue(API_WRITE_RATE_LIMIT_WINDOW_MS, 60_000, 1_000, 24 * 60 * 60 * 1000),
  max: normalizeRateLimitValue(API_WRITE_RATE_LIMIT_MAX, 60, 1, 100_000),
  standardHeaders: true,
  legacyHeaders: false,
  validate: false,
  keyGenerator: rateLimitKeyGenerator,
  message: { error: 'Too many requests' },
});
app.use(cors({
  origin(origin, callback) {
    callback(null, isAllowedCorsOrigin(origin));
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
  getHomeKitPairings,
  isHomeKitPairing,
  normalizePairingRecord,
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
  deriveDeviceHealth,
  isHomeKitPairing,
  mapReliabilityStats,
  parentBridgeId,
  parseIntInRange,
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
