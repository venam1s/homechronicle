---
audit: whole-codebase security + correctness + dependency
date: 2026-06-14
method: 6 parallel specialist audit agents + deterministic scans (npm audit, secret grep) + adversarial verification of material findings against primary source
scope: listener/ + web/ + docker/compose/nginx config
mode: report-only (no fixes applied)
tests_at_audit: listener 638/638, web 331/331 (green)
---

# HomeChronicle Whole-Codebase Audit — 2026-06-14

> **RESOLUTION LOG (2026-06-14) — audit fully addressed.**
> - **Fixed (quick 260614-ikn):** H-1.
> - **Fixed (quick 260614-j12):** H-2, M-1, M-6, M-7, L-4, L-5, L-6 + dependency `npm audit fix` → **0 vulnerabilities** in both packages (lockfile-only, no major bumps; `patch-package` kept in `dependencies` because the Dockerfile uses `npm ci --omit=dev` + `postinstall: patch-package`).
> - **Fixed (quick 260614-jfv):** M-2 (accept-invite wrapped in a transaction), M-3 (disabled-user login → 401), M-4 (query-cache in-flight dedup + negative caching), M-5 (per-iteration try/catch in the alerts loop + matter ingestRows), M-8 (startup warn when CORS_ALLOW_LOCALHOST+production; CSP unsafe-inline accepted — Tailwind v4 constraint), M-9 (QuietHoursPanel setState→useEffect), L-1 (target_url redacted on POST/PATCH/deliveries), L-2 (beta listener port bound to 127.0.0.1), L-3 (['setup','retention'] staleTime aligned to 30s), L-7 (logout purges per-user pref localStorage + csrfToken), L-9 (password min raised to 12), L-12 (quietHoursExcludedAccessories capped at 200; email length-check before regex).
> - **Accepted / won't-fix (rationale):** M-8 CSP `style-src 'unsafe-inline'` (required by Tailwind v4 runtime); L-8 PIN/CSRF in sessionStorage (inherent to the pattern; XSS posture is clean); L-10 DNS-rebind (already mitigated by fire-time IP pinning); L-11 migration 0005 (migrations are tracked/run-once and 0005 already has `DROP CONSTRAINT IF EXISTS`); remaining L-12 micro-items (store.js temp-name, `ALTER USER` cmdline — PG16 redacts, standalone token log, `:latest` tags, IPv6 `fec0::/10` deprecated range).
> - **Tests after all fixes:** listener **666/666**, web **331/331**. npm audit: **0/0**.

Findings are tagged **[VERIFIED]** (confirmed by me against primary source), **[VERIFIED×2]** (two independent agents + source), or **[agent-reported]** (plausible, from a single specialist agent, not independently re-verified). Severity reflects production reachability for a self-hosted, invite-only household app.

## HIGH

### H-1 — Authorization mismatch: UI hides destructive actions from members, server does NOT enforce admin [VERIFIED] — ✅ RESOLVED (quick 260614-ikn, commits 5d55da4 + aee85b4)
**Resolution:** user chose server-side enforcement. Added legacy-safe `requireAdminSession` middleware (`if (req.hcSession && req.hcSession.role !== 'admin') → 403`) to alerts/alerts-settings/archive/retention/repair/matter/setup mutating routes; service-token + AUTH_ENABLED=false paths preserved; `/matter/events`, room/display-name/note, `/me`, GETs left open. Tests added (member→403, admin/no-session→pass). listener 656/656.

**This is an enforcement mismatch, and the fix direction is a product decision, not a settled vuln.** The milestone is explicitly "household accounts, NO per-user isolation" — so it's plausible members are trusted peers and the UI hiding is just tiering (in which case the server is fine and the UI is the only gap), OR the documented "members can't delete devices" intent means the server SHOULD enforce (in which case this is broken access control). Decide which before fixing.

The facts: the global auth gate (`index.js:546-569`) authorizes any valid **session OR API_TOKEN** but never checks `role`. Only `users-router.js` and `smtp-router.js` enforce admin. The web UI hides device/data/retention/alert controls from members **client-side only** (`SettingsPage.jsx` `isAdmin`). A member can bypass the UI and call these routes directly — they have **no role check** (only write-rate-limiters):
- `DELETE /api/data/all` — wipe ALL events (`archive-router.js:150`)
- `DELETE /api/data/accessory` — delete a device's events (`archive-router.js:127`)
- `DELETE /api/setup/matter/pairing/:nodeId`, `POST /setup/matter/commission|pair` (`matter-router.js:233,109,157`)
- `PATCH /api/setup/retention` — shorten retention → mass deletion on next sweep
- `POST|PATCH|DELETE /api/alerts/rules` — incl. webhook target URLs (attacker-controlled exfil endpoint)

REQUIREMENTS **USER-05** ("admin-only actions enforced server-side") is marked done but appears satisfied only for user-management (`users-router`), not for device/data/retention/alerts. The recent Settings restructure made these admin-only **in the UI** without adding server enforcement.
**If the decision is "enforce server-side":** add a `requireAdmin`-style guard (the pattern already in `smtp-router.js`/`users-router.js`) to every state-mutating route outside `/api/auth` and `/api/me`; leave read-only GETs (events/stats) open to all authenticated users. **If the decision is "members are trusted peers":** USER-05's wording and the UI gating should be reconciled to match, and this drops to informational.

### H-2 — `req.hcSession.userId` is always undefined in users-router (camelCase vs `user_id`) [VERIFIED×2] — severity arguably Medium
(Self-only impact: an admin can disable/delete only their **own** account, and the last-admin DB guard still blocks a zero-admin state; the concrete harm is the `invited_by` audit column silently NULL. Ranked here for visibility but lower-impact than H-1.)
`index.js:554-557` builds `req.hcSession` by spreading the session row (which has `user_id`) and adding only `csrfToken` — it never sets `userId`. `users-router.js` reads `req.hcSession.userId` at lines 149, 211, 245, 353.
- Self-disable guard (`:245`) and self-delete guard (`:353`) compare `undefined === targetId` → always false → an admin can disable/delete their own account (the last-admin DB guard still blocks zero-admin, so it's not catastrophic, but the self-protection is bypassed).
- `invitedBy: req.hcSession.userId` (`:149,:211`) stores `NULL` → invite audit trail lost.
**Fix:** replace all four `req.hcSession.userId` → `req.hcSession.user_id`. (`auth-router.js` and `me-router.js` already use `user_id` correctly.)

## MEDIUM

### M-1 — `TRUST_PROXY` unset in docker-compose.yml and docker-compose.portainer.yml [VERIFIED — matches prior T-20-BRUTE work]
Only `docker-compose.beta.yml` sets `TRUST_PROXY=2`. Without it, Express ignores `X-Forwarded-For`; behind nginx all clients collapse into one rate-limit bucket → the auth limiter is shared household-wide (10 failed logins lock out everyone). **Fix:** add `TRUST_PROXY: ${TRUST_PROXY:-1}` to the listener env in the prod + portainer compose files.

### M-2 — accept-invite is not atomic [agent-reported — matches known WARNING-1]
`auth-router.js:296-313` calls `redeemInvite()` (marks invite used) then `createUser()` with no wrapping transaction. If `createUser` throws, the invite is consumed but no account exists; user can't retry. **Fix:** wrap redeem+create in one `BEGIN/COMMIT` with `ROLLBACK` on failure.

### M-3 — Disabled user login returns 200 + cookie, then 401 on every request [agent-reported]
`POST /login` (`auth-router.js:193-213`) never checks `user.disabled_at`. `validateSession` does, so the session is immediately invalid — no security bypass, but a confusing login-then-locked UX. **Fix:** add a `disabled_at` check after password verification.

### M-4 — query-cache cold-miss stampede + no negative caching [agent-reported]
`query-cache.js` cold path runs `queryFn()` with no in-flight dedup and no error caching. N concurrent tabs after a cold start/expiry each fire the same expensive stats CTE; under DB stress every request retries a failing query instead of backing off. **Fix:** store the in-flight Promise on cold miss; add a short error sentinel TTL.

### M-5 — One failure aborts a batch loop (two sites) [agent-reported]
- `alerts.js` per-rule loop: a `createDelivery` failure aborts delivery records for subsequent rules → next event's suppression check finds no prior delivery and fires (defeats quiet-period).
- `matter-runtime.js ingestRows`: one bad row's `insertEvent` aborts the batch; 10 consecutive errors disable that device's polling until restart.
**Fix:** per-iteration try/catch + `log.warn`, continue the loop.

### M-6 — clearCookie omits `secure` flag [VERIFIED pattern]
`auth-router.js:447` clears `hc_session` without `secure: SESSION_COOKIE_SECURE`; some browsers won't clear a Secure cookie unless attributes match. **Fix:** add the flag to `clearCookie`.

### M-7 — `POSTGRES_PASSWORD=changeme` default in portainer compose [VERIFIED]
`docker-compose.portainer.yml:7,29` defaults the DB password (and DATABASE_URL) to `changeme` with no `env_file`. Mitigated by postgres binding to `127.0.0.1` (not externally reachable), but a Portainer deploy without setting the var runs a known-default credential. **Fix:** drop the `:-changeme` fallback / fail fast.

### M-8 — CSP `style-src 'unsafe-inline'`; CORS `credentials:true` + loopback reflection (dev) [agent-reported]
nginx CSP allows inline styles (Tailwind v4 runtime constraint — `script-src` is correctly locked with no unsafe-eval). CORS reflects loopback origins with credentials when `CORS_ALLOW_LOCALHOST=true` (default only in non-production). **Fix:** document both; add a startup warn if localhost CORS is on in production.

### M-9 — setState during render in QuietHoursPanel [VERIFIED — downgraded from agent's "infinite loop"]
`QuietHoursPanel.jsx:55-58` calls `setDismissed(false)` in the render body. It is self-terminating (the setState makes the condition false on the next render), so it is a React warning + one extra render, **not** an infinite loop. Still an anti-pattern. **Fix:** move into a `useEffect([dismissed, data?.enabled])`.

## LOW

- **L-1** Webhook `target_url` returned unredacted in `POST/PATCH /alerts/rules` and `GET /alerts/deliveries` responses (GET /rules redacts). URLs often embed secrets. [agent]
- **L-2** beta compose publishes the listener port on `0.0.0.0` (bypasses nginx headers/rate-limit); bind to `127.0.0.1`. [agent]
- **L-3** `['setup','retention']` shared query key with three different `staleTime`s (10s/30s/300s) → inconsistent refresh. [agent]
- **L-4** `saveDisplayNameMutation` doesn't invalidate `['accessories']` → ~15s stale device name. [agent]
- **L-5** QuietHoursPanel exclude button lacks `stopPropagation` → click also navigates to Timeline. [agent]
- **L-6** `<ErrorBoundary key="detail">` is a fixed key → stays errored across accessory switches; use `key={selectedAccessoryId}`. [agent]
- **L-7** localStorage prefs not purged on user switch → brief flash of previous user's theme/layout (TanStack cache IS cleared on logout, so no event-data leak). [agent]
- **L-8** HomeKit PIN vault (`hc_pins`) and CSRF token stored in sessionStorage → readable by any same-origin XSS (inherent to the pattern; XSS posture is clean today). [agent]
- **L-9** Password min length inconsistent: claim-admin requires 12, `validatePasswordStrength` requires 10. [agent]
- **L-10** DNS-rebind residual: create-time webhook validation is advisory (no DNS); fire-time DOES resolve+pin (`alerts.js:141`) + `redirect:'manual'`, so classic rebind is mitigated. Minor residual only. [VERIFIED — downgraded from agent's HIGH]
- **L-11** Migration `0005` `ADD CONSTRAINT` not idempotent (no `DO $$ … duplicate_object` guard) — only matters on manual re-run with single-transaction abort. [agent]
- **L-12** Misc hardening: IPv6 `fec0::/10` site-local not blocked (deprecated); email length check after regex; `quietHoursExcludedAccessories` array uncapped (capped indirectly by 256KB blob limit); `store.js` temp filename predictable; `ALTER USER … PASSWORD` visible in process cmdline; standalone entrypoint logs a truncated token; `:latest` image tags. [agent]

## DEPENDENCY (npm audit) [CORRECTED against `npm ls` — the sub-agent's "false positive / fixed version" claim was WRONG]
- **listener: 6 moderate, all present at the flagged versions and all in the PRODUCTION dependency tree** (`npm ls` confirmed): `brace-expansion@5.0.5` (via `uuid`←`hap-controller`), `ip-address@10.1.0` + `qs@6.15.0` (via `express-rate-limit`), `uuid@11.1.0` (via `hap-controller`), `yaml@2.8.2` (via `patch-package`). npm flags by installed-version-in-range, so these advisories genuinely apply. **A non-breaking `npm audit fix` is available** (`--dry-run` changes 6 packages, no `--force`/breaking). Practical exploitability is **low** because the app does not feed attacker-controlled input to the vulnerable code paths (ip-address HTML emit, qs.stringify comma-format, brace-expansion ranges, uuid buf arg, deeply-nested YAML), but they should be patched. **Fix:** run `cd listener && npm audit fix`; move `patch-package` to `devDependencies` (removes `yaml` from the prod tree); drop the dead `fast-xml-parser` override.
- **web: 1 high (vite path traversal) + 1 moderate (postcss) — dev/build-only, NOT production-reachable.** This conclusion holds on architecture you can verify: production web ships as a static `nginx:alpine` image with no Node runtime, and both packages are `dev: true`. Still worth `npm audit fix` to keep the dev surface clean.

## SECRETS — CLEAN
No hardcoded secrets in tracked files (all matches are `${{ secrets.* }}` refs, SQL column names, comments, or documented placeholders). No `.env`/`pairings.json`/`smtp-secret.json` tracked in git.

## VERIFIED-CLEAN (strong controls confirmed by multiple agents + source)
Parameterized SQL across 40+ query sites (no string interpolation of user data anywhere); argon2id (OWASP params); timing-safe API_TOKEN compare; session tokens SHA-256 hashed at rest; bootstrap-admin race fixed via `pg_advisory_xact_lock`; session revoke is IDOR-safe (`id=$1 AND user_id=$2`); `me-router` scopes all per-user reads/writes to `req.hcSession.user_id` (no IDOR on preferences/quiet-hours); SMTP password isolated in 0600 file, never returned by API; no secrets in logs or responses; webhook SSRF protection (private/loopback/link-local blocked, IP-pinned fetch, `redirect:'manual'`); CSRF token in sessionStorage+header (not a cookie); query cache cleared on logout; `['auth','me']` divergence bug fixed; DB clients released in `finally`; subscriber/Matter timers + handlers cleaned up; postgres bound to `127.0.0.1` in all compose files; `X-Powered-By` disabled; invite/reset tokens single-use + hashed.

## TEST / VERIFY STATUS
Full suites green and unchanged since the Phase 25 fixes: **listener 638/638, web 331/331**. No code was modified during this audit (report-only).
