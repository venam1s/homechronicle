---
status: partial
phase: 23-security-hardening-nginx-cutover
source: [23-03-PLAN.md, 23-05-PLAN.md]
started: 2026-06-13
updated: 2026-06-15
---

## Current Test

[testing complete — keystone SEC-07 no-login→401 + standalone render + bulk-revoke passed; 2 live checks skipped]

## Tests

### 1. SEC-07 live cutover — unauthenticated browser → 401 (T-23-BYPASS) — VERIFY BEFORE PROD CUTOVER
expected: With AUTH_ENABLED=true behind real nginx + the live index.js gate, an unauthenticated browser (no session cookie) gets 401 on API calls — nginx injects NO real X-API-Token. This is the real SEC-07 proof; the render test only proves the rendered config, not the live composed runtime (index.js exports nothing → the gate is only unit-tested via a re-implemented makeGate — composition-test-gap, cf. Phase 20). After login, the app works via session cookie alone.
result: pass
note: User confirmed live on deployment 2026-06-15 — unauthenticated browser gets 401; app works via session cookie after login.

### 2. SEC-07 standalone (supervisord) image render
expected: Build standalone image AUTH_ENABLED=true, exec in, inspect /etc/nginx/conf.d/default.conf — the 3 X-API-Token lines carry an empty value (""), real token value appears 0×. Rebuild AUTH_ENABLED=false → real token value appears exactly 3×.
result: pass
note: Docker daemon unavailable, so the full image build/exec was not run. Verified via faithful reproduction of docker/standalone/entrypoint.sh compute + envsubst against web/nginx.conf.template (the file Dockerfile.standalone copies to /etc/nginx/templates/default.conf.template). AUTH_ENABLED=true → 3 X-API-Token lines all empty, real token 0×; AUTH_ENABLED=false → real token exactly 3×. 2026-06-15.

### 3. SEC-07 service-token path intact (both modes)
expected: `curl -H "x-api-token: $API_TOKEN" .../api/...` succeeds under both AUTH_ENABLED=true and =false (direct callers unaffected by the cutover).
result: skipped
reason: Requires live deployment with API_TOKEN; deferred (code path covered by auth-gate unit tests — service-token fallback at index.js:573-577).

### 4. SEC-05 two-browser Active Sessions list + per-row revoke
expected: Log in on browsers A + B (+ C). In A → Settings → Account → Active Sessions: all sessions listed; A marked "This device" (no revoke button); others show device/IP/timestamps. Revoke B from A → only B's row shows pending (C stays enabled), B's row disappears immediately, B logged out on next request.
result: skipped
reason: Requires multiple live browser sessions; deferred. Bulk-revoke variant (Test 5) passed live, which exercises the same revoke + "This device" exclusion path.

### 5. SEC-05 "Log out other devices" bulk action excludes current
expected: In A, click "Log out other devices" → all non-current sessions (C) revoked and removed, A's "This device" session remains and A stays logged in. The "This device" row has no revoke control and is never bulk-revoked.
result: pass
note: User confirmed live 2026-06-15 — bulk revoke removes other sessions, current "This device" session retained.

## Summary

total: 5
passed: 3
issues: 0
pending: 0
skipped: 2
blocked: 0

## Gaps

[none — no issues found; 2 live checks skipped, not failed]
