# My Accessories — Bulk Actions Design

**Date:** 2026-03-27

## Summary

Add three controls to the top of the My Accessories tab (MyDevicesTab):
1. **Repair All** — bulk repair pairing for all HomeKit devices
2. **Live Toasts toggle** — enable/disable live event toasts
3. **Remove All Pairings** — delete all HomeKit + Matter pairings with double confirmation

## 1. Repair All

### Behavior
- Button at top of My Accessories tab, labeled "Repair All"
- Wrench icon, consistent with per-device repair button
- On click: sequentially calls `POST /api/setup/repair/:deviceId` for each paired HomeKit device
- Calls repair without a PIN (the endpoint works for devices with stored pairings, which is the common case)
- Shows inline progress: "Repairing 3/7..." with per-device results
- Results displayed as a summary after completion: "5 OK, 1 skipped, 1 failed" with device names for non-OK results
- Devices that fail with `NO_PIN` or `WRONG_PIN` are counted as "skipped" — user can repair those individually via the per-device wrench button
- Other errors (network, timeout) are counted as "failed"
- Always continues through all devices (best-effort), never stops on failure
- Button disabled while repair is in progress
- Matter devices are excluded (they don't use HAP add-pairing)
- Toast on completion: success or error summary
- Query invalidation (`pairings`, `accessories`, `health`) runs once after all devices complete, not per-device

### UI States
- **Idle:** `[Wrench] Repair All`
- **In progress:** `Repairing 3/7...` (disabled, spinner)
- **Complete:** Summary shown for 5 seconds, then returns to idle. Summary lists device names for any skipped/failed.

### No backend changes needed
Reuses existing `POST /api/setup/repair/:deviceId` endpoint called per device.

## 2. Live Toasts Toggle

### Behavior
- Toggle switch at top of My Accessories tab
- Label: "Live Toasts" with Bell icon
- Toggles `liveEventToastsEnabled` via `saveRetentionMutation`
- When toggled on, per-accessory bell icons appear on each device row (existing behavior)
- When toggled off, per-accessory bell icons hide (existing behavior)
- Toast confirmation on toggle: "Live toasts enabled" / "Live toasts disabled"

### Relationship with SettingsTab
SettingsTab already has a `liveEventToastsEnabled` toggle. Both controls write to the same retention config via `saveRetentionMutation`. TanStack Query cache invalidation ensures both stay in sync automatically — toggling in one place is immediately reflected in the other.

### No backend changes needed
Reuses existing `PATCH /api/setup/retention` with `{ liveEventToastsEnabled: bool }`.

## 3. Remove All Pairings

### Behavior
- Button at top of My Accessories tab, labeled "Remove All Pairings"
- Red/danger styling, Trash2 icon
- **Double confirmation flow:**
  1. Click button → inline confirmation panel expands: "This will remove all HomeKit and Matter pairings. Event data will NOT be deleted. Type DELETE to confirm."
  2. Text input must contain exactly "DELETE" (case-sensitive) to enable the confirm button
  3. Confirm button click → sequentially removes all pairings
- Calls `DELETE /api/setup/pairing/:deviceId` for each HomeKit device
- Calls `DELETE /api/setup/matter/pairing/:nodeId` for each Matter device
- Shows progress: "Removing 3/7..." where denominator is `paired.length + matterPairings.length`
- Always continues through all devices (best-effort) — does not stop on individual failure
- On completion: toast summary showing success/failure counts, queries invalidated so remaining devices (if any failed) are visible
- Cancel button dismisses the confirmation panel (only available before confirming, not during removal)

### No backend changes needed
Reuses existing per-device delete endpoints.

## Layout

All three controls appear in a horizontal toolbar row between the accessory count label and the device list:

```
12 accessories

[Wrench] Repair All    [Bell toggle] Live Toasts    [Trash] Remove All Pairings

┌─────────────────────────────────────────┐
│ Device 1...                             │
│ Device 2...                             │
└─────────────────────────────────────────┘
```

- Repair All and Live Toasts toggle on the left
- Remove All Pairings on the right (danger zone separation)
- On narrow screens, toolbar wraps naturally (flex-wrap)
- Toolbar only shows when there are paired devices (already gated by existing early return)

## Implementation

### Files to modify
- `web/src/components/setup/MyDevicesTab.jsx` — add toolbar with three controls, state management for repair-all and remove-all flows
- `web/src/hooks/useSetup.js` — expose `repairPairingMutation` and `deletePairingMutation`/`deleteMatterPairingMutation` (already exported)

### No new files needed
All logic fits within MyDevicesTab using existing mutations from useSetup.

## Testing

- Unit tests for repair-all sequential logic (mock mutations)
- Verify remove-all requires exact "DELETE" text
- Verify live toasts toggle updates retentionConfig
- Both light and dark mode visual verification
