---
audit: security-focused review of the surface added since 2026-08-30
date: 2026-11-14
head: 72923c8 (main; fixes applied in that commit, baseline 8d3af15)
method: single-session manual review informed by the 2026-08-30 audit's accepted/deferred ledger, NOT a multi-agent sweep — prior-audit read first, then delta scoping by git log, targeted greps traced to origin, and runtime smoke tests for each claim that mattered (glob/node-pg-migrate import, display-name 500 cause, limiter blocking behaviour); every fix has a test, and each new test was checked for non-vacuity
scope: listener/src + web/src + nginx template + docker entrypoints; delta since the 2026-08-30 audit = 109 commits. New surface reviewed: Timeline export, device categories, display names + history rename, updates-router, quiet/threshold alerts, temperature units, multi-outlet service split, accessories-router, stats-router
mode: fixes applied and committed (72923c8); pushed to GitLab + GitHub; released as v0.6.0-beta.3 tagged on that head
tests_at_audit: listener 1126/1126, web 957/957 (green at 72923c8; 1091 at baseline 8d3af15 → 1126 = 35 new)
previous: docs/project/SECURITY-AUDIT-2026-08-30.md (fully resolved, shipped as v0.3.3)
---

# HomeChronicle Security Audit — 2026-11-14

> **RESOLUTION LOG — all findings of this pass are fixed in `72923c8`.**
> - **MEDIUM:** API L-3 (member-writable JSON store caps) — **closed**, carried over from the 2026-08-30 deferred ledger.
> - **LOW:** L-1 public auth GET rate limiting; L-2 `/api/updates/latest` cold-cache stampede; L-3 non-https release `href`; L-4 audit-log injection via member-supplied names — all fixed.
> - **INFO:** I-1 stale auth-gate comment describing an auth bypass that does not exist — corrected.
> - **DEPENDENCY:** 2 advisories / 3 moderate `npm audit` findings (`glob`, `minimatch`) → `npm audit` 0, via `overrides` rather than `npm audit fix --force`. Verified on Node 20 (CI boot-smoke, real Postgres + migrations) and Node 22 (beta listener healthy).
> - **Accepted / deferred:** unchanged from 2026-08-30 — see "Accepted by design" below, each with the decision it cites.
> - **Partial-ship note:** `8d3af15` swept two of these files mid-edit and pushed them inside an unrelated commit. The auth-router limiter went out complete; the setup-router helpers went out **with no callers**, so the API L-3 caps were inert until `72923c8`. Release notes describing beta.3 should attribute the caps to `72923c8`.

Findings are tagged **[VERIFIED]** (confirmed against primary source, or by a runtime test written for the purpose) or **[REASONED]** (traced in source, impact argued but not executed). Severity reflects real reachability for a self-hosted, invite-only household app that runs unattended: an authenticated *member* is the realistic adversary for most of this surface, since the app has no anonymous write path.

Headline: **1 MEDIUM, 4 LOW, 1 INFO, 2 dependency advisories.** No HIGH. The 2026-08-30 remediation held — every control that audit verified clean is still in place, and the one finding of substance here was already on its own deferred list.

---

## What this pass deliberately did not re-litigate

The 2026-08-30 audit recorded a set of accepted trade-offs. Re-reading it first was the single highest-value step, because three of its "verified clean" entries are exactly the things a fresh reviewer flags first. They were confirmed still true and left alone:

- `X-API-Token` is injected by nginx **only** when `AUTH_ENABLED=false` — see I-1 below, which is the one place the codebase said otherwise.
- Members may point webhook rules at private-LAN targets (Auth L-1, mitigated by the M-3 rule caps).
- `/api/auth/user-count` is a public probe by cross-plan contract.
- Service-token callers skip CSRF, because `API_TOKEN` is a bearer secret absent from a cross-site browser context.

---

## MEDIUM

### API L-3 — member-writable JSON stores accepted unbounded, untyped keys and values → persistent disk/memory growth by any member [VERIFIED]

`PATCH /api/setup/{room,category,display-name,note}` are deliberately not admin-only (`requireAdminSession`'s JSDoc lists them as exempt), so any authenticated member can write them. None validated input beyond a truthiness check on `accessoryId`:

```js
const { accessoryId, roomName } = req.body ?? {};
if (!accessoryId) return res.status(400).json({ error: 'accessoryId is required' });
rooms[accessoryId] = roomName.trim();      // key and value both unbounded
```

Three distinct problems:

1. **`accessoryId` became a store KEY verbatim.** A member could post a 256 KB key (the `API_JSON_LIMIT` ceiling) under a fresh value on each request, at 60 writes/min, growing `rooms.json` / `notes.json` / `display-names.json` without bound. These files are re-read into memory on every store refresh (default 30 s), on hardware that is routinely an RPi or NAS. This is the availability half of the finding and the reason it is MEDIUM rather than LOW.
2. **Values were uncapped** — `roomName`, `note` and `displayName` likewise bounded only by the JSON body limit.
3. **A non-string value returned 500, not 400** — `roomName`/`note` reached `.trim()` directly, so `{"roomName": 42}` produced an unhandled `TypeError`.

Prototype pollution was considered and is **not** reachable: `rooms['__proto__'] = '<string>'` on a plain object is a silently-ignored accessor write, so no own key is created and nothing is persisted.

**Fix (`setup-router.js`):** `parseStoreKey` / `parseStoreText` / `storeCapacityError`. Key 200, name 200, note 2000, 5000 entries per store.

Two properties the cap had to preserve, both now pinned by tests:

- **The name cap is 200 to match `alerts-router.js`'s `MAX_TEXT_LEN`**, not an arbitrary round number. Clearing a display name rewrites it into `alert_rules.scope_value`; a longer name would fail that transaction downstream.
- **Caps bind NEW keys only.** An existing key stays updatable and clearable — including over-long keys written *before* this cap, which are precisely what the fix targets. Rejecting them on the clear path would have made the junk removable only by hand-editing the JSON, breaking the fix's own premise. Likewise `MAX_STORE_ENTRIES` never blocks a clear, so a full store is always recoverable through the API.
- **Finite numbers are coerced, not refused.** The pre-cap code accepted any truthy value; a `typeof !== 'string'` rejection would have broken saves for any caller sending a numeric Matter `nodeId`. Call sites were checked (`useSetup.js` sends strings throughout), so this is insurance against a regression rather than a known break.

---

## LOW

### L-1 — the four public auth GETs had no rate limiter → unbounded anonymous DB work [VERIFIED]

`/api/auth/{csrf-token,user-count,config,invite-status}` are in `PUBLIC_AUTH_PATHS`: reachable with no session and no token. Three of the four touch the database (`validateSession`'s join, `getUserCount`, `getInviteByTokenHash`) and none was limited.

This is a **DoS ceiling, not a brute-force control** — invite and reset tokens are 256-bit random, so `invite-status` is not a guessing oracle; the issue is purely that an anonymous caller could drive unbounded query load.

**Fix (`auth-router.js`):** a dedicated 120/min limiter, env-overridable via `PUBLIC_READ_RATE_LIMIT_WINDOW_MS` / `_MAX`.

Two design constraints, both of which would have caused an outage if got wrong:

- **Not `authLimiter`.** Its ceiling is 10 per 15 minutes. The SPA fetches `/csrf-token` on every load, in every new tab, and again on each post-403 `?refresh=1` retry; `/config` and `/user-count` are probed by the login screens. Reusing it would lock a household out of its own login page — and worse where `TRUST_PROXY` is unset or too low (M-12), because the whole household then shares one bucket. Polling was checked and ruled out as an aggravating factor: `main.jsx` sets only `staleTime`, no global `refetchInterval`, and `useAuthConfig` is `staleTime: Infinity`.
- **One limiter instance per route, not one shared.** `express-rate-limit` counts per instance, so a shared instance lets a caller hammering `/user-count` exhaust the budget `/csrf-token` needs. `/csrf-token` is the one route whose 429 actually breaks the app — no CSRF token means no login and no writes. Separate buckets keep that budget its own.

### L-2 — `/api/updates/latest` cold-cache stampede on a public path [VERIFIED]

The cache was assigned only after `Promise.allSettled` resolved for every host, so concurrent requests all missed and each fired its own pair of upstream GETs. On a public, unauthenticated path at 60 req/min/IP that is up to 120 outbound requests in a burst.

This directly contradicted the rationale recorded in `public-paths.js` for making the path public — *"the listener answers from a 12-hour cache, so anonymous traffic hits memory, not the network"* — which was true only once warm. It could also exhaust GitHub's 60-requests/hour-per-IP unauthenticated budget in one burst, degrading update checks for the whole instance.

**Fix (`updates-router.js`):** one shared in-flight promise, cleared in `finally`. A cold check is now exactly one call per host regardless of concurrency.

### L-3 — upstream release URL reached the UI as an `href` without a scheme check [REASONED]

`normalizeRelease` passed `html_url` / `_links.self` straight through, and the web UI renders it as a link target. Mitigated in practice by React 19's escaping and the SPA's `connect-src 'self'` CSP, and the upstreams are fixed, but `UPDATE_CHECK_URL` is operator-overridable and a redirected or compromised upstream could supply `javascript:`.

**Fix:** accept the value only when it parses and `protocol === 'https:'`; otherwise `null`. The release is still reported, just without a link.

### L-4 — audit-log injection via member-supplied device names [VERIFIED]

The setup write handlers logged member-controlled values unquoted:

```js
log.info(`[setup] Note for ${accessoryId} set to ${note?.trim() || '(cleared)'}`);
```

A newline in a room name, note or display name forges additional `[audit]`/`[setup]` lines in the listener log — the same log an operator reads to reconstruct who changed what.

**Fix:** `JSON.stringify` the member-controlled values at these sites. Deliberately **not** sanitised inside `logger.js`, which would mangle multi-line `err.stack` output everywhere else. Note bodies are long free text, so `/note` now logs only whether a note was set or cleared, not the body.

---

## INFO

### I-1 — the auth-gate comment described an authentication bypass that does not exist [VERIFIED]

`index.js` read:

> *"browser sessions win even when nginx **unconditionally injects** X-API-Token"*

If that were true the chain would be severe: with `AUTH_ENABLED=true` and `API_TOKEN` set, any cookie-less request through nginx would pass the gate on the service-token fallback, `requireAdminSession` would allow it (no `hcSession`), and `skipCsrfProtection` would skip CSRF — making the login wall cosmetic and letting a member reach admin routes by dropping their cookie.

It is false. Both `web/docker-entrypoint.d/15-compute-api-token.envsh` and `docker/standalone/entrypoint.sh` compute an **empty** `NGINX_API_TOKEN` when auth is on, and the 2026-08-30 audit verified this (SEC-07 / T-23-BYPASS). The comment is a leftover from the pre-cutover behaviour.

Recorded as a finding rather than a typo because it cost real review time in this pass and would mislead the next reviewer into either chasing a phantom or, worse, "fixing" the gate. **Fix:** comment rewritten to state the actual behaviour and name both entrypoints.

---

## DEPENDENCY

Two advisories, reported by `npm audit` as 3 moderate findings (`glob`, `minimatch`, and `node-pg-migrate` for depending on a vulnerable `glob`). Chain: `node-pg-migrate@8.0.4` → `glob@11.1.0` → `minimatch@10.2.5`.

| Advisory | Verdict |
|---|---|
| GHSA-3g3m-2fjr-6pw4 — glob AbortSignal cancellation bypass | **Unreachable** |
| GHSA-g3hv-75wg-m249 — minimatch globstar DoS amplification | **Unreachable** |

**Why unreachable, definitively:** `node-pg-migrate` calls glob at exactly one site, `getMigrationFilePaths`, gated on `useGlob: true`. `db.js`'s two `runner()` calls never set it, so the function takes its `readdir` branch and glob is never invoked — only the top-level `import { glob } from 'glob'` executes. This is a stronger argument than the 2026-08-30 audit had available ("patterns aren't attacker-controlled").

**Fix:** `overrides` to `glob@14.0.6` / `minimatch@11.0.8` → `npm audit` **0**. `npm audit fix --force` was explicitly avoided: it downgrades `node-pg-migrate` to 7.6.1, a breaking change on code that runs at every boot of every install.

**Runtime verification (closed):** at review time the override had been exercised only on Node 26 — the sole locally installed runtime, and fetching another was not permitted in-session — so it shipped with a stated residual risk on the runtimes that matter. That risk is now closed empirically: **CI boot-smoke passed on Node 20 against real Postgres with migrations applied**, and the rebuilt beta listener (**Node 22.23.5**) carries `glob@14.0.6` / `minimatch@11.0.8`, ran its migrations and reports healthy. Nothing to revert.

Supporting evidence gathered at review time, recorded because it is what justified shipping ahead of that confirmation: `glob@14.0.6` engines are `18 || 20 || >=22`, a **superset** of the `20 || >=22` of the 11.1.0 it replaces, and `minimatch@11.0.8` is `20 || >=22`, identical; the `glob@14` API was exercised against node-pg-migrate's exact usage (`withFileTypes` + `fullpath()`) and matches; eight test files import `db.js` at runtime, so the suite exercises the module load on whichever Node CI runs; `npm ci` resolves the overridden tree; and the lockfile delta is confined to the glob subtree. Should a future bump ever redden CI on a glob/minimatch module-load error, the revert is the two `overrides` entries plus `npm install` — every code fix in `72923c8` is independent of them.

---

## Accepted by design (unchanged, with the decision each cites)

| Item | Decision |
|---|---|
| Members may set private-LAN webhook targets; status + 300 B of error body readable | Auth L-1, 2026-08-30 — mitigated by M-3 rule caps; `ALERTS_ALLOW_PRIVATE_TARGETS` keeps its default |
| `POST /api/matter/events` lets a member forge event rows | API L-5, 2026-08-30 — residual of June H-1 |
| Archive export available to any member at 120 req/min | API L-8, 2026-08-30 |
| HomeKit setup codes held in `sessionStorage` in plaintext | Tab-scoped, purged on logout (web L-2); no XSS sinks and CSP in force. Browser-side encryption without a server-held key adds no real protection |
| `/api/auth/user-count` public | Cross-plan contract, Plan 05 |
| `users` / `smtp` routers reject sessionless service-token callers | Deliberate, stricter than `requireAdminSession` |
| Display-name renames triggerable at 60/min, each rewriting history | `scheduleRename` serialises every rename through one queue and re-reads the current name at run time, so concurrent DB load is bounded at 1 and rapid edits converge. LOW; no change |

---

## Verified clean

Confirmed against primary source this pass:

- **SQL injection — none.** Every `${…}` in a query was traced to origin: `EXPORT_COLUMNS` / archive `columns` are module-level literal arrays; `${table}` in `db.js` and `display-names.js` iterates a literal `['event_logs', 'event_logs_archive']`; `quiet-alerts.js` passes hardcoded column names into `latest()` with values parameterised; `alerts-router.js`'s `map[key]` is driven by `validatePatch`, which builds a **closed** key set, so neither an arbitrary column nor a prototype key can reach the SQL; `stats-router.js`'s `hourCondition` / `excludeCondition` are literal strings with `$n` placeholders, and `days` passes `parseIntInRange`.
- **Webhook SSRF** — `redirect: 'manual'`, fire-time IP pinning against `resolvedAddresses`, IPv6-mapped/loopback/link-local classification. `grep "fetch("` confirms one sender in `alerts.js`; the quiet and threshold paths delegate to it rather than opening their own.
- **CSV formula injection** — `csvCell` prefixes `= + - @ \t \r` with `'` and quotes correctly; export filenames are server-generated from a timestamp and a validated `format`.
- **Disabled-owner alert suppression** (M-1) — `quiet-alerts.js` carries the same `LEFT JOIN users … disabled_at IS NULL` filter as `processAlertsForEvent`; the newer scheduler did not regress it.
- **Secrets never serialised** — `GET /pairings` allow-lists fields (no `longTermData`/LTSK/LTPK); `smtp-router` builds its GET response field-by-field and deletes any `password` key twice over.
- **IDOR** — `revokeSessionById` scopes `AND user_id = $2`; alert-rule PATCH/DELETE append `AND user_id = $n` for session callers; `/api/me/preferences` is an opaque `jsonb` blob keyed by `user_id` with no role field, so no mass assignment.
- **Authz coverage** — every mutating route inventoried; `users-router` and `smtp-router` lack `requireAdminSession` in the chain but guard inline on `req.hcSession.role`.
- **`JsonObjectStore`** — fixed paths from env/constants (no traversal), `0600`, atomic temp-file rename, serialised writes.
- **Web** — no XSS sinks (`dangerouslySetInnerHTML` absent), `npm audit` 0.

---

## Method note

Scaled deliberately: this was a focused delta pass by one reviewer, not the six-agent whole-codebase sweep of 2026-08-30, and it should not be read as equivalent coverage. Its leverage came from reading the prior audit's accepted/deferred ledger first — which both supplied the one MEDIUM for free and prevented re-flagging four settled trade-offs.

Each fix carries a test, and every new test was checked for non-vacuity rather than assumed: the limiter test ships a companion asserting the same driver *does* observe blocking against a `max:10` limiter, so a regression that reinstated `authLimiter` would fail rather than silently pass; the dedup test would have seen 20 calls instead of 2 before the fix. One apparent failure during development was run down to the mock harness (`pool.connect is not a function` on the display-name rename path) rather than papered over, and the display-name cap is asserted on the rejection path which returns before that machinery.

Areas examined and found clean are listed above so the next pass can skip them; `accessories-router.js` and `stats-router.js` were the largest new code and are included in that list.
