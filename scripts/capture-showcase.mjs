#!/usr/bin/env node
/**
 * Capture showcase screenshots for the screenshots gallery page.
 * These go beyond the landing page screenshots to show full feature depth.
 */
import { chromium } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIR = path.resolve(__dirname, '../docs/screenshots');
const BASE = process.argv[2] || 'http://172.16.1.15:3100';
const DESKTOP = { width: 1080, height: 1220 };
const SCALE = 2;

const SKINS = ['ocean', 'graphite', 'sunrise', 'red', 'yellow', 'purple', 'slate', 'pink'];

async function main() {
  const browser = await chromium.launch({ headless: true });

  // ── Theme skins (dashboard crops) ──
  console.log('── Theme skin variations ──');
  for (const skin of SKINS) {
    for (const theme of ['light', 'dark']) {
      const ctx = await browser.newContext({
        viewport: DESKTOP,
        deviceScaleFactor: SCALE,
        colorScheme: theme,
      });
      const page = await ctx.newPage();
      await page.addInitScript(([t, s]) => {
        localStorage.setItem('hc_theme_preference', t);
        localStorage.setItem('hc_ui_skin', s);
      }, [theme, skin]);

      await page.goto(BASE, { waitUntil: 'networkidle' });
      await page.waitForTimeout(2000);

      // Crop to show KPI cards + daily activity chart + events by hour/room
      await page.screenshot({
        path: path.join(DIR, `skin-${skin}-${theme}.png`),
        fullPage: true,
        clip: { x: 0, y: 0, width: 1080, height: 1100 },
      });
      console.log(`  ok skin-${skin}-${theme}`);
      await ctx.close();
    }
  }

  // ── Feature screenshots (light mode) ──
  console.log('\n── Feature screenshots ──');
  const ctx = await browser.newContext({
    viewport: DESKTOP,
    deviceScaleFactor: SCALE,
    colorScheme: 'light',
  });
  const page = await ctx.newPage();
  await page.addInitScript(() => {
    localStorage.setItem('hc_theme_preference', 'light');
    localStorage.setItem('hc_ui_skin', 'ocean');
  });

  // Dashboard — wait for all panels to load (including anomaly baselines)
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(4000);

  const quietHours = page.getByText('Quiet Hours Activity').first();
  if (await quietHours.isVisible().catch(() => false)) {
    await quietHours.scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);
    const pos = await quietHours.evaluate(el => {
      const rect = el.getBoundingClientRect();
      return { x: rect.x + window.scrollX, y: rect.y + window.scrollY };
    });
    await page.screenshot({
      path: path.join(DIR, 'feature-quiet-hours.png'),
      fullPage: true,
      clip: { x: 0, y: pos.y - 15, width: 1080, height: 300 },
    });
    console.log('  ok feature-quiet-hours');
  } else {
    console.log('  skip quiet-hours (not visible)');
  }

  // Dashboard — active outliers (wait for baselines to finish computing)
  const outliers = page.getByText('Active Outliers').first();
  if (await outliers.isVisible().catch(() => false)) {
    // Wait for "Analyzing baselines..." to disappear (up to 15s)
    const analyzing = page.getByText('Analyzing baselines');
    for (let i = 0; i < 15; i++) {
      if (!await analyzing.isVisible().catch(() => false)) break;
      await page.waitForTimeout(1000);
    }
    await page.waitForTimeout(500);

    await outliers.scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);
    // Get the width of the outliers column (it's in a 2-col grid with stale devices)
    const pos = await outliers.evaluate(el => {
      const rect = el.getBoundingClientRect();
      // Find the parent grid cell to get exact column width
      let parent = el.parentElement;
      while (parent && !parent.classList.contains('grid') && parent !== document.body) {
        parent = parent.parentElement;
      }
      const colWidth = parent ? parent.children[0].getBoundingClientRect().width : 500;
      return {
        x: rect.x + window.scrollX,
        y: rect.y + window.scrollY,
        colWidth,
      };
    });
    await page.screenshot({
      path: path.join(DIR, 'feature-active-outliers.png'),
      fullPage: true,
      clip: { x: Math.max(0, pos.x - 15), y: Math.max(0, pos.y - 15), width: Math.min(pos.colWidth + 20, 520), height: 380 },
    });
    console.log('  ok feature-active-outliers');
  } else {
    console.log('  skip active-outliers (not visible)');
  }

  // Dashboard — stale devices (use heading position for reliable full-page clip)
  const stale = page.getByText('Stale Devices').first();
  if (await stale.isVisible().catch(() => false)) {
    await stale.scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);
    const pos = await stale.evaluate(el => {
      const rect = el.getBoundingClientRect();
      return { x: rect.x + window.scrollX, y: rect.y + window.scrollY };
    });
    await page.screenshot({
      path: path.join(DIR, 'feature-stale-devices.png'),
      fullPage: true,
      clip: { x: Math.max(0, pos.x - 15), y: Math.max(0, pos.y - 15), width: 540, height: 380 },
    });
    console.log('  ok feature-stale-devices');
  } else {
    console.log('  skip stale-devices (not visible)');
  }

  // Timeline — scene groups (episodes with multiple events)
  await page.click('text=Timeline');
  await page.waitForTimeout(1500);

  // Look for scene groups (they have "events at the same time" text)
  const sceneGroup = page.locator('text=/\\d+ events at the same time/').first();
  if (await sceneGroup.isVisible().catch(() => false)) {
    await sceneGroup.scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);
    const pos = await sceneGroup.evaluate(el => {
      const rect = el.getBoundingClientRect();
      return { x: rect.x + window.scrollX, y: rect.y + window.scrollY };
    });
    await page.screenshot({
      path: path.join(DIR, 'feature-scene-groups.png'),
      fullPage: true,
      clip: { x: 0, y: Math.max(0, pos.y - 60), width: 1080, height: 400 },
    });
    console.log('  ok feature-scene-groups');
  } else {
    console.log('  skip scene-groups (not visible)');
  }

  // Accessories — device detail with full stats
  await page.click('text=Accessories');
  await page.waitForTimeout(1500);

  // Click first device with events to get a rich detail page
  const eventBadge = page.locator('text=/\\d+ events?/').first();
  if (await eventBadge.isVisible()) {
    await eventBadge.click();
    await page.waitForTimeout(2000);

    const backBtn = page.locator('button:has-text("Back")').first();
    if (await backBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      // Full detail page
      await page.screenshot({
        path: path.join(DIR, 'feature-device-detail-full.png'),
        fullPage: true,
        clip: { x: 0, y: 0, width: 1080, height: 1220 },
      });
      console.log('  ok feature-device-detail-full');

      // Device info section
      const deviceInfo = page.getByText('Device Info').first();
      if (await deviceInfo.isVisible().catch(() => false)) {
        await deviceInfo.scrollIntoViewIfNeeded();
        await page.waitForTimeout(200);
        const pos = await deviceInfo.evaluate(el => {
          const rect = el.getBoundingClientRect();
          return { x: rect.x + window.scrollX, y: rect.y + window.scrollY };
        });
        await page.screenshot({
          path: path.join(DIR, 'feature-device-info.png'),
          fullPage: true,
          clip: { x: 0, y: pos.y - 15, width: 1080, height: 250 },
        });
        console.log('  ok feature-device-info');
      }

      // Connection reliability section
      const reliability = page.getByText('Connection Reliability').first();
      if (await reliability.isVisible().catch(() => false)) {
        await reliability.scrollIntoViewIfNeeded();
        await page.waitForTimeout(200);
        const pos = await reliability.evaluate(el => {
          const rect = el.getBoundingClientRect();
          return { x: rect.x + window.scrollX, y: rect.y + window.scrollY };
        });
        await page.screenshot({
          path: path.join(DIR, 'feature-connection-reliability.png'),
          fullPage: true,
          clip: { x: 0, y: pos.y - 15, width: 1080, height: 220 },
        });
        console.log('  ok feature-connection-reliability');
      }

      await backBtn.click();
      await page.waitForTimeout(500);
    }
  }

  // Manage — bridge child devices expanded
  await page.click('text=Manage');
  await page.waitForTimeout(1000);

  const showChildren = page.locator('text=/Show child/i').first();
  if (await showChildren.isVisible().catch(() => false)) {
    await showChildren.click();
    await page.waitForTimeout(1000);
    // Capture the expanded area
    const pos = await showChildren.evaluate(el => {
      const rect = el.getBoundingClientRect();
      return { x: rect.x + window.scrollX, y: rect.y + window.scrollY };
    });
    await page.screenshot({
      path: path.join(DIR, 'feature-bridge-children.png'),
      fullPage: true,
      clip: { x: 0, y: Math.max(0, pos.y - 100), width: 1080, height: 500 },
    });
    console.log('  ok feature-bridge-children');
  } else {
    console.log('  skip bridge-children (not visible)');
  }

  // Manage — Add Accessories (HomeKit + Matter side by side)
  const addTab = page.locator('nav button', { hasText: 'Add Accessories' });
  if (await addTab.isVisible()) {
    await addTab.click();
    await page.waitForTimeout(1000);
    await page.screenshot({
      path: path.join(DIR, 'feature-add-devices.png'),
      fullPage: false,
    });
    console.log('  ok feature-add-devices');
  }

  // Manage — Alerts tab (if enabled)
  const alertsTab = page.locator('nav button', { hasText: 'Alerts' });
  if (await alertsTab.isVisible().catch(() => false)) {
    await alertsTab.click();
    await page.waitForTimeout(1000);
    await page.screenshot({
      path: path.join(DIR, 'feature-alerts.png'),
      fullPage: false,
    });
    console.log('  ok feature-alerts');
  } else {
    console.log('  skip alerts (tab not visible — may be disabled)');
  }

  // Manage — Settings: scheduled repair section (tight crop around the card)
  const settingsBtn = page.locator('nav button', { hasText: 'Settings' });
  await settingsBtn.click();
  await page.waitForTimeout(1000);

  const repair = page.getByText('Scheduled Repair').first();
  if (await repair.isVisible().catch(() => false)) {
    const repairCard = repair.locator('xpath=ancestor::div[contains(@class,"rounded") or contains(@class,"bg-")]').last();
    if (await repairCard.isVisible().catch(() => false)) {
      const box = await repairCard.boundingBox();
      if (box) {
        await page.screenshot({
          path: path.join(DIR, 'feature-scheduled-repair.png'),
          clip: { x: Math.max(0, box.x - 12), y: Math.max(0, box.y - 12), width: box.width + 24, height: box.height + 24 },
        });
        console.log('  ok feature-scheduled-repair');
      }
    } else {
      // Fallback: heading-based crop with tighter height
      await repair.scrollIntoViewIfNeeded();
      await page.waitForTimeout(200);
      const pos = await repair.evaluate(el => {
        const rect = el.getBoundingClientRect();
        return { x: rect.x + window.scrollX, y: rect.y + window.scrollY };
      });
      await page.screenshot({
        path: path.join(DIR, 'feature-scheduled-repair.png'),
        fullPage: true,
        clip: { x: 0, y: Math.max(0, pos.y - 20), width: 1080, height: 180 },
      });
      console.log('  ok feature-scheduled-repair (fallback)');
    }
  } else {
    console.log('  skip scheduled-repair (not visible)');
  }

  await ctx.close();

  // ── Dark mode feature shots ──
  console.log('\n── Dark mode features ──');
  const darkCtx = await browser.newContext({
    viewport: DESKTOP,
    deviceScaleFactor: SCALE,
    colorScheme: 'dark',
  });
  const darkPage = await darkCtx.newPage();
  await darkPage.addInitScript(() => {
    localStorage.setItem('hc_theme_preference', 'dark');
    localStorage.setItem('hc_ui_skin', 'ocean');
  });

  // Timeline dark
  await darkPage.goto(BASE, { waitUntil: 'networkidle' });
  await darkPage.waitForTimeout(500);
  await darkPage.click('text=Timeline');
  await darkPage.waitForTimeout(1500);
  await darkPage.screenshot({
    path: path.join(DIR, 'feature-timeline-dark.png'),
    fullPage: true,
    clip: { x: 0, y: 0, width: 1080, height: 1220 },
  });
  console.log('  ok feature-timeline-dark');

  // Accessories dark
  await darkPage.click('text=Accessories');
  await darkPage.waitForTimeout(1500);
  await darkPage.screenshot({
    path: path.join(DIR, 'feature-accessories-dark.png'),
    fullPage: true,
    clip: { x: 0, y: 0, width: 1080, height: 1220 },
  });
  console.log('  ok feature-accessories-dark');

  // Manage dark
  await darkPage.click('text=Manage');
  await darkPage.waitForTimeout(1500);
  await darkPage.screenshot({
    path: path.join(DIR, 'feature-manage-dark.png'),
    fullPage: true,
    clip: { x: 0, y: 0, width: 1080, height: 1220 },
  });
  console.log('  ok feature-manage-dark');

  await darkCtx.close();

  // ── Mobile (PWA) ──
  console.log('\n── Mobile feature screenshots ──');

  // Mobile Timeline
  const mCtx = await browser.newContext({
    viewport: { width: 393, height: 852 },
    deviceScaleFactor: 2,
    colorScheme: 'light',
    isMobile: true,
  });
  const mPage = await mCtx.newPage();
  await mPage.addInitScript(() => {
    localStorage.setItem('hc_theme_preference', 'light');
    localStorage.setItem('hc_ui_skin', 'ocean');
  });
  await mPage.goto(BASE, { waitUntil: 'networkidle' });
  await mPage.waitForTimeout(500);
  await mPage.click('text=Timeline');
  await mPage.waitForTimeout(1500);
  await mPage.screenshot({
    path: path.join(DIR, 'mobile-timeline.png'),
    fullPage: true,
    clip: { x: 0, y: 0, width: 393, height: 852 },
  });
  console.log('  ok mobile-timeline');

  await mPage.click('text=Accessories');
  await mPage.waitForTimeout(1500);
  await mPage.screenshot({
    path: path.join(DIR, 'mobile-accessories.png'),
    fullPage: true,
    clip: { x: 0, y: 0, width: 393, height: 852 },
  });
  console.log('  ok mobile-accessories');

  await mCtx.close();

  await browser.close();
  console.log('\nAll showcase screenshots captured!');
}

main().catch((err) => {
  console.error('Failed:', err);
  process.exit(1);
});
