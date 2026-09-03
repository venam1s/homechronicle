---
review: release-readiness
reviewed: 2026-04-27
diff_base: f2083ab
diff_head: HEAD
branch: ui-redesign
files_reviewed: 20
files_reviewed_list:
  - listener/src/accessories-router.js
  - listener/src/device-health.js
  - listener/src/index.js
  - listener/src/repair-helpers.js
  - listener/src/repair-scheduler.js
  - listener/src/setup-helpers.js
  - listener/src/subscriber.js
  - web/src/App.jsx
  - web/src/components/ActivityFeed.jsx
  - web/src/components/EpisodeGroup.jsx
  - web/src/components/EventRow.jsx
  - web/src/components/KpiCards.jsx
  - web/src/components/KpiCards.test.jsx
  - web/src/components/SceneGroup.jsx
  - web/src/components/Sidebar.jsx
  - web/src/components/Timeline.jsx
  - web/src/components/TopDevices.jsx
  - web/src/lib/roomColors.js
  - web/src/pages/DashboardPage.jsx
  - web/src/pages/DevicesPage.jsx
findings:
  critical: 0
  high: 3
  medium: 2
  low: 5
  total: 10
status: issues_found
---

# Release Review: f2083ab..HEAD (`ui-redesign`)

**Scope:** v1.3 Repair Reliability Fixes (Phases 18+19), device-health quick-task fixes (260427-ttq + 260427-vch), and UI tail polish.
**Test posture:** 337/337 listener tests pass on `npm test`. Web tests not run by reviewer (no regression evidence required for vitest changes since KpiCards.test.jsx was rewritten in the same commit).
**Endpoint check:** `/api/setup/alerts` is mounted correctly (`createAlertsSettingsRouter` at `/api/setup`, route `/alerts` — verified in `listener/src/index.js:457` and `alerts-settings-router.js:16`). The new `App.jsx:52` query and feature-flag wiring are valid.

## Summary

The repair-reliability backend work is well-tested and structurally sound — `performPairSetupAndPersist` is cleanly extracted, the scheduler correctly resets stats only on success, and the new `subscriberConnected` / `subscriberLastHealthyAt` plumbing is exercised by 6 new device-health tests. The UI tail polish has three real defects on the dashboard and timeline surfaces: the new "THIS WEEK" KPI sums whatever window the user has selected (not 7 days) while labeling itself "last 7 days"; the new "TOP DEVICE" and "TOP ROOM" KPIs are silently fixed at 7 days regardless of dashboard window with no label indicating so; and the new clickable timeline rows nest a `<button>` inside a `role="button"` div, breaking accessibility semantics. There is also a coherent class of "the rescue is too aggressive" issues (MEDIUM) where `connected: Boolean(session?.client)` is too loose a liveness signal — these collapse to a single fix.

No CRITICAL findings — nothing here will corrupt data or crash the listener. Three HIGH findings require fixes before release.

## HIGH

### H-01: "THIS WEEK" KPI sums the dashboard window, not 7 days
**File:** `web/src/components/KpiCards.jsx:67,98`
**Issue:** `eventsWeek` is computed as `daily?.reduce(...)` over the result of `useDailyStats(dashboardDays)`. `dashboardDays` defaults to 30 (`DashboardPage` line 36) and can be 7/30/90 via the global range toggle. The sub-text hard-codes `'last 7 days'`. So a user on the 30-day window sees the 30-day total under a "last 7 days" caption. The card label "THIS WEEK" is also a lie for 30/90 windows.
**Why it matters:** Misleading dashboard headline metric — users will trust this number and make the wrong call about device activity. The bug is invisible when `dashboardDays === 7` but reproducible immediately after toggling to 30d (which is the persisted default for new sessions).
**Fix:** Either (a) call `useDailyStats(7)` explicitly for the week sum, like the existing `sparkDaily` query does; (b) slice the last 7 entries before reducing; or (c) make the label dynamic to match the window:
```js
// Option (a) — preferred, matches the label
const { data: weekDaily } = useDailyStats(7);
const eventsWeek = weekDaily?.reduce((sum, d) => sum + toInt(d.count), 0) ?? null;
```
The current `KpiCards.test.jsx` Test 2 happens to pass only because `MOCK_DAILY` has 2 rows summing to 28; it does not exercise this bug. Add a test that drives `dashboardDays={30}` with >7 daily rows and asserts week-sum is bounded to 7.

### H-02: Nested interactive elements in `EventRow` break a11y and tab order
**File:** `web/src/components/EventRow.jsx:46-50,63-69,82-90`
**Issue:** The row container now has `role="button"`, `tabIndex={0}`, `onClick`, `onKeyDown`. Inside the row, the accessory name is rendered as a real `<button>` (line 64) and the mute icon is a real `<button>` (line 83). HTML5 forbids nesting interactive content inside `role=button`; ARIA-wise this is an "interactive widget cannot have interactive descendants" violation. Practical consequences:
1. Keyboard tab order now stops on row → name button → mute button (3 stops per row × ~50 rows = ~150 tab stops on a typical timeline view).
2. Screen readers announce both the row and the inner button as "button," which is confusing.
3. `e.stopPropagation()` is correctly called on the inner buttons' clicks, so mouse behavior is fine, but `onKeyDown` on the parent will still capture Space/Enter when focus is on the parent — and Space scrolls the page by default if not preventDefault'd, which the row handler does prevent. So keyboard behavior on the parent is OK; the issue is the focus-stop pollution and screen-reader confusion.
**Why it matters:** Accessibility regression and a noticeably worse keyboard experience for power users. Also a violation of WCAG 2.1 SC 1.3.1 / 4.1.2.
**Fix:** Pick one model and stick with it. Either:
- Make ONLY the row clickable (remove the inner accessory-name `<button>`, render as a span; rely on the row's `onClick` to navigate); OR
- Keep the inner buttons and DON'T make the row clickable (revert lines 42-50 of EventRow.jsx).
The Activity Feed already follows the first model. Recommend: drop the row-level handlers in EventRow.jsx and keep only the inner accessory-name button; add `cursor-pointer` to the inner button and let the row visually highlight on hover via existing `hover:bg-hc-panel-mid`. This restores the v1.2 a11y posture and is consistent with ActivityFeed.

### H-03: TOP DEVICE / TOP ROOM KPIs are fixed at 7 days regardless of dashboard window, with no indication
**File:** `web/src/components/KpiCards.jsx:35-36`
**Issue:** `useTopDevices()` and `useRoomStats(7)` are called with hard-coded 7-day windows. The KPI cards sit alongside TODAY (today only) and "THIS WEEK" (which itself is broken — see H-01) and respond to a global window toggle (`dashboardDays`) that the user can flip to 30 or 90. After a flip:
- TODAY card updates (today is always today)
- "THIS WEEK" updates to the new window total (per H-01)
- TOP DEVICE / TOP ROOM stay frozen on the 7-day winner — and there is no `last 7 days` sub-label on these cards to telegraph that they don't track the toggle.
The values can therefore mislead in the same way H-01 does, just inverted: the value stays the same when the user expects it to change.
**Why it matters:** Same class of bug as H-01 — the dashboard's top-line numbers don't agree on what window they describe. Whichever way you resolve it (track the window or freeze at 7d), the four cards must be coherent.
**Fix:** Product-level decision required:
- (a) **Track the window:** pass `dashboardDays` to both hooks — `useTopDevices(dashboardDays)`, `useRoomStats(dashboardDays)` — and update the sub-text labels to reflect it (e.g. show "events" only, or compute `events / dashboardDays` for a per-day rate). Matches user expectations after a window toggle.
- (b) **Freeze at 7d explicitly:** keep the 7-day calls but add explicit sub-labels — e.g., add a small `(7d)` qualifier to the TOP DEVICE / TOP ROOM card labels, AND fix H-01 to also be 7d. All four cards then read as "today's stats and weekly leaders," independent of the dashboard window.
Pick one and apply consistently across all four KPI cards. Recommend (b) — KPI cards historically describe "now" (online/offline counts in v1.2), not a sliding window, and a 7-day weekly leaderboard is a cleaner mental model than "leader over 90d."

## MEDIUM

### M-01: `subscriberConnected` rescue is gated on a too-loose liveness signal (consolidates connection-setup window + hung-socket + quiet-device-reconnect)
**File:** `listener/src/subscriber.js:670` (`connected: Boolean(session?.client)`), `listener/src/device-health.js:76-79`, `listener/src/subscriber.js:707-725` (`getRepairTargets`)
**Issue:** Three symptoms with the same root cause — `Boolean(session?.client)` is too permissive a liveness signal:
1. **Hung socket masking.** `session.client` is set on `new HttpClient(...)` (subscriber.js:236-237) and is NOT cleared on `event-disconnect`. A device whose HAP TCP socket has been hung for hours, or whose resubscribe loop is silently failing, will still report `connected: true` and short-circuit `deriveDeviceHealth` to "online" regardless of `lastHealthyAt`. Defeats the whole purpose of the device-health system for the worst-case failure mode.
2. **Connection-setup window.** During the 100-2000 ms between `session.client = client` (line 237) and `await client.subscribeCharacteristics(...)` succeeding (line 454 / 401), `connected` reports true but the device is not actually subscribed to events. A health query in this window reports "online" for a not-yet-subscribed device. Brief but real false-positive on every reconnect, and at startup with many devices.
3. **Quiet-device daily reconnect.** `getRepairTargets` defaults `staleThresholdMs = 10 * 60_000` and is called from `repair-scheduler.js:92` with no override. A correctly-functioning motion sensor in an empty room can trivially go >10 min without firing; post-change, `lastHealthyAt` only refreshes on actual events, so the scheduler will daily call `stopSubscriber` + `startSubscriber` on a perfectly healthy connection. Combined with the hung-socket rescue, paradoxical: the UI says "online" while the scheduler reconnects it nightly.

**Why it matters:** Self-hosted users will believe their accessories are healthy when they are not (1), see brief false-positives across reconnects (2), and waste cycles disrupting good connections every night (3). Not a regression vs. v1.2 (the v1.2 device-health was already permissive on `subscriberConnectedAt`), but the new rescue makes (1) categorical instead of time-bounded.

**Fix — single change:** Tighten the `connected` flag in `getSubscriberStats` and (separately) gate `isStale` on it. Track a successful subscription explicitly:
```js
// subscriber.js — set after every successful subscribeCharacteristics()
stats.subscribed = true;       // line 402, 405, 454
// clear in event-disconnect handler (currently does not clear)
stats.subscribed = false;      // line 396 entry

// getSubscriberStats — strict liveness
return {
  ...stats,
  connected: Boolean(session?.client) && stats.subscribed === true &&
    stats.lastHealthyAt &&
    (Date.now() - new Date(stats.lastHealthyAt).getTime()) < 30 * 60_000,
  reconnectAttempts: Math.max(0, stats.connectAttempts - 1),
};

// getRepairTargets — let live, recently-active sockets suppress isStale
const isStale = !stats.subscribed &&
  (!lastHealthy || now - new Date(lastHealthy).getTime() > staleThresholdMs);
```
This single change resolves all three symptoms: a hung socket has no recent heartbeat → falls back to the timestamp rescue → eventually marked stale; the connection-setup window has `subscribed=false` → no false-positive; quiet-but-healthy devices have `subscribed=true` → suppressed from the daily reconnect target list.

### M-02: Scheduler reads pairings via un-normalized snapshot; helper writes via normalized path
**File:** `listener/src/index.js:286,292`
**Issue:** Two different `loadPairings` callables are wired into the scheduler:
- Line 286: `loadPairings: () => pairingsStore.getSnapshot()` — raw store data, NOT run through `normalizePairingsMap()`.
- Line 292 (passed inside the `performPairSetupAndPersist` closure): the destructured `loadPairings` from `createStoreHelpers` (line 133), which DOES normalize via `normalizePairingsMap()`.

For HomeKit pairings the difference is small (only `protocol` defaulting to 'homekit'), so today this works. For Matter pairings the maps are keyed differently — `normalizePairingsMap` rekeys Matter entries by `nodeId`. `getRepairTargets` only emits HomeKit deviceIds today, so the inconsistency does not bite. But it is a fragile invariant: any future code path that adds Matter targets, or any store-shape change, will silently mismatch.
**Why it matters:** Lurking landmine. The whole reason `createStoreHelpers` exists is to centralize normalization; the scheduler's local snapshot bypasses it.
**Fix:** Use the helper version in both spots:
```js
loadPairings,                 // line 286 — drop the inline () => pairingsStore.getSnapshot()
```

## LOW

### L-01: Unused `savePairing` parameter in repair scheduler
**File:** `listener/src/repair-scheduler.js:49`
**Issue:** `savePairing` is destructured into the factory's parameter list but never referenced inside `runRepairCycle()` after the v1.3 changes (the old `savePairing` call site at the former line 109 was replaced by `performPairSetupAndPersist`). The JSDoc at line 33 already concedes "(isStale path)" but no isStale path uses it.
**Fix:** Remove `savePairing` from the parameter destructure and from the JSDoc; remove the `savePairing: savePairingForRepair` wiring at `index.js:282`. Pure dead-code cleanup; behaviour is unchanged.

### L-02: `mapReliabilityStats` lacks tests for new `last_healthy_at` / `connected` fields
**File:** `listener/test/setup-helpers.test.js`
**Issue:** No assertions cover the two new mapped fields added at `setup-helpers.js:75-76`. If the field naming drifts (camelCase vs snake_case), nothing catches it. The web side reads `reliability.last_healthy_at` (not `lastHealthyAt`) — a typo here would silently null the field on the API.
**Fix:** Add a single test asserting both fields round-trip:
```js
test('mapReliabilityStats maps last_healthy_at and connected', () => {
  const r = mapReliabilityStats({ lastHealthyAt: 'X', connected: true /* + minimal other fields */ });
  assert.equal(r.last_healthy_at, 'X');
  assert.equal(r.connected, true);
});
```

### L-03: `getTrendSubText()` returns the literal string `'events'` when delta is 0/null, masking the trend semantics
**File:** `web/src/components/KpiCards.jsx:73-87`
**Issue:** Pre-change, a 0/null delta showed an em-dash `'—'` to convey "no comparison available." Post-change, it shows the bare word `'events'`, which reads as "today's count is N events" but doesn't communicate that there is no trend. Cosmetic.
**Fix:** Either restore the em-dash for the zero/null case, or render `'events (no change)'` to make the semantics explicit.

### L-04: KpiCards Test 7 is too weak ("at least one zero")
**File:** `web/src/components/KpiCards.test.jsx:81-86`
**Issue:** With empty `MOCK_DAILY`, the component now renders `0` for both Today and This Week, plus `'None'` for Top Device and `'Unknown'` for Top Room. The assertion `expect(zeros.length).toBeGreaterThanOrEqual(1)` will pass even if a future regression nukes the Week value. Test should pin down both "0"s explicitly.
**Fix:**
```js
expect(zeros.length).toBe(2); // today + week
```

### L-05: `cardSubTexts.today` always renders even when there is no trend (the `!= null` guard is a no-op for today)
**File:** `web/src/components/KpiCards.jsx:96-101,119`
**Issue:** Minor: `cardSubTexts.today` is always non-null (it always returns at least the string `'events'`). The `!= null` guard at line 119 will always pass for the today card, so the bottom row of the today card always renders. Other cards correctly receive `null` and skip the row. This is intentional design but readers may misread the `!= null` guard as defensive null-handling.
**Fix:** Either add a comment explaining the asymmetry, or normalize "no trend" to `null` so the guard does the work:
```js
function getTrendSubText() {
  if (delta === null || delta === 0) return null; // hide subtext when no trend
  // ...
}
```

## Release Readiness

**Verdict: HOLD until H-01, H-02, and H-03 are addressed.** The repair-reliability backend (Phases 18+19) is genuinely solid — closure-injected helper, success-only stat resets, comprehensive tests, sane error paths. M-01 describes a coherent class of "the rescue is too aggressive" issues that should be tightened in a follow-up but is not strictly a regression vs. v1.2 (the v1.2 device-health was already permissive on `subscriberConnectedAt`); however, the proposed single-change fix is small enough that addressing it alongside H-01/H-02/H-03 in this release would harden the dashboard's truth-telling end-to-end. H-01 puts a wrong number on the most prominent surface of the dashboard, H-03 freezes two of the four KPI cards at a non-toggleable window with no label, and H-02 introduces an a11y regression on every clickable timeline row — all three are user-visible, all three are fast fixes (under 30 minutes each), and all three should ship with this release rather than as a follow-up. After H-01/H-02/H-03 are fixed and M-01 is at least scoped, this branch is ready for release.

---

_Reviewed: 2026-04-27_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard with selective deep cross-file tracing_
