---
phase: 21-email-infrastructure-invites-password-reset
plan: "04"
subsystem: listener/email-subsystem
tags: [nodemailer, smtp, email-transport, secret-isolation, admin-routes, tdd, wave-1]
dependency_graph:
  requires:
    - listener/src/emails.js
    - listener/src/smtp-config.js
    - listener/src/smtp-router.js
    - listener/test/emails.test.js (replaced Wave 0 stub)
    - listener/test/smtp-router.test.js
  provides:
    - listener/src/emails.js — nodemailer transport lifecycle + send functions
    - listener/src/smtp-config.js — SMTP secret isolation + env-over-UI merge
    - listener/src/smtp-router.js — admin-only GET/PUT /smtp + POST /smtp/test
    - listener/test/emails.test.js — 9 tests (EMAIL-01, EMAIL-03, EMAIL-04)
    - listener/test/smtp-router.test.js — 13 tests (EMAIL-04, D-01, D-03, T-21-04-ADMINONLY)
  affects:
    - listener/test/emails.test.js (replaced stub from 21-01)
tech_stack:
  added:
    - nodemailer (already installed in listener — used via initEmail)
  patterns:
    - TDD RED/GREEN per task (test commit → implementation commit)
    - Module-level singleton pattern (let transporter = null) from index.js matterRuntime model
    - _testTransport injection hook for unit tests (no real SMTP)
    - Atomic temp-rename + chmod 0600 for SMTP secret (mirrors store.js write discipline)
    - Field-by-field response construction (never spread snapshot with potential password)
    - Per-router rate limiter (smtpWriteLimiter 20/min)
    - Factory function pattern (createSmtpRouter) matching retention-router.js
key_files:
  created:
    - listener/src/emails.js
    - listener/src/smtp-config.js
    - listener/src/smtp-router.js
    - listener/test/smtp-router.test.js
  modified:
    - listener/test/emails.test.js (replaced Wave 0 stub with 9 real tests)
decisions:
  - "_testTransport injection hook added to initEmail() for testability without real SMTP; avoids module registry hacks"
  - "smtp-config.js exports SMTP_CONFIG_FILE and SMTP_SECRET_FILE constants for use in index.js wiring (Plan 21-09)"
  - "readSmtpSecret/writeSmtpSecret accept optional secretPath param for test isolation (tmp dir override)"
  - "smtp-router DELETE on response.password/smtpPass is defensive — the store snapshot never holds the secret, but the guard prevents future regressions"
  - "smtp-router POST /smtp/test returns 502 (not 500) on send failure — upstream SMTP is a dependency, not an internal error"
metrics:
  duration: "~30 minutes"
  completed: "2026-06-11"
  tasks_completed: 3
  tasks_total: 3
  files_created: 4
  files_modified: 1
---

# Phase 21 Plan 04: Email Subsystem (emails.js + smtp-config.js + smtp-router.js) Summary

**One-liner:** SMTP transport module with non-fatal degradation, 0600-file secret isolation, and admin-only GET/PUT/test routes — password never leaves the server in any API response.

## Tasks Completed

| Task | Name | Commits | Key Files |
|------|------|---------|-----------|
| 1 | emails.js transport module | 9cd278e (RED), 1bdb77f (GREEN) | listener/src/emails.js, listener/test/emails.test.js |
| 2 | smtp-config.js secret isolation + env-over-UI | 3f5b1fe | listener/src/smtp-config.js |
| 3 | smtp-router.js admin-only SMTP routes | 314c225 (RED), d03faf9 (GREEN) | listener/src/smtp-router.js, listener/test/smtp-router.test.js |

## What Was Built

### Task 1 — emails.js

- Module-level singleton (`let transporter = null`) initialized at startup via `initEmail(config)`.
- `initEmail`: guards on missing host/smtpPass (logs warn + returns early, EMAIL-01 degradation).
- `verify()` failure caught non-fatally: logs error, sets `transporter = null` — startup never crashes.
- All three timeouts required by Pitfall 4: `connectionTimeout: 10_000`, `socketTimeout: 15_000`, `greetingTimeout: 10_000`.
- `_testTransport` injection hook in `initEmail` config allows unit tests to inject a mock transport without touching module internals or real SMTP.
- `sendInvite` / `sendPasswordReset`: throw `'Email not configured'` when `transporter === null`; send text + minimal HTML bodies.
- `sendAlertEmail`: Phase-22 stub — defined, throws when disabled, not wired this phase.
- `isEmailEnabled()`: returns `transporter !== null`.
- 9 tests in `emails.test.js` replacing the Wave 0 placeholder: non-fatal verify failure, graceful degrade on missing config, sendMail called with correct args.

### Task 2 — smtp-config.js

- `readSmtpSecret([secretPath])`: env `SMTP_PASS` wins over `smtp-secret.json` (D-02); missing file returns `null`, never throws.
- `writeSmtpSecret(smtpPass, [secretPath])`: atomic temp-rename + `chmod 0600` (T-21-04-SECRETPERM).
- `buildSmtpConfig(storeSnapshot, secret)`: per-field env override for host/port/user/from/secure; returns `{ host, port, user, from, secure, smtpPass }`.
- `envOverriddenFields(snapshot)`: returns list of fields pinned by env vars for the UI's per-field notice.
- `getAppBaseUrl()`: returns `APP_BASE_URL` trimmed, or `''`.
- `SMTP_CONFIG_FILE` / `SMTP_SECRET_FILE` constants exported for use in index.js wiring (Plan 21-09).
- Zero `JsonObjectStore` references — password stored only in `smtp-secret.json` (EMAIL-04).

### Task 3 — smtp-router.js

- `createSmtpRouter({ smtpConfigStore, readSmtpSecret, writeSmtpSecret, buildSmtpConfig, envOverriddenFields, initEmail, sendTestEmail, isEmailEnabled })` factory pattern.
- Per-router `smtpWriteLimiter` (20 req/min, same shape as retention-router).
- `GET /smtp`: builds response field-by-field (`host/port/user/from/secure`); adds `passwordConfigured: secret != null` and `envFields`; defensively deletes `password`/`smtpPass` before sending.
- `PUT /smtp`: persists non-secret fields; only calls `writeSmtpSecret` when password is a non-empty string (D-01); re-inits transport immediately so changes take effect live.
- `POST /smtp/test`: 503 when disabled; calls `sendTestEmail(req.hcSession.email)` (D-03); 502 on send failure.
- Every route: `req.hcSession?.role !== 'admin'` → 403 (T-21-04-ADMINONLY).
- 13 tests: EMAIL-04 no-leak proof, admin-only, blank-password preservation (D-01), 503-when-disabled.

## Verification Results

- `node --test test/emails.test.js`: 9/9 pass
- `node --test test/smtp-router.test.js`: 13/13 pass
- `npm test` (full suite): 473/473 pass (includes 3 pre-existing Wave 0 stubs for plans 21-03, 21-06)
- `grep -c "connectionTimeout|socketTimeout|greetingTimeout" listener/src/emails.js` = 3 (all timeouts present)
- `sendAlertEmail` imported nowhere else in `listener/src/`: confirmed
- `grep -c "JsonObjectStore" listener/src/smtp-config.js` = 0 (password not in any store)
- `grep -c "0o600|0600" listener/src/smtp-config.js` = 5 (perms enforced)

## Deviations from Plan

None — plan executed exactly as written, with one minor addition:

**_testTransport injection hook** (Rule 2 - missing testability hook): The plan specified "inject a fake transporter (mock createTransport or a settable transporter)". Rather than mocking the `nodemailer` module globally (fragile), a `_testTransport` field in the `initEmail` config was added. This is a clean, non-intrusive hook that doesn't affect production behavior.

**smtp-config.js optional secretPath param**: `readSmtpSecret` and `writeSmtpSecret` both accept an optional `secretPath` parameter. The plan noted tests can be isolated "by pointing path constants at a tmp dir via env". The explicit param makes test isolation cleaner without env manipulation.

## Known Stubs

- `sendAlertEmail` in `emails.js` is an intentional Phase-22 stub. It is defined and functional (throws when disabled, sends when enabled), but is not wired to any route or caller in this phase. Plan 21-04 explicitly specifies "define but not wired this phase".

## Threat Surface Scan

Plan threat model fully mitigated:

| Threat ID | Mitigation Applied |
|-----------|-------------------|
| T-21-04-SMTPLEAK | GET response built field-by-field; defensive `delete response.password` before send; 13-test proof |
| T-21-04-SECRETPERM | `writeSmtpSecret` does atomic temp-rename + `chmod 0600` |
| T-21-04-SMTPHANG | All three timeouts set in `initEmail`; `verify()` wrapped in try/catch; send failures return 502 |
| T-21-04-ADMINONLY | Every route checks `req.hcSession?.role !== 'admin'` → 403; tested for GET/PUT/test |
| T-21-04-CLEARSECRET | `PUT /smtp` only calls `writeSmtpSecret` when `body.password` is non-empty string; tested |

No new threat surface beyond what was planned.

## Self-Check: PASSED

- listener/src/emails.js: FOUND
- listener/src/smtp-config.js: FOUND
- listener/src/smtp-router.js: FOUND
- listener/test/emails.test.js: FOUND (Wave 0 stub replaced)
- listener/test/smtp-router.test.js: FOUND
- Commit 9cd278e: FOUND (test: RED emails.js)
- Commit 1bdb77f: FOUND (feat: emails.js GREEN)
- Commit 3f5b1fe: FOUND (feat: smtp-config.js)
- Commit 314c225: FOUND (test: RED smtp-router)
- Commit d03faf9: FOUND (feat: smtp-router GREEN)
