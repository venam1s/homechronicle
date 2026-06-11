---
phase: 20-auth-foundation
plan: 13
subsystem: web-ui
tags: [auth, logout, sidebar, react, testing]
dependency_graph:
  requires: ["20-09", "20-12"]
  provides: ["AUTH-03 user-facing logout", "Sign out control in Sidebar footer"]
  affects: ["web/src/components/Sidebar.jsx", "web/src/components/Sidebar.test.jsx"]
tech_stack:
  added: []
  patterns: ["useAuth hook consumption", "logoutMutation wiring", "sessionStorage csrfToken clear on logout"]
key_files:
  created: []
  modified:
    - web/src/components/Sidebar.jsx
    - web/src/components/Sidebar.test.jsx
decisions:
  - "Account label reads nested user?.user?.email (not user?.email) to match /auth/me response shape; falls back to capitalized role then 'Account' to avoid rendering undefined"
  - "Sign out placed at bottom of footer div after version/links block in both expanded and collapsed layout states; collapsed uses icon-only + aria-label='Sign out'"
  - "Mocks for react-router-dom and useAuth added to Sidebar.test.jsx in Task 1 (required to keep existing 11 tests passing after the component started calling useNavigate and useAuth)"
metrics:
  duration_minutes: 15
  completed: "2026-06-11"
  tasks_completed: 2
  files_modified: 2
---

# Phase 20 Plan 13: Sidebar Sign Out Control Summary

Wired `useAuth().logoutMutation` into a visible "Sign out" control in the Sidebar footer, making AUTH-03 user-facing — a logged-in user can now log out from the UI without dev tools in both expanded and collapsed sidebar states.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Add user/account section + Sign out control to Sidebar footer | 7c41131 | web/src/components/Sidebar.jsx, web/src/components/Sidebar.test.jsx |
| 2 | Extend Sidebar.test.jsx with Sign out control tests | dd3d107 | web/src/components/Sidebar.test.jsx |

## What Was Built

**Sidebar.jsx changes:**
- Added `LogOut` to lucide-react import, added `useNavigate` from react-router-dom and `useAuth` from `../hooks/useAuth.js`
- Derived `accountLabel` from `user?.user?.email` with role capitalization fallback then "Account" fallback (never renders undefined)
- Added `handleLogout()`: calls `logoutMutation.mutate(undefined, { onSuccess })` — onSuccess clears `sessionStorage.csrfToken` and calls `navigate('/login', { replace: true })`
- Expanded state: renders account label (`text-xs text-hc-muted truncate`) + Sign out button with `LogOut` icon and visible "Sign out" span
- Collapsed state: icon-only button with `aria-label="Sign out"` and `title="Sign out"`
- Uses only `--hc-*` token utility classes; no raw hex or `dark:` variants

**Sidebar.test.jsx changes (Task 1 + Task 2):**
- Added `vi.mock('react-router-dom', ...)` with `mockNavigate` via `vi.hoisted`
- Added `vi.mock('../hooks/useAuth.js', ...)` with `mockLogoutMutate` via `vi.hoisted`; default mock user `{ user: { id: 1, role: 'admin' } }` (no email, exercises fallback path)
- Added `beforeEach(() => vi.clearAllMocks())`
- 5 new tests (Tests 12-16): Sign out renders expanded, Sign out renders collapsed, click calls mutate, onSuccess clears csrfToken + navigates to /login, account label fallback when email absent

## Verification

```
cd web && node_modules/.bin/vitest run --reporter=verbose
```

All 16 Sidebar tests pass (11 original + 5 new), 0 failures.

## Deviations from Plan

**[Rule 3 - Blocking] Added react-router-dom and useAuth mocks to Task 1 test changes**

- **Found during:** Task 1 verification
- **Issue:** The component modification added calls to `useNavigate()` and `useAuth()` which require a Router context and QueryClientProvider. The existing test file had neither mock, so all 11 existing tests immediately failed with "No QueryClient set, use QueryClientProvider to set one".
- **Fix:** Added `vi.mock('react-router-dom', ...)` and `vi.mock('../hooks/useAuth.js', ...)` with `vi.hoisted` to Sidebar.test.jsx as part of Task 1, alongside the initial `beforeEach(() => vi.clearAllMocks())`. These mocks were required anyway for Task 2's tests, so this was additive with no rework needed in Task 2.
- **Files modified:** web/src/components/Sidebar.test.jsx
- **Commit:** 7c41131

## Known Stubs

None — the Sign out control is fully wired to `useAuth().logoutMutation`; the account label resolves from the live /auth/me response (nested `user?.user?.email`) with a deterministic fallback chain.

## Threat Flags

None — this plan only modifies client-side UI components. No new network endpoints, auth paths, file access patterns, or schema changes were introduced.

## Self-Check: PASSED

- [x] web/src/components/Sidebar.jsx exists and contains Sign out control
- [x] web/src/components/Sidebar.test.jsx exists with 16 tests (11 + 5 new)
- [x] Commit 7c41131 exists (Task 1)
- [x] Commit dd3d107 exists (Task 2)
- [x] All 16 Sidebar tests pass with 0 failures
