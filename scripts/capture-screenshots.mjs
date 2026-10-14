#!/usr/bin/env node
/**
 * Capture the screenshots used by homechronicle.net (docs/index.html,
 * docs/screenshots.html and docs/guide/*.md) from a live instance.
 *
 * Targets the v0.4 UI:
 *   - Masthead top navigation (Dashboard / Devices / Timeline / Alerts / Settings)
 *   - Twelve palettes x light/dark, driven through the per-user `palette` and
 *     `theme` preferences
 *   - Settings sections About / Admin / Configuration / Appearance / Account
 *
 * Auth: an admin session token is read from $HC_COOKIE_FILE (default
 * /tmp/hc_shot_cookie.txt) and attached as the `hc_session` cookie on every
 * Playwright context before navigation.
 *
 * Read-only by construction: every non-GET /api/** request is answered locally
 * with a 200 and never reaches the server, so a capture cannot change the
 * account's preferences, sign it out, or touch devices. GET responses are
 * rewritten to scrub personal names (PII_REPLACEMENTS) before the page renders.
 *
 * Usage:
 *   HC_COOKIE_FILE=/path/to/token node scripts/capture-screenshots.mjs [baseUrl]
 *   ONLY=palettes|pages|panels|mobile   capture just one group
 *   PALETTE_SHOTS=ember-light,tide-dark  limit the palette run to these shots
 */
import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Resolve a usable Chromium executable. The bundled Playwright build number may
 * not match the locally installed browser. Fall back to whatever Chromium /
 * headless shell is in the Playwright cache, newest first.
 */
function resolveChromiumPath() {
  if (process.env.PLAYWRIGHT_CHROMIUM_PATH) return process.env.PLAYWRIGHT_CHROMIUM_PATH;
  const cache = path.join(os.homedir(), 'Library/Caches/ms-playwright');
  let dirs = [];
  try {
    dirs = fs.readdirSync(cache)
      .filter((d) => /^chromium(_headless_shell)?-\d+$/.test(d))
      .sort((a, b) => Number(b.split('-').pop()) - Number(a.split('-').pop()));
  } catch { return undefined; }
  for (const d of dirs) {
    const candidates = [
      path.join(cache, d, 'chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'),
      path.join(cache, d, 'chrome-mac/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'),
      path.join(cache, d, 'chrome-headless-shell-mac-arm64/chrome-headless-shell'),
      path.join(cache, d, 'chrome-headless-shell-mac-x64/chrome-headless-shell'),
      path.join(cache, d, 'chrome-linux/chrome'),
    ];
    for (const c of candidates) if (fs.existsSync(c)) return c;
  }
  return undefined;
}

const SCREENSHOTS_DIR = path.resolve(__dirname, '../docs/screenshots');
const BASE_URL = (process.argv[2] || 'https://hc.venamis.net').replace(/\/$/, '');
const COOKIE_FILE = process.env.HC_COOKIE_FILE || '/tmp/hc_shot_cookie.txt';
const ONLY = process.env.ONLY || '';
// The build version the target runs (About shows it). Seeding it as "last seen"
// hides the what's-new dot; a wrong value would open the changelog modal instead.
const BUILD_VERSION = process.env.HC_BUILD_VERSION
  || execSync('git describe --tags --abbrev=0', { cwd: __dirname }).toString().trim();

const COOKIE_DOMAIN = new URL(BASE_URL).hostname;
const COOKIE_SECURE = new URL(BASE_URL).protocol === 'https:';

// Desktop: 1280 logical at 2x — wide enough for the masthead and the dashboard grid.
const DESKTOP = { width: 1280, height: 900 };
const DEVICE_SCALE = 2;
const FEATURE_CLIP = { x: 0, y: 0, width: 1280, height: 800 };

const MOBILE = { width: 393, height: 852 };
const MOBILE_SCALE = 2;

// Picker order from web/src/lib/palettes.js. Porcelain is the default.
const PALETTES = ['gallery', 'ember', 'almanac', 'harvest', 'ink', 'fern', 'porcelain', 'tide', 'atlas', 'iris', 'dusk', 'graphite'];
const DEFAULT_PALETTE = 'porcelain';

// Longest / most specific first, so a catch-all never pre-empts a longer match.
const PII_REPLACEMENTS = [
  ['havuq@venamis.net', 'admin@example.com'],
  ['smithmarcw@icloud.com', 'you@example.com'],
  ['no-reply@venamis.net', 'no-reply@example.com'],
  ['venamis.net', 'example.com'],
  ['havuq', 'admin'],
  ['smithmarcw', 'you'],
  ['Hubitat Smith Hub', 'Smart Home Hub'],
  ['Smith Hub', 'Home Hub'],
  ['Carl T20', 'Robot Vacuum'],
  ['ZVille OWM', 'Weather Station'],
  ['ZVille', 'Home'],
];
const PII_NEEDLES = ['Smith', 'Carl', 'ZVille', 'havuq', 'smithmarcw', 'venamis'];

let SESSION_TOKEN;
try {
  SESSION_TOKEN = fs.readFileSync(COOKIE_FILE, 'utf8').trim();
} catch (err) {
  console.error(`FATAL: could not read ${COOKIE_FILE} —`, err.message);
  process.exit(1);
}
if (!SESSION_TOKEN) {
  console.error(`FATAL: ${COOKIE_FILE} is empty`);
  process.exit(1);
}

// LAN addresses (bridge IPs, connection errors) become documentation-range ones.
// A latitude,longitude pair, plus the "Town, CC" a weather plugin appends to it
// in its serial number — patterns, so no real place name lives in this script.
const COORDS = /-?\d{1,3}\.\d{3,},\s?-?\d{1,3}\.\d{3,}(?:\s*[A-Za-z][A-Za-z .'-]*,\s?[A-Z]{2}\b)?/g;
const PLACEHOLDER_COORDS = '40.00000,-90.00000 Springfield, US';

// Every IPv4 address (LAN bridges, connection errors, session IPs that may be
// public) becomes one from the 192.0.2.0/24 documentation range.
const IPV4 = /\b(?:\d{1,3}\.){3}\d{1,3}\b/g;
const DOC_IP = /^192\.0\.2\.\d{1,3}$/;

/** Names of anything in a scrubbed body that still looks private. */
function leaks(body) {
  const found = PII_NEEDLES.filter((n) => body.includes(n));
  if ((body.match(IPV4) || []).some((ip) => !DOC_IP.test(ip))) found.push('ipv4');
  if (/-?\d{1,3}\.\d{3,},\s?-?\d{1,3}\.\d{3,}/.test(body.split(PLACEHOLDER_COORDS).join(''))) found.push('coordinates');
  return found;
}
const leakReport = [];

function scrub(text) {
  let out = text;
  for (const [from, to] of PII_REPLACEMENTS) out = out.split(from).join(to);
  out = out.replace(COORDS, PLACEHOLDER_COORDS);
  let n = 0;
  const seen = new Map();
  return out.replace(IPV4, (ip) => {
    if (DOC_IP.test(ip)) return ip;
    if (!seen.has(ip)) seen.set(ip, `192.0.2.${(n++ % 250) + 2}`);
    return seen.get(ip);
  });
}

const out = (name) => path.join(SCREENSHOTS_DIR, name);

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
 * Route every /api/** request:
 *   - non-GET: answered locally (200), never forwarded. PUT /api/me/preferences
 *     echoes its body so the app's preference cache stays consistent.
 *   - GET /api/me/preferences: real blob with `palette` and `theme` forced to
 *     the capture's look.
 *   - other GETs: fetched and PII-scrubbed.
 */
async function installRoutes(page, look, capture) {
  await page.route('**/api/**', async (route) => {
    const req = route.request();
    const url = req.url();
    const method = req.method();
    try {
      if (method !== 'GET' && method !== 'HEAD') {
        let body = '{}';
        if (/\/api\/me\/preferences(\?|$)/.test(url)) {
          let sent = {};
          try { sent = JSON.parse(req.postData() || '{}').prefs ?? {}; } catch { /* keep {} */ }
          body = JSON.stringify({ prefs: { ...sent, palette: look.palette, theme: look.theme } });
        }
        await route.fulfill({ status: 200, contentType: 'application/json', body });
        return;
      }

      if (/\/api\/me\/preferences(\?|$)/.test(url)) {
        const resp = await route.fetch();
        let json;
        try { json = JSON.parse(await resp.text()); } catch { json = {}; }
        if (!json || typeof json.prefs !== 'object' || json.prefs == null) json = { prefs: {} };
        json.prefs.palette = look.palette;
        json.prefs.theme = look.theme;
        const prefsBody = scrub(JSON.stringify(json));
        const prefsHits = leaks(prefsBody);
        if (prefsHits.length) leakReport.push(`${new URL(url).pathname}: ${prefsHits.join(', ')}`);
        await route.fulfill({ status: 200, contentType: 'application/json', body: prefsBody });
        return;
      }

      const resp = await route.fetch();
      const ct = resp.headers()['content-type'] || '';
      if (!/json|text/i.test(ct)) {
        await route.fulfill({ response: resp });
        return;
      }
      const body = scrub(await resp.text());
      const hits = leaks(body);
      if (hits.length) leakReport.push(`${new URL(url).pathname}: ${hits.join(', ')}`);
      if (capture) {
        for (const [key, re] of Object.entries(CAPTURE_PATTERNS)) {
          if (capture[key] == null && re.test(url)) capture[key] = body;
        }
      }
      await route.fulfill({ response: resp, body });
    } catch {
      try { await route.continue(); } catch { /* already handled */ }
    }
  });
}

const CAPTURE_PATTERNS = {
  events: /\/api\/events(\?|$)/,
  accessories: /\/api\/accessories(\?|$)/,
  me: /\/api\/auth\/me(\?|$)/,
  users: /\/api\/users\/?(\?|$)/,
  smtp: /\/api\/setup\/smtp(\?|$)/,
  rooms: /\/api\/stats\/rooms(\?|$)/,
  detail: /\/api\/accessories\/[^/]+\/detail(\?|$)/,
};

/** Seed localStorage so first paint (theme-init.js) already matches the look. */
async function seedLook(page, look) {
  await page.addInitScript(({ palette, theme, version }) => {
    localStorage.setItem('hc_theme_preference', theme);
    localStorage.setItem('hc_palette', palette);
    localStorage.setItem('hc_last_seen_version', version);
  }, { ...look, version: BUILD_VERSION });
}

/** New authenticated page with routes + look installed. */
async function openPage(browser, { look, viewport = DESKTOP, scale = DEVICE_SCALE, mobile = false, capture, auth = true }) {
  const ctx = await browser.newContext({
    viewport, deviceScaleFactor: scale, colorScheme: look.theme, isMobile: mobile, hasTouch: mobile,
  });
  if (auth) await authenticate(ctx);
  const page = await ctx.newPage();
  await installRoutes(page, look, capture);
  await seedLook(page, look);
  return { ctx, page };
}

async function waitForCharts(page) {
  try {
    await page.waitForSelector('.recharts-bar-rectangle, .recharts-area-area, .recharts-line-curve', { timeout: 20000 });
  } catch {
    console.log('    ⚠ chart data not detected after 20s, capturing anyway');
  }
  await page.waitForTimeout(1200);
}

/** The app scrolls <main>, not the document. */
async function scrollMainTop(page) {
  await page.evaluate(() => { const m = document.querySelector('main'); if (m) m.scrollTop = 0; window.scrollTo(0, 0); });
  await page.waitForTimeout(300);
}

/**
 * Element-crop a dashboard panel: find an anchor inside it, climb to the grid
 * item. `anchor` is a panel title (exact text), or { text } for a substring, or
 * { css } — the House Summary, room map and rhythm panels have no title.
 */
async function cropPanel(page, anchor, file) {
  const grid = page.locator('.react-grid-item');
  const heading = (typeof anchor === 'string'
    ? grid.getByText(anchor, { exact: true })
    : anchor.css ? grid.locator(anchor.css) : grid.getByText(anchor.text, { exact: false })).first();
  const title = typeof anchor === 'string' ? anchor : (anchor.css ?? anchor.text);
  if (!(await heading.count())) {
    console.log(`    ⚠ panel "${title}" not found — skipping ${file}`);
    return;
  }
  await heading.scrollIntoViewIfNeeded();
  await page.waitForTimeout(600);
  const item = heading.locator('xpath=ancestor::div[contains(@class,"react-grid-item")][1]');
  const target = (await item.count()) ? item.first() : heading;
  const box = await target.boundingBox();
  if (!box || box.width < 40 || box.height < 40) {
    console.log(`    ⚠ panel "${title}" has no usable box — skipping ${file}`);
    return;
  }
  await target.screenshot({ path: out(file) });
}

// The Settings card (rounded-xl Card) whose header heading is `title`.
const cardOf = (page, title) => page
  .getByRole('heading', { name: title, exact: true }).first()
  .locator('xpath=ancestor::div[contains(@class,"rounded-xl")][1]');

/**
 * Screenshot just the given elements (their union, plus padding) instead of the
 * whole viewport. The docs show these in cards a third to a full row wide, and a
 * full 1280px page shrunk to that size is unreadable. Clamped to <main> so the
 * masthead never creeps into the crop.
 */
async function clipShot(page, locators, file, { pad = 24, alignTop = false } = {}) {
  if (alignTop) {
    await locators[0].evaluate((el) => el.scrollIntoView({ block: 'start' }));
  } else {
    await locators[0].scrollIntoViewIfNeeded();
  }
  await page.waitForTimeout(600);
  const boxes = [];
  for (const l of locators) {
    const box = await l.boundingBox();
    if (!box) throw new Error(`${file}: element not visible`);
    boxes.push(box);
  }
  const vp = page.viewportSize();
  const main = await page.locator('main').first().boundingBox().catch(() => null);
  const area = main ?? { x: 0, y: 0, width: vp.width, height: vp.height };
  const x = Math.max(area.x, Math.min(...boxes.map((b) => b.x)) - pad);
  const y = Math.max(area.y, Math.min(...boxes.map((b) => b.y)) - pad);
  const right = Math.min(area.x + area.width, vp.width, Math.max(...boxes.map((b) => b.x + b.width)) + pad);
  const bottom = Math.min(area.y + area.height, vp.height, Math.max(...boxes.map((b) => b.y + b.height)) + pad);
  if (right - x < 40 || bottom - y < 40) throw new Error(`${file}: crop too small`);
  await page.screenshot({ path: out(file), clip: { x, y, width: right - x, height: bottom - y } });
}

async function navTo(page, label) {
  await page.locator('nav[aria-label="Main navigation"] button', { hasText: label }).first().click({ timeout: 8000 });
  await page.waitForTimeout(1800);
  await scrollMainTop(page);
}

async function settingsSection(page, label) {
  await page.locator('[role="button"]', { hasText: new RegExp(`^${label}$`) }).first().click({ timeout: 6000 });
  await page.waitForTimeout(1200);
  await scrollMainTop(page);
}

async function isAuthenticated(page) {
  const onLogin = await page.locator('input[type="password"]').count();
  const hasNav = await page.locator('nav[aria-label="Main navigation"]').count();
  return hasNav > 0 && onLogin === 0;
}

async function shot(name, fn) {
  try {
    await fn();
    console.log(`  ✓ ${name}`);
  } catch (err) {
    console.log(`  ⚠ ${name} — ${err.message.split('\n')[0]}`);
  }
}

const viewportShot = (page, file) => page.screenshot({ path: out(file), clip: FEATURE_CLIP });

// ─────────────────────────────────────────────────────────────────────────────

// Anchors are the text each panel actually renders (registry names differ for
// some: "Quiet Hours", "Weekday Heatmap").
const PANELS = [
  [{ text: 'events so far today' }, 'dashboard-house-summary.png'],
  [{ text: 'Block size follows' }, 'dashboard-room-map.png'],
  [{ css: '[aria-label^="Daily rhythm"]' }, 'dashboard-rhythm.png'],
  ['Daily Activity', 'dashboard-daily-activity.png'],
  ['Events by Hour', 'dashboard-events-by-hour.png'],
  ['Events by Room', 'dashboard-events-by-room.png'],
  ['Quiet Hours', 'dashboard-quiet-hours.png'],
  ['Most Active Devices', 'dashboard-most-active-devices.png'],
  ['Weekday Heatmap', 'dashboard-weekly-pattern.png'],
  ['Active Outliers', 'dashboard-outliers.png'],
  ['Stale Devices', 'dashboard-stale-devices.png'],
];

async function capturePanels(page) {
  for (const [anchor, file] of PANELS) await shot(file, () => cropPanel(page, anchor, file));
}

async function capturePages(browser, verify) {
  console.log('\n── Login page (unauthenticated) ──');
  await shot('login-page.png', async () => {
    const { ctx, page } = await openPage(browser, { look: { palette: DEFAULT_PALETTE, theme: 'light' }, auth: false });
    await page.goto(BASE_URL + '/', { waitUntil: 'networkidle' });
    await page.waitForSelector('input[type="password"]', { timeout: 8000 });
    await page.waitForTimeout(800);
    await clipShot(page, [page.locator('div.rounded-xl:has(input[type="password"])').first()], 'login-page.png', { pad: 32 });
    await ctx.close();
  });

  console.log('\n── Desktop, light ──');
  const { ctx, page } = await openPage(browser, { look: { palette: DEFAULT_PALETTE, theme: 'light' }, capture: verify });
  await page.goto(BASE_URL + '/', { waitUntil: 'networkidle' });
  await waitForCharts(page);

  await shot('dashboard-lite-page.png', () => page.screenshot({ path: out('dashboard-lite-page.png'), fullPage: false }));
  // Full-height dashboard: grow the viewport to the scroll height of <main>.
  await shot('dashboard-full-page.png', async () => {
    const h = await page.evaluate(() => (document.querySelector('main')?.scrollHeight ?? 2000) + 80);
    await page.setViewportSize({ width: DESKTOP.width, height: Math.min(h, 6000) });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: out('dashboard-full-page.png') });
    await page.setViewportSize(DESKTOP);
    await page.waitForTimeout(800);
  });

  await capturePanels(page);
  await scrollMainTop(page);

  await shot('timeline-lite-page.png', async () => {
    await navTo(page, 'Timeline');
    await viewportShot(page, 'timeline-lite-page.png');
  });
  await shot('timeline-search-heatmap.png', async () => {
    const search = page.getByText('Search & filters', { exact: true }).first();
    if (await search.count()) { await search.click().catch(() => {}); await page.waitForTimeout(500); }
    const heat = page.getByText('Activity heatmap', { exact: true }).first();
    if (await heat.count()) { await heat.click().catch(() => {}); await page.waitForTimeout(1200); }
    await viewportShot(page, 'timeline-search-heatmap.png');
  });

  await shot('devices-browse.png', async () => {
    await navTo(page, 'Devices');
    await viewportShot(page, 'devices-browse.png');
  });
  await shot('device-detail.png', async () => {
    // An active device makes a better example than whichever row sorts first.
    const active = page.locator('main button:has(div.rounded-full.w-2)', { hasText: 'Weather Station' });
    const row = (await active.count()) ? active.first() : page.locator('main button:has(div.rounded-full.w-2)').first();
    await row.click({ timeout: 6000 });
    await page.waitForTimeout(2500);
    await scrollMainTop(page);
    await viewportShot(page, 'device-detail.png');
    await page.keyboard.press('Escape').catch(() => {});
  });
  await shot('devices-add.png', async () => {
    await navTo(page, 'Devices');
    await page.locator('main nav button', { hasText: 'Add Accessories' }).first().click({ timeout: 6000 });
    await page.waitForTimeout(1500);
    await viewportShot(page, 'devices-add.png');
  });
  await shot('devices-manage.png', async () => {
    await page.locator('main nav button', { hasText: 'Manage Accessories' }).first().click({ timeout: 6000 });
    await page.waitForTimeout(1500);
    await viewportShot(page, 'devices-manage.png');
  });

  await shot('alerts-page.png', async () => {
    await navTo(page, 'Alerts');
    await viewportShot(page, 'alerts-page.png');
  });

  await navTo(page, 'Settings');
  await shot('settings-about.png', async () => {
    await settingsSection(page, 'About');
    await viewportShot(page, 'settings-about.png');
  });
  await shot('settings-users.png', async () => {
    await settingsSection(page, 'Admin');
    await clipShot(page, [cardOf(page, 'Users'), cardOf(page, 'Pending invites')], 'settings-users.png');
  });
  await shot('settings-email-smtp.png', async () => {
    const smtp = page.getByText('Email (SMTP)', { exact: true }).first();
    await smtp.scrollIntoViewIfNeeded();
    await page.waitForTimeout(500);
    const box = await smtp.boundingBox();
    if (!box) throw new Error('SMTP card not visible');
    await page.screenshot({ path: out('settings-email-smtp.png'), clip: { x: 0, y: Math.max(0, box.y - 32), width: DESKTOP.width, height: Math.min(760, DESKTOP.height - Math.max(0, box.y - 32)) } });
  });
  await shot('settings-device-management.png', async () => {
    await settingsSection(page, 'Configuration');
    await viewportShot(page, 'settings-device-management.png');
  });
  await shot('settings-advanced.png', async () => {
    await page.locator('button[role="tab"]', { hasText: 'Advanced' }).first().click({ timeout: 6000 });
    await page.waitForTimeout(1000);
    await viewportShot(page, 'settings-advanced.png');
  });
  await shot('settings-appearance.png', async () => {
    await settingsSection(page, 'Appearance');
    await viewportShot(page, 'settings-appearance.png');
  });
  await shot('settings-account-sessions.png', async () => {
    await settingsSection(page, 'Account');
    await clipShot(page, [cardOf(page, 'Active Sessions')], 'settings-account-sessions.png', { alignTop: true });
  });
  await ctx.close();

  console.log('\n── Desktop, dark ──');
  {
    const { ctx: dctx, page: dpage } = await openPage(browser, { look: { palette: DEFAULT_PALETTE, theme: 'dark' } });
    await dpage.goto(BASE_URL + '/', { waitUntil: 'networkidle' });
    await waitForCharts(dpage);
    await shot('dashboard-dark-page.png', () => viewportShot(dpage, 'dashboard-dark-page.png'));
    await shot('timeline-dark.png', async () => { await navTo(dpage, 'Timeline'); await viewportShot(dpage, 'timeline-dark.png'); });
    await shot('devices-dark.png', async () => { await navTo(dpage, 'Devices'); await viewportShot(dpage, 'devices-dark.png'); });
    await shot('settings-appearance-dark.png', async () => {
      await navTo(dpage, 'Settings');
      await settingsSection(dpage, 'Appearance');
      await viewportShot(dpage, 'settings-appearance-dark.png');
    });
    await dctx.close();
  }
}

async function captureMobile(browser) {
  console.log('\n── Mobile ──');
  for (const theme of ['light', 'dark']) {
    const { ctx, page } = await openPage(browser, {
      look: { palette: DEFAULT_PALETTE, theme }, viewport: MOBILE, scale: MOBILE_SCALE, mobile: true,
    });
    await page.goto(BASE_URL + '/', { waitUntil: 'networkidle' });
    await waitForCharts(page);
    const pwaName = theme === 'light' ? 'pwa-lite.jpeg' : 'pwa-dark.jpeg';
    await shot(pwaName, () => page.screenshot({ path: out(pwaName), type: 'jpeg', quality: 88 }));

    if (theme === 'light') {
      const go = async (label) => {
        await page.getByRole('button', { name: 'Open navigation menu' }).click({ timeout: 6000 });
        await page.waitForTimeout(500);
        await page.locator('nav[aria-label="Main navigation"] button', { hasText: label }).first().click({ timeout: 6000 });
        await page.waitForTimeout(1800);
      };
      await shot('mobile-timeline.png', async () => { await go('Timeline'); await page.screenshot({ path: out('mobile-timeline.png') }); });
      await shot('mobile-devices.png', async () => { await go('Devices'); await page.screenshot({ path: out('mobile-devices.png') }); });
    }
    await ctx.close();
  }
}

/**
 * True when a dashboard panel rendered its failure state. Each palette shot is a
 * fresh page load of every panel, which can trip the listener's stats rate
 * limit; a failed load is retried after a pause rather than captured.
 */
// A panel whose request fails doesn't always say so: Today's Rhythm quietly
// falls back to default quiet hours (11 PM–6 AM UTC) when /api/stats/quiet-hours
// is rate-limited, so a shot can look fine and still be wrong. Count failed
// API responses too, not just visible error text.
const apiFailures = new WeakMap();
function trackApiFailures(page) {
  apiFailures.set(page, 0);
  page.on('response', (resp) => {
    if (resp.url().includes('/api/') && resp.status() >= 400) {
      apiFailures.set(page, (apiFailures.get(page) ?? 0) + 1);
    }
  });
}

async function dashboardFailed(page) {
  if ((apiFailures.get(page) ?? 0) > 0) return true;
  return (await page.getByText(/unavailable right now|Failed to load/i).count()) > 0;
}

async function capturePalettes(browser) {
  const only = process.env.PALETTE_SHOTS ? process.env.PALETTE_SHOTS.split(',') : null;
  for (const theme of ['light', 'dark']) {
    console.log(`\n── Palette gallery (${theme}) ──`);
    for (const palette of PALETTES) {
      if (only && !only.includes(`${palette}-${theme}`)) continue;
      const file = `palette-${palette}-${theme}.png`;
      await shot(file, async () => {
        const { ctx, page } = await openPage(browser, { look: { palette, theme } });
        trackApiFailures(page);
        await page.goto(BASE_URL + '/', { waitUntil: 'networkidle' });
        await waitForCharts(page);
        for (let attempt = 1; attempt <= 3 && await dashboardFailed(page); attempt++) {
          console.log(`    … ${file}: panels failed to load, retrying in 30s (${attempt}/3)`);
          await page.waitForTimeout(30000);
          apiFailures.set(page, 0);
          await page.reload({ waitUntil: 'networkidle' });
          await waitForCharts(page);
        }
        if (await dashboardFailed(page)) throw new Error('panels still failing after retries');
        const applied = await page.evaluate(() => [document.documentElement.dataset.palette, document.documentElement.dataset.theme]);
        if (applied[0] !== palette || applied[1] !== theme) {
          throw new Error(`page rendered ${applied.join('/')} instead of ${palette}/${theme}`);
        }
        await viewportShot(page, file);
        await ctx.close();
      });
      await new Promise((r) => setTimeout(r, 8000));
    }
  }
}

async function main() {
  fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
  console.log(`Target: ${BASE_URL}  (build ${BUILD_VERSION})`);
  const executablePath = resolveChromiumPath();
  if (executablePath) console.log(`Using Chromium: ${executablePath}`);
  const browser = await chromium.launch({ headless: true, executablePath });

  {
    const { ctx, page } = await openPage(browser, { look: { palette: DEFAULT_PALETTE, theme: 'light' } });
    await page.goto(BASE_URL + '/', { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
    if (!(await isAuthenticated(page))) {
      console.error('\nFATAL: session did not authenticate (landed on the login page). Aborting.');
      await browser.close();
      process.exit(2);
    }
    console.log('✓ Authenticated');
    if (await page.getByRole('dialog').count()) {
      console.error(`FATAL: a dialog is open on load — HC_BUILD_VERSION (${BUILD_VERSION}) probably doesn't match the target's build.`);
      await browser.close();
      process.exit(2);
    }
    await ctx.close();
  }

  const verify = Object.fromEntries(Object.keys(CAPTURE_PATTERNS).map((k) => [k, null]));
  if (!ONLY || ONLY === 'pages') await capturePages(browser, verify);
  if (ONLY === 'panels') {
    const { ctx, page } = await openPage(browser, { look: { palette: DEFAULT_PALETTE, theme: 'light' } });
    await page.goto(BASE_URL + '/', { waitUntil: 'networkidle' });
    await waitForCharts(page);
    await capturePanels(page);
    await ctx.close();
  }
  if (!ONLY || ONLY === 'mobile') await captureMobile(browser);
  if (!ONLY || ONLY === 'palettes') await capturePalettes(browser);
  await browser.close();

  console.log('\n── PII scrub verification (every API response) ──');
  if (!ONLY || ONLY === 'pages') {
    for (const [key, body] of Object.entries(verify)) {
      if (!body) console.log(`  ⚠ no ${key} body captured`);
    }
  }
  const unique = [...new Set(leakReport)];
  if (unique.length) {
    for (const line of unique) console.log(`  ⚠⚠ LEAK ${line}`);
    process.exitCode = 3;
  } else {
    console.log('  ✓ no needles, non-documentation IPv4 addresses, or coordinates in any response');
  }
  console.log('\n✅ Done.');
}

main().catch((err) => {
  console.error('Screenshot capture failed:', err);
  process.exit(1);
});
