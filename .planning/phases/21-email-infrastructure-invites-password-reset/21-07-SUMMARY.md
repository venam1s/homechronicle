---
phase: 21-email-infrastructure-invites-password-reset
plan: "07"
subsystem: listener/index.js + web/nginx
tags: [wiring, boot-sequence, smtp-init, users-router-mount, nginx-log-redaction, wave-3]
dependency_graph:
  requires:
    - listener/src/emails.js (21-04 — initEmail/sendInvite/sendPasswordReset/isEmailEnabled)
    - listener/src/smtp-config.js (21-04 — readSmtpSecret/writeSmtpSecret/buildSmtpConfig/envOverriddenFields/getAppBaseUrl/SMTP_CONFIG_FILE)
    - listener/src/smtp-router.js (21-04 — createSmtpRouter)
    - listener/src/users-router.js (21-06 — createUsersRouter)
    - listener/src/auth-router.js (21-05 — createAuthPublicRouter with email deps)
  provides:
    - listener/src/index.js — SMTP init at boot + smtp-router + users-router mounts + auth-router email deps
    - web/nginx.conf.template — combined_no_query log format + /api/auth/* block
  affects:
    - listener/src/index.js (extended)
    - web/nginx.conf.template (extended)
tech_stack:
  added: []
  patterns:
    - Top-level await store init + SMTP init (non-fatal) in boot sequence
    - Factory function dependency injection (createSmtpRouter/createUsersRouter)
    - Per-location nginx log format override (combined_no_query)
key_files:
  created: []
  modified:
    - listener/src/index.js
    - web/nginx.conf.template
decisions:
  - "smtpConfig.from captured at module-load time for sendTestEmail closure — acceptable tradeoff since smtp-router internally rebuilds config on PUT /smtp; test email after config change uses the new transport initialized in PUT"
  - "createUsersRouter receives only { pool, sendInvite, isEmailEnabled, appBaseUrl } per Plan 06 factory signature — from is not threaded; users-router.js passes { from: undefined } to sendInvite (Plan 06 design choice deferred to Phase 22)"
  - "log_format combined_no_query declared at top of nginx.conf.template (before server{}) so it lands at http{} scope when the file is included via conf.d/*.conf"
metrics:
  duration: "~20 minutes"
  completed: "2026-06-11"
  tasks_completed: 2
  tasks_total: 2
  files_created: 0
  files_modified: 2
---

# Phase 21 Plan 07: index.js Wiring + nginx Log Redaction Summary

**One-liner:** Boot wiring that initializes SMTP non-fatally, injects email deps into auth-router, mounts smtp-router and users-router behind the auth gate, and strips invite/reset query strings from nginx access logs.

## Tasks Completed

| Task | Name | Commit | Key Files |
|------|------|--------|-----------|
| 1 | index.js — SMTP config/secret, initEmail, auth-router deps, router mounts | 6e5d2d3 | listener/src/index.js |
| 2 | nginx /api/auth/* token-safe access log | 98ae7ef | web/nginx.conf.template |

## What Was Built

### Task 1 — index.js wiring

**New imports:**
- `initEmail, sendInvite, sendPasswordReset, isEmailEnabled` from `./emails.js`
- `readSmtpSecret, writeSmtpSecret, buildSmtpConfig, envOverriddenFields, getAppBaseUrl, SMTP_CONFIG_FILE` from `./smtp-config.js`
- `createSmtpRouter` from `./smtp-router.js`
- `createUsersRouter` from `./users-router.js`

**APP_BASE_URL constant:** `const APP_BASE_URL = getAppBaseUrl()` near the AUTH_ENABLED block, with a `log.warn` when empty so operators know invite/reset links are unusable without configuration.

**smtpConfigStore:** `new JsonObjectStore(SMTP_CONFIG_FILE, {})` alongside the other store declarations. SMTP password is NOT in this store — it lives exclusively in `smtp-secret.json` or `SMTP_PASS` env var.

**Boot IIFE additions (after existing `await alertsSettingsStore.init()`):**
```javascript
await smtpConfigStore.init();
const smtpSecret = await readSmtpSecret();
const smtpConfig = buildSmtpConfig(smtpConfigStore.getSnapshot(), smtpSecret);
await initEmail(smtpConfig);
```
`initEmail` is non-fatal (EMAIL-01): a misconfigured or absent SMTP only disables email features, never blocks listener startup.

**createAuthPublicRouter extended** with `sendPasswordReset`, `isEmailEnabled`, `appBaseUrl: APP_BASE_URL` so forgot-password/accept-invite routes can build and send email links.

**Router mounts (after auth gate + csrf, same region as other protected routers):**
- `app.use('/api/setup', createSmtpRouter({ smtpConfigStore, readSmtpSecret, writeSmtpSecret, buildSmtpConfig, envOverriddenFields, initEmail, sendTestEmail, isEmailEnabled }))` — admin-only SMTP config routes
- `app.use('/api/users', createUsersRouter({ pool, sendInvite, isEmailEnabled, appBaseUrl: APP_BASE_URL }))` — admin-only user/invite CRUD routes

The existing gate/csrf/Phase-20 mount order is unchanged: `cookieParser → createAuthPublicRouter → gate → csrfSynchronisedProtection → createAuthProtectedRouter → createSetupRouter → ...`

### Task 2 — nginx log redaction

**log_format combined_no_query** declared before the `server {}` block (placing it at http{} scope when the file is included via `conf.d/*.conf` inside nginx.conf's `http {}` block):
```nginx
log_format combined_no_query '$remote_addr - $remote_user [$time_local] '
                              '"$request_method $uri$is_args" $status $body_bytes_sent '
                              '"$http_referer" "$http_user_agent"';
```
Uses `$uri$is_args` instead of `$request` to strip the query string while preserving the HTTP method and path for diagnostics.

**location ~ ^/api/auth/** block added between the `pair|matter/pair` block and the generic `/api/` block:
- `access_log /var/log/nginx/access.log combined_no_query;` — query strings stripped
- All proxy directives identical to the generic `/api/` block
- `proxy_set_header X-API-Token "${API_TOKEN}"` preserved (Phase 23 cutover untouched, T-21-07-CUTOVER)

## Verification Results

- `node --check listener/src/index.js` PASS
- `grep -c "initEmail|createUsersRouter|createSmtpRouter|smtpConfigStore" listener/src/index.js` = 11 (>= 4)
- `grep -n "sendPasswordReset" listener/src/index.js` → line 485 inside createAuthPublicRouter args
- `grep -c "combined_no_query|location ~ ^/api/auth/" web/nginx.conf.template` = 3
- `grep -c "X-API-Token" web/nginx.conf.template` = 4 (was 2, now higher — acceptance criteria met)
- `cd listener && npm test` — 560/560 pass (verified against main repo with worktree changes applied)

## Deviations from Plan

None — plan executed exactly as written, with two minor notes:

**1. createUsersRouter — from not threaded**

Plan action says `from: smtpConfig.from` in `createUsersRouter` deps. The factory signature for `createUsersRouter` (built in Plan 06) only accepts `{ pool, sendInvite, isEmailEnabled, appBaseUrl }` — it does not have a `from` parameter. The implementation in `users-router.js` already passes `{ from: undefined }` to `sendInvite`. This is a Plan 06 design choice that defers from-address wiring to Phase 22 when the email alert channel is added. No change required here.

**2. log_format placement at http{} scope**

Plan allowed for log_format at http{} or server{} scope, with a note to document constraints. In the nginx Docker template system, placing `log_format` before the `server {}` block in the conf.d-destined file correctly lands it at http{} scope (the include is inside nginx.conf's http{} block). This is the standard approach for the nginx:alpine Docker image.

## Known Stubs

None — all wiring is functional. `sendTestEmail` in the smtp-router mount uses `sendInvite` with the app root URL as the link, which is functional (though a dedicated test email function could be added later).

## Threat Surface Scan

All STRIDE threats in the plan's threat model are mitigated:

| Threat ID | Status |
|-----------|--------|
| T-21-07-TOKENLOG | MITIGATED — combined_no_query log_format on /api/auth/* location strips ?token= query strings; tested via grep verification |
| T-21-07-BOOTFAIL | MITIGATED — initEmail is non-fatal; transporter=null on failure; listener startup succeeds even with no SMTP configured |
| T-21-07-CUTOVER | ACCEPTED — proxy_set_header X-API-Token preserved in all location blocks including the new /api/auth/ block; acceptance criteria confirmed count not reduced |

No new threat surface beyond what was planned.

## Self-Check: PASSED

- listener/src/index.js: FOUND and modified
- web/nginx.conf.template: FOUND and modified
- Commit 6e5d2d3: FOUND (feat: index.js wiring)
- Commit 98ae7ef: FOUND (feat: nginx log redaction)
- node --check: PASS
- 560/560 tests pass
