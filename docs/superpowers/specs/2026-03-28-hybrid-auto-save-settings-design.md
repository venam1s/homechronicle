# Hybrid Auto-Save Settings

**Date:** 2026-03-28
**Status:** Approved

## Problem

The Settings tab requires pressing a sticky "Save settings" button for all changes. As the page grows, this creates friction for simple toggle/select changes and the save button can be hard to discover. Numeric inputs with validation ranges still benefit from explicit save to avoid accidental destructive changes (e.g., setting retention days to 1).

## Design

Split settings into two save behaviors:

### Auto-save settings (on change, toast confirmation)

These are low-risk controls with constrained values (on/off, dropdown selections):

| Setting | Control type |
|---------|-------------|
| Archive before delete | Toggle |
| Auto-scan HomeKit | Toggle |
| Quiet hours enabled | Toggle |
| Quiet hours start | Select (hour picker) |
| Quiet hours end | Select (hour picker) |
| Toasts enabled | Toggle |
| Live event toasts enabled | Toggle |
| Toast position | Select |
| Toast duration | Select (number) |
| Toast max visible | Select (number) |
| Log level | Select |

On change:
1. Update local state immediately (optimistic UI)
2. Call `autoSave()` which debounces 300ms, then calls `saveRetentionMutation.mutateAsync` (or `saveLogLevelMutation` for log level) with the changed field. Only one request is in-flight at a time; if a new change arrives while a request is pending, the pending result is ignored and a fresh request is sent with the latest state.
3. On success: show toast "Setting saved" (skipped when disabling toasts — see edge case below)
4. On error: show error toast; revert local state by reading from the TanStack Query cache (`retentionConfig` / `logLevelConfig`), which is only updated on mutation success

### Manual-save settings (sticky bar)

These are numeric text inputs where typos or partial input could be destructive:

| Setting | Control type | Valid range |
|---------|-------------|-------------|
| Retention days | Number input | 1-3650 |
| Stale threshold hours | Number input | 1-720 |
| Episode window minutes | Number input | 1-30 |
| Scene window seconds | Number input | 1-30 |
| Episode min event count | Number input | 1-20 |

The sticky save bar appears only when these numeric fields are dirty. The `isDirty` calculation narrows to only track these 5 fields.

### Edge cases

**Rapid toggles:** The `autoSave` helper uses a 300ms debounce. Only the final value after the user stops toggling is sent. This prevents request races and lost updates on the server's JSON file store.

**Toasts enabled toggle:** When the user disables toasts, the auto-save applies `configureToasts({ enabled: false })` before attempting to show the confirmation toast, so the toast is naturally suppressed. When enabling, the toast config is applied first so the confirmation toast appears.

**`savePending` and the sticky bar:** Auto-save uses a separate `useRef`-based pending flag so it does not interfere with `savePending` (which gates the manual save button). The manual save button is only disabled by its own mutation state.

**`saveFeedback` state:** Auto-save does not set `saveFeedback`. Only the manual save flow uses it to show the "Saved" indicator on the sticky bar.

## Implementation scope

### Files changed

- `web/src/components/setup/SettingsTab.jsx` — all changes contained here

### Changes

1. **New `autoSave` helper** — debounced (300ms), accepts a partial config object, calls the appropriate mutation, shows toast on success/error, serialized (one in-flight at a time)
2. **Toggle/select onChange handlers** — call `autoSave()` instead of only updating local state
3. **`isDirty` calculation** — narrowed to only the 5 numeric text inputs
4. **Sticky save bar** — unchanged in appearance, just shows less often
5. **`handleSaveSettings`** — narrowed to only save the 5 numeric fields

### Not changed

- No API changes — the existing `saveRetentionMutation` and `saveLogLevelMutation` already accept partial updates
- No new files or components
- No changes to other tabs
