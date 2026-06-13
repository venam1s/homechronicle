---
status: partial
phase: 23-security-hardening-nginx-cutover
source: [23-03-PLAN.md, 23-05-PLAN.md]
started: 2026-06-13
updated: 2026-06-13
---

## Current Test

[awaiting human testing — both checkpoints approved on automated evidence; live verification deferred to deployment]

## Tests

### 1. SEC-07 live cutover — unauthenticated browser → 401 (T-23-BYPASS) — VERIFY BEFORE PROD CUTOVER
expected: With AUTH_ENABLED=true behind real nginx + the live index.js gate, an unauthenticated browser (no session cookie) gets 401 on API calls — nginx injects NO real X-API-Token. This is the real SEC-07 proof; the render test only proves the rendered config, not the live composed runtime (index.js exports nothing → the gate is only unit-tested via a re-implemented makeGate — composition-test-gap, cf. Phase 20). After login, the app works via session cookie alone.
result: [pending]

### 2. SEC-07 standalone (supervisord) image render
expected: Build standalone image AUTH_ENABLED=true, exec in, inspect /etc/nginx/conf.d/default.conf — the 3 X-API-Token lines carry an empty value (""), real token value appears 0×. Rebuild AUTH_ENABLED=false → real token value appears exactly 3×.
result: [pending]

### 3. SEC-07 service-token path intact (both modes)
expected: `curl -H "x-api-token: $API_TOKEN" .../api/...` succeeds under both AUTH_ENABLED=true and =false (direct callers unaffected by the cutover).
result: [pending]

### 4. SEC-05 two-browser Active Sessions list + per-row revoke
expected: Log in on browsers A + B (+ C). In A → Settings → Account → Active Sessions: all sessions listed; A marked "This device" (no revoke button); others show device/IP/timestamps. Revoke B from A → only B's row shows pending (C stays enabled), B's row disappears immediately, B logged out on next request.
result: [pending]

### 5. SEC-05 "Log out other devices" bulk action excludes current
expected: In A, click "Log out other devices" → all non-current sessions (C) revoked and removed, A's "This device" session remains and A stays logged in. The "This device" row has no revoke control and is never bulk-revoked.
result: [pending]

## Summary

total: 5
passed: 0
issues: 0
pending: 5
skipped: 0
blocked: 0

## Gaps
