---
phase: 24-per-user-ui-preferences-phase-1
plan: 07
type: gap_closure
gap_closure: true
status: complete
requirements: [PREF-04, PREF-08, PREF-11]
source: 24-REVIEW.md (CR-01 BLOCKER, WR-01 WARNING, IN-01, IN-02)
key_files:
  created:
    - web/src/components/UserPreferencesProvider.jsx
  modified:
    - web/src/hooks/useUserPreferences.js
    - web/src/hooks/usePreference.js
    - web/src/main.jsx
    - web/src/hooks/useUserPreferences.test.js
    - web/src/hooks/usePreference.test.js
    - web/src/components/setup/SettingsTab.blob.test.jsx
commits:
  - fc22938 fix(24-07): lift useUserPreferences to a shared provider (CR-01) + sidebar codec (WR-01) + drop dead skin blob key (IN-02)
  - e7663b4 test(24-07): cross-instance debounce regression + relocate seeding to provider
  - 58e4d81 fix(24-07): serialize preference PUTs across debounce windows + harden lifecycle (second-review pass)
second_review: 24-REVIEW-FIX.md (across-window CR-01 variant + WR-01 unhandled rejections + WR-02 unmount cleanup — all fixed)
---

# 24-07 — Code-review gap closure (CR-01 / WR-01 / IN-01 / IN-02)

Closes the findings from `24-REVIEW.md` produced by the phase code-review gate.

## CR-01 (BLOCKER) — racing whole-blob PUTs / dual-seeding race → FIXED
**Root cause (confirmed against source):** `usePreference` called `useUserPreferences()` per
instance, and `useUserPreferences` kept its debounce buffer + seed guard in **per-instance**
`useRef`s. Only the React Query cache was shared. So a synced dashboard-range change cascading
across 5–6 chart instances fired 5–6 independent whole-blob last-writer-wins PUTs over unordered
parallel connections — the PUT that arrived last (fewest keys) won server-side → **silent
cross-device data loss**, masked locally by localStorage + the optimistic cache. The
"merge-at-flush prevents concurrent drops" guarantee held only *within* one instance.

**Fix:** Lifted all query/mutation/debounce/seed logic into a single
`UserPreferencesProvider` (mounted in `main.jsx` inside `AuthGate`, wrapping `App`). It owns
ONE shared debounce buffer + ONE seed guard. `useUserPreferences` is now a thin
`useContext` consumer with a **safe no-provider default** (`{ prefs: {}, setPrefsBlob: noop,
seedIfEmpty: noop }`) so anon shells / isolated unit tests degrade to pure-localStorage with
zero server calls (PREF-05/D-15 preserved). All `setPrefsBlob` calls now funnel into one
buffer → one coalesced 500ms PUT carrying every key → no racing PUTs.

The dual-seeding race is closed by removing `usePreference`'s per-key seeding effect:
`seedIfEmpty` (provider-owned, single ref guard, invoked once from `App.jsx`) is now the SOLE
seeding path (folds in IN-01).

## WR-01 (WARNING) — sidebarCollapsed codec mismatch → FIXED
The consumer (`App.jsx`) deserializes `hc_sidebar_collapsed` to a **boolean** (default `false`),
but the blob was seeded with the raw string `'true'`/`'false'` (codec `raw`). The reconciliation
type guard `typeof serverVal !== typeof defaultValue` then rejected string-vs-boolean → the
sidebar pref never synced cross-device. Fixed with a dedicated `bool` codec in the provider's
`D12_KEYS`/`readD12Key` that maps the localStorage `'true'`/`'false'` string → a real boolean for
the blob. Theme/accent stay `raw` (genuinely strings). Legacy localStorage format is unchanged.

## IN-02 + useSkin/PREF-08 disposition → RESOLVED
There is no `useSkin` hook. Skin was consolidated into accent; `useAccent.js` reads the legacy
`hc_ui_skin` localStorage key directly as a one-time accent fallback. The `'skin'` blob key in
`D12_KEYS` was therefore **dead** (no consumer) — removed. **PREF-08 ("useTheme/useSkin/useAccent/
sidebar-collapsed") is satisfied by theme + accent (incl. legacy-skin fallback) + sidebar
coverage — skin is covered-by-consolidation, not missing.**

## Regression test (the test whose absence let CR-01 ship)
Added a cross-instance test in `useUserPreferences.test.js`: two `usePreference` instances under
ONE provider, near-simultaneous `setValue`s with fake timers → asserts **exactly one** PUT whose
body carries **all** keys. RED against the old per-instance design, GREEN after the provider lift.
`seedIfEmpty` once-only/snapshot coverage relocated to the provider's test.

## Second-review pass (24-REVIEW-FIX.md) — across-window race + lifecycle → FIXED
A focused re-review of the fix caught that the provider serialized writes *within* a 500ms
window but ran PUTs concurrently *across* windows — a slow earlier whole-blob PUT could land
after a newer one and, under the server's last-writer-wins replace (`me-router.js`), silently
drop the newer keys (same CR-01 defect class, moved from cross-instance to cross-window). Fixed:
- **Serialize** flushes via `inFlightRef` so the server receives whole-blob replaces in dispatch
  order (each merged body is a superset → ordered delivery converges with no dropped keys).
- **Sequence-guard** the cache echo (`flushSeqRef`) so a stale earlier response can't clobber a
  fresher value.
- **WR-01:** the returned promise always resolves (fire-and-forget callers no longer trigger
  `unhandledrejection` on a failed PUT).
- **WR-02:** the debounce timer is cleared on unmount (no trailing PUT after logout).
Added an across-window serialization regression test (later PUT held until the in-flight one
resolves, then carries all keys).

## Verification
- `cd web && npm test` → 45 files / 327 tests GREEN.
- `cd listener && npm test` → GREEN (0 failures; listener untouched).
- Anon / `AUTH_ENABLED=false`: provider query `enabled:!!user?.id` + safe context default → zero
  server calls when logged out (PREF-05/D-15 intact).
