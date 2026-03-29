# Toast Display Settings

## Overview

Add user-configurable toast position, duration, and max visible count to the existing toast notification system. Extends the Notifications section in Settings with a grouped box of three dropdowns.

## New fields in retention.json

| Field | Type | Default | Valid values |
|-------|------|---------|-------------|
| `toastPosition` | string | `"bottom-right"` | `"bottom-right"`, `"top-right"`, `"bottom-left"`, `"top-left"` |
| `toastDuration` | number | `3` | `2`, `3`, `5`, `7` |
| `toastMaxVisible` | number | `3` | `1`, `2`, `3`, `5` |

### Validation rules (PATCH /api/setup/retention)

- `toastPosition`: must be one of the four valid strings
- `toastDuration`: must be one of `[2, 3, 5, 7]`
- `toastMaxVisible`: must be one of `[1, 2, 3, 5]`

## Backend changes

Five touchpoints in `listener/src/index.js` (same pattern as the existing toast fields):

1. `retentionStore` defaults — add `toastPosition: 'bottom-right'`, `toastDuration: 3`, `toastMaxVisible: 3`
2. `normalizeRetentionSettings()` — validate and normalize the three new fields
3. `GET /api/setup/retention` response — include the three new fields
4. `PATCH /api/setup/retention` validation — reject invalid values
5. `PATCH /api/setup/retention` response — include the three new fields

## Settings UI

In `SettingsTab.jsx`, within the existing Notifications section, below the two toggles and hint text, add three inline `<select>` rows. Follow the same layout pattern as the Quiet Hours start/end selectors — flex rows with a text label on the left and a `<select>` on the right, no bordered wrapper.

The box contains three rows:
- **Position** — `<select>` with options: Bottom Right, Top Right, Bottom Left, Top Left
- **Duration** — `<select>` with options: 2s, 3s, 5s, 7s
- **Max visible** — `<select>` with options: 1, 2, 3, 5

The three selects are dimmed (`opacity-50 pointer-events-none`) when `toastsEnabled` is false.

New local state in SettingsTab:
- `toastPositionInput` (synced from retentionConfig)
- `toastDurationInput` (synced from retentionConfig)
- `toastMaxVisibleInput` (synced from retentionConfig)

All three are included in `isDirty` computation and `handleSaveSettings`.

## Toast component changes

### Position

`ToastProvider` currently hardcodes `fixed bottom-4 right-4`. Replace with dynamic positioning based on a `position` value read from retention config.

Position CSS mapping:
- `bottom-right`: `bottom-4 right-4` (current)
- `top-right`: `top-4 right-4`
- `bottom-left`: `bottom-4 left-4`
- `top-left`: `top-4 left-4`

### Animation direction

The current entrance animation (`animate-slide-in-right`) and exit animation (`translate-x-4`) assume right-side positioning. For left positions, mirror the animations:
- Right positions: enter from right (`translateX(1rem)` → `0`), exit to right (`translate-x-4`)
- Left positions: enter from left (`translateX(-1rem)` → `0`), exit to left (`-translate-x-4`)

Add a `animate-slide-in-left` keyframe in CSS (mirror of `slide-in-right`) and select the appropriate animation class based on position.

### PWA standalone offset

The `hc-standalone:bottom-24` class currently adjusts bottom positioning for standalone PWA mode. Apply this only for bottom positions. For top positions, no standalone offset is needed (the status bar is at the top but doesn't overlap the content area).

Since `ToastProvider` should stay generic (no data-fetching), pass position/duration/maxVisible as props from `main.jsx` or read them via a thin wrapper. The simplest approach: add a `ToastSettingsProvider` wrapper in `App.jsx` that reads retention config and passes settings down to `ToastProvider` via props.

Actually, simpler: `ToastProvider` already wraps the app in `main.jsx` where retention config isn't available. Instead, make Toast render position/duration/maxVisible from a `useToastSettings` hook that reads from a React context set by the app. Or simplest of all: have `App.jsx` call a `useToast().configure({ position, duration, maxVisible })` method that updates internal state in the provider.

**Chosen approach:** Add a `configure(settings)` method to the toast context value (changing shape from `{ addToast, dismiss }` to `{ addToast, dismiss, configure }`). `App.jsx` calls it via a useEffect when retentionConfig changes. Toast component reads the configured values from internal state. `configure()` must be idempotent — only update state when values actually change (compare before setting) to avoid unnecessary re-renders. This keeps ToastProvider generic and avoids restructuring the provider hierarchy.

### Max visible

Replace the hardcoded `MAX_VISIBLE = 3` with the configured value from `configure()`. Default remains 3 if not configured.

### Duration

The `addToast(message, type, duration)` call already accepts an optional duration parameter in milliseconds. The configured `toastDuration` is stored in seconds (2, 3, 5, 7). When no explicit duration is passed to `addToast`, multiply the configured value by 1000 to get milliseconds (e.g., `3` → `3000ms`). Callers that pass an explicit duration override the configured default.

## Files to modify

### Backend
- `listener/src/index.js` — Five touchpoints for three new fields

### Frontend
- `web/src/components/Toast.jsx` — Add `configure()` method, dynamic position classes, configurable max-visible and default duration
- `web/src/components/setup/SettingsTab.jsx` — Add three dropdowns in a grouped box within Notifications section
- `web/src/App.jsx` — Call `configure()` when retentionConfig changes

## Out of scope

- Custom position coordinates (only 4 corners)
- Per-toast-type duration overrides
- Animation customization
