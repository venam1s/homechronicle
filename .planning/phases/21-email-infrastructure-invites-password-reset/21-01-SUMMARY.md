---
phase: 21-email-infrastructure-invites-password-reset
plan: "01"
subsystem: listener/email-infra
tags: [nodemailer, migration, db-schema, test-stubs, wave-0]
dependency_graph:
  requires: []
  provides:
    - listener/migrations/0004_invites_reset_tokens.sql
    - listener/node_modules/nodemailer@8.0.11
    - listener/test/emails.test.js (stub)
    - listener/test/users-router.test.js (stub)
    - listener/test/db-invites.test.js (stub)
  affects:
    - listener/package.json
    - listener/package-lock.json
    - .env.example
tech_stack:
  added:
    - nodemailer@8.0.11 (npm, listener)
  patterns:
    - migration 0004 mirrors 0003 exactly (Up/Down markers, BIGSERIAL PK, idx_<table>_<column> naming)
    - Wave 0 test stub pattern (placeholder test + req ID header comment)
key_files:
  created:
    - listener/migrations/0004_invites_reset_tokens.sql
    - listener/test/emails.test.js
    - listener/test/users-router.test.js
    - listener/test/db-invites.test.js
  modified:
    - listener/package.json
    - listener/package-lock.json
    - .env.example
decisions:
  - "Used idx_<table>_<column> naming for all 5 indexes (matches 0003 convention)"
  - "Migration Down section includes ALTER TABLE users DROP COLUMN IF EXISTS disabled_at (additive column is safe to drop in Down)"
  - "dnssd-fqdn-cycle.test.js failure in full suite run is pre-existing flakiness (15s timeout on local cold ESM import) — not caused by this plan"
metrics:
  duration: "~12 minutes"
  completed: "2026-06-11"
  tasks_completed: 3
  tasks_total: 3
  files_created: 4
  files_modified: 3
---

# Phase 21 Plan 01: Wave 0 Foundation (nodemailer + Migration 0004 + Test Stubs) Summary

**One-liner:** nodemailer 8.0.11 installed, migration 0004 adds invites/password_reset_tokens/disabled_at, three Wave 0 test stubs created — all downstream plans can now land.

## Tasks Completed

| Task | Name | Commit | Key Files |
|------|------|--------|-----------|
| 1 | Install nodemailer + document env vars | 8f11f10 | listener/package.json, package-lock.json, .env.example |
| 2 | Author migration 0004 | a1fe6ab | listener/migrations/0004_invites_reset_tokens.sql |
| 3 | Create Wave 0 test stub files | 55401a7 | listener/test/emails.test.js, users-router.test.js, db-invites.test.js |

## What Was Built

### Task 1 — nodemailer + SMTP env vars

- `npm install nodemailer@^8.0.10` in `listener/` — installed 8.0.11 (semver-satisfied); lockfile synced.
- nodemailer pre-audited [OK] in RESEARCH § Package Legitimacy Audit (14 yrs, 14M/wk, official repo).
- `.env.example` gains a `# Email (SMTP) — Phase 21` section documenting 7 new vars: `SMTP_HOST`, `SMTP_PORT` (default 587), `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`, `SMTP_SECURE`, `APP_BASE_URL`.
- All 7 vars documented as optional (graceful degradation when unconfigured per EMAIL-01).
- Comment notes env vars override Settings UI values (D-02).

### Task 2 — Migration 0004

`listener/migrations/0004_invites_reset_tokens.sql` mirrors `0003_users_sessions.sql` format exactly:

**Up section (in order):**
1. `ALTER TABLE users ADD COLUMN IF NOT EXISTS disabled_at TIMESTAMPTZ` — USER-05 disable support
2. `CREATE TABLE IF NOT EXISTS invites` — token_hash TEXT NOT NULL UNIQUE, status CHECK ('pending','accepted','revoked','expired'), role CHECK ('admin','member'), invited_by FK ON DELETE SET NULL, expires_at, used_at
3. `CREATE TABLE IF NOT EXISTS password_reset_tokens` — user_id FK ON DELETE CASCADE, token_hash UNIQUE, expires_at, used_at
4. 5 indexes: `idx_invites_token_hash`, `idx_invites_email`, `idx_invites_status`, `idx_password_reset_tokens_token_hash`, `idx_password_reset_tokens_user_id`

**Down section:** Drops only the two new tables + drops disabled_at column. Never touches users/sessions.

Migration will auto-apply at next listener startup via the existing `migrateDb()` runner.

### Task 3 — Wave 0 Test Stubs

Three new test files each have:
- A header JSDoc comment listing requirement IDs covered
- A note that the placeholder MUST be replaced (not appended) by the owning downstream plan
- One passing placeholder test so `npm test` stays green

| File | Req IDs | Owning Plan |
|------|---------|-------------|
| listener/test/emails.test.js | EMAIL-01, EMAIL-03, EMAIL-04 | Plan 21-04 |
| listener/test/users-router.test.js | USER-01..07 | Plan 21-06 |
| listener/test/db-invites.test.js | USER-03, PWD-03 | Plan 21-03 |

## Verification Results

- `cd listener && npm ls nodemailer` -- nodemailer@8.0.11 — PASS
- `import nodemailer from 'nodemailer'` -- prints OK — PASS
- Migration acceptance checks (13 assertions via Python): all PASS
- `node --test test/emails.test.js test/users-router.test.js test/db-invites.test.js` -- 3/3 pass — PASS
- Full listener suite `npm test`: 3 new stub tests pass; one pre-existing `dnssd-fqdn-cycle.test.js` failure (15s ESM cold-import timeout on local machine, documented in STATE.md quick task 260608-f4h) — NOT caused by this plan

## Deviations from Plan

None — plan executed exactly as written.

The accidental `npm install` in the worktree root (placed nodemailer in root `node_modules`) was caught and corrected before the first commit: root `package.json`/`package-lock.json` restored via `git checkout --`, then `npm install` re-run correctly from `listener/`.

## Known Stubs

The three test files are intentional Wave 0 stubs. Each contains exactly one placeholder test that asserts `true`. They are listed in the plan's `must_haves.artifacts` section as stubs by design — downstream plans 21-03, 21-04, 21-06 will replace the placeholders with real coverage.

## Threat Surface Scan

No new network endpoints, auth paths, file access patterns, or schema changes at trust boundaries beyond what was planned:
- Migration 0004 schema additions match the T-21-01-MIG mitigation (token_hash UNIQUE + ON DELETE CASCADE) — no new surface.
- nodemailer install matches T-21-SC mitigation (pre-audited, lockfile pinned) — no new surface.

## Self-Check: PASSED

- listener/migrations/0004_invites_reset_tokens.sql: FOUND
- listener/test/emails.test.js: FOUND
- listener/test/users-router.test.js: FOUND
- listener/test/db-invites.test.js: FOUND
- Commit 8f11f10: FOUND (chore: nodemailer + env vars)
- Commit a1fe6ab: FOUND (feat: migration 0004)
- Commit 55401a7: FOUND (test: Wave 0 stubs)
