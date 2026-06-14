# Phase 25: Per-User Quiet Hours (Phase 2) - Context

**Gathered:** 2026-06-14
**Status:** Ready for planning

<domain>
## Phase Boundary

Make quiet hours **per-user** by building on the Phase 24 per-user preferences blob.
Two deliverables:
1. **Listener:** `GET /api/stats/quiet-hours` (`stats-router.js:338`) applies the **requesting
   session user's** quiet-hours config (enabled/start/end/excluded), read from their
   `user_preferences` JSONB blob, with the shared `retention.json` household config as fallback.
2. **Frontend:** the quiet-hours controls in `SettingsTab` (enabled / start / end / excluded
   accessories) move off the shared `retention.json` reads/writes onto the per-user preference
   blob when authenticated — exactly as Phase 24 did for toast + episode/scene grouping.

**In scope:** session-aware quiet-hours computation in the existing stats endpoint; routing the
SettingsTab quiet-hours controls through the Phase-24 `usePreference` layer.
**Out of scope:** any other stats endpoint; new quiet-hours capabilities (schedules, multiple
windows, notifications); changes to the alerts quiet-period suppression (separate concept).
</domain>

<decisions>
## Implementation Decisions

### Endpoint per-user source (D-25-01)
- **D-25-01:** `GET /api/stats/quiet-hours` reads the **session user's** quiet-hours keys directly
  from the `user_preferences` JSONB blob server-side (an extra query, or a JOIN on `user_id`),
  falling back to the shared `retention.json` config. The endpoint must read `req.hcSession?.user_id`
  (it is currently `(_req, res)` — change to use `req`). Requests with no user session (service
  API_TOKEN, or `AUTH_ENABLED=false`) use the shared config — today's behavior, unchanged. The
  client sends no quiet-hours params; the server stays authoritative.

### Fallback semantics (D-25-02)
- **D-25-02:** **Whole-config fallback.** If the user's blob has NO quiet-hours keys, use the shared
  `retention.json` config entirely; if the blob has them, use the blob's values. This matches how
  SettingsTab writes the four keys as a group and cleanly covers existing Phase-24 users (whose
  blobs are non-empty but have no quiet-hours yet → they transparently keep shared quiet hours).
  Presence test = "does the blob contain the quiet-hours keys" (define the canonical key set during
  planning; at minimum `quietHoursEnabled`).

### Migration of existing users (D-25-03)
- **D-25-03:** **No special seeding.** Phase 24's `seedIfEmpty` only fires when the *whole* blob is
  empty, so existing Phase-24 users (non-empty blobs) would never get quiet-hours seeded — and that
  is fine: the D-25-02 whole-config fallback keeps them on shared quiet hours until they opt in. When
  an authenticated user opens the quiet-hours controls in `SettingsTab`, the form **prefills from the
  effective values** (which resolve to the shared config via the fallback), so the first save writes
  their current setting into their per-user blob. Do NOT extend `seedIfEmpty` for quiet hours.

### Excluded accessories vs muted devices (D-25-04)
- **D-25-04:** Keep **two separate per-user lists**. `quietHoursExcludedAccessories` (excludes an
  accessory from quiet-hours stat flagging) and Phase 24's `mutedDevices` (suppresses toasts) are
  distinct behaviors with their own blob keys — do not unify them.

### Carried forward from Phase 24 (do not re-decide)
- The per-user preference layer exists and is the integration surface: `usePreference` /
  `useUserPreferences` (thin context consumer) / `UserPreferencesProvider` (single shared
  query+debounce+seed owner). Quiet-hours controls route through `usePreference` like toast/grouping.
- `AUTH_ENABLED=false` / logged-out → pure shared/localStorage behavior, byte-for-byte unchanged
  (Phase 24 D-15). The stats endpoint's no-session fallback is the server-side counterpart.
- The blob is whole-replace, last-writer-wins per save; writes are debounced + serialized in the
  provider (Phase 24 + the 24-07 CR-01 fix). Quiet-hours keys join the same blob — no new transport.
- Reuse the existing quiet-hours key names from `retention-router.js`: `quietHoursEnabled`,
  `quietHoursStart`, `quietHoursEnd`, `quietHoursExcludedAccessories`.

### Claude's Discretion
- Exact SQL shape for reading the user's quiet-hours in the stats endpoint (separate
  `SELECT prefs FROM user_preferences WHERE user_id=$1` vs a JOIN/CTE in the existing aggregation
  query) — planner/executor choose; both acceptable as long as one round-trip and parameterized.
- The canonical "has quiet-hours config" presence predicate (e.g. `quietHoursEnabled` present, or any
  of the four keys present) — define during planning; must be consistent between endpoint + UI.
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Spec & prior context
- `docs/superpowers/specs/2026-06-13-per-user-preferences-design.md` — the design spec; see the
  "Deferred to Phase 2" (quiet hours) note and the Architecture/Frontend sections.
- `.planning/phases/24-per-user-ui-preferences-phase-1/24-CONTEXT.md` — Phase 24 decisions D-01..D-18
  (blob, me-router, preference layer, seeding, AUTH_ENABLED=false invariants).
- `.planning/phases/24-per-user-ui-preferences-phase-1/24-07-SUMMARY.md` — the shared
  `UserPreferencesProvider` design + serialized-PUT semantics that quiet-hours writes inherit.
- `.planning/REQUIREMENTS.md` — requirement registry; Phase 25 quiet-hours requirements to be derived
  during plan-phase (new QH-* IDs; PREF-01..11 are Phase 24, complete).

### Code to change
- `listener/src/stats-router.js` §`GET /stats/quiet-hours` (line ~338) — make session-aware.
- `listener/src/retention-router.js` — shared quiet-hours config shape + key names (fallback source).
- `web/src/components/setup/SettingsTab.jsx` — quiet-hours controls to route through `usePreference`.
- `web/src/hooks/usePreference.js`, `web/src/components/UserPreferencesProvider.jsx` — the layer
  quiet-hours joins (D-12 key inventory in the provider may need the quiet-hours keys for first-paint).
</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `usePreference(key, default, { localStorageKey, serialize?, deserialize? })` — the single per-key
  abstraction; quiet-hours controls become `usePreference` calls (mirror the toast/grouping pattern
  added in 24-06 inside `SettingsTab`, including the authed-vs-`retentionConfig` "effective value"
  selection).
- `UserPreferencesProvider` D12_KEYS inventory — quiet-hours keys may be added so seeding/first-paint
  treat them consistently (though per D-25-03 they are NOT force-seeded).
- `me-router.js` GET/PUT `/api/me/preferences` — the existing read/write path for the blob; no API
  change needed (quiet-hours are just more keys in the same blob).

### Established Patterns
- Stats endpoints use `statsReadLimiter`, `cached()` TTL wrapper, try/catch → 500, and read a shared
  settings getter. The quiet-hours endpoint must now also read per-user state — mind the `cached()`
  wrapper: a per-user result MUST be cache-keyed by `user_id` (or bypass cache) so one user's
  quiet-hours don't leak into another's cached response. **Flag for planning/security.**
- SettingsTab's Phase-24 pattern: `const [blobX] = usePreference('x', default, {...})` then
  `effectiveX = user ? blobX : (retentionConfig?.x ?? default)`.

### Integration Points
- `req.hcSession` (set in `index.js`) carries `user_id` — the stats endpoint reads it (it is gated by
  the session-or-token auth gate already; confirm read endpoints receive `hcSession`).
- Server-side fallback to `retention.json` shared config = the existing settings getter used today.
</code_context>

<specifics>
## Specific Ideas

- The per-user-result caching hazard on the `cached()` stats wrapper is the single highest-risk item
  (cross-user data leak) — call it out explicitly in the plan + security review.
</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope. (Multiple quiet-hours windows, schedule calendars, and
quiet-hours-driven notifications were not raised and remain out of scope / future milestones.)
</deferred>

---

*Phase: 25-per-user-quiet-hours-phase-2*
*Context gathered: 2026-06-14*
