const { test, expect } = require('playwright/test');

// v0.4 masthead pages (desktop width; below 1024px the floating nav replaces it).
const PAGES = ['Dashboard', 'Devices', 'Timeline', 'Alerts', 'Settings'];

const DEVICES_SUBTABS = ['Browse', 'Add Accessories', 'Manage Accessories'];

const slug = (label) => label.toLowerCase().replace(/\s+/g, '-');
const navButton = (page, label) =>
  page.getByRole('navigation', { name: 'Main navigation' }).getByRole('button', { name: label, exact: true });

for (const theme of ['light', 'dark']) {
  test.describe(`Theme: ${theme}`, () => {
    test.beforeEach(async ({ page }) => {
      // Set color scheme preference
      await page.emulateMedia({ colorScheme: theme });
      await page.goto('/');
      // Wait for app to load
      await navButton(page, 'Dashboard').waitFor({ timeout: 5000 });
      // Set theme preference via localStorage
      await page.evaluate((t) => {
        localStorage.setItem('hc_theme_preference', t);
        // Force re-apply
        document.documentElement.dataset.theme = t;
        document.documentElement.classList.toggle('theme-dark', t === 'dark');
        document.documentElement.classList.toggle('theme-light', t === 'light');
        document.documentElement.style.colorScheme = t;
      }, theme);
      // Small wait for theme to apply
      await page.waitForTimeout(300);
    });

    for (const label of PAGES) {
      test(`${slug(label)} page`, async ({ page }) => {
        await navButton(page, label).click();
        await page.waitForTimeout(500);
        await page.screenshot({
          path: `test-results/theme-audit/${theme}-${slug(label)}.png`,
          fullPage: true,
        });
      });
    }

    // Capture Devices sub-tabs
    for (const label of DEVICES_SUBTABS) {
      test(`devices/${slug(label)}`, async ({ page }) => {
        await navButton(page, 'Devices').click();
        await page.waitForTimeout(300);
        await page.getByRole('button', { name: label, exact: true }).click();
        await page.waitForTimeout(500);
        await page.screenshot({
          path: `test-results/theme-audit/${theme}-devices-${slug(label)}.png`,
          fullPage: true,
        });
      });
    }
  });
}
