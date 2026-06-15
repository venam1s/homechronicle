# Member Self-Serve Alerts — Design Spec

**Date:** 2026-06-15
**Status:** Approved (brainstorming) → ready for GSD phase planning
**Milestone:** v1.4 (Multi-User Auth & Email) — folded in as a new phase before the release tag
**Related:** Phase 22 (Email Alert Channel), Phases 24/25 (per-user preferences & quiet hours — the ownership pattern this mirrors)

## Problem

Alert rules are currently **household-shared and admin-only**: `POST/PATCH/DELETE /api/alerts/rules` require an admin session, and the Alerts section only appears when an admin flips a household-wide `Webhook Alerts: On` master toggle (`PATCH /api/setup/alerts`, admin-only). A member who tries to enable alerts toggles a control that silently 403s, so the Alerts nav never appears. Members cannot set up alerts at all.

We want **members to set up their own alerts**, with the email channel disabled (with a clear message) when SMTP is not configured.

## Approved Decisions

1. **Ownership: per-user private.** Each user (admin or member) owns their alert rules and only sees/edits their own. Mirrors the per-user preferences & quiet-hours model from Phases 24/25.
2. **Channels: email-to-self + webhook.** Members may create both. A member's email alerts are locked to their own account email (no arbitrary recipients). Webhooks are allowed and run through the existing SSRF validator. Admins keep arbitrary email recipients.
3. **SMTP unconfigured:** the email channel is disabled in the UI with an "Email not configured — ask an admin to set up SMTP" message, and rejected server-side as defense in depth.
4. **Master toggle dropped.** The household-wide enable gate goes away. Any logged-in user always sees the Alerts section and manages their own rules (self-serve). The admin-only enable toggle and the nav-gating-by-`enabled` are both removed.
5. **Sequencing:** folded into v1.4. The milestone reopens with this phase, gets re-audited, then tagged.

## Architecture

Reuse the existing `alert_rules` table by adding an owner column, and scope every query by owner. This keeps the alert-processing pipeline (`processAlertsForEvent`) untouched and follows the Phase 24/25 pattern. (Rejected alternative: a separate per-user alerts table — unnecessary duplication, and it would fragment the processing query.)

### 1. Data model

- **Migration `0008_alert_rules_owner`** (additive, up/down following existing migration format):
  - `ALTER TABLE alert_rules ADD COLUMN user_id BIGINT REFERENCES users(id) ON DELETE CASCADE;`
  - `CREATE INDEX ix_alert_rules_user_id ON alert_rules (user_id);`
  - **Backfill:** set `user_id` on existing rows to the bootstrap admin (lowest-id admin user) so current household rules continue to work as that admin's rules.
- **`alert_deliveries`: unchanged.** Ownership is derived by joining `rule_id → alert_rules.user_id`. The existing `event_id` FK and per-channel columns are untouched.
- Deleting a user cascades their rules (`ON DELETE CASCADE`); their deliveries follow the existing rule/delivery FK behavior.

### 2. API & permissions (`alerts-router.js`)

- **Authentication:** replace `requireAdminSession` on `POST/PATCH/DELETE /rules` with "any authenticated session." A request with no `req.hcSession` (service `API_TOKEN` only) cannot own rules → reject writes that need an owner with 401/403, matching existing router conventions.
- **Owner scoping (every query):**
  - `GET /rules` → `WHERE user_id = $sessionUserId`.
  - `POST /rules` → `user_id` is set from the session, never from the request body (no owner forgery).
  - `PATCH /rules/:id` and `DELETE /rules/:id` → `WHERE id = $id AND user_id = $sessionUserId` (IDOR protection; a 0-row update/delete returns 404). Same pattern as Phase 23 self-only session revoke.
  - `GET /deliveries` → scoped to deliveries whose rule is owned by the session user.
- **Email recipient enforcement (server-side):** when `role === 'member'` and `channel === 'email'`, force `target_email` to the member's own account email regardless of submitted value. Admins keep arbitrary recipients.
- **SMTP guard:** `channel === 'email'` is rejected with a clear error (e.g. `{ error: 'Email channel unavailable — SMTP is not configured' }`) when email is not enabled (`isEmailEnabled()` false).
- **Master toggle removed:** `enabled` in `/api/setup/alerts` is no longer used as a gate. `webhookTimeoutMs` remains an admin-only household infra setting; `defaultQuietMinutes` remains a per-rule default. (Confirm during planning whether anything server-side, e.g. subscriber processing, currently short-circuits on `enabled` and remove that gate too.)

### 3. Frontend & UX

- **Sidebar (`Sidebar.jsx`):** remove the `featureFlag: 'alerts'` entry condition so Alerts is always visible to authenticated users. Remove the `alertsEnabled`-based `visibleNavItems` filter for alerts.
- **App (`App.jsx`):** remove the `alertsEnabled` gate and the "bounce off the alerts page when disabled" effect.
- **Settings (`SettingsTab.jsx`):** remove the admin-only "Webhook Alerts" enable toggle (the source of the confusion). Keep the webhook-timeout control as an admin infra setting (admin-gated, since the rest of household infra config is admin-only).
- **Alerts page (`Alerts.jsx` / `AlertsPage`):**
  - Shows only the caller's own rules.
  - Channel picker: the **Email** option is disabled with an "Email not configured — ask an admin to set up SMTP" message when SMTP is off (frontend learns SMTP status from the existing alerts/SMTP capability the Phase 22 UI already uses).
  - For **members**, the email recipient field is locked/read-only and prefilled from `useAuth().user.email`. For **admins**, the recipient field stays editable (existing Phase 22 behavior).

### 4. Security & threat model

- **IDOR:** rule read/edit/delete scoped by `user_id` in SQL; cross-user access returns 404.
- **Email abuse:** member recipient forced to own account email server-side (UI lock is not the control).
- **SSRF:** existing `validateWebhookTargetUrl` (loopback/link-local/optional private-range blocking) now applies to all authenticated users — a broader surface than admin-only, but validated. `ALERTS_ALLOW_PRIVATE_TARGETS` still governs private ranges.
- **Privilege:** server always derives `user_id` from the session; the request body cannot set or change ownership or role.
- **Service token:** `API_TOKEN`-only callers (no session) cannot create owned rules; behavior for the service path is documented and tested.

### 5. Testing

- **Listener:** per-user scoping on GET/POST/PATCH/DELETE; IDOR rejection (another user's rule id → 404); member `channel=email` forces own email; admin can set arbitrary recipient; `channel=email` rejected when SMTP unconfigured; webhook validation still enforced; existing webhook rules keep working post-migration; backfill assigns existing rows to the bootstrap admin.
- **Web:** Alerts nav always visible to authenticated users (no enable gate); a user sees only their own rules; email channel disabled + message when SMTP off; recipient locked for members and editable for admins; Settings no longer shows the enable toggle.
- **Migration:** `0008` applies cleanly on top of `0007`; up/down verified.

## Proposed Requirements (register in REQUIREMENTS.md under v1.4)

- **MALERT-01:** Alert rules are per-user owned; each user sees and manages only their own rules.
- **MALERT-02:** Any authenticated user (admin or member) can create, edit, and delete their own alert rules; no admin role required.
- **MALERT-03:** `alert_rules` gains a `user_id` FK → `users(id) ON DELETE CASCADE` (migration `0008`); existing rows are backfilled to the bootstrap admin; the change is additive and webhook rules continue to work.
- **MALERT-04:** Rule edit/delete is owner-scoped in SQL (IDOR-safe); accessing another user's rule returns 404.
- **MALERT-05:** A member's email-channel rule recipient is forced server-side to the member's own account email; admins may use arbitrary recipients.
- **MALERT-06:** The email channel is disabled in the UI (with an explanatory message) and rejected server-side when SMTP is unconfigured.
- **MALERT-07:** The household-wide alerts enable gate is removed; the Alerts section is always available to authenticated users; the admin-only enable toggle is removed from Settings.

## Out of Scope (YAGNI)

- Admin oversight/visibility into other users' rules (chosen model is private per-user).
- Arbitrary email recipients for members.
- Notification channels beyond webhook/email.
- Per-user SMTP configuration (SMTP stays an admin household setting).
