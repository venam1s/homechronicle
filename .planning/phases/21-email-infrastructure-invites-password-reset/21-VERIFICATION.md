---
phase: 21-email-infrastructure-invites-password-reset
status: passed
verified: 2026-06-12
method: goal-backward + live in-browser verification on beta + full automated suites
requirements: [USER-01, USER-02, USER-03, USER-04, USER-05, USER-06, USER-07, PWD-01, PWD-02, PWD-03, PWD-04, EMAIL-01, EMAIL-02, EMAIL-03, EMAIL-04]
---

## Phase 21 — Email Infrastructure + Invites + Password Reset

**Goal:** Admins can invite new users by email; invited users can accept and set a
password; users can reset forgotten passwords; SMTP infrastructure is operational with
graceful degradation when unconfigured.

**Verdict: PASSED.**

## Evidence

### Automated suites (green)
- Listener: **562/562** (`node --test`)
- Web: **279/279** (`vitest`)
- Six human-verify fixes each shipped with a regression test verified to fail without its fix.

### Live in-browser verification (beta deployment)
Driven against the running beta stack (real DB, real session/cookie flow), confirmed by the user:
- Login / session / sidebar identity (`/me` → `role: admin`).
- Admin-only Settings → Admin section renders (Users + pending invites + Email/SMTP).
- SMTP configures, saves, and the test-send endpoint is reachable; "Send test email" works.
- forgot-password is enumeration-safe (identical 200 for known/unknown).

### Artifacts present + wired
| Requirement(s) | Artifact | Status |
|---|---|---|
| USER-03/05, PWD-03, EMAIL-01 | `listener/migrations/0004_invites_reset_tokens.sql` (invites, password_reset_tokens, users.disabled_at) | ✓ runs at startup |
| EMAIL-01/03/04 | `emails.js` (non-fatal nodemailer transport), `smtp-config.js` (0600 secret, env-over-UI) | ✓ |
| EMAIL-02/04 | `smtp-router.js` (admin GET/PUT/test, never leaks password) | ✓ mounted |
| USER-01/03/05/06/07, PWD-03 | `db.js` invite/reset/user CRUD + `validateSession` `disabled_at IS NULL` guard | ✓ |
| USER-02/03, PWD-01/02 | `auth-router.js` accept-invite / forgot-password / reset-confirm / change-password | ✓ routes present |
| USER-01/02/04/05/06/07 | `users-router.js` (`createUsersRouter` mounted) — CRUD + last-admin/self guards | ✓ |
| PWD-04 | `security.js` `validatePasswordStrength` + `web/src/lib/strength.js` meter | ✓ |
| USER-01/02/03/04/07, EMAIL-02, PWD-01/02/04 | React surfaces: SettingsPage (3-section), UsersPanel, InviteCreateModal, SMTPConfigSection, ChangePasswordSection, AcceptInvitePage, ResetPasswordPage, PasswordStrengthMeter | ✓ |
| EMAIL-01/02 | `index.js` `initEmail` + smtpConfigStore + router mounts | ✓ |

### Success criteria
1. Admin generates a copyable invite link (always), also emailed when SMTP configured — ✓ (InviteCreateModal + users-router `isEmailEnabled` gating; graceful degradation banner verified).
2. Invited user accepts link, sets a strength-checked password, lands in app (also verifies email) — ✓ (AcceptInvitePage + accept-invite atomic redeem → session).
3. Password reset via enumeration-safe forgot-password + reset-confirm — ✓ (verified live, identical responses).
4. SMTP operational with graceful degradation — ✓ (configures/saves/tests; invites degrade to copyable links when unconfigured).

## Notes / follow-ups (non-blocking)
- `21-05-SUMMARY.md` was reconstructed after the original was lost to a worktree-removal
  hazard (#2070); the routes it documents are verified present in source and live.
- Actual email **delivery** depends on the operator's SMTP provider config (e.g. iCloud
  requires an app-specific password and an authorized From alias) — outside phase scope;
  the app surfaces the provider's error on test-send.
- Infra (not phase scope): beta `db-sync` one-shot needs `network_mode: host` to reach
  prod for the prod→beta refresh (currently warns and proceeds with existing data).
- Recommended next: `/gsd:code-review 21` (advisory) and `/gsd:secure-phase 21`.
