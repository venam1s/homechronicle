---
phase: 21-email-infrastructure-invites-password-reset
plan: 10
subsystem: ui
tags: [react, tanstack-query, settings, users, invites, smtp, auth]

requires:
  - phase: 21-09
    provides: useUsers/useInvites hooks, SMTPConfigSection, ChangePasswordSection
  - phase: 21-08
    provides: PasswordStrengthMeter, public invite/reset pages
  - phase: 21-06
    provides: /api/users + invite management endpoints
provides:
  - "Settings restructured into Admin / Configuration / Account sub-sections (left-rail desktop, <select> mobile)"
  - "UsersPanel — user table with role/status, last-admin + self guards, pending invites with Resend/Revoke"
  - "InviteCreateModal — role selector + always-copyable invite link success state"
  - "Role-gated Admin section (admin-only); Account shown to everyone"
affects: [phase-22-email-alerts, phase-23-hardening-nginx-cutover]

tech-stack:
  added: []
  patterns: [role-gated section routing via useState, inline-confirm destructive actions]

key-files:
  created:
    - web/src/components/UsersPanel.jsx
    - web/src/components/InviteCreateModal.jsx
    - web/src/components/UsersPanel.test.jsx
    - web/src/components/InviteCreateModal.test.jsx
    - web/src/hooks/useAuth.test.js
    - web/src/components/AuthGate.shared-cache.test.jsx
  modified:
    - web/src/pages/SettingsPage.jsx
    - web/src/hooks/useAuth.js
    - web/src/components/AuthGate.jsx
    - web/src/components/Sidebar.jsx
    - web/src/components/SMTPConfigSection.jsx
    - listener/src/emails.js
    - listener/src/index.js
    - docker-compose.beta.yml

key-decisions:
  - "Settings is a 3-section shell (D-04): Admin (admin-only, default for admins), Configuration (re-hosts existing SettingsTab unchanged), Account (everyone)."
  - "Guards render as disabled controls with tooltips, not hidden (D-06) — last-admin + self protection mirrored server-side."
  - "Invite always shows a copyable link regardless of SMTP state (D-10)."

patterns-established:
  - "Shared TanStack Query keys must use identical queryFns: AuthGate + useAuth both key ['auth','me'] — both must unwrap the { user } envelope or the first-resolved shape wins."

status: complete
human_verified: true
---

## Plan 21-10 — Settings restructure + UsersPanel + InviteCreateModal

Final integration plan for Phase 21. Composes the 21-08/21-09 building blocks into the
admin-facing management surface and ends in a human-verify checkpoint.

## What was built

- **SettingsPage.jsx** — restructured into Admin / Configuration / Account sub-sections.
  Left-rail nav on desktop, `<select>` on mobile. Admin section gated on `role === 'admin'`
  and is the default section for admins; non-admins default to Account. Configuration
  re-hosts the existing `SettingsTab` unchanged.
- **UsersPanel.jsx** — user table (role badge, status badge, action menu). Last-admin and
  self guards render as `disabled` controls with tooltips. Pending-invites list with
  Resend / Revoke (inline-confirm for destructive actions).
- **InviteCreateModal.jsx** — email + role selector; success state shows the always-copyable
  invite link with copy affordance and SMTP-on/off note variants.

Tasks 1–3 committed: `70c9505`, `ac889e1`, `a6f11e9`. Pre-checkpoint suite green
(listener 560/560, web 274/274).

## Human-verify checkpoint (Task 4) — APPROVED

In-browser verification against the beta deployment surfaced **six real defects** (all
fixed, all regression-tested; the unit suites missed them because they mocked the hooks
per-component — classic composition defects). Diagnosed the Admin-tab failure with a live
browser inspecting the React Query cache.

| # | Fix | Commit | Why the unit suite missed it |
|---|-----|--------|------------------------------|
| 1 | `useAuth` unwraps `/me`'s `{ user }` envelope so `user.role`/`email` resolve | `a1cd057` + test `29c4239` | tests mocked `useAuth` with conflicting shapes |
| 2 | `AuthGate` must unwrap too — it shares the `['auth','me']` cache key and resolved first, caching the wrapped shape → Admin tab hidden | `424dd9a` | per-component mocks never compose the two queries |
| 3 | Email senders default the `{ from }` options param → forgot-password no longer throws a destructure TypeError when SMTP is off; bind `{ from }` at injection | `34a0cb4` | call-site arg mismatch only hit at runtime |
| 4 | `SMTPConfigSection` invalidates `['setup','smtp']` after save so the test button enables without a reload | `0dda7cb` | no test asserted post-save refetch |
| 5 | Save the SMTP password on **first-time** setup (was gated on `changingPassword`, only set by the Change button which needs an existing secret) | `ed4aa61` | no first-time-setup test existed |
| 6 | Beta: `SESSION_COOKIE_SECURE` defaults off (secure cookie wasn't round-tripping the Traefik→nginx chain → login loop) | `34a0cb4` | infra/deploy config, not unit-testable |

Human confirmed on beta: admin screen visible, identity in sidebar, SMTP configures +
sends a test email.

## Self-Check: PASSED

- Tasks 1–4 complete (Task 4 human-approved).
- Full suite green: listener 562/562, web 279/279.
- All six human-verify fixes committed to `main` with regression tests (each verified to
  fail without its fix).
