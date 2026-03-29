# Hybrid Auto-Save Settings

**Date:** 2026-03-28
**Status:** Approved

## Problem

The Settings tab requires pressing a sticky "Save settings" button for all changes. As the page grows, this creates friction for simple toggle/select changes and the save button can be hard to discover. Numeric inputs with validation ranges still benefit from explicit save to avoid accidental destructive changes (e.g., setting retention days to 1).

## Design

Split settings into two save behaviors:

### Auto-save settings (immediate on change, toast confirmation)

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
2. Call `saveRetentionMutation.mutateAsync` (or `saveLogLevelMutation` for log level) with the changed field merged into current config
3. On success: show toast "Setting saved"
4. On error: show error toast, revert local state to server value

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

## Implementation scope

### Files changed

- `web/src/components/setup/SettingsTab.jsx` — all changes contained here

### Changes

1. **New `autoSave` helper function** — accepts a partial config object, calls the appropriate mutation, shows toast on success/error
2. **Toggle/select onChange handlers** — call `autoSave()` immediately instead of only updating local state
3. **`isDirty` calculation** — narrowed to only the 5 numeric text inputs
4. **Sticky save bar** — unchanged in appearance, just shows less often
5. **`handleSaveSettings`** — narrowed to only save the 5 numeric fields (plus any auto-save fields that happen to be dirty, for safety)

### Not changed

- No API changes — the existing `saveRetentionMutation` and `saveLogLevelMutation` already accept partial updates
- No new files or components
- No changes to other tabs
