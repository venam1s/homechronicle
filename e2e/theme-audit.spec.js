const { test, expect } = require('playwright/test');

const TABS = [
  { name: 'dashboard', selector: 'button:has-text("Dashboard")' },
  { name: 'timeline', selector: 'button:has-text("Timeline")' },
  { name: 'accessories', selector: 'button:has-text("Accessories")' },
  { name: 'manage', selector: 'button:has-text("Manage")' },
];

const MANAGE_SUBTABS = [
  { name: 'add-accessories', selector: 'button:has-text("Add Accessories")' },
  { name: 'my-accessories', selector: 'button:has-text("My Accessories")' },
  { name: 'settings', selector: 'button:has-text("Settings")' },
];

for (const theme of ['light', 'dark']) {
  test.describe(`Theme: ${theme}`, () => {
    test.beforeEach(async ({ page }) => {
      // Set color scheme preference
      await page.emulateMedia({ colorScheme: theme });
      await page.goto('/');
      // Wait for app to load
      await page.waitForSelector('button:has-text("Dashboard")', { timeout: 5000 });
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

    for (const tab of TABS) {
      test(`${tab.name} tab`, async ({ page }) => {
        await page.click(tab.selector);
        await page.waitForTimeout(500);
        await page.screenshot({
          path: `test-results/theme-audit/${theme}-${tab.name}.png`,
          fullPage: true,
        });
      });
    }

    // Capture manage sub-tabs
    for (const subtab of MANAGE_SUBTABS) {
      test(`manage/${subtab.name}`, async ({ page }) => {
        await page.click('button:has-text("Manage")');
        await page.waitForTimeout(300);
        await page.click(subtab.selector);
        await page.waitForTimeout(500);
        await page.screenshot({
          path: `test-results/theme-audit/${theme}-manage-${subtab.name}.png`,
          fullPage: true,
        });
      });
    }
  });
}
