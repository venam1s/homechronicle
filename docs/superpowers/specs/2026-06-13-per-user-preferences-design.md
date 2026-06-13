# Per-User UI Preferences — Design Spec

**Date:** 2026-06-13
**Status:** Approved (brainstorming) → routing into GSD
**Author:** brainstorming session (havuq + Claude)

## Problem

HomeChronicle is a household, multi-user app (v1.4 auth), but every "dashboard
page" preference is stored in **browser localStorage**, not against the user
account. Consequences today:

- A user who logs in on a second device gets defaults — their layout, theme,
  and ranges do not follow them.
- Two users sharing one browser share (and clobber) each other's layout/theme.
- A few related settings (toast prefs, episode/scene grouping) live in the
  **shared** `retention.json` server config, so they are household-global even
  though they are personal display preferences.

**Goal:** make personal UI preferences follow the logged-in **account** across
devices, while keeping genuine infrastructure settings household-shared.

## Scope

### In scope (per-user)

Currently browser-localStorage → becomes per-user:
- Dashboard grid layout + hidden panels (`hc_dashboard_layouts`, `hc_dashboard_hidden`)
- Dashboard time ranges: global + per-panel + sync toggle (`hc_dashboard_global_days`,
  `hc_dashboard_room_days`, `hc_dashboard_trend_days`, `hc_dashboard_weekday_days`,
  `hc_dashboard_top_devices_days`, `hc_dashboard_sync_ranges`)
- Appearance: theme, skin, accent, sidebar collapsed (`hc_theme_preference`,
  `hc_ui_skin`, `hc_accent`, `hc_sidebar_collapsed`)
- Muted devices (`hc_muted`)

Currently shared `retention.json` (client-applied, no server analysis) → becomes per-user:
- Toast preferences: enabled, live-event toasts, position, duration, max visible
- Episode/scene grouping params: `episodeWindowMinutes`, `sceneWindowSeconds`,
  `episodeMinEventCount`

### Stays household-shared (admin-only, unchanged)

Physically one-per-server / infrastructure:
- Retention cutoff, archive-before-delete, stale accessory threshold
- Log level, Scheduled Repair, alert delivery config (enable/timeout/default quiet)
- HomeKit auto-scan

### Deferred to Phase 2

- **Quiet hours** (enabled / start / end / excluded accessories). Server-coupled:
  the listener computes quiet-hours flagging in `stats-router.js GET /stats/quiet-hours`
  from the shared config. Per-user quiet hours requires that endpoint to apply the
  **requesting session user's** config (shared value as fallback). Out of Phase 1.

## Architecture

A single per-user JSON **preferences blob** in Postgres, read/written as a whole.

### Data model (Phase 1)

New migration `0007_user_preferences.sql` (follows the existing up/down format):

```sql
CREATE TABLE user_preferences (
  user_id    INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  prefs      JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

One row per user; `ON DELETE CASCADE` so removing a user drops their prefs.
Purely additive — no changes to existing tables.

### API (new `me-router.js`, mounted at `/api/me`, session-required)

- `GET /api/me/preferences` → `{ prefs: {...} }` for the session user. No row → `{ prefs: {} }`.
- `PUT /api/me/preferences` → body `{ prefs: {...} }`; upsert that **replaces** the
  blob (the client holds the authoritative merged state). Returns the stored blob.
- Both require an authenticated session. When `AUTH_ENABLED=false`, the router is
  effectively unused (the client never calls it — see Frontend).
- **Guards:** reject bodies whose serialized `prefs` exceeds ~256 KB (abuse cap);
  `prefs` must be a JSON object. Standard try/catch → 400 on validation, 500 on error,
  matching existing router conventions.

### Frontend

- `useUserPreferences()` — TanStack Query `['me','preferences']`, **enabled only when
  authenticated** (`AUTH_ENABLED` and a logged-in session). Exposes the blob plus a
  debounced `setPrefs(partial)` that PUTs the merged blob.
- `usePreference(key, defaultValue, { localStorageKey })` — the single abstraction all
  consumers use:
  - **Authenticated:** value resolves from the server blob; the localStorage value is
    used as the synchronous first-paint cache; writes go to the server (debounced) and
    mirror into localStorage.
  - **Not authenticated / `AUTH_ENABLED=false`:** reads/writes localStorage only — exactly
    today's behavior, untouched.
- **Consumers refactored to go through this layer:** `useDashboardLayout`; dashboard
  ranges in `DashboardPage` and the four chart panels (`RoomChart`, `TopDevices`,
  `TrendChart`, `WeekdayHeatmap`); `useTheme`, `useSkin`, `useAccent`, sidebar-collapsed;
  `useMutedDevices`; and the toast + grouping controls in `SettingsTab` (these stop
  reading/writing the shared `retention.json` config when authenticated).

### Seeding / migration of existing values

On the first authenticated load where the server blob is empty:
- Push the current localStorage snapshot (layout, ranges, theme, skin, accent, sidebar,
  muted) into the blob.
- Seed toast + grouping from the user's current **shared** `retention.json` values, so the
  household setting they have today carries forward as their personal default.

After seeding, the server blob is authoritative; localStorage remains a write-through cache.

## Data flow

1. App boots → applies localStorage-cached theme/skin/layout immediately (no flash).
2. Auth resolves → if authenticated, `useUserPreferences` fetches the blob.
3. Empty blob → seed from localStorage + shared config, PUT once.
4. Subsequent reads come from the blob (cached in React Query + mirrored to localStorage).
5. Any preference change → update blob in cache → debounced `PUT /api/me/preferences`
   → mirror to localStorage.

## Edge cases

- **`AUTH_ENABLED=false`** (single-user installs): no user identity; pure localStorage.
  This path must remain byte-for-byte behaviorally identical to today.
- **Logged out** (e.g., login page): localStorage only (login page theme still works).
- **First paint:** cached theme/skin applied before the blob loads; reconcile after.
- **Multiple devices:** PUT replaces the blob → last-writer-wins per save. Acceptable for
  UI prefs; documented, not solved with merge/CRDT.
- **Blob corruption / unknown keys:** unknown keys ignored by consumers; a malformed blob
  falls back to per-key defaults.

## Testing

- `me-router`: GET returns `{}` when no row; PUT upserts and replaces; auth gate (401
  unauthenticated); size-cap rejection; non-object `prefs` rejection.
- Preference layer: authenticated read/write hits server; anonymous read/write hits
  localStorage; seeding runs exactly once on empty blob; debounce coalesces writes.
- Existing localStorage hook tests preserved and run in the anonymous path.
- Migration up/down applies cleanly against the existing schema.

## Phase breakdown

- **Phase 1 (this spec):** data model + `me-router` + preference layer + consumer
  refactor + seeding + tests. No listener/stats computation changes.
- **Phase 2 (separate spec/phase):** per-user quiet hours — `/stats/quiet-hours` applies
  the requesting session user's quiet-hours config, shared value as fallback; move
  quiet-hours controls in `SettingsTab` into the per-user blob.

## Non-goals

- No per-user **data** isolation (events remain shared household data — unchanged from v1.4).
- No merge/CRDT conflict resolution across devices.
- No change to infrastructure settings' shared/admin-only nature.
