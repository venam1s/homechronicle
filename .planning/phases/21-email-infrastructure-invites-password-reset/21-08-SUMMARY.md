---
phase: 21-email-infrastructure-invites-password-reset
plan: "08"
subsystem: web-auth
tags: [react, password-strength, invite, reset-password, tdd, public-routes]
dependency_graph:
  requires:
    - web/src/lib/strength.js::passwordStrengthTier (21-02)
    - web/src/lib/strength.js::strengthFeedback (21-02)
    - /api/auth/accept-invite endpoint (21-05)
    - /api/auth/forgot-password endpoint (21-05)
    - /api/auth/reset-confirm endpoint (21-05)
  provides:
    - web/src/components/PasswordStrengthMeter.jsx (3-segment strength meter)
    - web/src/pages/AcceptInvitePage.jsx (public invite-acceptance page)
    - web/src/components/ResetPasswordPage.jsx (functional two-view reset page)
    - web/src/main.jsx /accept-invite public route
  affects:
    - web/src/main.jsx (added AcceptInvitePage import + route)
tech_stack:
  added: []
  patterns:
    - TDD (RED → GREEN per task): 3 tasks, 6 commits (3 test + 3 feat)
    - inline CSS-var fills (not Tailwind bg- classes) for theme-reactive strength meter segments
    - useMutation + post-success CSRF fetch + navigate pattern (mirrors LoginPage)
    - enumeration-safe confirmation copy — identical string for all POST forgot-password submissions
    - useSearchParams two-view routing (View A = no token, View B = token present)
    - vi.useFakeTimers({ shouldAdvanceTime: true }) for timer-dependent navigate tests
key_files:
  created:
    - web/src/components/PasswordStrengthMeter.jsx
    - web/src/components/PasswordStrengthMeter.test.jsx
    - web/src/pages/AcceptInvitePage.jsx
    - web/src/pages/AcceptInvitePage.test.jsx
    - web/src/components/ResetPasswordPage.test.jsx
  modified:
    - web/src/components/ResetPasswordPage.jsx (replaced placeholder with functional implementation)
    - web/src/main.jsx (added /accept-invite public route)
decisions:
  - "Email field omitted from AcceptInvitePage — accept-invite contract does not return email pre-submit; server binds token→email atomically (simplest safe choice)"
  - "View B 400 and all onError cases → tokenInvalid=true; no leakage of whether error was network or invalid-token"
  - "vi.useFakeTimers({ shouldAdvanceTime: true }) scoped to success-timer test only — global fake timers block Promise resolution in vitest"
  - "Confirmed test file placement: test for AcceptInvitePage at web/src/pages/AcceptInvitePage.test.jsx; node_modules symlinked in worktree to main checkout"
metrics:
  duration: "~25 minutes"
  completed: "2026-06-11"
  tasks_completed: 3
  tasks_total: 3
  files_changed: 7
---

# Phase 21 Plan 08: Public Password Pages Summary

3-segment theme-reactive `PasswordStrengthMeter`, functional `AcceptInvitePage` (invite-acceptance with post-success CSRF fetch + navigation), functional `ResetPasswordPage` (two-view: email request + set-new-password), and `/accept-invite` registered as a public route alongside `/login` and `/reset-password`.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 (RED) | Failing tests for PasswordStrengthMeter | 935c0c6 | web/src/components/PasswordStrengthMeter.test.jsx |
| 1 (GREEN) | PasswordStrengthMeter component | 4da7fa5 | web/src/components/PasswordStrengthMeter.jsx |
| 2 (RED) | Failing tests for AcceptInvitePage | 231ba44 | web/src/pages/AcceptInvitePage.test.jsx |
| 2 (GREEN) | AcceptInvitePage + /accept-invite route | 560e142 | web/src/pages/AcceptInvitePage.jsx, web/src/main.jsx |
| 3 (RED) | Failing tests for ResetPasswordPage | dd3f572 | web/src/components/ResetPasswordPage.test.jsx |
| 3 (GREEN) | Functional ResetPasswordPage (two views) | d53759d | web/src/components/ResetPasswordPage.jsx |

## TDD Gate Compliance

All 3 tasks followed strict RED → GREEN TDD:
- Task 1 RED: `935c0c6` — ERR_MODULE_NOT_FOUND (component didn't exist)
- Task 1 GREEN: `4da7fa5` — 8/8 vitest tests passing
- Task 2 RED: `231ba44` — "Failed to resolve import ./AcceptInvitePage.jsx"
- Task 2 GREEN: `560e142` — 5/5 vitest tests passing
- Task 3 RED: `dd3f572` — 7/8 tests failing (placeholder only rendered static markup)
- Task 3 GREEN: `d53759d` — 8/8 tests passing; full suite 215/215

## Verification Results

```
cd web && npx vitest run
  Test Files: 33 passed (33)
  Tests:      215 passed (215)
  Duration:   ~4s

AcceptInvitePage + ResetPasswordPage + PasswordStrengthMeter tests: all pass
/accept-invite in main.jsx: { path: '/accept-invite', element: <AcceptInvitePage /> } (public, outside AuthGate)
No hardcoded hex (grep -ci "#[0-9a-f]{3,6}": 0) in all 3 new files
No dark: variants in any new components
```

## Implementation Details

### PasswordStrengthMeter.jsx
- `password` prop → `passwordStrengthTier()` → fill count (1/2/3)
- Segments rendered with `data-testid="strength-segment"` for test query
- Inline `style={{ backgroundColor: 'var(--hc-...-text)' }}` for all fills (not Tailwind `bg-` classes)
- `strengthFeedback(password)` caption below bar via `<p className="text-hc-caption text-hc-muted">`

### AcceptInvitePage.jsx
- `useSearchParams` reads `?token=`; no token → expired/invalid full-card (no form)
- Email field omitted (API contract doesn't return email pre-submit; server binds token atomically)
- Password + confirm fields with show/hide toggles (identical anatomy to LoginPage)
- PasswordStrengthMeter mounted below password field, above confirm
- Client-side mismatch check before POST (no round-trip on obvious error)
- `onSuccess`: fetch csrf-token → sessionStorage → invalidate ['auth','me'] → navigate('/')
- `onError`: inline danger banner with `err.message`
- `useEffect` focuses password field on mount

### ResetPasswordPage.jsx (replaced placeholder)
- Split into `<ViewA>` and `<ViewB>` sub-components; main component branches on `?token=`
- **View A** (no token): email field, POST /auth/forgot-password; `onSuccess` AND `onError` both set `submitted=true` (enumeration-safe — identical UI regardless of outcome)
- **View A** post-submit: exact UI-SPEC copy: "If that email address is registered, you'll receive a reset link shortly. The link expires after 1 hour."
- **View B** (token present): password + confirm + PasswordStrengthMeter + "Set new password"
- **View B** success: "Your password has been reset. Redirecting you to sign in…" banner + `setTimeout(() => navigate('/login'), 2000)`
- **View B** error: any error → `tokenInvalid=true` → token-invalid full-card with "Request a new link" → `/reset-password` (no token)
- "Back to sign in" link preserved from original placeholder (in both views)
- Focus management: View A focuses email; View B focuses password

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] vi.useFakeTimers() blocked Promise resolution in tests**
- **Found during:** Task 3 GREEN
- **Issue:** `vi.useFakeTimers()` in `beforeEach` caused `waitFor(...)` to time out (15s) because vitest's async machinery relies on real timer ticks to resolve mutations
- **Fix:** Removed global `vi.useFakeTimers()` from `beforeEach`; scoped `vi.useFakeTimers({ shouldAdvanceTime: true })` only to the timer-dependent success-navigate test, with `vi.useRealTimers()` cleanup
- **Files modified:** `web/src/components/ResetPasswordPage.test.jsx`
- **Commit:** d53759d (included in GREEN commit)

**2. [Rule 3 - Blocker] node_modules not present in worktree**
- **Found during:** Task 1 GREEN (vitest couldn't resolve 'vite')
- **Issue:** The git worktree does not include `node_modules` (not tracked). Vitest errored with `ERR_MODULE_NOT_FOUND: Cannot find package 'vite'`
- **Fix:** Created symlink `web/node_modules` → `/Users/marcsmith/ai-projects/homechronicle/web/node_modules`
- **Impact:** The symlink is not tracked in git (gitignored); the main checkout's node_modules serves both checkout and worktree

## Threat Model Coverage

| Threat ID | Disposition | Status |
|-----------|-------------|--------|
| T-21-08-ENUMUI | mitigate | MITIGATED — ViewA shows identical confirmation copy for all submissions (both `onSuccess` and `onError` set `submitted=true`); never reveals email existence |
| T-21-08-WEAKUI | accept | ACCEPTED — meter is UX-only; server re-validates on accept-invite/reset-confirm (21-05) |
| T-21-08-PUBLICROUTE | accept | ACCEPTED — /accept-invite + /reset-password public by design; no privileged reads |

## Known Stubs

None — all three components are fully functional with real data flows wired to the backend API endpoints.

## Threat Flags

None — no new network endpoints, auth paths, or file access patterns introduced. These are client-side pages consuming existing API routes established in Plans 21-05.

## Self-Check: PASSED

- `web/src/components/PasswordStrengthMeter.jsx` created: FOUND
- `web/src/components/PasswordStrengthMeter.test.jsx` created: FOUND
- `web/src/pages/AcceptInvitePage.jsx` created: FOUND
- `web/src/pages/AcceptInvitePage.test.jsx` created: FOUND
- `web/src/components/ResetPasswordPage.jsx` modified: FOUND
- `web/src/components/ResetPasswordPage.test.jsx` created: FOUND
- `web/src/main.jsx` modified with /accept-invite route: FOUND
- Commit 935c0c6 (test RED strength meter): FOUND
- Commit 4da7fa5 (feat GREEN strength meter): FOUND
- Commit 231ba44 (test RED AcceptInvitePage): FOUND
- Commit 560e142 (feat GREEN AcceptInvitePage): FOUND
- Commit dd3f572 (test RED ResetPasswordPage): FOUND
- Commit d53759d (feat GREEN ResetPasswordPage): FOUND
