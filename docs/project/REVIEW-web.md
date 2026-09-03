---
phase: web-frontend-review
reviewed: 2026-04-11T12:00:00Z
depth: standard
files_reviewed: 34
files_reviewed_list:
  - web/src/App.jsx
  - web/src/main.jsx
  - web/src/lib/api.js
  - web/src/lib/episodes.js
  - web/src/lib/queryKeys.js
  - web/src/lib/icons.js
  - web/src/lib/roomColors.js
  - web/src/hooks/useEvents.js
  - web/src/hooks/useAlerts.js
  - web/src/hooks/useSetup.js
  - web/src/hooks/useTheme.js
  - web/src/hooks/useSkin.js
  - web/src/hooks/useLiveEventToasts.js
  - web/src/hooks/useUpdateCheck.js
  - web/src/hooks/useMutedDevices.js
  - web/src/hooks/useAccentRgb.js
  - web/src/components/Toast.jsx
  - web/src/components/Timeline.jsx
  - web/src/components/FilterBar.jsx
  - web/src/components/ErrorBoundary.jsx
  - web/src/components/AccessoryList.jsx
  - web/src/components/AccessoryDetail.jsx
  - web/src/components/Alerts.jsx
  - web/src/components/PairingHealthBanner.jsx
  - web/src/components/StatsCards.jsx
  - web/src/components/ActivityChart.jsx
  - web/src/components/AnomalyPanel.jsx
  - web/src/components/SceneGroup.jsx
  - web/src/components/EpisodeGroup.jsx
  - web/src/components/EventRow.jsx
  - web/src/components/StaleDevicesPanel.jsx
  - web/src/components/TrendChart.jsx
  - web/src/components/TopDevices.jsx
  - web/src/components/setup/SetupTabs.jsx
findings:
  critical: 0
  warning: 8
  info: 5
  total: 13
status: issues_found
---

# Web Frontend Code Review Report

**Reviewed:** 2026-04-11
**Depth:** standard
**Files Reviewed:** 34
**Status:** issues_found

## Summary

The HomeChronicle web frontend is well-structured with consistent patterns across hooks, components, and utilities. TanStack Query usage is generally correct with appropriate stale times and refetch intervals. Error boundaries wrap all four main tabs. Dark mode support is thorough. The codebase uses proper input encoding (encodeURIComponent) on API calls and avoids dangerouslySetInnerHTML throughout.

Key concerns found: a stale closure in the Toast system's auto-dismiss timer, missing `onNavigateToAccessory` in useLiveEventToasts dependency array, a potential race condition in Timeline's backfill effect, and inconsistent query key patterns between useSetup and other hooks that could cause failed cache invalidation.

## Warnings

### WR-01: Toast auto-dismiss captures stale `settings.duration` via closure

**File:** `web/src/components/Toast.jsx:49-52`
**Issue:** The `addToast` callback uses `settings.duration` as the default timeout for `setTimeout`, but `settings.duration` is captured in the closure via the `useCallback` dependency array. However, the `setTimeout` at line 49 uses the `duration` variable from the destructured `opts` parameter, which defaults to `settings.duration` at call time. The real issue is that the inner `setTimeout` at line 51 (the 400ms removal timer) fires 400ms after the fade-out starts, but if `addToast` is called rapidly and the component re-renders, the `setToasts` updater still references the correct `id` via closure. This is actually fine for the removal timer.

The actual bug is: if `configure()` is called to change `settings.duration` (e.g., from the retention config), toasts that were already scheduled with the old duration will not be affected, and new toasts created between the `configure` call and the next render will still use the old duration because `addToast` hasn't been recreated yet. This is a minor timing window but can cause the first toast after a config change to use the wrong duration.

**Fix:** Use a ref for settings to avoid the stale closure:
```javascript
const settingsRef = useRef(settings);
settingsRef.current = settings;

const addToast = useCallback((message, type = 'success', opts = {}) => {
  const { duration = settingsRef.current.duration, onClick } = typeof opts === 'number' ? { duration: opts } : opts;
  // ... rest unchanged, use settingsRef.current.maxVisible
}, []); // stable reference, no deps needed
```

### WR-02: Missing dependency in useLiveEventToasts useEffect

**File:** `web/src/hooks/useLiveEventToasts.js:47-79`
**Issue:** The `useEffect` at line 47 references `onNavigateToAccessory` inside the closure (line 62: `onNavigateToAccessory ? () => onNavigateToAccessory(name) : undefined`), but `onNavigateToAccessory` is not listed in the dependency array at line 79. If the parent re-creates this callback (which it does not currently because it uses `useCallback` in App.jsx), the effect would capture a stale reference. Currently safe due to stable `useCallback` in the parent, but fragile.

**Fix:** Add `onNavigateToAccessory` to the dependency array:
```javascript
}, [data, enabled, accessorySet, addToast, onNavigateToAccessory]);
```

### WR-03: Timeline backfill effect uses muted Set by reference but depends on mutedKey

**File:** `web/src/components/Timeline.jsx:88-129`
**Issue:** The backfill effect at line 88 reads `muted` directly (line 97: `muted.has(e.accessory_name)`) but the dependency array at line 129 includes `mutedKey` (a stringified version) instead of `muted`. While `mutedKey` correctly triggers re-runs when the set changes, the `muted` reference inside the effect closure may be stale if the `useMutedDevices` hook returns a new Set object on the same render cycle. In practice this works because `mutedKey` changes whenever `muted` changes, but the closure still captures the `muted` from the render where the effect was created, which should match `mutedKey`. This is technically correct but the use of `filters` as a plain object in the dependency array (line 129) is problematic -- object identity changes on every render since `filters` is state derived from `setFilters`, causing the backfill to re-run unnecessarily on each render where filters hasn't actually changed.

**Fix:** Stabilize the filters dependency:
```javascript
const filtersKey = JSON.stringify(filters);
// In the effect dependency array, use filtersKey instead of filters
}, [data?.events, data?.pages, filtersKey, mutedKey, page]);
```

### WR-04: Inconsistent query key patterns cause cache invalidation misses

**File:** `web/src/hooks/useSetup.js:168`
**Issue:** The `repairPairingMutation` onSuccess handler invalidates `['pairings']` (line 168) and `['health']` (line 170), but the actual query keys used are `['setup', 'pairings']` (line 39) and `['health']` (line 170 matches PairingHealthBanner). The invalidation of `['pairings']` at line 168 will NOT match `['setup', 'pairings']` because TanStack Query's `invalidateQueries` with a queryKey does prefix matching, and `['pairings']` does not prefix-match `['setup', 'pairings']`. This means after a successful repair, the pairings list will not refresh.

**Fix:**
```javascript
onSuccess: () => {
  queryClient.invalidateQueries({ queryKey: ['setup', 'pairings'] });
  queryClient.invalidateQueries({ queryKey: ['accessories'] });
  queryClient.invalidateQueries({ queryKey: ['health'] });
},
```

### WR-05: useSetup comment says localStorage but implementation uses sessionStorage for PINs

**File:** `web/src/hooks/useSetup.js:9-12, 17`
**Issue:** The comment at line 7 says "persists entered PINs in localStorage so they survive refresh" and line 17 says "PIN vault (localStorage-backed)", but `loadSavedPins()` at line 11 reads from `sessionStorage`, and `savePin`/`clearPin` at lines 328/334 write to `sessionStorage`. PINs stored in sessionStorage will NOT survive browser restarts or new tabs. The security implications are acceptable (sessionStorage is actually more appropriate for sensitive data like PINs), but the misleading comments could cause a future developer to "fix" it by switching to localStorage, which would be a security regression.

**Fix:** Update the comments to accurately reflect the implementation:
```javascript
// PIN vault -- persists entered PINs in sessionStorage for the current tab session
```

### WR-06: `groupIntoScenes` silently drops events with null timestamps

**File:** `web/src/lib/episodes.js:30-35`
**Issue:** When `asTimestamp` returns null for either the previous or next event (line 33: `if (prevTs == null || nextTs == null) continue`), the current event is silently skipped via `continue` but it was already added to the `current` group on a previous iteration (or as `events[0]` at line 28). The `continue` skips the gap comparison but does NOT remove the event from the `current` array. The next valid event will then either be added to `current` (grouped with the invalid-timestamp event) or start a new group. This means events with invalid timestamps can end up grouped with unrelated events. The Timeline component has a separate `isValidTimestamp` filter, so these events are later removed from display, but the episode/scene grouping logic operates on stale data.

**Fix:** Filter out events with invalid timestamps before grouping:
```javascript
export function groupIntoScenes(events, { sceneWindowMs = SCENE_WINDOW_MS } = {}) {
  const valid = events.filter(e => asTimestamp(e.timestamp) != null);
  if (!valid.length) return [];
  // ... use valid instead of events
```

### WR-07: ActivityChart UTC-to-local conversion uses Math.round on potentially fractional UTC hour

**File:** `web/src/components/ActivityChart.jsx:24`
**Issue:** `utcHoursToLocal` computes `utcH` as `((localH - offsetHours) % 24 + 24) % 24` where `offsetHours` is `-new Date().getTimezoneOffset() / 60`. For timezones with non-integer offsets (e.g., India at UTC+5:30, Nepal at UTC+5:45, Chatham Islands at UTC+12:45), `utcH` will be a non-integer (e.g., 6.5). `Math.round(utcH)` at line 24 then picks the nearest integer hour, which means the bar chart will show slightly incorrect data for half-hour/quarter-hour timezone users -- events from one UTC hour will be attributed to an adjacent local hour.

**Fix:** For half-hour timezones, interpolate between two adjacent UTC hours or use floor instead of round for consistent behavior:
```javascript
const utcIdx = Math.floor(utcH);
return { hour: label, localH, count: utc[utcIdx % 24] };
```
Note: This is still imprecise for fractional offsets. A correct solution would aggregate events client-side by local hour rather than mapping UTC-bucketed server data.

### WR-08: `api.js` DEV mode reads API_BASE directly instead of using Vite proxy

**File:** `web/src/lib/api.js:1`
**Issue:** `API_BASE` is set to `'http://localhost:3001/api'` in DEV mode, but `useEvents.js` (line 5) declares its own `BASE = '/api'` and uses that for all fetch calls, which goes through Vite's dev proxy. This means `useEvents.js` correctly uses the proxy, but any code that imports `API_BASE` from `api.js` (such as Timeline.jsx line 107) bypasses the Vite proxy and hits localhost:3001 directly. This inconsistency means CORS headers must be configured on the listener for dev mode, and cookie-based auth (if ever added) would not work for `API_BASE` callers.

**Fix:** Unify on a single base URL. Either:
1. Remove `API_BASE` export from `api.js` and have all code use `fetchJson` which already handles auth headers, OR
2. Change `useEvents.js` to import and use `API_BASE` from `api.js` consistently:
```javascript
// In useEvents.js, replace:
const BASE = '/api';
// With:
import { API_BASE as BASE } from '../lib/api.js';
```

## Info

### IN-01: Module-level counter `nextId` in Toast.jsx is shared across StrictMode double-renders

**File:** `web/src/components/Toast.jsx:13`
**Issue:** `let nextId = 0` is a module-level mutable variable. In React StrictMode (which this app uses in main.jsx), effects and callbacks may fire twice in development. Each double-invocation of `addToast` increments `nextId` twice, leading to skipped IDs. This has no functional impact (IDs are only used as keys and for dismissal), but it means toast IDs are not sequential in development mode.

**Fix:** No action needed -- cosmetic only. If sequential IDs matter for debugging, consider using `useRef` inside the provider instead.

### IN-02: `useSetup` hook is monolithic and creates many queries/mutations on every mount

**File:** `web/src/hooks/useSetup.js`
**Issue:** `useSetup` creates 12 queries and 12 mutations on every mount, regardless of which tab is active in SetupTabs. All queries start fetching immediately when the Manage tab is opened, even if the user only views one sub-tab. TanStack Query handles this reasonably well with stale-time caching, but it generates unnecessary network requests on initial mount.

**Fix:** Consider splitting into focused hooks (e.g., `useSetupDevices`, `useSetupSettings`, `useSetupMatter`) that are called only by the sub-tab components that need them. This is a refactoring suggestion, not a bug.

### IN-03: Duplicate `savedDisplayNames` in useSetup return value

**File:** `web/src/hooks/useSetup.js:415,474`
**Issue:** `savedDisplayNames` appears twice in the return object -- once at line 415 (in the Queries section) and again at line 474 (in the Display name editing section). JavaScript objects allow duplicate keys but the second one silently shadows the first. In this case both reference the same variable, so it has no functional impact.

**Fix:** Remove the duplicate at line 474.

### IN-04: Alerts form does not validate scopeValue when scopeType requires it

**File:** `web/src/components/Alerts.jsx:91-98`
**Issue:** When `scopeType` is set to "room", "accessory", or "characteristic", the `scopeValue` field should contain a value, but the form does not enforce this -- the field has no `required` attribute and no client-side validation. The server may reject it, but the user gets no immediate feedback about which field is missing.

**Fix:** Add conditional `required` attribute:
```jsx
<input
  type="text"
  value={form.scopeValue}
  required={form.scopeType !== 'all'}
  // ...
/>
```

### IN-05: AnomalyPanel and StaleDevicesPanel clickable divs lack keyboard accessibility

**File:** `web/src/components/AnomalyPanel.jsx:57-61`, `web/src/components/StaleDevicesPanel.jsx:39`
**Issue:** Both components use `<div onClick={...}>` for clickable cards but do not include `role="button"`, `tabIndex={0}`, or `onKeyDown` handlers. Keyboard-only users cannot activate these elements. The Toast component correctly handles this pattern (lines 88-91 in Toast.jsx).

**Fix:** Add keyboard accessibility attributes:
```jsx
<div
  role="button"
  tabIndex={0}
  onClick={() => { /* ... */ }}
  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { /* same as onClick */ } }}
  // ...
>
```

---

_Reviewed: 2026-04-11_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
