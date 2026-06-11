---
phase: 21-email-infrastructure-invites-password-reset
plan: "09"
subsystem: web-settings
tags: [react, hooks, tanstack-query, smtp-form, change-password, tdd, wave-4]
dependency_graph:
  requires:
    - /api/users endpoints (21-06 users-router)
    - /api/setup/smtp endpoints (21-04 smtp-router)
    - /api/auth/password endpoint (21-05 auth-router extensions)
    - web/src/components/PasswordStrengthMeter.jsx (21-08)
    - web/src/lib/strength.js (21-02)
  provides:
    - web/src/hooks/useUsers.js (useUsers, useInvites, 7 mutation hooks)
    - web/src/components/SMTPConfigSection.jsx (admin SMTP form)
    - web/src/components/ChangePasswordSection.jsx (change-own-password form)
  affects:
    - web test count: 215 → 243 (+28 tests)
tech_stack:
  added: []
  patterns:
    - TDD (RED → GREEN per task for Tasks 2 + 3): 4 commits (2 test + 2 feat)
    - Task 1 (no tdd flag): implementation + tests in a single feat commit
    - useQuery/useMutation + invalidateQueries pattern (mirrors useAuth.js)
    - Masked password state: changingPassword boolean; never seeded from GET
    - envFields array drives per-field "Set via environment variable" notice
    - PASSWORD never included in PUT body unless changingPassword && password non-empty (D-01)
    - PasswordStrengthMeter mounted below New password field in ChangePasswordSection
    - 3s success-then-reset timer using useRef to avoid leaked setTimeouts
key_files:
  created:
    - web/src/hooks/useUsers.js
    - web/src/hooks/useUsers.test.js
    - web/src/components/SMTPConfigSection.jsx
    - web/src/components/SMTPConfigSection.test.jsx
    - web/src/components/ChangePasswordSection.jsx
    - web/src/components/ChangePasswordSection.test.jsx
  modified: []
decisions:
  - "Hook test file uses createElement() (not JSX) to avoid JSX-in-.js oxc parse error — .js extension does not trigger the JSX plugin; hook tests stay .js per existing codebase convention"
  - "getByLabelText('Password') exact string (not regex) in SMTPConfigSection tests — regex /password/i also matches aria-label='Show password' on toggle button, causing multiple-element error"
  - "Test email button disabled via disabled HTML attribute (not just opacity class) so getByRole check on isDisabled works; isConfigured drives both opacity class and the disabled attribute"
  - "useRef for success timer in ChangePasswordSection — cleanup on unmount prevents setState after component is gone; avoids test flakiness"
metrics:
  duration: "~30 minutes"
  completed: "2026-06-11"
  tasks_completed: 3
  tasks_total: 3
  files_changed: 6
---

# Phase 21 Plan 09: Settings Section Components + useUsers Summary

**One-liner:** TanStack Query hooks for /api/users + admin SMTP form with masked-secret/env-notice + change-own-password form with strength meter — EMAIL-04 enforced client-side (password never seeded from GET), D-01 enforced (blank save omits password key).

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | useUsers data hooks | 5c5c3de | web/src/hooks/useUsers.js, useUsers.test.js |
| 2 (RED) | Failing tests for SMTPConfigSection | dd6fcce | web/src/components/SMTPConfigSection.test.jsx |
| 2 (GREEN) | SMTPConfigSection SMTP form | b63989b | web/src/components/SMTPConfigSection.jsx |
| 3 (RED) | Failing tests for ChangePasswordSection | 0b7d537 | web/src/components/ChangePasswordSection.test.jsx |
| 3 (GREEN) | ChangePasswordSection form | 4b5b907 | web/src/components/ChangePasswordSection.jsx |

## TDD Gate Compliance

Tasks 2 and 3 followed strict RED → GREEN TDD:
- Task 2 RED: `dd6fcce` — ERR_MODULE_NOT_FOUND (SMTPConfigSection.jsx didn't exist)
- Task 2 GREEN: `b63989b` — 9/9 tests passing
- Task 3 RED: `0b7d537` — ERR_MODULE_NOT_FOUND (ChangePasswordSection.jsx didn't exist)
- Task 3 GREEN: `4b5b907` — 7/7 tests passing; full suite 243/243

## Verification Results

```
cd web && npx vitest run src/hooks/useUsers.test.js
  Tests: 12 passed (12)

cd web && npx vitest run src/components/SMTPConfigSection.test.jsx
  Tests: 9 passed (9)

cd web && npx vitest run src/components/ChangePasswordSection.test.jsx
  Tests: 7 passed (7)

cd web && npx vitest run
  Test Files: 36 passed (36)
  Tests:      243 passed (243)
  Duration:   ~4s

No dark: variants in SMTPConfigSection.jsx or ChangePasswordSection.jsx
No hardcoded hex (#[0-9a-f]{3,6}) in either component
```

## Implementation Details

### useUsers.js
- `useUsers()`: `useQuery(['users','list']) → GET /users/`
- `useInvites()`: `useQuery(['users','invites']) → GET /users/invites`
- `useInviteUser()`: POST /users/invite, invalidates `['users','invites']`
- `useRevokeInvite(id)`: DELETE /users/invites/:id, invalidates `['users','invites']`
- `useResendInvite(id)`: POST /users/invites/:id/resend, invalidates `['users','invites']`
- `useSetUserRole({id,role})`: PATCH /users/:id {action:'setRole',role}, invalidates `['users','list']`
- `useDisableUser(id)`: PATCH /users/:id {action:'disable'}, invalidates `['users','list']`
- `useEnableUser(id)`: PATCH /users/:id {action:'enable'}, invalidates `['users','list']`
- `useRemoveUser(id)`: DELETE /users/:id, invalidates `['users','list']`

### SMTPConfigSection.jsx
- `useQuery(['setup','smtp'])` loads `{host,port,user,from,secure,passwordConfigured,envFields}`
- Form state seeded from GET response EXCEPT password (never seeded — EMAIL-04)
- `changingPassword` boolean: `passwordConfigured && !changingPassword` shows "•••• configured" + Change; else shows input (empty)
- `envFields.includes(fieldName)` renders italic "Set via environment variable" notice instead of input
- Save mutation omits `password` key entirely unless `changingPassword && password !== ''` (D-01)
- SMTP-not-configured warning banner when `!isConfigured` (no host or no passwordConfigured)
- Send test email button: `disabled` attribute set when unconfigured; success/failure via toast/inline error

### ChangePasswordSection.jsx
- Three password fields (Current/New/Confirm) each with show/hide toggle + unique aria-labels
- `PasswordStrengthMeter` mounted below New password field
- Client mismatch check before `mutate()` — sets `mismatchError`, no PATCH issued
- `onSuccess`: sets `success=true`, shows banner; `setTimeout(3000)` resets all state via ref for safe cleanup
- `onError`: `mapErrorMessage()` maps server error to UI-SPEC copy (wrong-current / too short / blocklisted / generic)
- Button is `w-auto` (not full-width per UI-SPEC)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] JSX in .js hook test file**
- **Found during:** Task 1 verification
- **Issue:** `useUsers.test.js` initially used JSX syntax. Vite's oxc parser rejects JSX in `.js` files; only `.jsx` files get the JSX transform.
- **Fix:** Rewrote wrapper to use `React.createElement()` — existing hook test files (useDashboardLayout.test.js) confirm `.js` tests do not use JSX.
- **Commit:** 5c5c3de

**2. [Rule 1 - Bug] getByLabelText regex matched toggle button aria-label**
- **Found during:** Task 2 GREEN
- **Issue:** Test used `getByLabelText(/password/i)` which matched both the input `aria-label="Password"` and toggle button `aria-label="Show password"` → "Found multiple elements" error.
- **Fix:** Changed test queries to exact string `getByLabelText('Password')`.
- **Files modified:** `web/src/components/SMTPConfigSection.test.jsx`
- **Commit:** b63989b

## Threat Model Coverage

| Threat ID | Disposition | Status |
|-----------|-------------|--------|
| T-21-09-SMTPUI | mitigate | MITIGATED — password input never seeded; masked state until Change clicked; blank save omits key; 9 tests prove all three properties |
| T-21-09-CSRFCHG | mitigate | MITIGATED — fetchJson sends X-CSRF-Token + credentials:'include' on all PATCH mutations (Phase 20) |
| T-21-09-ADMINUI | accept | ACCEPTED — SettingsPage shell (21-10) will render SMTPConfigSection only for role==='admin'; server enforces admin on SMTP routes |

## Known Stubs

None — all three components are fully functional with real data flows wired to backend API endpoints.

## Threat Flags

None — no new network endpoints, auth paths, or file access patterns.

## Self-Check: PASSED

- `web/src/hooks/useUsers.js` created: FOUND
- `web/src/hooks/useUsers.test.js` created: FOUND
- `web/src/components/SMTPConfigSection.jsx` created: FOUND
- `web/src/components/SMTPConfigSection.test.jsx` created: FOUND
- `web/src/components/ChangePasswordSection.jsx` created: FOUND
- `web/src/components/ChangePasswordSection.test.jsx` created: FOUND
- Commit 5c5c3de (feat useUsers hooks): FOUND
- Commit dd6fcce (test RED SMTPConfigSection): FOUND
- Commit b63989b (feat GREEN SMTPConfigSection): FOUND
- Commit 0b7d537 (test RED ChangePasswordSection): FOUND
- Commit 4b5b907 (feat GREEN ChangePasswordSection): FOUND
