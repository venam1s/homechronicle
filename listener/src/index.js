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
import { insertEvent, pool, migrateDb, runRetentionSweep, runAlertDeliveriesRetentionSweep, runSessionRetentionSweep, runInviteTokenSweep, runPasswordResetTokenSweep, validateSession } from './db.js';
import { startSubscribers, stopSubscriber, startSubscriber, getSubscriberStats, getSubscriberHealth, resetSubscriberStats, getRepairTargets, stopAllSubscribers } from './subscriber.js';
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
import { createUpdatesRouter } from './updates-router.js';
import { PUBLIC_AUTH_PATHS } from './public-paths.js';
import { createSetupRouter } from './setup-router.js';
import { createRepairScheduler } from './repair-scheduler.js';
import { createQuietAlertScheduler } from './quiet-alerts.js';
import { performPairSetupAndPersist } from './repair-helpers.js';
import { createRepairRouter } from './repair-router.js';
import { createAlertsSettingsRouter } from './alerts-settings-router.js';
import { setAlertEmailFrom, getAlertEmailFrom } from './subscriber.js';
import { processAlertsForEvent, setWebhookTimeoutMs, ALERTS_WEBHOOK_TIMEOUT_MS, WEBHOOK_TIMEOUT_FROM_ENV } from './alerts.js';
import { createMatterRuntime } from './matter-runtime.js';
import { initController as initMatterController } from './matter-controller.js';
import { cached } from './query-cache.js';
import { log } from './logger.js';
import { secureTokenEquals, hashToken } from './security.js';
import cookieParser from 'cookie-parser';
import { createCsrf } from './csrf.js';
import { createAuthPublicRouter, createAuthProtectedRouter } from './auth-router.js';
import {
  cacheAccessoryMetadata,
  getAllDiscoveredAccessories,
  getAccessoryCapabilities,
  getAccessoryIdentity,
} from './accessory-metadata.js';
import { getHomeKitPairings, createStoreHelpers } from './setup-helpers.js';
import { createDiscoveryHelpers } from './discovery-helpers.js';
import { initEmail, sendInvite, sendPasswordReset, isEmailEnabled } from './emails.js';
import { readSmtpSecret, writeSmtpSecret, buildSmtpConfig, envOverriddenFields, getAppBaseUrl, validateAppBaseUrl, SMTP_CONFIG_FILE } from './smtp-config.js';
import { createSmtpRouter } from './smtp-router.js';
import { createUsersRouter } from './users-router.js';
import { createMeRouter } from './me-router.js';
import { createGracefulShutdown } from './shutdown.js';

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
const CATEGORIES_FILE = process.env.CATEGORIES_FILE
  || (process.env.NODE_ENV === 'production' ? '/app/data/categories.json' : './data/categories.json');
const RETENTION_FILE = process.env.RETENTION_FILE
  || (process.env.NODE_ENV === 'production' ? '/app/data/retention.json' : './data/retention.json');
const REPAIR_FILE = process.env.REPAIR_FILE
  || (process.env.NODE_ENV === 'production' ? '/app/data/repair.json' : './data/repair.json');
const ALERTS_SETTINGS_FILE = process.env.ALERTS_SETTINGS_FILE
  || (process.env.NODE_ENV === 'production' ? '/app/data/alerts-settings.json' : './data/alerts-settings.json');
const REPAIR_HOUR_DEFAULT = parseIntInRange(process.env.REPAIR_HOUR, 3, 0, 23);
// H-3: same pairSetup timeout budget subscriber.js uses for auto re-pair,
// threaded into the scheduled repair cycle's pairSetup path.
const HAP_PAIR_TIMEOUT_MS = parseIntInRange(process.env.HAP_PAIR_TIMEOUT_MS, 60_000, 1_000, 300_000);

const PORT = Number(process.env.API_PORT ?? 3001);
const RESCAN_INTERVAL_MS = 60 * 60 * 1000; // 1 hour
const STORE_REFRESH_INTERVAL_MS = Number.parseInt(process.env.STORE_REFRESH_INTERVAL_MS ?? '30000', 10);
const API_TOKEN = (process.env.API_TOKEN ?? '').trim();
const API_TOKEN_READS_ENABLED = /^(1|true|yes|on)$/i.test(process.env.API_TOKEN_READS_ENABLED ?? 'false');
const API_JSON_LIMIT = (process.env.API_JSON_LIMIT ?? '256kb').trim() || '256kb';
const IS_PRODUCTION = String(process.env.NODE_ENV ?? 'production').trim().toLowerCase() === 'production';
const CORS_ALLOWED_ORIGINS = (process.env.CORS_ALLOWED_ORIGINS ?? '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);
const CORS_ALLOW_LOCALHOST = /^(1|true|yes|on)$/i.test(
  process.env.CORS_ALLOW_LOCALHOST ?? (IS_PRODUCTION ? 'false' : 'true')
);

// M-8: warn when loopback origins are reflected with credentials in production.
// Legitimate production deployments should not reflect localhost origins;
// this configuration is safe only in development.
if (CORS_ALLOW_LOCALHOST && IS_PRODUCTION) {
  log.warn('[cors] CORS_ALLOW_LOCALHOST is enabled in production — loopback origins are reflected with credentials');
}
const DISCOVERY_SCAN_ENABLED = !/^(0|false|no|off)$/i.test(process.env.DISCOVERY_SCAN_ENABLED ?? 'true');

// TRUST_PROXY (T-20-BRUTE, M-12): controls Express `trust proxy`. This is the
// NUMBER OF PROXIES between the client and the listener that append to
// X-Forwarded-For. UNSET by default, so req.ip is the direct socket address —
// correct for direct exposure and dev. `1` = the bundled nginx alone (the
// stock compose topology). `2` = a TLS terminator (Traefik, Caddy, Cloudflare
// Tunnel, another nginx) in front of the bundled nginx — nginx always appends
// its own hop, so the terminator makes it two. rateLimitKeyGenerator
// (security.js) returns req.ip unconditionally; Express resolves req.ip from
// this hop count, walking the forwarded chain from the right and skipping n
// trusted hops (H-4) — the generator never reads X-Forwarded-For itself.
// Getting this too LOW keys every limiter on the proxy's own address,
// collapsing the whole household into one bucket (10 failed logins from
// anyone locks everyone out); too HIGH walks past the real client into
// attacker-controlled header territory. Accepts a hop count, true/false, or
// any Express trust-proxy value ('loopback', a subnet, etc.).
const TRUST_PROXY = (() => {
  const raw = (process.env.TRUST_PROXY ?? '').trim();
  if (!raw) return undefined; // unset → do not configure trust proxy
  if (/^(1|true|yes|on)$/i.test(raw)) return true;
  if (/^(0|false|no|off)$/i.test(raw)) return false;
  if (/^\d+$/.test(raw)) return Number.parseInt(raw, 10); // hop count
  return raw; // subnet list / 'loopback' / 'linklocal' / 'uniquelocal'
})();

const RETENTION_SWEEP_MS = Number.parseInt(process.env.RETENTION_SWEEP_MS ?? `${24 * 60 * 60 * 1000}`, 10);
const RETENTION_DAYS_DEFAULT = Number.parseInt(process.env.RETENTION_DAYS ?? '365', 10);
const ALERT_RETENTION_DAYS = Number.parseInt(process.env.ALERT_RETENTION_DAYS ?? '90', 10);
const RETENTION_ARCHIVE_DEFAULT = /^(1|true|yes|on)$/i.test(process.env.RETENTION_ARCHIVE ?? 'true');
const STALE_THRESHOLD_HOURS_DEFAULT = Number.parseInt(process.env.STALE_THRESHOLD_HOURS ?? '12', 10);

// -- Auth system (Phase 20) --
// AUTH_ENABLED defaults true; set AUTH_ENABLED=false to revert to legacy API_TOKEN-only mode.
const AUTH_ENABLED = !/^(0|false|no|off)$/i.test(process.env.AUTH_ENABLED ?? 'true');
// SESSION_COOKIE_SECURE: set to true for HTTPS deployments. NEVER derived from NODE_ENV (D-14/SEC-01).
const SESSION_COOKIE_SECURE = /^(1|true|yes|on)$/i.test(process.env.SESSION_COOKIE_SECURE ?? 'false');
// Session max-age in milliseconds (D-07): default 7 days; 30 days for rememberMe
const SESSION_MAX_AGE_DEFAULT = parseIntInRange(
  process.env.SESSION_MAX_AGE_DEFAULT,
  7 * 24 * 60 * 60 * 1000,
  60_000,
  365 * 24 * 60 * 60 * 1000,
);
const SESSION_MAX_AGE_REMEMBER = parseIntInRange(
  process.env.SESSION_MAX_AGE_REMEMBER,
  30 * 24 * 60 * 60 * 1000,
  60_000,
  365 * 24 * 60 * 60 * 1000,
);

// APP_BASE_URL used for building invite/reset email links (EMAIL-01, PWD-02)
const APP_BASE_URL = getAppBaseUrl();
if (!APP_BASE_URL) {
  log.warn('[api] APP_BASE_URL is not set — invite and password-reset email links will be unusable until APP_BASE_URL is configured');
} else {
  const appBaseUrlCheck = validateAppBaseUrl(APP_BASE_URL);
  if (!appBaseUrlCheck.ok) {
    // Warn only — never exit. An existing deployment with an odd base URL must keep booting (L-4).
    log.warn(`[api] APP_BASE_URL is not a valid http(s) URL — invite and password-reset links will be broken: ${appBaseUrlCheck.error}`);
  }
}

if (IS_PRODUCTION && !AUTH_ENABLED && !API_TOKEN) {
  log.error('[api] API_TOKEN is required when NODE_ENV=production and AUTH_ENABLED=false');
  process.exit(1);
}
if (AUTH_ENABLED && !SESSION_COOKIE_SECURE) {
  log.warn('[api] AUTH_ENABLED=true but SESSION_COOKIE_SECURE is not set — cookies will be sent over HTTP (acceptable for self-hosted HTTP; set SESSION_COOKIE_SECURE=true for HTTPS)');
}
if (IS_PRODUCTION && CORS_ALLOW_LOCALHOST) {
  log.warn('[api] CORS_ALLOW_LOCALHOST is enabled in production — set to false if not needed');
}

const pairingsStore = new JsonObjectStore(PAIRINGS_FILE, {});
const roomsStore = new JsonObjectStore(ROOMS_FILE, {});
const displayNamesStore = new JsonObjectStore(DISPLAY_NAMES_FILE, {});
const notesStore = new JsonObjectStore(NOTES_FILE, {});
// Device category overrides: accessoryId -> category id (see categories.js).
const categoriesStore = new JsonObjectStore(CATEGORIES_FILE, {});
const loadCategories = () => categoriesStore.getSnapshot();
const saveCategories = async (overrides) => { await categoriesStore.write(overrides); };
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
// No `enabled` key: MALERT-07 made alerts per-RULE rather than household-wide.
// An alerts-settings.json written before that change may still carry one; it is
// ignored, and the settings router rejects any attempt to set it.
const alertsSettingsStore = new JsonObjectStore(ALERTS_SETTINGS_FILE, {
  defaultQuietMinutes: 0,
  webhookTimeoutMs: 5000,
});
// ALERTS_WEBHOOK_TIMEOUT_MS, when set, wins over the saved value (see alerts.js).
const applySavedWebhookTimeout = (settings) => {
  if (!WEBHOOK_TIMEOUT_FROM_ENV) setWebhookTimeoutMs(settings?.webhookTimeoutMs);
};
// SMTP non-secret config store (password lives only in smtp-secret.json, never here)
const smtpConfigStore = new JsonObjectStore(SMTP_CONFIG_FILE, {});
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
await categoriesStore.init();
await retentionStore.init();
await repairStore.init();
await alertsSettingsStore.init();
applySavedWebhookTimeout(alertsSettingsStore.getSnapshot());
await smtpConfigStore.init();
const smtpSecret = await readSmtpSecret();
const smtpConfig = buildSmtpConfig(smtpConfigStore.getSnapshot(), smtpSecret);
await initEmail(smtpConfig);
setAlertEmailFrom(smtpConfig.from ?? '');
await initMatterController();
matterRuntime = createMatterRuntime({
  insertEvent,
  loadRooms,
  // Alert processing used to live only in the HomeKit subscriber, so every
  // alert rule was silently HomeKit-only and no Matter device could ever
  // trigger one. Both transports now run the same rules against the same
  // "from" address.
  processAlerts: (event) => processAlertsForEvent(pool, event, getAlertEmailFrom()),
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
    void categoriesStore.refresh().catch((err) => {
      log.warn('[store] categories refresh failed:', err.message ?? err.stack ?? err);
    });
    void retentionStore.refresh()
      .then(() => { retentionSettings = loadRetentionSettings(); })
      .catch((err) => {
        log.warn('[store] retention refresh failed:', err.message ?? err.stack ?? err);
      });
    void repairStore.refresh().catch((err) => {
      log.warn('[store] repair refresh failed:', err.message ?? err.stack ?? err);
    });
    void alertsSettingsStore.refresh().then(applySavedWebhookTimeout).catch((err) => {
      log.warn('[store] alerts-settings refresh failed:', err.message ?? err.stack ?? err);
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
  performPairSetupAndPersist: (deviceId, pin, address, port, pairMethod) =>
    performPairSetupAndPersist(
      { deviceId, pin, address, port, pairMethod },
      { HttpClient, loadPairings, savePairings, timeoutMs: HAP_PAIR_TIMEOUT_MS },
    ),
});
repairScheduler.start();

// "Goes quiet" alert rules have no triggering event, so they are checked on a timer.
const quietAlertScheduler = createQuietAlertScheduler({ pool, getEmailFrom: getAlertEmailFrom });
quietAlertScheduler.start();

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

  // expired sessions (delete-only, absolute expiry — WR-03)
  try {
    const sessionResult = await runSessionRetentionSweep();
    if (sessionResult.deleted > 0) {
      log.info(`[retention] sessions expired deleted=${sessionResult.deleted}`);
    }
  } catch (err) {
    log.error('[retention] sessions sweep failed:', err.message ?? err.stack ?? err);
  }

  // expired/consumed invites (delete-only — SEC-06 / D-06)
  try {
    const inviteResult = await runInviteTokenSweep();
    if (inviteResult.deleted > 0) {
      log.info(`[retention] invites expired/consumed deleted=${inviteResult.deleted}`);
    }
  } catch (err) {
    log.error('[retention] invites sweep failed:', err.message ?? err.stack ?? err);
  }

  // expired/used password-reset tokens (delete-only — SEC-06 / D-06)
  try {
    const resetResult = await runPasswordResetTokenSweep();
    if (resetResult.deleted > 0) {
      log.info(`[retention] password_reset_tokens expired/consumed deleted=${resetResult.deleted}`);
    }
  } catch (err) {
    log.error('[retention] password_reset_tokens sweep failed:', err.message ?? err.stack ?? err);
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
// Configure trust proxy before any rate limiter so rateLimitKeyGenerator keys
// per real client IP behind a reverse proxy (T-20-BRUTE). No-op when unset.
if (TRUST_PROXY !== undefined) {
  app.set('trust proxy', TRUST_PROXY);
  log.info(`[api] trust proxy enabled (TRUST_PROXY=${process.env.TRUST_PROXY?.trim()}) — auth rate limits key per resolved client IP (req.ip)`);
}
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
  methods: ['GET', 'HEAD', 'OPTIONS', 'POST', 'PUT', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Token', 'X-CSRF-Token'],
  // The Timeline export reads its filename and row counts from these when the
  // web UI is on another origin (Vite dev server, VITE_API_BASE_URL).
  exposedHeaders: ['Content-Disposition', 'X-Export-Total', 'X-Export-Rows', 'X-Export-Truncated'],
  maxAge: 600,
  credentials: true,
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

// -- Auth middleware stack (Phase 20) --
// cookie-parser must run before csrf-sync and the session gate (req.cookies needed)
app.use(cookieParser());

// Build the csrf instance; generateCsrfToken is injected into the public auth router
// so GET /api/auth/csrf-token returns real tokens.
const { csrfSynchronisedProtection, generateCsrfToken } = createCsrf({ pool });

// Public auth routes — mounted BEFORE the gate so login/claim-admin/csrf-token/user-count
// are reachable without a session (D-02 PUBLIC_AUTH_PATHS).
app.use('/api/auth', createAuthPublicRouter({
  pool,
  SESSION_COOKIE_SECURE,
  SESSION_MAX_AGE_DEFAULT,
  SESSION_MAX_AGE_REMEMBER,
  generateCsrfToken,
  sendPasswordReset: (to, resetUrl) => sendPasswordReset(to, resetUrl, { from: smtpConfig.from }),
  isEmailEnabled,
  appBaseUrl: APP_BASE_URL,
  authEnabled: AUTH_ENABLED,
}));

// -- Auth gate: token-OR-session-OR-public (AUTH_ENABLED-aware) --
// The exempt paths live in ./public-paths.js so the tests can import the real
// list instead of keeping a copy (they had already drifted).

// Express 5 propagates async errors natively — no try/catch wrapper needed.
app.use(async (req, res, next) => {
  if (!AUTH_ENABLED) {
    // Legacy v1.3 behavior preserved verbatim (D-08)
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
  }

  // AUTH_ENABLED=true: session + token + public path gate
  if (req.method === 'OPTIONS') return next();
  if (PUBLIC_AUTH_PATHS.has(req.path)) return next();

  // Session cookie path FIRST (D-01/D-03/CR-02): browser sessions win even when nginx
  // unconditionally injects X-API-Token. SHA-256 hash before DB lookup (D-12).
  const rawCookie = req.cookies?.hc_session;
  if (rawCookie) {
    const session = await validateSession(pool, hashToken(rawCookie));
    if (session) {
      // Normalize snake_case DB columns to camelCase so csrf.js getTokenFromState
      // can read req.hcSession.csrfToken consistently (Rule 1 fix: snake/camel mismatch).
      // The spread also carries session.email (now selected by validateSession's join,
      // WR-02) and session.role through to req.hcSession so GET /me can surface them.
      req.hcSession = {
        ...session,
        csrfToken: session.csrf_token ?? null,
      };
      return next();
    }
  }

  // Service-token fallback: API_TOKEN still authorizes alongside sessions (AUTH-08/P11)
  // A valid token with no/invalid session cookie is accepted — AUTH_TOKEN path intact.
  if (API_TOKEN) {
    const providedToken = String(
      req.get('x-api-token') ?? extractBearerToken(req.get('authorization'))
    ).trim();
    if (secureTokenEquals(API_TOKEN, providedToken)) return next();
  }

  res.setHeader('WWW-Authenticate', 'Bearer realm="homechronicle-api"');
  return res.status(401).json({ error: 'Unauthorized' });
});

// csrf-sync protection — mounts AFTER cookie-parser and the session gate so
// req.hcSession is populated before storeTokenInState/getTokenFromState run.
// Public auth routes (pre-gate) are exempt by position.
app.use(csrfSynchronisedProtection);

// Protected auth routes — gate populates req.hcSession before these run.
app.use('/api/auth', createAuthProtectedRouter({ pool, SESSION_COOKIE_SECURE }));

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
  loadCategories,
  saveCategories,
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
app.use('/api/alerts', createAlertsRouter({
  pool,
  isEmailEnabled,
  getDefaultQuietMinutes: () => alertsSettingsStore.getSnapshot().defaultQuietMinutes ?? 0,
}));

app.use('/api/setup', createAlertsSettingsRouter({
  getSettings: () => alertsSettingsStore.getSnapshot(),
  saveSettings: async (s) => alertsSettingsStore.write(s),
  webhookTimeoutEnvMs: WEBHOOK_TIMEOUT_FROM_ENV ? ALERTS_WEBHOOK_TIMEOUT_MS : null,
  onSettingsChange: (next) => {
    // Was `Alerts ${next.enabled ? 'enabled' : 'disabled'}` — there is no
    // `enabled` key any more (MALERT-07), so it logged "Alerts disabled" on
    // every single save regardless of state.
    applySavedWebhookTimeout(next);
    log.info(`[alerts-settings] Updated: quiet=${next.defaultQuietMinutes}m timeout=${next.webhookTimeoutMs}ms`);
  },
}));

app.use('/api/setup', createSmtpRouter({
  smtpConfigStore,
  readSmtpSecret,
  writeSmtpSecret,
  buildSmtpConfig,
  envOverriddenFields,
  initEmail,
  sendTestEmail: (to) => sendInvite(to, `${APP_BASE_URL}/`, { from: smtpConfig.from }),
  isEmailEnabled,
  onSmtpConfigChange: (cfg) => { smtpConfig.from = cfg.from ?? ''; setAlertEmailFrom(cfg.from ?? ''); },
}));

app.use('/api/users', createUsersRouter({
  pool,
  sendInvite: (to, inviteUrl) => sendInvite(to, inviteUrl, { from: smtpConfig.from }),
  isEmailEnabled,
  appBaseUrl: APP_BASE_URL,
}));
// D-08: me-router mounted after the global auth gate (line ~524) and csrfSynchronisedProtection
// (line ~577). PUT is CSRF-protected automatically (SEC-02). Per-handler 401 rejects service tokens.
app.use('/api/me', createMeRouter({ pool }));
let matterDiscoveryCache = [];
app.use('/api', createMatterRouter({
  // Needed by POST /matter/events, which writes each batch in one transaction.
  pool,
  insertEvent,
  loadPairings,
  savePairings,
  loadRooms,
  saveRooms,
  loadNotes,
  saveNotes,
  loadCategories,
  saveCategories,
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
  loadCategories,
  saveCategories,
}));
app.use('/api', createStatsRouter({
  pool,
  cached,
  getRooms: loadRooms,
  getRetentionSettings: () => retentionSettings,
  getCategoryOverrides: loadCategories,
}));
app.use('/api', createAccessoriesRouter({
  pool,
  loadPairings,
  loadRooms,
  getRetentionSettings: () => retentionSettings,
  getCategoryOverrides: loadCategories,
  getSubscriberStats,
  getAccessoryCapabilities,
  getAccessoryIdentity,
  getAllDiscoveredAccessories,
  cacheAccessoryMetadata,
  HttpClient,
}));





// Update check. Proxied server-side because the SPA is served with
// `connect-src 'self'` — the browser cannot reach gitlab.com directly.
app.use('/api/updates', createUpdatesRouter());

app.use('/api', createHealthRouter({
  pool,
  getSubscriberHealth,
  getMatterRuntime: () => matterRuntime,
  loadPairings,
}));

// ─── Global error handler — MUST remain the final app.use() in index.js ───
// D-03: Returns { error: 'Internal server error' } — matches existing route handler pattern
// D-06: Safety net only; existing route try/catch blocks are preserved
// SEC-02: Handles EBADCSRFTOKEN errors from csrfSynchronisedProtection (status 403)
app.use(function globalExpressErrorHandler(err, req, res, _next) {
  if (err.code === 'EBADCSRFTOKEN') {
    return res.status(403).json({ error: 'Invalid or missing CSRF token' });
  }
  log.error(`[express] Unhandled route error ${req.method} ${req.path}:`, err.message ?? err.stack ?? err);
  if (res.headersSent) return;
  res.status(500).json({ error: 'Internal server error' });
});

const API_BIND_ADDRESS = (process.env.API_BIND_ADDRESS ?? '').trim() || '0.0.0.0';

const server = app.listen(PORT, API_BIND_ADDRESS, () => {
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
});

// M-6: graceful SIGTERM/SIGINT shutdown. Docker's default grace period is
// ~10s between SIGTERM and SIGKILL — this must complete well inside that.
const { shutdown: gracefulShutdown } = createGracefulShutdown({
  steps: [
    {
      name: 'http server',
      run: async () => {
        server.closeAllConnections?.();
        await new Promise((resolve) => server.close(resolve));
      },
    },
    { name: 'repair scheduler', run: () => repairScheduler.stop() },
    { name: 'quiet alert scheduler', run: () => quietAlertScheduler.stop() },
    { name: 'HAP subscribers', run: () => stopAllSubscribers() },
    { name: 'matter runtime', run: () => matterRuntime?.stopAll() },
    { name: 'postgres pool', run: async () => { await pool.end(); } },
  ],
});
process.once('SIGTERM', () => { void gracefulShutdown('SIGTERM'); });
process.once('SIGINT', () => { void gracefulShutdown('SIGINT'); });
