#!/usr/bin/env node
/**
 * Capture updated screenshots from the PROD instance for homechronicle.net.
 *
 * Targets the current (v0.3.x) authenticated UI:
 *   - Sidebar nav (Dashboard / Devices / Timeline / Alerts / Settings)
 *   - Per-user skin (localStorage hc_accent, legacy hc_ui_skin) + theme (hc_theme_preference)
 *   - Settings sections (Admin / Configuration / Account) with inner tabs
 *
 * Auth: an admin session cookie token is read from /tmp/hc_shot_cookie.txt and
 * attached as the `hc_session` cookie on every Playwright context BEFORE navigation.
 *
 * PII scrub: a route interceptor rewrites real device/place names out of every
 * /api/** JSON response body before the page renders. Zero prod mutation.
 *
 * Usage: node scripts/capture-screenshots.mjs [baseUrl]   (defaults to prod)
 */
import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Resolve a usable Chromium executable. The bundled Playwright build number may
 * not match the locally installed browser (e.g. headless_shell-1217 expected but
 * only chromium-1208 present). Fall back to the full Chrome-for-Testing binary
 * that ships under chromium-<n>, newest first.
 */
function resolveChromiumPath() {
  if (process.env.PLAYWRIGHT_CHROMIUM_PATH) return process.env.PLAYWRIGHT_CHROMIUM_PATH;
  const cache = path.join(os.homedir(), 'Library/Caches/ms-playwright');
  let dirs = [];
  try {
    dirs = fs.readdirSync(cache)
      .filter((d) => /^chromium-\d+$/.test(d))
      .sort((a, b) => Number(b.split('-')[1]) - Number(a.split('-')[1]));
  } catch { return undefined; }
  for (const d of dirs) {
    const candidates = [
      path.join(cache, d, 'chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'),
      path.join(cache, d, 'chrome-mac/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'),
      path.join(cache, d, 'chrome-linux/chrome'),
    ];
    for (const c of candidates) if (fs.existsSync(c)) return c;
  }
  return undefined;
}
const SCREENSHOTS_DIR = path.resolve(__dirname, '../docs/screenshots');
const BASE_URL = (process.argv[2] || 'https://hc.venamis.net').replace(/\/$/, '');

// Cookie host derived from the base URL (prod = hc.venamis.net).
const COOKIE_DOMAIN = new URL(BASE_URL).hostname;
const COOKIE_SECURE = new URL(BASE_URL).protocol === 'https:';

// Desktop viewport matching existing screenshots (~2160px wide at 2x = 1080 logical).
const DESKTOP = { width: 1080, height: 1220 };
const DEVICE_SCALE = 2;

// Standard 3:2 clip for feature-row screenshots.
const FEATURE_CLIP = { x: 0, y: 0, width: 1080, height: 720 };

// Mobile viewport for PWA screenshots (~603 logical at 2x = 1206px)
const MOBILE = { width: 393, height: 852 };
const MOBILE_SCALE = 2;

const SKINS = ['ocean', 'graphite', 'sunrise', 'red', 'yellow', 'purple', 'slate', 'pink'];

// Per-skin accent override. accent is a PER-USER SERVER preference (GET /api/me/preferences
// → UserPreferencesProvider seeds 'accent' → useAccent → applyAccent → [data-accent] CSS).
// Setting only localStorage hc_accent is INSUFFICIENT: once the server blob is non-empty the
// reconciliation effect overrides localStorage with the server value, so every skin rendered
// the admin's saved accent. The fix (skin-capture path only): the route handler rewrites the
// GET response so prefs.accent = currentAccent on every fetch, and short-circuits the PUT so
// the capture never mutates the admin's real prefs. null = no override (normal runs).
let currentAccent = null;

// PII scrub: longest/most-specific substrings first so catch-alls don't pre-empt
// them. Account emails MUST precede the bare username/domain catch-alls
// (e.g. smithmarcw@icloud.com → you@example.com BEFORE smithmarcw → you, else
// the residual yields you@icloud.com). Device-name rules retained from prior run.
const PII_REPLACEMENTS = [
  // Account emails / domains (longest → shortest)
  ['havuq@venamis.net', 'admin@example.com'],
  ['smithmarcw@icloud.com', 'you@example.com'],
  ['no-reply@venamis.net', 'no-reply@example.com'],
  ['venamis.net', 'example.com'],
  ['havuq', 'admin'],
  ['smithmarcw', 'you'],
  // Device / place names
  ['Hubitat Smith Hub', 'Smart Home Hub'],
  ['Smith Hub', 'Home Hub'],
  ['Carl T20', 'Robot Vacuum'],
  ['ZVille OWM', 'Weather Station'],
  ['ZVille', 'Home'],
];

// Read the admin session token.
let SESSION_TOKEN;
try {
  SESSION_TOKEN = fs.readFileSync('/tmp/hc_shot_cookie.txt', 'utf8').trim();
} catch (err) {
  console.error('FATAL: could not read /tmp/hc_shot_cookie.txt —', err.message);
  process.exit(1);
}
if (!SESSION_TOKEN) {
  console.error('FATAL: /tmp/hc_shot_cookie.txt is empty');
  process.exit(1);
}

function scrub(text) {
  let out = text;
  for (const [from, to] of PII_REPLACEMENTS) out = out.split(from).join(to);
  return out;
}

const PII_NEEDLES = ['Smith', 'Carl', 'ZVille', 'havuq', 'smithmarcw', 'venamis'];

/** Attach the session cookie to a context. */
async function authenticate(context) {
  await context.addCookies([{
    name: 'hc_session',
    value: SESSION_TOKEN,
    domain: COOKIE_DOMAIN,
    path: '/',
    httpOnly: true,
    secure: COOKIE_SECURE,
    sameSite: 'Lax',
  }]);
}

/**
 * Install the PII-scrubbing route interceptor on a page. Rewrites every /api/**
 * JSON response body. Optionally captures cleaned bodies for verification.
 */
async function installPiiScrub(page, capture) {
  await page.route('**/api/**', async (route) => {
    try {
      const url = route.request().url();
      const method = route.request().method();

      // ── Per-user preferences override (skin-capture path) ──
      // currentAccent is read at REQUEST time (not install time) so per-skin updates apply.
      if (/\/api\/me\/preferences(\?|$)/.test(url)) {
        if (method === 'PUT') {
          // Echo the sent body as { prefs: <sent> } WITHOUT forwarding to the server, so the
          // capture never persists anything to the admin's real prefs (no route.fetch()).
          let sent = {};
          try { sent = JSON.parse(route.request().postData() || '{}').prefs ?? {}; } catch { /* keep {} */ }
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: scrub(JSON.stringify({ prefs: sent })),
          });
          return;
        }
        // GET: fetch the real response, ensure { prefs: {...} }, inject accent, keep PII scrub.
        const resp = await route.fetch();
        let json;
        try { json = JSON.parse(await resp.text()); } catch { json = {}; }
        if (!json || typeof json !== 'object' || typeof json.prefs !== 'object' || json.prefs == null) {
          json = { prefs: {} };
        }
        if (currentAccent) json.prefs.accent = currentAccent;
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: scrub(JSON.stringify(json)),
        });
        return;
      }

      const resp = await route.fetch();
      const ct = resp.headers()['content-type'] || '';
      // Only rewrite text-ish bodies (JSON). Pass others through untouched.
      if (!/json|text|javascript/i.test(ct)) {
        await route.fulfill({ response: resp });
        return;
      }
      const original = await resp.text();
      const body = scrub(original);
      if (capture) {
        const url = route.request().url();
        if (capture.events == null && /\/api\/events(\?|$)/.test(url)) capture.events = body;
        if (capture.accessories == null && /\/api\/accessories(\?|$)/.test(url)) capture.accessories = body;
        if (capture.me == null && /\/api\/auth\/me(\?|$)/.test(url)) capture.me = body;
        // Match the users list GET (/api/users) but NOT /api/users/invites etc.
        if (capture.users == null && /\/api\/users(\/?(\?|$))/.test(url)) capture.users = body;
        if (capture.smtp == null && /\/api\/setup\/smtp(\?|$)/.test(url)) capture.smtp = body;
      }
      await route.fulfill({ response: resp, body });
    } catch {
      // Network hiccup — let the request continue unmodified rather than abort.
      try { await route.continue(); } catch { /* already handled */ }
    }
  });
}

/** Set theme + skin in localStorage before the app boots. */
async function applyThemeInit(page, { theme, skin }) {
  await page.addInitScript(({ t, s }) => {
    localStorage.setItem('hc_theme_preference', t);
    localStorage.setItem('hc_accent', s);      // current key
    localStorage.setItem('hc_ui_skin', s);     // legacy fallback
  }, { t: theme, s: skin });
}

/** Wait for Recharts data to actually draw (not just the SVG container). */
async function waitForCharts(page) {
  try {
    await page.waitForSelector('.recharts-bar-rectangle, .recharts-area-area', { timeout: 20000 });
    await page.waitForTimeout(500);
  } catch {
    console.log('    ⚠ chart data elements not detected after 20s, capturing anyway');
  }
}

/**
 * Element-crop a dashboard panel by its heading text. The customizable grid
 * (react-grid-layout v2) wraps every panel — bare (KPI/Quiet Hours, which carry
 * their own h3 title) and non-bare (chart panels, whose title lives in the
 * `.hc-drag-handle` header span) alike — in a `.react-grid-item` div. We locate
 * the heading, climb to that enclosing grid item, scroll it into view, and
 * screenshot the element so the crop tracks the live layout instead of guessing
 * fixed coords (which came out blank when panels moved/reordered).
 *
 * Returns true if captured, false if the heading wasn't found (caller skips —
 * never writes a blank image).
 */
async function cropPanelByHeading(page, headingText, outFile) {
  const heading = page.getByText(headingText, { exact: false }).first();
  if (!(await heading.count())) {
    console.log(`    ⚠ panel heading "${headingText}" not found — skipping ${path.basename(outFile)}`);
    return false;
  }
  await heading.scrollIntoViewIfNeeded();
  await page.waitForTimeout(500);
  const gridItem = heading.locator('xpath=ancestor::div[contains(@class,"react-grid-item")][1]');
  const target = (await gridItem.count()) ? gridItem.first() : heading;
  const box = await target.boundingBox();
  if (!box || box.width < 40 || box.height < 40) {
    console.log(`    ⚠ panel "${headingText}" element has no usable box — skipping ${path.basename(outFile)}`);
    return false;
  }
  await target.screenshot({ path: outFile });
  return true;
}

/** Click a sidebar nav button by visible label. Returns true on success. */
async function navTo(page, label) {
  const btn = page.locator('aside[aria-label="Main navigation"] button', { hasText: label }).first();
  await btn.click({ timeout: 8000 });
  await page.waitForTimeout(1800);
  return true;
}

/** Confirm we landed on the authenticated app (not the login page). */
async function assertAuthenticated(page) {
  const onLogin = await page.locator('input[type="password"]').count();
  const hasSidebar = await page.locator('aside[aria-label="Main navigation"]').count();
  return hasSidebar > 0 && onLogin === 0;
}

/** Wrap a single capture so one failure doesn't abort the run. */
async function shot(name, fn) {
  try {
    await fn();
    console.log(`  ✓ ${name}`);
  } catch (err) {
    console.log(`  ⚠ ${name} — ${err.message}`);
  }
}

/**
 * Capture the 8-skin gallery for one theme mode. Accent is driven via the per-skin
 * /api/me/preferences GET override (currentAccent), NOT localStorage — see installPiiScrub.
 * localStorage hc_accent/hc_ui_skin are still set as belt-and-suspenders for first paint.
 */
async function captureSkins(browser, mode) {
  console.log(`\n── Skin gallery (${mode}) ──`);
  const ctx = await browser.newContext({ viewport: DESKTOP, deviceScaleFactor: DEVICE_SCALE, colorScheme: mode });
  await authenticate(ctx);
  const page = await ctx.newPage();
  await installPiiScrub(page);
  // Seed an initial skin so the first load already has localStorage set.
  await applyThemeInit(page, { theme: mode, skin: SKINS[0] });
  currentAccent = SKINS[0];
  await page.goto(BASE_URL + '/', { waitUntil: 'networkidle' });

  for (let i = 0; i < SKINS.length; i++) {
    const skin = SKINS[i];
    if (i > 0) await page.waitForTimeout(2000);
    // Drive accent via the server-pref GET override (the real fix).
    currentAccent = skin;
    await page.evaluate(({ s, m }) => {
      localStorage.setItem('hc_accent', s);
      localStorage.setItem('hc_ui_skin', s);
      localStorage.setItem('hc_theme_preference', m);
    }, { s: skin, m: mode });
    await page.reload({ waitUntil: 'networkidle' });
    await waitForCharts(page);
    const failed = await page.locator('text=/Failed to load/').count();
    if (failed > 0) {
      console.log(`    ⚠ API error for ${skin}-${mode}, retrying after 5s...`);
      await page.waitForTimeout(5000);
      await page.reload({ waitUntil: 'networkidle' });
      await waitForCharts(page);
    }
    await shot(`skin-${skin}-${mode}.png`, async () => {
      await page.screenshot({ path: path.join(SCREENSHOTS_DIR, `skin-${skin}-${mode}.png`), fullPage: true });
    });
  }
  currentAccent = null;
  await ctx.close();
}

async function main() {
  fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
  console.log(`Target: ${BASE_URL}  (cookie host: ${COOKIE_DOMAIN})`);

  const executablePath = resolveChromiumPath();
  if (executablePath) console.log(`Using Chromium: ${executablePath}`);
  const browser = await chromium.launch({ headless: true, executablePath });
  const verifyCapture = { events: null, accessories: null, me: null, users: null, smtp: null };

  // ───────────────────────── AUTH CHECK ─────────────────────────
  {
    const ctx = await browser.newContext({ viewport: DESKTOP, deviceScaleFactor: DEVICE_SCALE, colorScheme: 'light' });
    await authenticate(ctx);
    const page = await ctx.newPage();
    await installPiiScrub(page, verifyCapture);
    await applyThemeInit(page, { theme: 'light', skin: 'ocean' });
    await page.goto(BASE_URL + '/', { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
    const ok = await assertAuthenticated(page);
    if (!ok) {
      console.error('\nFATAL: session cookie did NOT authenticate — landed on login page (token likely expired). Aborting.');
      await ctx.close();
      await browser.close();
      process.exit(2);
    }
    console.log('✓ Authenticated — Dashboard loaded.\n');
    await ctx.close();
  }

  // SKINS_ONLY: re-capture ONLY the 16 skin-*-{light,dark}.png shots (the other shots are
  // already correct). Keeps the auth-check above as a fail-fast; skips login/desktop/pwa.
  if (process.env.SKINS_ONLY) {
    console.log('SKINS_ONLY=1 — capturing skin gallery only.');
    await captureSkins(browser, 'light');
    await captureSkins(browser, 'dark');
    await browser.close();
    console.log('\n✅ Skin-only screenshot run complete.');
    return;
  }

  // ───────────────────────── LOGIN PAGE (no cookie) ─────────────────────────
  console.log('── Login page (unauthenticated) ──');
  await shot('login-page.png', async () => {
    const ctx = await browser.newContext({ viewport: DESKTOP, deviceScaleFactor: DEVICE_SCALE, colorScheme: 'light' });
    const page = await ctx.newPage();
    await installPiiScrub(page);
    await applyThemeInit(page, { theme: 'light', skin: 'ocean' });
    await page.goto(BASE_URL + '/', { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
    await page.waitForSelector('input[type="password"]', { timeout: 8000 });
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'login-page.png'), clip: FEATURE_CLIP });
    await ctx.close();
  });

  // ───────────────────────── DESKTOP LIGHT ─────────────────────────
  console.log('\n── Light mode (desktop) ──');
  {
    const ctx = await browser.newContext({ viewport: DESKTOP, deviceScaleFactor: DEVICE_SCALE, colorScheme: 'light' });
    await authenticate(ctx);
    const page = await ctx.newPage();
    await installPiiScrub(page, verifyCapture);
    await applyThemeInit(page, { theme: 'light', skin: 'ocean' });

    await page.goto(BASE_URL + '/', { waitUntil: 'networkidle' });
    await waitForCharts(page);
    await page.waitForTimeout(800);

    // Dashboard (light, full page)
    await shot('dashboard-lite-page.png', async () => {
      await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'dashboard-lite-page.png'), fullPage: true });
    });

    // ── Dashboard feature crops (element-based; keep legacy filenames) ──
    // The admin's saved layout shows: KPI row, Quiet Hours Activity, Daily
    // Activity, Events by Hour, Events by Room. The original filenames reference
    // panels not in this layout, so we map each to the closest present panel.
    //   dashboard-daily-activity.png        -> "Daily Activity" line chart
    //   dashboard-most-active-devices.png   -> "Events by Room" (closest "most active")
    //   dashboard-weekly-monthly-heatmaps.png -> "Events by Hour" bar chart
    //   dashboard-stale-devices.png         -> "Quiet Hours Activity" (device-health-ish)
    await shot('dashboard-daily-activity.png', async () => {
      await cropPanelByHeading(page, 'Daily Activity', path.join(SCREENSHOTS_DIR, 'dashboard-daily-activity.png'));
    });
    await shot('dashboard-most-active-devices.png', async () => {
      await cropPanelByHeading(page, 'Events by Room', path.join(SCREENSHOTS_DIR, 'dashboard-most-active-devices.png'));
    });
    await shot('dashboard-weekly-monthly-heatmaps.png', async () => {
      await cropPanelByHeading(page, 'Events by Hour', path.join(SCREENSHOTS_DIR, 'dashboard-weekly-monthly-heatmaps.png'));
    });
    await shot('dashboard-stale-devices.png', async () => {
      await cropPanelByHeading(page, 'Quiet Hours Activity', path.join(SCREENSHOTS_DIR, 'dashboard-stale-devices.png'));
    });

    // Timeline (light)
    await shot('timeline-lite-page.png', async () => {
      await navTo(page, 'Timeline');
      await page.waitForTimeout(800);
      await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'timeline-lite-page.png'), clip: FEATURE_CLIP });
    });

    // Timeline with Search & filters + Activity heatmap expanded
    await shot('timeline-search-heatmap.png', async () => {
      const search = page.getByText('Search & filters', { exact: false }).first();
      if (await search.count()) { await search.click().catch(() => {}); await page.waitForTimeout(400); }
      const heat = page.getByText('Activity heatmap', { exact: false }).first();
      if (await heat.count()) { await heat.click().catch(() => {}); await page.waitForTimeout(900); }
      await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'timeline-search-heatmap.png'), clip: FEATURE_CLIP });
    });

    // Devices page (light) — keeps legacy filename accessories-lite-page.png
    await shot('accessories-lite-page.png', async () => {
      await navTo(page, 'Devices');
      await page.waitForTimeout(800);
      await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'accessories-lite-page.png'), clip: FEATURE_CLIP });
    });

    // Alerts page (light)
    await shot('alerts-page.png', async () => {
      await navTo(page, 'Alerts');
      await page.waitForTimeout(800);
      await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'alerts-page.png'), clip: FEATURE_CLIP });
    });

    // ── Settings shots ──
    await navTo(page, 'Settings');
    await page.waitForTimeout(800);

    const settingsRail = (label) =>
      page.locator('nav [role="button"]', { hasText: label }).first()
        .or(page.getByRole('button', { name: label, exact: true })).first();

    // Settings > Admin > Users
    await shot('settings-users.png', async () => {
      const admin = page.getByText('Admin', { exact: true }).first();
      await admin.click({ timeout: 6000 });
      await page.waitForTimeout(1200);
      await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'settings-users.png'), clip: FEATURE_CLIP });
    });

    // Settings > Admin > Email (SMTP) card — scroll to it then clip its card
    await shot('settings-email-smtp.png', async () => {
      const smtp = page.getByText(/SMTP|Email/i).first();
      await smtp.scrollIntoViewIfNeeded();
      await page.waitForTimeout(500);
      const box = await smtp.boundingBox();
      if (!box) throw new Error('SMTP heading not visible');
      await page.screenshot({
        path: path.join(SCREENSHOTS_DIR, 'settings-email-smtp.png'),
        clip: { x: 0, y: Math.max(0, box.y - 24), width: 1080, height: 700 },
      });
    });

    // Settings > Configuration > Advanced
    await shot('settings-advanced.png', async () => {
      const config = page.getByText('Configuration', { exact: true }).first();
      await config.click({ timeout: 6000 });
      await page.waitForTimeout(800);
      const advTab = page.locator('button[role="tab"]', { hasText: 'Advanced' }).first();
      await advTab.click({ timeout: 6000 });
      await page.waitForTimeout(900);
      await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'settings-advanced.png'), clip: FEATURE_CLIP });
    });

    // Settings > Account (Change password + Active Sessions)
    await shot('settings-account-sessions.png', async () => {
      const account = page.getByText('Account', { exact: true }).first();
      await account.click({ timeout: 6000 });
      await page.waitForTimeout(1000);
      await page.getByText('Active Sessions', { exact: false }).first().scrollIntoViewIfNeeded().catch(() => {});
      await page.waitForTimeout(400);
      await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'settings-account-sessions.png'), clip: FEATURE_CLIP });
    });

    await ctx.close();
  }

  // ───────────────────────── DESKTOP DARK ─────────────────────────
  console.log('\n── Dark mode (desktop) ──');
  await shot('dashboard-dark-page.png', async () => {
    const ctx = await browser.newContext({ viewport: DESKTOP, deviceScaleFactor: DEVICE_SCALE, colorScheme: 'dark' });
    await authenticate(ctx);
    const page = await ctx.newPage();
    await installPiiScrub(page);
    await applyThemeInit(page, { theme: 'dark', skin: 'ocean' });
    await page.goto(BASE_URL + '/', { waitUntil: 'networkidle' });
    await waitForCharts(page);
    await page.waitForTimeout(800);
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'dashboard-dark-page.png'), clip: FEATURE_CLIP });
    await ctx.close();
  });

  // ───────────────────────── PWA / MOBILE ─────────────────────────
  console.log('\n── PWA / mobile ──');
  for (const mode of ['light', 'dark']) {
    const ctx = await browser.newContext({
      viewport: MOBILE, deviceScaleFactor: MOBILE_SCALE, colorScheme: mode, isMobile: true,
    });
    await authenticate(ctx);
    const page = await ctx.newPage();
    await installPiiScrub(page);
    await applyThemeInit(page, { theme: mode, skin: 'ocean' });
    await page.goto(BASE_URL + '/', { waitUntil: 'networkidle' });
    await waitForCharts(page);
    await page.waitForTimeout(800);

    const pwaName = mode === 'light' ? 'pwa-lite.jpeg' : 'pwa-dark.jpeg';
    await shot(pwaName, async () => {
      await page.screenshot({ path: path.join(SCREENSHOTS_DIR, pwaName), type: 'jpeg', quality: 90 });
    });

    if (mode === 'light') {
      // Open the FloatingNav FAB and navigate (labels hidden on mobile sidebar).
      const openMobileNav = async () => {
        const fab = page.getByRole('button', { name: 'Open navigation menu' }).first();
        if (await fab.count()) { await fab.click().catch(() => {}); await page.waitForTimeout(500); }
      };

      await shot('mobile-timeline.png', async () => {
        await openMobileNav();
        await page.getByRole('button', { name: 'Timeline' }).first().click({ timeout: 6000 });
        await page.waitForTimeout(1600);
        await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'mobile-timeline.png') });
      });

      await shot('mobile-accessories.png', async () => {
        await openMobileNav();
        await page.getByRole('button', { name: 'Devices' }).first().click({ timeout: 6000 });
        await page.waitForTimeout(1600);
        await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'mobile-accessories.png') });
      });
    }

    await ctx.close();
  }

  // ───────────────────────── SKIN GALLERY ─────────────────────────
  await captureSkins(browser, 'light');
  await captureSkins(browser, 'dark');

  await browser.close();

  // ───────────────────────── PII VERIFICATION ─────────────────────────
  console.log('\n── PII scrub verification ──');
  // me/users/smtp are dumped IN FULL (task requirement); events/accessories are
  // large, so a 600-char snippet is enough to prove the device scrub still works.
  const FULL_DUMP = new Set(['me', 'users', 'smtp']);
  for (const key of ['events', 'accessories', 'me', 'users', 'smtp']) {
    const body = verifyCapture[key];
    const label = key === 'me' ? 'auth/me' : key === 'smtp' ? 'setup/smtp' : key;
    if (!body) { console.log(`  ⚠ no /api/${label} body captured to verify`); continue; }
    const dirty = PII_NEEDLES.filter((n) => body.includes(n));
    const shown = FULL_DUMP.has(key) ? body : body.slice(0, 600).replace(/\s+/g, ' ');
    console.log(`\n  /api/${label} (scrubbed${FULL_DUMP.has(key) ? ', full body' : ', first 600 chars'}):\n    ${shown}`);
    if (dirty.length) console.log(`  ⚠⚠ PII STILL PRESENT in /api/${label}: ${dirty.join(', ')}`);
    else console.log(`  ✓ /api/${label} clean — no ${PII_NEEDLES.join('/')}`);
  }

  console.log('\n✅ Screenshot run complete.');
}

main().catch((err) => {
  console.error('Screenshot capture failed:', err);
  process.exit(1);
});
