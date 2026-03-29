# Toast Notifications & Live Event Toasts

## Overview

Add configurable toast notifications to HomeChronicle. Two main capabilities:

1. **Action toasts** — feedback for user-initiated actions (save, delete, wipe)
2. **Live event toasts** — ambient awareness of accessory events when not on the Timeline tab

## Settings

All settings are server-side, stored in `retention.json` via the existing `/api/setup/retention` endpoint.

### New fields in retention.json

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `toastsEnabled` | boolean | `true` | Master kill switch for all toasts |
| `liveEventToastsEnabled` | boolean | `false` | Enable live event polling + toasts |
| `toastAccessories` | string[] | `[]` | Accessory IDs that trigger live event toasts |

### Validation rules (PATCH /api/setup/retention)

- `toastsEnabled`: boolean
- `liveEventToastsEnabled`: boolean
- `toastAccessories`: array of strings

## Settings UI

### Settings tab — new "Notifications" section

Placed between the existing "Timeline" and "Advanced" sections:

- **Enable toast notifications** — toggle for `toastsEnabled`
- **Live event toasts** — toggle for `liveEventToastsEnabled` (disabled if master is off)
- Brief description: "Show a popup when selected accessories report events. Only appears when you're not on the Timeline tab."
- When live event toasts are enabled but `toastAccessories` is empty, show a hint: "Select accessories to watch on the My Devices tab."

### My Devices tab — per-accessory bell toggle

- A bell icon button on each accessory row
- Toggling adds/removes the accessory ID from `toastAccessories` via `saveRetentionMutation`
- Bell toggles do NOT trigger a "Settings saved" toast (silent save)
- Only visible when `liveEventToastsEnabled` is true
- Filled bell = subscribed, outline bell = not subscribed

## Action Toasts

Wire `addToast` into existing flows:

| Action | Toast message | Type |
|--------|--------------|------|
| Settings saved | "Settings saved" | success |
| Accessory deleted | "Accessory deleted" | success |
| All data wiped | "All data wiped" | success |
| Room assigned/updated | "Room saved" | success |
| Display name saved | "Name saved" | success |

Action toasts are always shown when `toastsEnabled` is true. No per-action configuration.

## Live Event Toasts

### Polling mechanism

- New hook: `useLiveEventToasts`
- Polls `/api/events?from=<ISO timestamp>&limit=20` every 5 seconds using the existing `from` query parameter on the events endpoint
- Deduplicates by event `id` to avoid showing the same event twice (the `from` param is inclusive, so the last-seen timestamp will return the boundary event again)
- Initializes its timestamp to "now" on mount — no historical catch-up on page load, no persistence needed
- Only active when:
  - `toastsEnabled` is true
  - `liveEventToastsEnabled` is true
  - `toastAccessories` has at least one entry
  - The current tab is NOT Timeline
  - Retention settings have finished loading (treat `undefined`/loading config as disabled)
- On each poll, filters events to only those from accessories in `toastAccessories`
- `activeTab` is passed as a parameter to the hook from `App.jsx` (where tab state lives)

### Toast content

Format: `"{accessory name} — {characteristic}: {value}"`

Examples:
- "Front Door — Contact: Open"
- "Living Room — Motion: Detected"
- "Garage — Lock: Unlocked"

Type: `info`

### Display constraints

- Max 3 visible toasts at a time (hardcoded)
- Oldest auto-dismissed when a 4th arrives
- Standard 3-second auto-dismiss

## Toast component changes

### Max visible limit

Add a max-visible cap to `ToastProvider`. When a new toast would exceed the limit, dismiss the oldest before adding.

### Master toggle

Rather than coupling `ToastProvider` to TanStack Query, keep it generic. The `useLiveEventToasts` hook checks `toastsEnabled` before calling `addToast`. Action toast call sites also check `toastsEnabled` before firing. `ToastProvider` itself remains a pure React context with no data-fetching dependencies.

### Info icon

Add an `Info` icon from lucide-react for the `info` toast type, matching the existing `CheckCircle2` (success) and `AlertCircle` (error) pattern.

## Files to modify

### Listener (backend)
- `listener/src/index.js` — Five specific touchpoints:
  1. `retentionStore` default object — add `toastsEnabled: true`, `liveEventToastsEnabled: false`, `toastAccessories: []`
  2. `normalizeRetentionSettings()` — include the three new fields in the returned object
  3. `GET /api/setup/retention` response — include the three new fields
  4. `PATCH /api/setup/retention` validation — add type checks for the three new fields
  5. `PATCH /api/setup/retention` response — include the three new fields

### Web (frontend)
- `web/src/components/Toast.jsx` — Add max-visible logic, add `Info` icon for info type
- `web/src/components/setup/SettingsTab.jsx` — Add Notifications section with two toggles and empty-state hint
- `web/src/components/setup/MyDevicesTab.jsx` — Add bell toggle per accessory row (silent save, no toast)
- `web/src/hooks/useSetup.js` — Add state for new settings fields
- `web/src/hooks/useLiveEventToasts.js` — New hook: polling, dedup by event ID, active-tab gating
- `web/src/App.jsx` — Mount `useLiveEventToasts` at app level, pass `activeTab` to hook

## Out of scope

- Toast position, duration, or max-visible as user settings (hardcoded defaults)
- Error toasts (errors remain inline)
- Sound/vibration
- Browser push notifications
- WebSocket/SSE transport
- Timestamp persistence across page reloads (initializes to "now")
