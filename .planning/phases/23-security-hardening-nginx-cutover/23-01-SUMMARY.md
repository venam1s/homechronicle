---
phase: 23-security-hardening-nginx-cutover
plan: 01
subsystem: testing
tags: [postgres, migration, nginx, envsubst, node-test, sessions, auth]

# Dependency graph
requires:
  - phase: 20-auth-foundation
    provides: sessions table + inline auth gate (makeGate harness in gate.test.js)
  - phase: 22-email-alert-channel
    provides: additive migration 0005 pattern (Up/Down section comments)
provides:
  - migration 0006 adding nullable sessions.user_agent + sessions.ip_address
  - RED scaffold scripts/test-nginx-template.sh (token-VALUE-count 0 auth-on / 3 auth-off)
  - GREEN regression guard listener/test/auth-gate-empty-token.test.js (T-23-BYPASS no-bypass)
  - RED scaffold listener/test/sessions-metadata.test.js (pins listSessionsForUser/revokeSessionById contracts)
affects: [23-02, 23-03, 23-04, 23-05]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Render-test security assertion via token-VALUE sentinel count, not directive presence"
    - "Missing-export ESM import as RED mechanism for not-yet-implemented db functions"

key-files:
  created:
    - listener/migrations/0006_session_metadata.sql
    - scripts/test-nginx-template.sh
    - listener/test/auth-gate-empty-token.test.js
    - listener/test/sessions-metadata.test.js
  modified: []

key-decisions:
  - "auth-gate-empty-token.test.js is a GREEN regression guard, not artificially forced RED — the no-bypass property already holds in the Phase-20 gate; forcing it RED via a bogus import would make it incoherent. The Wave-0 RED requirement is satisfied by sessions-metadata.test.js (genuine missing-export failure)."
  - "nginx render test exports NGINX_API_TOKEN (future var name) while template still uses ${API_TOKEN} → sentinel never substituted under auth-off → count 0≠3 → RED until Plan 03's rename"
  - "revokeSessionById uses CONTEXT D-04 arg order (pool, userId, sessionId) with SQL params bound [sessionId, userId] — NOT the reversed PATTERNS.md excerpt"

patterns-established:
  - "Token-value-count render assertion (SEC-07): grep -c the real token sentinel, never the X-API-Token directive name"

requirements-completed: [SEC-05, SEC-07]

# Metrics
duration: ~12min
completed: 2026-06-13
---

# Phase 23 / Plan 01: Wave-0 Foundation Summary

**Migration 0006 (additive session metadata) plus the three RED/GREEN test scaffolds that give Waves 1–2 their automated verify targets — produced in the intended Wave-0 RED state.**

## Accomplishments
- Migration `0006_session_metadata.sql`: adds nullable `user_agent` + `ip_address` to `sessions` via `ADD COLUMN IF NOT EXISTS` (additive, reversible, no index); existing rows get NULL per D-01.
- `scripts/test-nginx-template.sh`: Docker-free render assertion of the SEC-07 cutover security property (token-value count = 0 when AUTH_ENABLED=true, = 3 when false). Currently RED against the un-renamed template (auth-off count = 0 ≠ 3). Plan 03's `${API_TOKEN}`→`${NGINX_API_TOKEN}` rename turns it GREEN.
- `listener/test/auth-gate-empty-token.test.js`: GREEN regression guard for T-23-BYPASS — proves the cutover (no token injected) still returns 401 for no-session + no/empty token, while the service-token path stays intact. 4/4 pass.
- `listener/test/sessions-metadata.test.js`: genuine RED scaffold — imports `listSessionsForUser`/`revokeSessionById` from db.js (not yet implemented) so the module fails to load; pins the SELECT self-scoping (D-02, no token_hash/csrf_token) and the ownership-scoped DELETE param order (D-04, T-23-IDOR) for Plan 02.

## Task Commits
1. **Task 1: Migration 0006** — `f5b9f3a` (feat)
2. **Task 2: nginx render RED scaffold** — `edf17a6` (test)
3. **Task 3: auth-gate guard + session-metadata RED stubs** — `0f47531` (test)

## Files Created
- `listener/migrations/0006_session_metadata.sql` — additive session metadata columns
- `scripts/test-nginx-template.sh` — SEC-07 render assertion (RED)
- `listener/test/auth-gate-empty-token.test.js` — no-bypass guard (GREEN)
- `listener/test/sessions-metadata.test.js` — session db contract stubs (RED)

## Self-Check: PASSED (with expected RED scaffolds)
- migration 0006 acceptance greps pass (2 ADD COLUMN, DROP order correct, no index).
- `./scripts/test-nginx-template.sh` exits 1 (RED): auth-on count 0 PASS, auth-off count 0≠3 FAIL — expected.
- `node --test test/auth-gate-empty-token.test.js test/sessions-metadata.test.js`: auth-gate 4/4 pass; sessions-metadata fails at import (missing export) — expected RED.
- `test/token-sweep.test.js` absent (relocated to Plan 04). ✓

## RED → GREEN handoff
- Plan 02 implements `listSessionsForUser` + `revokeSessionById` → turns `sessions-metadata.test.js` GREEN.
- Plan 03 renames the template token var → turns `scripts/test-nginx-template.sh` GREEN.
- Plan 04 creates + greens the relocated `token-sweep.test.js` (SEC-06).
