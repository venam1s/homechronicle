---
audit: whole-codebase security + correctness + reliability + dependency
date: 2026-08-30
head: a39bcb0 (main; v0.3.2 tag = a50afc0)
method: 6 parallel specialist review agents (auth/authz, API input & SSRF, runtime robustness, web frontend, docker/nginx/CI, email + dependencies) + deterministic scans (npm audit, npm outdated, secret grep) + orchestrator re-verification of every HIGH/MEDIUM against primary source; one live Docker DNS probe on sion for H-1
scope: listener/ + web/ + docker/ + compose + nginx + CI + scripts; delta since the 2026-06-14 audit = 82 commits / 42 code files (+2107/-335): Phase 26 member alert rules, emails.js HTML layout, nginx per-request resolver, LoginPage error branching, Settings restructure, FloatingNav
mode: report-only (no fixes applied, nothing committed)
tests_at_audit: listener 730/730, web 400/400 (green at HEAD)
previous: .planning/SECURITY-AUDIT-2026-06-14.md (fully resolved 2026-06-14)
raw_reports: .planning/audits/2026-08-30/{auth,api,runtime,web,infra,email-deps}.md + npm-audit.txt
---

# HomeChronicle Whole-Codebase Audit — 2026-08-30

> **RESOLUTION LOG (2026-08-30, same day) — audit fully addressed; shipped as v0.3.3.**
> - **HIGH:** H-1 fixed (quick 260830-1pj: entrypoint pre-resolves /etc/hosts-only `LISTENER_HOST`, 6 new template tests); H-2 fixed (260830-1qh: `patches/hap-controller+0.10.2.patch` destroys the socket + rejects on MAC failure, regression test); H-3 fixed (260830-1qh: `withTimeout` on all four HAP calls, `HAP_REQUEST_TIMEOUT_MS`/`HAP_PAIR_TIMEOUT_MS`); H-4 fixed (260830-1qi: key = `req.ip`); H-5 fixed (260830-1pj: standalone COPYs `migrations/` + `patches/`).
> - **MEDIUM:** M-1, M-3 (260830-1qj); M-2 (260830-1qi); M-4, M-5, M-6 (260830-1qh); M-7, M-8, M-9 (260830-dfe); M-10 (260830-1ql); M-11, M-13, M-14, M-15 (260830-1qm); M-12 (260830-1qi) — all fixed.
> - **LOW fixed:** Auth L-2/L-3/L-4 (1qj/1qi), API L-4 text caps (1qj), Web L-1/L-2/L-4 (dfe), Email L-1..L-5 (1ql), dependency advisories (all 9 → `npm audit` 0/0, 1ql).
> - **Accepted / deferred:** Auth L-1 member LAN webhook targets (mitigated by M-3 caps; `ALERTS_ALLOW_PRIVATE_TARGETS` stays default); API L-2/L-3/L-5..L-10, Runtime L-1..L-6, Web L-3/L-5..L-10, Infra LOWs — not addressed this pass; `@matter/main` 0.17 / `node-pg-migrate` 9 / `lucide-react` 1.x majors deferred to dedicated phases. Step 7 deferred two items: host-path `pgmigrations` re-stamp (pre-existing), and `create-release` not `needs:` the build jobs.
> - **Trade-off introduced:** beta DB sync now also excludes `alert_rules`/`alert_deliveries` (FK to excluded `users`); beta has no prod alert rules after a sync.
> - **Tests after all fixes:** see TEST / VERIFY STATUS addendum at the bottom. Raw per-step summaries: `.planning/quick/260830-{1pj,1qh,1qi,1qj,dfe,1ql,1qm}-*/`.

Findings are tagged **[VERIFIED]** (orchestrator confirmed against primary source or by live test), **[VERIFIED×2]** (two independent agents + source), or **[agent-reported]** (single specialist, plausible, not independently re-verified). Severity reflects real reachability/impact for a self-hosted, invite-only household app that runs unattended — reliability defects that silently kill a device or the process rank alongside security defects, because "runs for months untouched" is the product promise.

**All June-2026 fixes were re-verified and are still in place** (H-1 admin guards, M-2 accept-invite txn, M-3 disabled-user login, M-4 query-cache dedup, M-5 loop isolation, M-6/M-7 cookie+compose, L-1 redaction, L-2 beta port bind, L-3/L-7/M-9 web, L-9/L-12 caps, the May subscriber repair-loop fix, and the dnssd cycle-guard patch) — with **one regression** (M-2 below, the BIGINT-vs-Number type mismatch that June's H-2 fix introduced).

Headline: **5 HIGH, 15 MEDIUM, ~35 LOW.** Two of the HIGHs mean **v0.3.2 as shipped does not work for the stock self-hosted deployment** (compose default) or the standalone image at all — prod and beta are unaffected only because they use container-name upstreams and the split images.

---

## HIGH

### H-1 — v0.3.2 nginx per-request resolver breaks the STOCK compose deployment: `host.docker.internal` is `/etc/hosts`-only, Docker's embedded DNS returns NXDOMAIN → permanent 502 on every `/api/*` [VERIFIED — live-tested on sion]
`web/nginx.conf.template:23,79-80,95-96,107-108` (commit `f8295c5`, 2026-06-17): every `/api` block now does `set $hc_listener ${LISTENER_HOST}; proxy_pass http://$hc_listener:…` with `resolver ${NGINX_RESOLVER}` (default `127.0.0.11`). A hostname in a variable `proxy_pass` is resolved **exclusively through `resolver`** — nginx never consults `/etc/hosts` on that path (the old static `proxy_pass` did, via libc at config load).

`docker-compose.yml:84-87` and `docker-compose.portainer.yml:62-65` default `LISTENER_HOST=host.docker.internal`, which exists only via `extra_hosts: host.docker.internal:host-gateway` — an `/etc/hosts` line. Live probe on sion (Docker 29.0.4, user-defined network, the condition compose creates):
```
$ docker run --rm --network my-network --add-host host.docker.internal:host-gateway alpine nslookup host.docker.internal 127.0.0.11
** server can't find host.docker.internal: NXDOMAIN        # embedded DNS does NOT serve extra_hosts
$ … nslookup homechronicle-listener-1 127.0.0.11
Address: 172.16.25.28                                       # container names resolve fine
```
So on the default topology (listener `network_mode: host`, web on a bridge reaching it through `host.docker.internal`) nginx cannot resolve its upstream at request time → 502 on every API call, permanently, with the login page reporting "backend unreachable". Every documented preset uses this default (`docs/guide/networking.md:45-56`, `docs/guide/portainer.md:28`, `.env.example`). Prod (`LISTENER_HOST: listener`) and beta (`hc-beta-listener`) use compose aliases and are unaffected — which is why nothing noticed.

Why it was not caught: `scripts/test-nginx-template.sh` only exercises `LISTENER_HOST=listener` (DNS-resolvable alias) and `127.0.0.1` (IP literal — resolver unused); the runtime probe in quick 260617-f5d was against beta's alias; `nginx -t` never touches DNS. Note: the in-flight quick task `260830-0wr` extends that test script but still does not cover an `/etc/hosts`-only name.

**Fix (recommended, small):** in `web/docker-entrypoint.d/15-compute-api-token.envsh` (already sourced before envsubst), if `LISTENER_HOST` is not an IP literal and `getent hosts "$LISTENER_HOST"` succeeds via `/etc/hosts` (i.e. the name appears in `/etc/hosts`), export the resolved IP as `LISTENER_HOST`. `extra_hosts`/`host-gateway` entries are static for the container's life, so nothing is lost; compose aliases keep per-request re-resolution. Add a `host.docker.internal` case to `test-nginx-template.sh`. Alternative: document `LISTENER_HOST=<host LAN IP>` — worse UX. **Ship as v0.3.3 promptly**: anyone pulling `:latest` on the stock compose is broken now.

### H-2 — `hap-controller` encrypted-frame parser spins forever on one undecryptable frame → 100 % CPU, entire listener frozen (sibling of the May dnssd readFQDN cycle bug) [VERIFIED]
`listener/node_modules/hap-controller@0.10.2/lib/transport/ip/http-connection.js:274-291` (`_requestEncrypted` → `bodyParser`): inside `while (message.length >= 18)`, `message` is advanced only on successful decrypt; the `catch (e) { /* pass */ }` leaves `message` and `frameLength` unchanged, so a MAC failure re-runs the same decrypt **synchronously, forever**, inside a socket `'data'` handler on the single event loop — no API, no other devices, no DB writes, no timers. The same parser is re-armed on the long-lived subscription socket (`:298-302`), the connection most likely to see an a2c-counter desync over months (accessory firmware reboot mid-stream, retransmitted frame, stale session). No self-healing: `restart: unless-stopped` ignores health status. This is exactly the class that pegged prod's CPU in May (quick 260528-0it).
**Fix:** `patch-package` hap-controller (the repo already ships this pattern for dnssd): in the `catch`, destroy the socket and reject (a MAC failure means the session is unrecoverable) — or at minimum `message = message.slice(18 + frameLength)`. Add a regression test mirroring `listener/test/dnssd-fqdn-cycle.test.js`. Upstream the fix.

### H-3 — `hap-controller` has no request timeout and never rejects in-flight requests on socket close: one unanswered HAP call strands a device (or the nightly repair scheduler) until restart [VERIFIED]
`http-connection.js:87` calls `socket.setKeepAlive(true)` but **never `socket.setTimeout()`** — the `'timeout'` listener at `:98` can never fire; the `'close'` handler (`:88-92`) does not reject pending promises; `_requestEncrypted` (`:257-311`) resolves only from the HTTP parser's `onMessageComplete`. The listener awaits these with no `Promise.race`/timeout: `subscriber.js:247` `getAccessories()` (session left with `client` set, no reconnect timer → device dead until restart), `:468/:413` `subscribeCharacteristics()` (same), `:635` `pairSetup()` inside `attemptAutoRepair` (`session.repairing` stuck `true` → `connectAccessory` and the reconnect timer both bail forever), and `repair-helpers.js:33` via the scheduler (`running` stuck `true` → **scheduled repair dead for the life of the process**). Real-world triggers: Wi-Fi accessory that reboots between TCP accept and HTTP response, half-open NAT after a router reboot, accessory that accepts but stalls. Linux TCP keepalive won't probe for ~2 h, and even then the promise never settles.
**Fix (app side, no upstream change):** wrap every HAP round-trip in a bounded race that closes the client on expiry, exactly as `setup-router.js:248-251` already does for discovery — `withTimeout(client.getAccessories(), 30_000, () => client.close())` for `getAccessories`, `subscribeCharacteristics`, `getCharacteristics`, `pairSetup` in subscriber.js and repair-helpers.js; clear `repairing`/`running` in the timeout path.

### H-4 — Auth/write rate limiters keyed on the attacker-controlled **leftmost** `X-Forwarded-For` → login brute-force limiter bypassed with one header in the default topology [VERIFIED×2]
`listener/src/security.js:115-125` `rateLimitKeyGenerator`: when `trust proxy` is set it returns `forwardedFor.split(',')[0]`. nginx appends via `$proxy_add_x_forwarded_for` (`web/nginx.conf.template:84,100,112`), so a client-supplied `X-Forwarded-For: <random>` becomes the leftmost entry; `docker-compose.yml:43` / `portainer.yml:36` default `TRUST_PROXY=1` (beta `2`). Every limiter uses this key — login, claim-admin, forgot-password, invite accept, all write limiters — so a fresh bucket per request is free. Mitigation in the user's own deployment: external traffic passes Authelia two_factor first; LAN clients hit nginx directly (port 3000) and are unprotected. Rated HIGH because the control is fully defeated by a trivial header, and the June audit's T-20-BRUTE work depended on it.
**Fix:** return `req.ip` (Express already computes the correct client address from `trust proxy` hop count); keep the header-free fallback. Related: **M-12** — `TRUST_PROXY=1` is also the wrong hop count for the Traefik→nginx→listener chain prod/beta actually run (two hops), so even with `req.ip` the household shares one bucket until it is `2`.

### H-5 — Standalone image ships without `listener/migrations/` (and `listener/patches/`) → `await migrateDb()` throws at boot → supervisord crash-loop; every published `havuq/homechronicle-standalone` tag (0.2.0–0.3.2) is non-bootable [VERIFIED]
`Dockerfile.standalone:72-74` copies `node_modules`, `package.json`, `src/` — not `migrations/`. `db.js:77-80` resolves `../migrations` relative to `src/`; `index.js:235` does an unconditional top-level `await migrateDb()`. `listener/Dockerfile:34` got `COPY migrations/` on 2026-04-06; the standalone file was last touched 2026-06-03 and never did. Same file also omits `patches/` before `npm ci` (`:16-19`), so `postinstall: patch-package` finds nothing and the dnssd cycle-guard (the May prod CPU fix) is **not applied** in standalone. Nobody noticed because the standalone image is built only on stable tags and never smoke-tested (quick 260613-mas already flagged "standalone boot smoke test not run — Docker unavailable").
**Fix:** add `COPY --chown=node:node listener/migrations/ ./migrations/` after `:74` and `COPY listener/patches/ ./patches/` before `:19`; add a CI smoke job that starts the standalone image and curls `/api/health`.

---

## MEDIUM

### M-1 — Disabling (or demoting) a user does not stop their alert rules; admins cannot see or delete another user's rules → a revoked member's webhook keeps receiving every household event [VERIFIED×2]
`alerts.js:201-207` selects `WHERE enabled = TRUE` with no join on `users.disabled_at`; the disable path (`users-router.js:281`) never touches `alert_rules`; all rule CRUD is owner-scoped (Phase 26), so no admin can list or delete them. Legacy NULL-owner rules (migration 0008) fire but are invisible to everyone. **Fix:** join `users` and skip rules whose owner is disabled/deleted; give admins an "all rules" view with delete; cascade-disable on user disable.

### M-2 — June H-2 regression: users-router self-guards compare a pg BIGINT **string** to a `Number` with `===` → self-disable / self-remove guards are dead code [VERIFIED]
`users-router.js:238,350` `const targetId = Number(req.params.id)`; `:245,353` `req.hcSession.user_id === targetId`. `users.id` is `BIGSERIAL` (migration 0003) and no `pg.types.setTypeParser(20, …)` is configured, so `user_id` arrives as `'5'`; `'5' === 5` is false. Self-only impact (an admin can disable/remove their own account; the last-admin DB guard still holds). Tests pass because they mock numeric ids. **Fix:** `String(req.hcSession.user_id) === String(targetId)` or set a global int8 parser; fix the test fixtures to use string ids.

### M-3 — Any member can drive unbounded outbound webhook traffic and `alert_deliveries` growth (no per-user rule cap, sequential 5 s timeouts, failed targets never suppressed, private-LAN targets allowed by default) [VERIFIED]
`alerts-router.js:288-343` no cap on rules; `alerts.js:235-273` sequential `await sendWebhook` bounded only by `ALERTS_WEBHOOK_TIMEOUT_MS` (5000); quiet-period suppression considers only `status='sent'` (`:222-226`); `subscriber.js:388-390` awaits alert processing per change but the listener's promise is discarded, so concurrent events fan out unbounded; delivery `error` stores 300 B of response body (`:153`) and the payload carries uncapped free text — also a fixed-shape POST relay into LAN services. 200 rules at `http://10.255.255.1/` + a 1 event/s sensor ≈ 200 sockets held 5 s each and 200 delivery rows per second. **Fix:** cap rules per user (e.g. 25) and per household; bounded-concurrency fan-out with a global in-flight ceiling; suppress/backoff failed targets; cap `name/scopeValue/matchValue`; consider `ALERTS_ALLOW_PRIVATE_TARGETS=false` for member rules.

### M-4 — Matter polling is permanently disabled after 10 consecutive errors; nothing ever re-enables it [VERIFIED]
`matter-runtime.js:92-95` sets `pollingEnabled=false`; the only `true` assignment is a brand-new session (`:251`) and `syncPairings` keeps existing sessions. Default mode is 5 s polling, so ~50 s of unreachability (reboot, Wi-Fi blip, sleepy end device) silently drops the device until listener restart or re-pair. **Fix:** exponential backoff instead of a hard stop, or auto-re-enable after a cool-down; expose re-enable in `syncPairings`.

### M-5 — Repair scheduler chain dies on the first rejected cycle [VERIFIED]
`repair-scheduler.js:64-69`: `await runRepairCycle()` is unguarded inside the timer callback; `scheduleNext` is never reached if it rejects. `runRepairCycle` rethrows `saveSettings` failures (`repairStore.write` → ENOSPC/EACCES/NAS hiccup). One failure at 03:00 → logged as unhandledRejection, **no further scheduled repairs until restart**. `:92-93` also run before the `try` (`running` stuck if they throw). **Fix:** `try/catch/finally { if (enabled) scheduleNext(hour) }`.

### M-6 — No SIGTERM/SIGINT handling: every `docker stop` / redeploy is an abrupt kill [VERIFIED absence]
No signal handlers in `listener/src`. Consequences: `JsonObjectStore._doWrite` (`store.js:82-87`) interrupted between `writeFile(tmp)` and `rename` leaves `*.tmp-<pid>-<ts>` files accumulating forever in `/app/data`; HAP sessions never closed → accessories hold dead controller sessions and rapid restart cycles can trip the **terminal** "max peers reached" path (`subscriber.js:98-101,509-513`); matter `CommissioningController` never closed; in-flight `insertEvent`s dropped. Beta is recreated nightly, prod on every deploy. **Fix:** `process.once('SIGTERM'|'SIGINT')` → stop scheduler, close all HAP/matter sessions, `pool.end()`, exit within ~8 s (Docker grace 10 s); sweep stale `.tmp-*` on store init.

### M-7 — Per-user preferences: whole-blob PUT fired before `GET /me/preferences` has resolved truncates the user's server blob (cross-device loss) [VERIFIED code path]
`web/src/components/UserPreferencesProvider.jsx:169-171` builds the flush body from `getQueryData(['me','preferences']) ?? {}` + partial; nothing gates on the query's `status === 'success'` (`retry:false`); `me-router.js:57-67` is a whole-blob replace. Deterministic trigger: the logout purge removes `hc_dashboard_*`, so on next login `useDashboardLayout`'s seeding effect calls `setPrefsBlob({dashboardHidden})` on mount → flush at +500 ms; a slow or failed first GET → server prefs replaced by `{dashboardHidden}`. **Fix (client):** re-arm the debounce until `getQueryState(...).status === 'success'` (or `ensureQueryData`). **Fix (server, belt-and-braces):** `SET prefs = user_preferences.prefs || EXCLUDED.prefs` or add PATCH.

### M-8 — Per-user Timeline grouping preferences are dead for authenticated users [VERIFIED]
`SettingsTab.jsx:535-547` (authed branch) writes `episodeWindowMinutes`/`sceneWindowSeconds`/`episodeMinEventCount` only to the per-user blob; the sole consumer `Timeline.jsx:54-61` reads them only from `['setup','retention']`. Saving has no effect. **Fix:** read via `usePreference(...)` in Timeline with retention as fallback, or write back to retention for everyone.

### M-9 — Dashboard Quiet Hours "Exclude" writes the shared retention config while the server reads the per-user blob → no effect; members get a silent 403 [VERIFIED]
`QuietHoursPanel.jsx:31-45` PATCHes `/api/setup/retention` (admin-only since June H-1); `stats-router.js:345-361` resolves quiet hours from `user_preferences` whenever the blob has `quietHoursEnabled`. No `onError`. **Fix:** branch like SettingsTab — when the user's blob has QH keys, `setPrefsBlob({...quietHoursExcludedAccessories})`; add an error toast.

### M-10 — SMTP transport uses opportunistic STARTTLS (no `requireTLS`) → plaintext credential fallback on 587 if STARTTLS isn't advertised or is stripped on-path [VERIFIED]
`emails.js:161-172` `createTransport({host, port, secure, auth, …timeouts})`; default `port 587`, `secure=false`. Requires an on-path attacker (home LAN → ISP → provider); not API-triggerable. **Fix:** `requireTLS: !secure` (env `SMTP_REQUIRE_TLS` default true) + `disableFileAccess: true, disableUrlAccess: true` while bumping nodemailer to 9.x (see DEPENDENCY).

### M-11 — Tag pipelines build, publish, and release without running `test` [VERIFIED]
`.gitlab-ci.yml:20-22` `test` runs only for MR and `main` pushes; `$CI_COMMIT_TAG` pipelines go `validate-release → build-* → create-release` with no test dependency. The 2026-08-08 main pipeline was red and v0.3.2 shipped without CI ever running its tests (they passed locally). **Fix:** add `- if: $CI_COMMIT_TAG` to `test.rules` and `needs: [validate-release, test]` on `.build-base`/`create-release`.

### M-12 — `TRUST_PROXY=1` default and docs are wrong for the Traefik→nginx→listener chain prod/beta actually use (2 hops) → whole household shares one auth-limit bucket [VERIFIED]
`docker-compose.yml:43`, `portainer.yml:36`, `docs/guide/environment-variables.md:75`, `security.md:46` say "1 behind nginx or Traefik", but nginx always appends its own hop, so behind Traefik it must be `2` (beta already is). Also `nginx.conf.template:85,101,113` overwrite `X-Forwarded-Proto` with `$scheme` (`http` between Traefik and nginx) — inert today (listener never reads it) but the first thing to check if `SESSION_COOKIE_SECURE=true` is retried. **Fix:** with H-4's `req.ip` change, document "hop count = number of proxies", default `1` for plain nginx, `2` behind a TLS terminator; pass through `$http_x_forwarded_proto` when present.

### M-13 — Host-cron `sync-prod-to-beta.sh` restores the FULL prod dump, non-atomically, including auth tables [VERIFIED]
`scripts/sync-prod-to-beta.sh:113-115` `pg_dump --clean --if-exists` (no `--exclude-table`) | `psql -v ON_ERROR_STOP=1` (no `--single-transaction`), invoked by the nightly `sync-beta-auto.sh:113` and `deploy-beta.sh:102`. Beta's `users/sessions/invites/password_reset_tokens` are replaced by prod's on every run (contradicts the in-stack `db-sync` policy that excludes them), and a mid-restore failure leaves beta half-restored. **Fix:** share the exclusion list with `docker/beta-db-sync.sh`, add `--single-transaction`, or retire this path in favour of the in-stack one-shot.

### M-14 — In-stack `db-sync` exclusion list is stale: FK-bearing `user_preferences` (0007) and `alert_rules.user_id` (0008) are still dumped → restore against beta's different `users` rows fails/rolls back once prod has real accounts [VERIFIED by reading; failure mode suspected]
`docker/beta-db-sync.sh:112` excludes only `users sessions invites password_reset_tokens`. **Fix:** exclude `user_preferences`, and null `alert_rules.user_id` (or exclude `alert_rules`) in the dump; add a post-restore FK sanity check.

### M-15 — Beta listener mounts production's `listener_data` read-write, unused [VERIFIED]
`docker-compose.beta.yml:115` `/mnt/Primary/apps/homechronicle/listener_data:/prod` on the listener without `:ro` (db-sync has `:ro` at `:75`); nothing in `listener/src` references `/prod`. Widens the blast radius of any beta bug or `docker exec` to prod's `pairings.json`. **Fix:** drop the mount (or `:ro`).

---

## LOW (by area — details and file:line in the raw reports)

**Auth (auth.md):** L-1 members can point webhook rules at private-LAN targets and read status + 300 B of error body (member-grade SSRF probe; likely accepted, see M-3) · L-2 `AUTH_ENABLED=false` makes alert-rule CRUD unusable (GET `[]`, writes 401; firing still works) [VERIFIED×2] · L-3 `PATCH /api/auth/password` has no rate limiter (stolen session can brute-force the current password) · L-4 member PATCH `channel:'webhook'` + any `targetEmail` key → 400 from CHECK constraint (lock ordering).

**API (api.md):** L-2 fire-time IP pinning breaks HTTPS webhooks to DNS-named hosts, nudging users to `http://` [suspected] · L-3 JSON stores accept unbounded keys/values from any member · L-4 alert-rule text fields uncapped · L-5 `POST /api/matter/events` lets any member forge event rows (residual of June H-1) · L-6 invite email not format/length-validated · L-7 unvalidated `from/to/hour` → Postgres cast error → 500 · L-8 500k-row archive export available to any member at 120 req/min · L-9/L-10 informational (SSRF guard residuals; `PATCH /api/setup/alerts enabled` is now a dead knob).

**Runtime (runtime.md):** L-1 `JsonObjectStore.refresh()` can regress the cache to pre-write content (mtime race) [suspected] · L-2 `scheduleReconnect` never clears an already-pending timer · L-3 disabling scheduled repair mid-cycle doesn't stop it; re-enable can double-schedule · L-4 delivery volume O(events × rules), failed targets retried every event (see M-3) · L-5 during a LAN outage every HomeKit device spawns its own 10 s mDNS browser per backoff round · L-6 pg Pool untuned; retention archive move is one unbounded transaction.

**Web (web.md):** L-1 sidebar collapse never persists (functional updater passed to `usePreference` setter) · L-2 logout purge misses 7 `hc_pref_*` keys + `hc_pins` (June L-7 incomplete) · L-3 update check is dead in production (CSP `connect-src 'self'` vs GitHub URL) · L-4 auth-off mode still polls `/api/auth/me` → 401 spam (`useAuth` lacks `enabled`) · L-5 Settings tab a11y gaps (arrow-key nav, `aria-controls`) · L-6 no root-level ErrorBoundary · L-7 any `/auth/me` failure treated as logged-out [suspected UX] · L-8 LoginPage status-matrix edge cases · L-9 `react-router-dom` 7.17.0 < advisory floor — no exposure (all `to` targets are literals), bump anyway · L-10 misc.

**Infra (infra.md):** 11 items — `trivy` scan is `|| true` (non-blocking), Docker Hub credential scope, D-Bus socket mount exposure, missing HSTS at nginx (Traefik handles it in the user's setup), `:latest` pins (accepted), healthcheck vs `restart` policy mismatch, standalone token log (accepted), etc.

**Email (email-deps.md):** L-1 invite/claim-admin addresses never format-validated (nodemailer strips CRLF, so no header injection) · L-2 sibling password-reset tokens stay valid ≤1 h after a successful reset · L-3 `PUT /api/setup/smtp` returns `ok:true` even when `verify()` failed (email silently disabled) · L-4 URL slots in the email layout not attribute-escaped; `APP_BASE_URL` not validated as a URL (env-only, safe today) · L-5 SMTP `port`/`host` unvalidated (admin-only).

---

## DEPENDENCY (npm audit + npm ls + reachability analysis) — all 9 advisories UNREACHABLE or dev/build-only in this app

| Package | Pulled in by | Advisory | Reachable here? | Action | Breaking? |
|---|---|---|---|---|---|
| `nodemailer@8.0.11` (direct) | — | message-level `raw` bypasses `disableFileAccess/UrlAccess` (file read / SSRF) | **No** — no `raw`/`attachments`/`path`/`href` anywhere | `nodemailer@9.0.6` + set `disableFileAccess/disableUrlAccess: true` + M-10 `requireTLS` in one change | major, low API risk |
| `ip-address@10.2.0` | `express-rate-limit` | leading-zero-octet / CIDR-suffix SSRF classification bypass | **No** — the listener's SSRF guard (`security.js`) is self-contained (WHATWG URL + own CIDR math) and every limiter uses the custom keyGenerator; agent probed octal/short/hex/IPv6-mapped/CIDR/DNS-to-loopback inputs — all blocked | `npm audit fix` | no |
| `brace-expansion@5.0.6` | `node-pg-migrate → glob → minimatch` | ReDoS/OOM | **No** — startup-only on a fixed dir | `npm audit fix` | no |
| `body-parser@2.2.2` | `express@5` | invalid `limit` disables size cap | only if an operator sets a malformed `API_JSON_LIMIT` (default `256kb`) | `npm audit fix` → 2.3.0 | no |
| `form-data@4.0.5` | `supertest` (dev) | CRLF injection | **No** — dev only, `npm ci --omit=dev` | `npm audit fix` | no |
| `react-router(-dom)@7.17.0` (direct, web) | — | open redirect via backslash in `<Link>`/`useNavigate`; RSC XSS | **No** — every `to`/`navigate()` target is a literal | bump to `^7.18.3` | no |
| `postcss@8.5.15`, `nanoid@3.3.12` | build chain | sourcemap path traversal; infinite loop | **No** — build-time on repo-controlled CSS; prod image is nginx + `dist/` | `npm audit fix` | no |
| `undici@7.24.5` | `jsdom` (dev) | 12 advisories | **No** — vitest only | `npm audit fix` | no |

`npm audit fix` (no `--force`) clears everything except nodemailer. Overrides/patches/lockfiles: `fast-xml-parser` override is dead (drop it); `picomatch` override still needed; dnssd patch applies on `listener/Dockerfile` but **not** in standalone (H-5); lockfiles in sync; all Dockerfiles and CI use `npm ci`. Outdated majors: `@matter/main` 0.16→0.17 (HIGH churn risk, dedicated phase), `node-pg-migrate` 8→9 (moderate; runs on every boot of every install — defer), `lucide-react` 0.408→1.37 (icon renames; optional). Risky-pattern scan (`child_process`/`eval`/untrusted `JSON.parse`/user-controlled fs paths): clean.

## SECRETS — CLEAN
`git grep` for hard-coded keys/tokens/JWTs/private keys across the tree: nothing. Beta `.env`, pairings, Dockhand tokens all outside the repo.

## VERIFIED-CLEAN (strong controls confirmed by ≥1 agent + orchestrator)
Server-side admin enforcement on all destructive routes (June H-1) · Phase 26 rule ownership/IDOR on GET/PATCH/DELETE/deliveries and non-admin `targetEmail` lock incl. PATCH-without-channel (T-26-EMAIL-SPOOF) · argon2id + timing-safe compare + 12-char minimum + common-password list · HttpOnly/SameSite session cookies, CSRF double-submit on every mutating route, owner-only session revoke · `X-API-Token` injected by nginx only when `AUTH_ENABLED=false`, and client-supplied token headers overridden · SSRF guard incl. IPv6-mapped/loopback/link-local + fire-time IP pinning · all SQL parameterized (no string-built ORDER BY/LIMIT) · prefs blob 64 KB cap, accessory array cap 200 · June M-4 query-cache dedup/negative cache and M-5 loop isolation intact · May repair-loop `succeeded` gate intact · dnssd cycle guard applied (split images) · CSP/XFO/CORP/COOP/Permissions-Policy present · no XSS sinks in web (`dangerouslySetInnerHTML` absent; API strings never reach `href`/`src` unescaped) · AuthGate/useAuth share one queryFn · CR-01 single-provider debounce + inFlightRef + seq guard intact (M-7 is a different gap) · SW never caches `/api` · escapeHtml applied to all text slots in emails; nodemailer strips CRLF from headers · invite/reset tokens 32-byte random, SHA-256 stored, expiring · no `child_process`/`eval`.

## TEST / VERIFY STATUS
listener 730/730, web 400/400 at HEAD `a39bcb0` (quick 260830-0wr added tests during this audit). `npm audit`: listener 5 (4 high, 1 low — none reachable), web 5 (4 high, 1 moderate — none reachable). Docker daemon unavailable locally, so no `nginx -t`/image smoke; H-1 was verified live on sion instead.

---

## Suggested remediation order

1. **v0.3.3 hotfix (same day):** H-1 (entrypoint `/etc/hosts` fallback + test case) and H-5 (standalone `COPY migrations/` + `patches/` + a CI smoke job). Both are ≤10-line changes; both mean the current release is broken for anyone not on the user's own prod/beta topology.
2. **Listener reliability quick (1 task):** H-2 patch-package + regression test; H-3 `withTimeout` on the four HAP calls; M-4 backoff; M-5 try/finally; M-6 SIGTERM handler + `.tmp-*` sweep.
3. **Auth/limiter quick:** H-4 `req.ip`; M-12 docs/defaults; M-2 string compare + fixture fix; auth L-3 limiter on password change.
4. **Alerts quick:** M-1 disabled-owner join + admin all-rules view; M-3 rule cap + bounded fan-out + failed-target suppression + text caps; L-2/L-4 auth-off CRUD + lock ordering.
5. **Web prefs quick:** M-7 gate flush on query success (+ server merge); M-8 Timeline reads prefs; M-9 QuietHours exclude branch; web L-1/L-2/L-4.
6. **Deps + email quick:** `npm audit fix` ×2, `react-router-dom ^7.18.3`, nodemailer 9 + `requireTLS` + `disableFileAccess/UrlAccess` (M-10), drop dead `fast-xml-parser` override, email L-1..L-5.
7. **Beta/CI hygiene:** M-11 tests on tags, M-13/M-14 sync exclusions + `--single-transaction`, M-15 drop RW prod mount.
8. Defer: `@matter/main` 0.17, `node-pg-migrate` 9, `lucide-react` 1.x to dedicated phases.

## TEST / VERIFY STATUS — after remediation (2026-08-30)
Fresh `npm ci` on merged main: listener **820/820**, web **416/416**, `npm run build` OK, `scripts/test-nginx-template.sh` PASS (nginx -t skipped: no local Docker), `npm audit` **0/0** in both packages. Released as **v0.3.3**.
