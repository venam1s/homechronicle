---
status: passed
phase: 23-security-hardening-nginx-cutover
verified_by: executing-agent self-verification, then independent code-review + security gate + live UAT (resolved 2026-06-15)
requirements: [SEC-05, SEC-06, SEC-07]
date: 2026-06-13
resolved: 2026-06-15
listener_tests: 714/714
web_tests: 366/366
---

# Phase 23: Security Hardening + Nginx Cutover — Verification

## ✅ Resolution (2026-06-15)

The self-verification caveat below has been **closed**. Since the original self-verified report:
- Independent code review ran and its findings were fixed: **CR-01** (nginx token must be sourced
  via `.envsh` so it reaches `envsubst` — commit `6bd14df`; hook is now
  `web/docker-entrypoint.d/15-compute-api-token.envsh`), plus **WR-01/02/03** (commits `6ce6d62`,
  `c2b4ee6`, `3e903f2`). See `23-REVIEW.md` / `23-REVIEWS.md`.
- Security gate ran: `23-SECURITY.md` records **T-23-BYPASS closed**.
- Live HUMAN-UAT (`23-HUMAN-UAT.md`): the **SEC-07 no-login→401 keystone** and the SEC-05 bulk
  "log out other devices" both **passed live** (2026-06-15); standalone render verified by faithful
  entrypoint+envsubst reproduction. Service-token curl + two-browser per-row revoke skipped (live-only).
- Suites green at HEAD: listener 714/714, web 366/366.

The original self-verification text is retained below for history.

## ⚠ Verification caveat (historical — resolved above)

This report is **self-verification by the agent that executed the phase**, not an independent review.
The `gsd-verifier` and `gsd-code-review` subagents did not run this session (the subagent dispatch
path returned without completing — the phase was executed inline as the documented fallback).
Automated test suites are green and an inline goal-backward check is recorded below, but
independent verification and code review are **deferred**:

- Run `/gsd:code-review 23` in a fresh session (where the subagent path may work).
- Run `/gsd:verify-work 23` to drive the deferred HUMAN-UAT live checks.

Same-author review has a known blind radius — treat the items in `23-HUMAN-UAT.md` as the real
acceptance for the live/composed paths, especially the SEC-07 no-login→401 runtime check.

## Goal

Browser authentication transitions to session-only; nginx no longer injects X-API-Token; users
can view and revoke active sessions; expired sessions and tokens are swept periodically.

## Requirement traceability

| Req | Status | Evidence |
|-----|--------|----------|
| SEC-05 (view/revoke active sessions) | met (units) | db.js `listSessionsForUser` (self-scoped, no token_hash/csrf_token) + `revokeSessionById` (SQL `id=$1 AND user_id=$2`, params `[sessionId,userId]` — T-23-IDOR); auth-router GET/DELETE `/sessions`; web `useSessions`/`useRevokeSession` + `ActiveSessionsPanel` (per-row + bulk, "This device" excluded) mounted under Settings → Account. **Live two-browser revoke deferred → HUMAN-UAT #4,#5.** |
| SEC-06 (sweep expired/used tokens) | met | db.js `runInviteTokenSweep` (`used_at IS NOT NULL OR expires_at < NOW() OR status != 'pending'`) + `runPasswordResetTokenSweep` (`used_at IS NOT NULL OR expires_at < NOW()`), both transactional, folded into `runRetentionSweepSafe` with isolated try/catch, no new timer (D-05). token-sweep.test.js green. |
| SEC-07 (nginx X-API-Token cutover) | met (render) | nginx.conf.template injects `${NGINX_API_TOKEN}` on all 3 proxy blocks; compute hook (web entrypoint.d/15 + standalone inline) sets it empty when AUTH_ENABLED=true, real token when false; AUTH_ENABLED on all 3 compose web services (fail-safe default true). `scripts/test-nginx-template.sh` PASS (token value 0 auth-on / 3 auth-off). auth-gate-empty-token.test.js proves no-session+empty-token → 401. **Live composed-runtime no-login→401 deferred → HUMAN-UAT #1 (composition-test-gap: index.js exports nothing).** |

## Success criteria (from ROADMAP)

1. View all active sessions + revoke any ("log out other devices"); revoking invalidates immediately
   — implemented + unit-tested; **live cross-browser revoke deferred (HUMAN-UAT #4/#5)**.
2. Expired sessions + used/expired invite/reset tokens deleted automatically (startup + periodic)
   — **met**: session sweep (pre-existing) + new invite/reset sweeps in the existing cycle, no new timer.

## Automated evidence
- `cd listener && npm test` → 607/607 pass (at final HEAD).
- `cd web && npm test` → 290/290 pass; `npm run build` succeeds.
- `scripts/test-nginx-template.sh` → PASS (0 auth-on / 3 auth-off).
- All 5 plan SUMMARYs on main; 17 atomic commits; working tree clean.

## Outstanding (non-blocking, tracked)
- HUMAN-UAT.md: 5 live/standalone/cross-browser items (status: partial).
- Independent code review (`/gsd:code-review 23`) + verify-work (`/gsd:verify-work 23`).
- Security gate: no SECURITY.md yet → `/gsd:secure-phase 23` (workflow.security_enforcement=true).
