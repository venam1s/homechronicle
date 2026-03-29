const { test, expect } = require('playwright/test');

// Use the preview server's proxy for API calls
const API = 'http://localhost:3001';

test.describe('Toast Notifications', () => {

  test.beforeEach(async ({ page }) => {
    // Reset toast settings to defaults before each test
    await fetch(`${API}/api/setup/retention`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        toastsEnabled: true,
        liveEventToastsEnabled: false,
        toastAccessories: [],
      }),
    });
    await page.goto('/');
    // Wait for the app to render
    await page.waitForSelector('.hc-tab-nav', { timeout: 10000 });
  });

  test('Settings tab shows Notifications section with two toggles', async ({ page }) => {
    // Navigate to Manage tab (the tab button contains text "Manage")
    await page.locator('.hc-tab-btn', { hasText: 'Manage' }).click();

    // Click Settings sub-tab
    await page.getByRole('button', { name: /settings/i }).click();

    // Verify Notifications heading exists
    await expect(page.getByText('Notifications', { exact: true })).toBeVisible();

    // Verify both checkboxes exist with their labels
    const toastsToggle = page.getByLabel('Enable toast notifications');
    const liveToggle = page.getByLabel('Live event toasts');

    await expect(toastsToggle).toBeVisible();
    await expect(toastsToggle).toBeChecked(); // default: true

    await expect(liveToggle).toBeVisible();
    await expect(liveToggle).not.toBeChecked(); // default: false
  });

  test('Live event toasts toggle is disabled when master toast is off', async ({ page }) => {
    await page.locator('.hc-tab-btn', { hasText: 'Manage' }).click();
    await page.getByRole('button', { name: /settings/i }).click();

    const toastsToggle = page.getByLabel('Enable toast notifications');
    const liveToggle = page.getByLabel('Live event toasts');

    // Uncheck master toggle
    await toastsToggle.uncheck();

    // Live toggle should be disabled
    await expect(liveToggle).toBeDisabled();
  });

  test('Saving settings shows "Settings saved" toast', async ({ page }) => {
    await page.locator('.hc-tab-btn', { hasText: 'Manage' }).click();
    await page.getByRole('button', { name: /settings/i }).click();

    // Wait for settings to load
    await page.waitForTimeout(1000);

    // Change a setting to make form dirty — toggle something off and back
    const toastsToggle = page.getByLabel('Enable toast notifications');
    await toastsToggle.uncheck();
    await toastsToggle.check();

    // The form should not be dirty since we toggled back. Try changing retention days.
    const retentionInput = page.locator('input[type="number"]').first();
    const currentVal = await retentionInput.inputValue();
    const newVal = currentVal === '30' ? '31' : '30';
    await retentionInput.fill(newVal);

    // Click save button
    await page.getByRole('button', { name: /save/i }).click();

    // Toast should appear
    await expect(page.getByText('Settings saved')).toBeVisible({ timeout: 5000 });
  });

  test('Settings saved toast disappears after ~3 seconds', async ({ page }) => {
    await page.locator('.hc-tab-btn', { hasText: 'Manage' }).click();
    await page.getByRole('button', { name: /settings/i }).click();
    await page.waitForTimeout(1000);

    const retentionInput = page.locator('input[type="number"]').first();
    const currentVal = await retentionInput.inputValue();
    const newVal = currentVal === '30' ? '31' : '30';
    await retentionInput.fill(newVal);

    await page.getByRole('button', { name: /save/i }).click();
    await expect(page.getByText('Settings saved')).toBeVisible({ timeout: 5000 });

    // Wait for auto-dismiss (3s + 300ms animation + buffer)
    await expect(page.getByText('Settings saved')).not.toBeVisible({ timeout: 6000 });
  });

  test('No toast when master toast is disabled', async ({ page }) => {
    // Disable toasts via API
    await fetch(`${API}/api/setup/retention`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ toastsEnabled: false }),
    });

    await page.reload();
    await page.waitForSelector('.hc-tab-nav', { timeout: 10000 });

    await page.locator('.hc-tab-btn', { hasText: 'Manage' }).click();
    await page.getByRole('button', { name: /settings/i }).click();
    await page.waitForTimeout(1000);

    // Change a setting to trigger save
    const retentionInput = page.locator('input[type="number"]').first();
    const currentVal = await retentionInput.inputValue();
    const newVal = currentVal === '60' ? '61' : '60';
    await retentionInput.fill(newVal);

    await page.getByRole('button', { name: /save/i }).click();

    // Wait and verify no toast appeared
    await page.waitForTimeout(2000);
    await expect(page.getByText('Settings saved')).not.toBeVisible();
  });

  test('Empty-state hint shows when live toasts enabled but no accessories selected', async ({ page }) => {
    // Enable live event toasts via API with empty accessories
    await fetch(`${API}/api/setup/retention`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ liveEventToastsEnabled: true, toastAccessories: [] }),
    });

    await page.reload();
    await page.waitForSelector('.hc-tab-nav', { timeout: 10000 });

    await page.locator('.hc-tab-btn', { hasText: 'Manage' }).click();
    await page.getByRole('button', { name: /settings/i }).click();
    await page.waitForTimeout(1000);

    // The live toggle should be checked
    const liveToggle = page.getByLabel('Live event toasts');
    await expect(liveToggle).toBeChecked();

    // Hint should be visible
    await expect(page.getByText('Select accessories to watch on the My Devices tab')).toBeVisible();
  });

  test('GET /api/setup/retention returns toast fields', async ({ request }) => {
    const res = await request.get(`${API}/api/setup/retention`);
    expect(res.ok()).toBeTruthy();
    const data = await res.json();
    expect(data).toHaveProperty('toastsEnabled', true);
    expect(data).toHaveProperty('liveEventToastsEnabled', false);
    expect(data).toHaveProperty('toastAccessories');
    expect(Array.isArray(data.toastAccessories)).toBeTruthy();
  });

  test('PATCH /api/setup/retention accepts toast fields', async ({ request }) => {
    const res = await request.patch(`${API}/api/setup/retention`, {
      data: {
        toastsEnabled: false,
        liveEventToastsEnabled: true,
        toastAccessories: ['test-acc-1', 'test-acc-2'],
      },
    });
    expect(res.ok()).toBeTruthy();
    const data = await res.json();
    expect(data.toastsEnabled).toBe(false);
    expect(data.liveEventToastsEnabled).toBe(true);
    expect(data.toastAccessories).toEqual(['test-acc-1', 'test-acc-2']);
  });

  test('PATCH /api/setup/retention rejects invalid toast fields', async ({ request }) => {
    const res = await request.patch(`${API}/api/setup/retention`, {
      data: { toastsEnabled: 'not-boolean' },
    });
    expect(res.status()).toBe(400);
  });
});
