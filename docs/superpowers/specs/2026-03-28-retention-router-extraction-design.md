# Retention Router Extraction

**Date:** 2026-03-28
**Status:** Approved

## Problem

`listener/test/toast-settings.test.js` has 6 tests that make HTTP requests to `localhost:3001`. They fail without a running server, breaking `npm test` (130/136 pass, 6 fail).

## Solution

Extract retention route handlers from `listener/src/index.js` into `listener/src/retention-router.js`, following the existing `createAlertsRouter` pattern. Rewrite tests to use mock req/res.

## New File: `listener/src/retention-router.js`

- `export function createRetentionRouter({ getSettings, saveSettings })` — factory that returns an Express router with:
  - `GET /retention` — returns current settings
  - `PATCH /retention` — validates input, merges with current, saves, returns updated
- `export function normalizeRetentionSettings(input)` — pure validation/normalization function (moved from index.js)
- Constants: `RETENTION_DAYS_DEFAULT`, `STALE_THRESHOLD_HOURS_DEFAULT`, valid position/duration/maxVisible arrays

## Changes to `listener/src/index.js`

- Import `createRetentionRouter` and `normalizeRetentionSettings` from `./retention-router.js`
- Remove `normalizeRetentionSettings` function definition
- Remove inline `app.get('/api/setup/retention', ...)` and `app.patch('/api/setup/retention', ...)`
- Add `app.use('/api/setup', createRetentionRouter({ getSettings: loadRetentionSettings, saveSettings: saveRetentionSettings }))`
- All other retention-related code (store, loadRetentionSettings, saveRetentionSettings, retentionSettings variable) stays in index.js

## Rewritten: `listener/test/toast-settings.test.js`

- Import `createRetentionRouter` and `normalizeRetentionSettings`
- Use `getRouteHandler(router, method, path)` + mock `req/res` pattern (same as `alerts-router.integration.test.js`)
- Test cases:
  - `normalizeRetentionSettings` defaults for toast fields
  - `normalizeRetentionSettings` preserves valid toast values
  - GET handler returns settings from `getSettings`
  - PATCH handler accepts valid `toastsEnabled` boolean
  - PATCH handler rejects non-boolean `toastsEnabled`
  - PATCH handler accepts valid `liveEventToastsEnabled` boolean
  - PATCH handler accepts valid `toastAccessories` array
  - PATCH handler rejects non-array `toastAccessories`
  - PATCH handler accepts valid `toastPosition`, `toastDuration`, `toastMaxVisible`
  - PATCH handler rejects invalid values for position/duration/maxVisible

## No Breaking Changes

- `normalizeRetentionSettings` has no external callers outside index.js
- Route paths unchanged (mounted at same `/api/setup` prefix)
- Response shapes unchanged
