---
audit: web frontend security + correctness
date: 2026-08-30
scope: web/src (HEAD a39bcb0), web/nginx.conf.template; delta since prior audit baseline 89154e9
method: primary-source read of every focus file at HEAD (git show), grep sweeps for sinks/storage/navigation, one `npm test` run
mode: report-only (no files changed, no git mutations)
tests_at_audit: web 400/400 green (49 files, 6.2s)
---

# HomeChronicle Web Frontend Audit — 2026-08-30

Tags: **[VERIFIED]** = confirmed against source with a concrete, deterministic trigger path (not executed in a browser); **[suspected]** = plausible, needs runtime confirmation. Severity reflects real reachability for an invite-only household app behind session-cookie auth. Items accepted in the 2026-06-14 audit (CSP `style-src 'unsafe-inline'`, PIN/CSRF in sessionStorage) are not re-reported.

Scope delta since 89154e9 (27 files, +1649/-252): auth-off routing (`useAuthConfig`, AuthGate), SettingsPage restructure + Advanced inner tab, FloatingNav, Phase 26 alerts member lock, invite pre-validation, LoginPage 401-vs-outage copy, nginx per-request resolver.

## HIGH

None.

## MEDIUM

### M-1 — Per-user Timeline grouping preferences are dead for authenticated users [VERIFIED]
`web/src/components/setup/SettingsTab.jsx:535-547` (authed branch of `handleSaveSettings`) writes `episodeWindowMinutes` / `sceneWindowSeconds` / `episodeMinEventCount` **only to the per-user blob** (`setBlobEpisodeWindowMinutes` etc.) and deliberately omits them from `saveRetentionMutation`. The only consumer of those values for actual grouping is `web/src/components/Timeline.jsx:54-61`, which reads them from the **shared** `['setup','retention']` query (`retentionConfig?.episodeWindowMinutes ?? 3` …), never from the blob. Result: an authed user edits "Episode capture interval", sees the green "Settings saved" toast, and the Timeline never changes (it keeps using the admin's retention.json values). Anonymous / auth-off users are unaffected (their path still PATCHes retention).
**Fix:** in `Timeline.jsx`, read the three grouping values via `usePreference('episodeWindowMinutes', retentionConfig?.episodeWindowMinutes ?? 3, …)` (same `hc_pref_*` keys as SettingsTab) so authed users get the blob value with the shared config as fallback — or drop the per-user split and write grouping back to retention for everyone.

### M-2 — Dashboard Quiet Hours "exclude" button writes the shared config, but the server reads the per-user blob [VERIFIED]
`web/src/components/QuietHoursPanel.jsx:31-45` `excludeMutation` reads `['setup','retention']` from the cache and `PATCH /api/setup/retention { quietHoursExcludedAccessories }`. Since Phase 25, `listener/src/stats-router.js:345-361` resolves quiet-hours settings from `user_preferences` whenever the session's blob contains `quietHoursEnabled`, and only falls back to retention.json otherwise. So for any authed user who has ever touched the Quiet Hours controls (SettingsTab writes all four QH keys — `SettingsTab.jsx:905-912`), clicking "Exclude" on the dashboard panel mutates the wrong store: the accessory keeps being flagged, and it never shows in the Settings "Excluded from quiet hours" list (`SettingsTab.jsx:440` reads `blobQhExcluded` when `blobHasQh`). For **members** the PATCH is additionally rejected with 403 (retention PATCH became admin-only in the H-1 resolution) and the mutation has no `onError`, so the click silently does nothing.
**Fix:** in `QuietHoursPanel`, branch like SettingsTab does — when `user && 'quietHoursEnabled' in prefs`, call `setPrefsBlob({ …fourKeys, quietHoursExcludedAccessories: next })`; else keep the retention PATCH. Add `onError` toast either way.

### M-3 — Whole-blob PUT fired before `GET /me/preferences` has data truncates the server blob [VERIFIED code path; not executed]
`UserPreferencesProvider.jsx:169-171` builds the flush body from `queryClient.getQueryData(['me','preferences']) ?? {}` merged with the pending partial, and the server does a **whole-blob replace** (`listener/src/me-router.js:57-67`, `SET prefs = EXCLUDED.prefs`). Nothing gates `setPrefsBlob` on the query having resolved (`enabled: !!user?.id`, `retry: false`, `staleTime: 60_000`). If a flush happens while `prefs` is still `undefined`, the merged body contains only the pending keys and every other preference (dashboard layouts, theme, accent, toast, quiet hours…) is deleted server-side. The optimistic cache and `localStorage` still hold the old values locally, so the loss is invisible on this device and shows up on the next device/login (and `seedIfEmpty` will not repair it because the blob is now non-empty).
Deterministic trigger: the L-7 logout purge removes `hc_dashboard_layouts` / `hc_dashboard_hidden`, so on the next login `useDashboardLayout.js:127-159`'s optional-panel seeding effect finds no known ids and calls `setHiddenArr(merged)` **on mount** → `usePreference.setValue` → `setPrefsBlob({ dashboardHidden })` → flush at +500 ms. Any of these makes the GET lose the race: a slow first query on an RPi/cold Postgres, or the GET failing outright (`retry:false` — e.g. a 502 during the listener-recreate window fixed in quick-260617-f5d) after which `prefs` stays `undefined` until the next focus refetch while the user is free to toggle theme/sidebar/dashboard.
**Fix (client):** in `setPrefsBlob`'s timer callback, if `queryClient.getQueryState(['me','preferences'])?.status !== 'success'`, re-arm the timer (or await `queryClient.ensureQueryData`) instead of flushing. **Fix (server, belt-and-braces):** make PUT a merge (`SET prefs = user_preferences.prefs || EXCLUDED.prefs`) or add a `PATCH`.

## LOW

### L-1 — Sidebar collapse never persists: functional updater passed to `usePreference` setter [VERIFIED]
`App.jsx:144` `onToggle={() => setCollapsed(c => !c)}` but `usePreference.js:106-114` does `setValue_(newVal); writeLocal(localStorageKey, newVal, serialize)` with no function handling. React toggles the UI (functional setState works), but `String((c)=>!c)` is written to `hc_sidebar_collapsed` (deserializes to `false` on reload), the function value is placed in the optimistic `['me','preferences']` cache, and `JSON.stringify` drops the key from the PUT body — so the pref never syncs. `useDashboardLayout.js:118,154` already documents that functional updaters are unsupported. **Fix:** `setCollapsed(!collapsed)` (or teach `setValue` to resolve `typeof newVal === 'function'` against current state).

### L-2 — Logout purge (L-7 fix) is incomplete [VERIFIED]
`useAuth.js:17-38` `USER_PREF_LS_KEYS` omits seven per-user keys introduced later: `hc_pref_episodeWindowMinutes`, `hc_pref_sceneWindowSeconds`, `hc_pref_episodeMinEventCount` (`SettingsTab.jsx:61-63`) and `hc_pref_quietHoursEnabled/Start/End/ExcludedAccessories` (`SettingsTab.jsx:69-73`). The HomeKit PIN vault `sessionStorage['hc_pins']` (`useSetup.js:10,330,337`) is also not cleared, so an admin's saved setup codes survive logout in the same tab. Only `csrfToken` is removed. **Fix:** derive the purge list from one shared constant (D12_KEYS + every `hc_pref_*`), and `sessionStorage.removeItem('hc_pins')` in the logout `onSuccess`.

### L-3 — Update check is dead in production [VERIFIED]
`useUpdateCheck.js:3-4` fetches `https://api.github.com/repos/havuq/homechronicle/releases`, but the nginx CSP (`nginx.conf.template:31`) is `connect-src 'self'`, so the browser blocks the request and the `catch` swallows it — "vX available" can never appear in the Docker build. The repo has also moved to GitLab (`git remote`), so the URL is stale regardless. Either point it at the GitLab releases API and add that origin to `connect-src`, or delete the hook (and `hc_disable_update_check` / `hc_update_dismissed`).

### L-4 — Auth-off mode still hammers `GET /api/auth/me` (401) [VERIFIED]
`AuthGate.jsx:20` gates its `['auth','me']` observer with `enabled: authEnabled === true`, but `useAuth.js:8-14` (used by App, Sidebar, Provider, Alerts, SettingsPage and every `usePreference` instance) has no `enabled`. TanStack runs a query if *any* observer is enabled, so in `AUTH_ENABLED=false` mode the gate is moot: `/me` fires on mount, every 60 s of staleness and every window focus, and always 401s (`auth-router.js:494`). Functionally harmless (`user` is `undefined`, consumers take the anon path) but it is a steady stream of 401s in the listener log. **Fix:** add the same `enabled: authEnabled === true` to `useAuth`'s query (keep the queryFn identical).

### L-5 — Settings accessibility (recent restructure) [VERIFIED]
- `SettingsPage.jsx:194-203` left-rail items are `<div role="button" tabIndex=0>` with no `aria-current`/`aria-pressed`, so AT cannot tell which section is active; prefer real `<button>`s with `aria-current="page"`.
- `SettingsPage.jsx:177` mobile `<select>` has no accessible name (`aria-label="Settings section"`).
- `SettingsTab.jsx:581-600` inner `role="tablist"`/`role="tab"`/`aria-selected` is present, but no `id`/`aria-controls`, no `role="tabpanel"` on the content, and no Left/Right arrow-key handling (every tab is `tabIndex=0`, non-roving). Enter/Space work.

### L-6 — No root-level ErrorBoundary [VERIFIED]
`App.jsx:158-171` wraps each page (`key={activePage}`) and AccessoryDetail (`key={selectedAccessoryId}` — L-6 from June confirmed fixed). But `main.jsx` mounts `RouterProvider`, `AuthGate`, `UserPreferencesProvider`, `Sidebar`/`FloatingNav`, and the login/invite/reset pages outside any boundary — a render error there is a blank page.

### L-7 — Any `/auth/me` failure is treated as "logged out" [suspected UX]
`AuthGate.jsx:69-70` `isError || !data → <Navigate to="/login">` with `retry: false`. A transient 5xx/502 on `/me` (e.g. during a listener recreate) bounces a user with a valid cookie to the login form; logging in again just mints an extra session. Consider distinguishing `status === 401` from other errors (retry / show a "backend unavailable" state), mirroring the LoginPage copy fix.

### L-8 — LoginPage status matrix edge cases [VERIFIED, minor]
`LoginPage.jsx:43-47`: 401 → "Incorrect email or password", everything else → "temporarily unavailable". Correct and non-enumerating for 5xx/network, but a 429 from the auth rate limiter and a 400 validation error also read as an outage. Optional: `429 → "Too many attempts, try again shortly"`.

### L-9 — `react-router-dom` 7.17.0 (< 7.18.1 open-redirect advisory) — no exposure, bump anyway [VERIFIED]
Every navigation target is a literal: `navigate('/')` (LoginPage:36, AcceptInvitePage:136, SetupAdminPage:28), `navigate('/login')` (SetupAdminPage:32, Sidebar:123, ResetPasswordPage:153), `<Navigate to="/login"|"/setup"|"/">` (main.jsx:37-47, AuthGate:70), `<Link to="/reset-password"|"/login">`. No `?next=`/`returnTo`/`redirect` param exists anywhere in `web/src`; `?token=` is only read into request bodies/query strings (`encodeURIComponent`). The advisory is not reachable, but `npm audit` will keep flagging it — bump to ≥7.18.1.

### L-10 — Misc
- `ResetPasswordPage.jsx:153` `setTimeout(() => navigate('/login'), 2000)` is not cleared on unmount (harmless; wrap in an effect with cleanup).
- `SettingsTab.jsx:328` archive download uses raw `fetch` without `credentials: 'include'` — fine in prod (same-origin), 401s in the cross-origin Vite dev setup only.
- CSP lacks `form-action 'self'` (defense-in-depth only; all forms are JS-submitted and no XSS sink exists).

## VERIFIED-CLEAN

- **XSS sinks:** no `dangerouslySetInnerHTML`, `innerHTML`, `eval`, `document.write`, or `location.assign/href=` writes in `web/src`. The only data-driven `href` is `Sidebar.jsx:310` (`availableUpdate.url` from the GitHub releases API, `target=_blank rel="noopener noreferrer"`, and dead in prod per L-3). All API-derived strings are rendered as React text (ActiveSessionsPanel explicitly, alerts, timeline, accessory names).
- **Open redirect:** see L-9 — zero user/API-controlled inputs reach `navigate()` / `<Link>` / `<Navigate>` / `window.location`. `App.jsx:108` `pushState` reuses the current URL verbatim.
- **AuthGate + useAuth shared `['auth','me']`:** both use the identical `fetchJson(...).then((d) => d?.user ?? null)`, `staleTime: 60_000`, `retry: false` (`AuthGate.jsx:11-17`, `useAuth.js:8-14`); `useAuthConfig` uses a separate `['auth','config']` key. Regression test `AuthGate.shared-cache.test.jsx` mounts both against one QueryClient.
- **CSRF plumbing (`api.js`):** `X-CSRF-Token` attached to every non-GET/HEAD; token from `sessionStorage`; one-shot self-recovery on 403 narrowed to `code === 'EBADCSRFTOKEN'` or the exact server message, using raw `fetch` + `?refresh=1` so it cannot recurse; `credentials: 'include'` on every call. Recovery paths in AuthGate (`useEffect` on `data`), LoginPage and AcceptInvitePage all store the token before navigating.
- **Logout:** `queryClient.clear()` + `csrfToken` removal + D12/toast localStorage purge (L-7 June fix present at `useAuth.js:40-52`); server revokes the session and clears the cookie with matching flags. Gaps are only the newer keys listed in L-2.
- **Invite / reset token handling:** tokens read via `useSearchParams` and sent only in JSON bodies or an `encodeURIComponent`'d query; nginx `combined_no_query` log format on `/api/auth/` keeps them out of access logs; `Referrer-Policy: no-referrer`; invite pre-validation fails closed to the "invalid" card on error; reset flow copy is enumeration-safe (`onError` also shows the confirmation).
- **UserPreferencesProvider CR-01 fix intact:** single provider owns `pendingPartialRef` / `debounceTimerRef` / `pendingResolversRef` / `seedFiredRef`; flushes are chained through `inFlightRef` and the server echo is sequence-guarded (`mySeq === flushSeqRef.current`); PUT rejections are swallowed (no unhandled rejection after logout); debounce timer cleared on unmount; per-key seeding removed from `usePreference`. (M-3 is a pre-resolve gap, not a regression of the fix.)
- **L-3 (June) staleTime alignment:** every `['setup','retention']` consumer at HEAD uses `staleTime: 30_000` (`App.jsx:52`, `Timeline.jsx:57`, `useSetup.js`).
- **M-9 (June) QuietHoursPanel:** dismissal reset now lives in `useEffect([dismissed, data?.enabled])` (`QuietHoursPanel.jsx:54-59`); no setState-during-render found anywhere in the focus set (SettingsTab derives `activeTab` without state; SettingsPage derives `activeSection`).
- **Effect cleanup:** `useUpdateCheck` clears its interval; `useMediaQuery`, `useTheme`, `FloatingNav` (scroll/keydown), `App` (popstate) all remove listeners; `SettingsTab` clears the autosave timer; `useLiveEventToasts` bounds `seenIds` (500) and disables polling when off-tab. `ToastProvider` timeouts are un-cleared but the provider never unmounts.
- **Phase 26 alerts member lock:** UI locks the recipient to `user.email` for members (`Alerts.jsx:229-243`) and the server enforces it on POST and PATCH regardless of the UI (`alerts-router.js:302-306, 366-372`); Email channel disabled until SMTP configured; webhook URL never prefilled from the redacted list response.
- **Dashboard layout persistence:** `sanitizeLayouts` drops unknown ids, seeds missing panels, clamps `h` to `PANEL_MAX_H`; RGL feedback loop guarded by returning early when nothing changed; hidden set sanitized.
- **nginx CSP:** `script-src 'self'` (no `unsafe-inline`/`unsafe-eval`), `object-src 'none'`, `base-uri 'self'`, `frame-ancestors 'none'`, `X-Frame-Options DENY`, COOP/CORP same-origin, no-referrer, `server_tokens off`; `no-store` on `/`, `/index.html`, `/service-worker.js`; per-request resolver + variable `proxy_pass` (quick-260617-f5d) present. Service worker caches only same-origin static assets and the navigation shell — never `/api/*`.
- **Auth-off routing:** `useAuthConfig` fails closed (only an explicit `false` disables the wall); `/login` and `/setup` redirect to `/` in auth-off; `/setup` is unreachable once `user-count > 0`; `claim-admin` enforces the 12-char minimum client and server side.
- **Storage secrets:** no tokens/passwords in `localStorage`; `API_TOKEN` is only embedded in DEV builds (`api.js:3-5`, `import.meta.env.DEV` guard) — prod relies on nginx injection.
- **Tests:** `cd web && npm test` → 49 files, 400/400 passing at HEAD.

## Summary counts
HIGH 0 · MEDIUM 3 (M-1 dead per-user Timeline grouping, M-2 Quiet Hours exclude writes the wrong store, M-3 pre-resolve whole-blob PUT truncation) · LOW 10.
