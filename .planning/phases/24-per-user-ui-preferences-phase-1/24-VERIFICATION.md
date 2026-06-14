---
phase: 24-per-user-ui-preferences-phase-1
status: passed
verified_by: orchestrator (inline — gsd-verifier subagent died early before writing output)
date: 2026-06-14
requirements: [PREF-01, PREF-02, PREF-03, PREF-04, PREF-05, PREF-06, PREF-07, PREF-08, PREF-09, PREF-10, PREF-11]
tests: { listener: "0 failures", web: "45 files / 328 tests pass" }
plans_complete: [24-01, 24-02, 24-03, 24-04, 24-05, 24-06, 24-07]
---

# Phase 24 — Verification (Per-User UI Preferences, Phase 1)

**Verdict: PASSED.** Goal achieved — personal UI preferences are server-backed per logged-in
account, infrastructure settings remain household-shared, anon/`AUTH_ENABLED=false` path is
unchanged pure-localStorage. Verified against the live codebase, not just SUMMARY claims.

## Requirement traceability (all accounted for)

| Req | Status | Evidence (source) |
|-----|--------|-------------------|
| PREF-01 | ✅ | `listener/migrations/0007_user_preferences.sql` — `user_id BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE`, `prefs JSONB NOT NULL DEFAULT '{}'`, `updated_at`; additive, clean up/down. Source-inspection test green. |
| PREF-02 | ✅ | `me-router.js` `createMeRouter` exposes GET + PUT `/preferences`; GET returns `{prefs:{}}` when no row; PUT upserts (whole-blob replace) and returns stored blob. Mounted `app.use('/api/me', createMeRouter({pool}))` (index.js:659, after global gate + CSRF). |
| PREF-03 | ✅ | `me-router.js` — 401 when no `req.hcSession.user_id`; 400 on non-object `prefs`; 256 KB (`MAX_PREFS_BYTES`) cap. Integration tests cover each. |
| PREF-04 | ✅ | `usePreference.js` — authed value resolves from server blob (type-guarded), setter PUTs via shared provider + mirrors localStorage. |
| PREF-05 | ✅ | Anon/logged-out path: provider query `enabled:!!user?.id` + safe no-provider context default + `usePreference`'s `if(user)` setter guard → zero server calls. Dedicated tests assert `fetchJson` not called when `user===null`. |
| PREF-06 | ✅ | `useDashboardLayout.js` routes layout + hidden panels through `usePreference`. |
| PREF-07 | ✅ | `DashboardPage.jsx` (global range + sync toggle) and `RoomChart`/`TrendChart`/`WeekdayHeatmap`/`TopDevices` (`*_days`) route through `usePreference`. |
| PREF-08 | ✅ | `useTheme.js` + `useAccent.js` + sidebar-collapsed (App.jsx) route through `usePreference`. **useSkin disposition:** no standalone `useSkin` hook exists — skin was consolidated into accent; `useAccent` reads legacy `hc_ui_skin` localStorage as an accent fallback. PREF-08 is satisfied by theme + accent(+legacy skin fallback) + sidebar — covered-by-consolidation, not missing. (Dead `skin` blob key removed in 24-07/IN-02.) |
| PREF-09 | ✅ | `useMutedDevices.js` routes muted-device set through `usePreference`. |
| PREF-10 | ✅ | `SettingsTab.jsx` toast + episode/scene grouping read the per-user blob when authed (`retentionConfig` only on the anon path). |
| PREF-11 | ✅ | `UserPreferencesProvider.seedIfEmpty` (single ref-guarded path) invoked once from `App.jsx` with the full localStorage snapshot + shared toast/grouping values; provider mounted in `main.jsx` inside `AuthGate`. |

## Code-review gate outcome (resolved)

The phase code-review gate found a real BLOCKER (`CR-01`, `24-REVIEW.md`): per-instance debounce
buffers fired racing whole-blob PUTs that silently dropped keys cross-device. Closed in gap plan
**24-07** by lifting query/debounce/seeding into a single `UserPreferencesProvider`. A focused
second-review pass (`24-REVIEW-FIX.md`) caught an across-window variant of the same race (concurrent
PUTs under the server's last-writer-wins replace) — fixed by serializing flushes + sequence-guarding
the cache echo, plus WR-01 (unhandled-rejection) and WR-02 (unmount timer cleanup). Both have
dedicated regression tests (cross-instance coalescing + across-window serialization).

## Test evidence
- `cd listener && npm test` → 0 failures.
- `cd web && npm test` → 45 files / 328 tests pass (includes the cross-instance + across-window
  regression tests and the unrelated Settings tab reorder).

## Notes
- No listener/stats computation changes (per goal). Per-user quiet hours remain deferred to Phase 25.
- gsd-verifier, gsd-executor (24-04 first attempt), and the 24-07 fixer subagents each died early
  this run; orchestrator handled the 24-04 checkpoint decision, performed the 24-07 fix inline, and
  wrote this verification inline. All work is committed and test-backed.
