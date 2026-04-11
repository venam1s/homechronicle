#!/usr/bin/env node
/**
 * Capture updated screenshots from the beta instance for homechronicle.net
 * Usage: node scripts/capture-screenshots.mjs [baseUrl]
 */
import { chromium } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCREENSHOTS_DIR = path.resolve(__dirname, '../docs/screenshots');
const BASE_URL = process.argv[2] || 'http://172.16.1.15:3100';

// Desktop viewport matching existing screenshots (~2160px wide at 2x = 1080 logical)
const DESKTOP = { width: 1080, height: 1220 };
const DEVICE_SCALE = 2;

// Mobile viewport for PWA screenshots (~603 logical at 2x = 1206px)
const MOBILE = { width: 393, height: 852 };
const MOBILE_SCALE = 2; // changed to match ~1206px close enough

async function main() {
  const browser = await chromium.launch({ headless: true });

  // ── LIGHT MODE full-page screenshots ──
  console.log('── Light mode screenshots ──');

  const lightCtx = await browser.newContext({
    viewport: DESKTOP,
    deviceScaleFactor: DEVICE_SCALE,
    colorScheme: 'light',
  });
  const lightPage = await lightCtx.newPage();

  // Set light theme + ocean skin before navigating
  await lightPage.addInitScript(() => {
    localStorage.setItem('hc_theme_preference', 'light');
    localStorage.setItem('hc_ui_skin', 'ocean');
  });

  // Dashboard (light)
  await lightPage.goto(BASE_URL, { waitUntil: 'networkidle' });
  await lightPage.waitForTimeout(1500); // let charts render
  await lightPage.screenshot({
    path: path.join(SCREENSHOTS_DIR, 'dashboard-lite-page.png'),
    fullPage: true,
  });
  console.log('  ✓ dashboard-lite-page.png');

  // Dashboard cropped: daily activity (KPI cards + chart)
  const dailyActivity = await lightPage.locator('.grid, [class*="stats-cards"], [class*="kpi"]').first();
  // Take a clip of the top portion instead
  await lightPage.screenshot({
    path: path.join(SCREENSHOTS_DIR, 'dashboard-daily-activity.png'),
    clip: { x: 0, y: 0, width: 1080, height: 380 },
  });
  console.log('  ✓ dashboard-daily-activity.png');

  // Dashboard cropped: most active devices (left column, lower section)
  // Find the "Most Active Devices" heading
  const mostActive = lightPage.getByText('Most Active Devices').first();
  if (await mostActive.isVisible()) {
    const box = await mostActive.boundingBox();
    if (box) {
      await lightPage.screenshot({
        path: path.join(SCREENSHOTS_DIR, 'dashboard-most-active-devices.png'),
        clip: { x: box.x - 10, y: box.y - 15, width: 494, height: 586 },
      });
      console.log('  ✓ dashboard-most-active-devices.png');
    }
  }

  // Dashboard cropped: weekday + monthly heatmaps
  const weekdayHeatmap = lightPage.getByText('Weekday Heatmap').first();
  if (await weekdayHeatmap.isVisible()) {
    const box = await weekdayHeatmap.boundingBox();
    if (box) {
      await lightPage.screenshot({
        path: path.join(SCREENSHOTS_DIR, 'dashboard-weekly-monthly-heatmaps.png'),
        clip: { x: box.x - 10, y: box.y - 15, width: 495, height: 585 },
      });
      console.log('  ✓ dashboard-weekly-monthly-heatmaps.png');
    }
  }

  // Dashboard cropped: stale devices
  const staleDevices = lightPage.getByText('Stale Devices').first();
  if (await staleDevices.isVisible()) {
    // Find the parent card/section containing "Stale Devices"
    const staleSection = staleDevices.locator('xpath=ancestor::div[contains(@class,"rounded") or contains(@class,"card") or contains(@class,"bg-")]').last();
    if (await staleSection.isVisible().catch(() => false)) {
      await staleSection.screenshot({
        path: path.join(SCREENSHOTS_DIR, 'dashboard-stale-devices.png'),
      });
    } else {
      // Fallback: take clip relative to the heading with safe bounds
      const box = await staleDevices.boundingBox();
      const pageHeight = await lightPage.evaluate(() => document.body.scrollHeight);
      if (box) {
        const clipHeight = Math.min(414, pageHeight - box.y + 15);
        await lightPage.screenshot({
          path: path.join(SCREENSHOTS_DIR, 'dashboard-stale-devices.png'),
          clip: { x: Math.max(0, box.x - 10), y: Math.max(0, box.y - 15), width: 497, height: clipHeight },
        });
      }
    }
    console.log('  ✓ dashboard-stale-devices.png');
  }

  // Timeline (light)
  await lightPage.click('text=Timeline');
  await lightPage.waitForTimeout(1500);
  await lightPage.screenshot({
    path: path.join(SCREENSHOTS_DIR, 'timeline-lite-page.png'),
    fullPage: true,
  });
  console.log('  ✓ timeline-lite-page.png');

  // Timeline with search & heatmap expanded
  const searchToggle = lightPage.getByText('Search & filters').first();
  if (await searchToggle.isVisible()) {
    await searchToggle.click();
    await lightPage.waitForTimeout(300);
  }
  const heatmapToggle = lightPage.getByText('Activity heatmap').first();
  if (await heatmapToggle.isVisible()) {
    await heatmapToggle.click();
    await lightPage.waitForTimeout(1000);
  }
  await lightPage.screenshot({
    path: path.join(SCREENSHOTS_DIR, 'timeline-search-heatmap.png'),
    fullPage: true,
  });
  console.log('  ✓ timeline-search-heatmap.png');

  // Accessories (light)
  await lightPage.click('text=Accessories');
  await lightPage.waitForTimeout(1500);
  await lightPage.screenshot({
    path: path.join(SCREENSHOTS_DIR, 'accessories-lite-page.png'),
    fullPage: true,
  });
  console.log('  ✓ accessories-lite-page.png');

  // Accessories device detail — click an event count badge to open detail view
  const eventBadge = lightPage.locator('text=/\\d+ events?/').first();
  if (await eventBadge.isVisible()) {
    await eventBadge.click();
    await lightPage.waitForTimeout(2000);
    // Check if we're in the detail view (has a Back button)
    const backBtn = lightPage.getByRole('button', { name: /back/i }).or(lightPage.locator('button:has-text("Back")')).first();
    if (await backBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      // Viewport-only screenshot (not fullPage) — the detail page is very long
      await lightPage.screenshot({
        path: path.join(SCREENSHOTS_DIR, 'accessories-device-details.png'),
        fullPage: false,
      });
      console.log('  ✓ accessories-device-details.png');
      await backBtn.click();
      await lightPage.waitForTimeout(500);
    } else {
      console.log('  ⚠ accessories-device-details.png — detail view not detected after click');
    }
  } else {
    console.log('  ⚠ accessories-device-details.png — no event badge found');
  }

  // Manage (light) — default tab is "Manage Accessories" (id: devices)
  await lightPage.click('text=Manage');
  await lightPage.waitForTimeout(1500);

  // Manage > Manage Accessories (My Devices) — this is the default tab
  await lightPage.screenshot({
    path: path.join(SCREENSHOTS_DIR, 'manage-my-devices.png'),
    fullPage: true,
  });
  console.log('  ✓ manage-my-devices.png');

  // Manage > Add Accessories tab
  const addAccessoriesTab = lightPage.locator('nav button', { hasText: 'Add Accessories' });
  if (await addAccessoriesTab.isVisible()) {
    await addAccessoriesTab.click();
    await lightPage.waitForTimeout(1000);
    await lightPage.screenshot({
      path: path.join(SCREENSHOTS_DIR, 'manage-lite-page.png'),
      fullPage: true,
    });
    console.log('  ✓ manage-lite-page.png');
  }

  // Manage > Settings tab
  const settingsTab = lightPage.locator('nav button', { hasText: 'Settings' });
  if (await settingsTab.isVisible()) {
    await settingsTab.click();
    await lightPage.waitForTimeout(1000);
    await lightPage.screenshot({
      path: path.join(SCREENSHOTS_DIR, 'manage-settings.png'),
      fullPage: true,
    });
    console.log('  ✓ manage-settings.png');
  }

  // Theme color picker — open the FAB skin picker and capture the whole FAB area
  const skinPickerBtn = lightPage.locator('button[title="Color themes"]');
  if (await skinPickerBtn.isVisible()) {
    await skinPickerBtn.click();
    await lightPage.waitForTimeout(600);
    // The swatches float to the left of the FAB — capture the full .hc-fab container
    // but we need a bigger area since the swatches extend left with absolute positioning
    const fabEl = lightPage.locator('.hc-fab');
    const fabBox = await fabEl.boundingBox();
    if (fabBox) {
      // Expand clip leftward to include the swatch tray (swatches are ~300px wide to the left)
      const clipX = Math.max(0, fabBox.x - 320);
      const clipWidth = fabBox.width + 320 + 20;
      await lightPage.screenshot({
        path: path.join(SCREENSHOTS_DIR, 'themes-color-picker.png'),
        clip: { x: clipX, y: fabBox.y, width: clipWidth, height: fabBox.height },
      });
      console.log('  ✓ themes-color-picker.png');
    }
  } else {
    console.log('  ⚠ themes-color-picker.png — picker button not found, skipping');
  }

  await lightCtx.close();

  // ── DARK MODE full-page screenshot ──
  console.log('\n── Dark mode screenshots ──');

  const darkCtx = await browser.newContext({
    viewport: DESKTOP,
    deviceScaleFactor: DEVICE_SCALE,
    colorScheme: 'dark',
  });
  const darkPage = await darkCtx.newPage();
  await darkPage.addInitScript(() => {
    localStorage.setItem('hc_theme_preference', 'dark');
    localStorage.setItem('hc_ui_skin', 'ocean');
  });

  await darkPage.goto(BASE_URL, { waitUntil: 'networkidle' });
  await darkPage.waitForTimeout(1500);
  await darkPage.screenshot({
    path: path.join(SCREENSHOTS_DIR, 'dashboard-dark-page.png'),
    fullPage: true,
  });
  console.log('  ✓ dashboard-dark-page.png');
  await darkCtx.close();

  // ── PWA (mobile) screenshots ──
  console.log('\n── PWA (mobile) screenshots ──');

  // PWA light
  const pwaLightCtx = await browser.newContext({
    viewport: MOBILE,
    deviceScaleFactor: MOBILE_SCALE,
    colorScheme: 'light',
    isMobile: true,
  });
  const pwaLightPage = await pwaLightCtx.newPage();
  await pwaLightPage.addInitScript(() => {
    localStorage.setItem('hc_theme_preference', 'light');
    localStorage.setItem('hc_ui_skin', 'ocean');
  });
  await pwaLightPage.goto(BASE_URL, { waitUntil: 'networkidle' });
  await pwaLightPage.waitForTimeout(1500);
  await pwaLightPage.screenshot({
    path: path.join(SCREENSHOTS_DIR, 'pwa-lite.jpeg'),
    fullPage: true,
    type: 'jpeg',
    quality: 90,
  });
  console.log('  ✓ pwa-lite.jpeg');
  await pwaLightCtx.close();

  // PWA dark
  const pwaDarkCtx = await browser.newContext({
    viewport: MOBILE,
    deviceScaleFactor: MOBILE_SCALE,
    colorScheme: 'dark',
    isMobile: true,
  });
  const pwaDarkPage = await pwaDarkCtx.newPage();
  await pwaDarkPage.addInitScript(() => {
    localStorage.setItem('hc_theme_preference', 'dark');
    localStorage.setItem('hc_ui_skin', 'ocean');
  });
  await pwaDarkPage.goto(BASE_URL, { waitUntil: 'networkidle' });
  await pwaDarkPage.waitForTimeout(1500);
  await pwaDarkPage.screenshot({
    path: path.join(SCREENSHOTS_DIR, 'pwa-dark.jpeg'),
    fullPage: true,
    type: 'jpeg',
    quality: 90,
  });
  console.log('  ✓ pwa-dark.jpeg');
  await pwaDarkCtx.close();

  // ── SKIN GALLERY screenshots (all skins × light + dark) ──
  const SKINS = ['ocean', 'graphite', 'sunrise', 'red', 'yellow', 'purple', 'slate', 'pink'];

  // Wait for Recharts data elements (bars and area paths) to actually render,
  // not just the SVG container (.recharts-surface appears before data draws)
  async function waitForCharts(page) {
    try {
      await page.waitForSelector('.recharts-bar-rectangle, .recharts-area-area', { timeout: 20000 });
      await page.waitForTimeout(500); // let animations settle
    } catch {
      console.log('    ⚠ chart data elements not detected after 20s, capturing anyway');
    }
  }

  // Capture skin screenshots reusing a single page per mode to avoid
  // overwhelming the API with too many fresh connections
  async function captureSkins(mode) {
    console.log(`\n── Skin gallery screenshots (${mode}) ──`);
    const ctx = await browser.newContext({
      viewport: DESKTOP,
      deviceScaleFactor: DEVICE_SCALE,
      colorScheme: mode,
    });
    const page = await ctx.newPage();

    // Initial load to get localStorage access
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });

    for (let i = 0; i < SKINS.length; i++) {
      const skin = SKINS[i];
      // Cooldown between captures to avoid overwhelming the API
      if (i > 0) await page.waitForTimeout(2000);
      // Set skin + theme in localStorage, then reload
      await page.evaluate(({ s, m }) => {
        localStorage.setItem('hc_ui_skin', s);
        localStorage.setItem('hc_theme_preference', m);
      }, { s: skin, m: mode });
      await page.reload({ waitUntil: 'networkidle' });
      await waitForCharts(page);
      // Verify charts actually loaded (no "Failed to load" visible)
      const hasFailed = await page.locator('text=/Failed to load/').count();
      if (hasFailed > 0) {
        console.log(`    ⚠ API errors detected for ${skin}-${mode}, retrying after 5s...`);
        await page.waitForTimeout(5000);
        await page.reload({ waitUntil: 'networkidle' });
        await waitForCharts(page);
      }
      await page.screenshot({
        path: path.join(SCREENSHOTS_DIR, `skin-${skin}-${mode}.png`),
        fullPage: true,
      });
      console.log(`  ✓ skin-${skin}-${mode}.png`);
    }

    await ctx.close();
  }

  await captureSkins('light');
  await captureSkins('dark');

  await browser.close();
  console.log('\n✅ All screenshots captured!');
}

main().catch((err) => {
  console.error('Screenshot capture failed:', err);
  process.exit(1);
});
