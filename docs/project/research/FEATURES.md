# Feature Research

**Domain:** Multi-user auth (invite-only) + email infrastructure + email alert channel — HomeChronicle v1.4
**Researched:** 2026-06-09
**Confidence:** HIGH (code schema read directly; patterns drawn from comparable self-hosted apps: Gitea, Vaultwarden, Immich, Home Assistant)

---

## Scope Constraint

Every feature is evaluated through one lens: **a handful of trusted people in a single household, self-hosted on a home server, where all users see all device events with no per-user isolation**. Per-user event scoping is explicitly out-of-scope per PROJECT.md. This rules out whole categories of "auth" features before analysis begins.

---

## Feature Landscape

### Table Stakes (Users Expect These)

Features users assume exist. Missing these = the feature area feels broken or incomplete.

| Feature | Area | Why Expected | Complexity | Notes |
|---------|------|--------------|------------|-------|
| First-user-becomes-admin bootstrap | Auth | Standard invite-only pattern; every comparable self-hosted app does this (Gitea, Vaultwarden, Immich). Users expect a clean "setup" flow on first access rather than editing an env file. | LOW | Check users table on startup; if empty, redirect to `/setup` — create first user as admin. No invite token needed for this path. |
| Admin invites others by email | Auth | Invite-only is the explicit model; "sign up" buttons are absent by design. | MEDIUM | Generate a time-limited invite token (opaque random bytes, not a JWT); store `(email, token_hash, role, expires_at, status)` in `invites` table. Admin sends invite → token link emailed. |
| Invite link doubles as email verification | Auth | Separate "verify your email" step after registration adds friction without security benefit for an admin-curated invite list. The admin already confirmed the address by entering it. | LOW | Accepting the invite marks the account as email-verified. No separate verify flow. |
| Invite token expiry | Auth | Stale links are a security hazard; users expect links to expire. | LOW | 72-hour default expiry is the community norm (Gitea, GitHub). Store `expires_at`; check on accept. Cronjob or on-access sweep to mark `expired`. |
| Invite lifecycle states | Auth | Users (admin) need to see what happened to an invite. | LOW | States: `pending` (sent, not yet accepted) → `accepted` (user clicked and set password) → `expired` (past `expires_at`) → `revoked` (admin explicitly cancelled). Admin UI shows all four. |
| Accept-invite sets password | Auth | The invite link is the only entry point; setting password on accept is the expected UX for invite-only flows. | LOW | Accept page shows email (pre-filled, read-only) + password + confirm. On submit: hash password, create user, mark invite `accepted`. |
| Session-based login | Auth | Replacing the shared API token with real sessions is the entire point. Username/email + password. | MEDIUM | HTTP-only session cookie (express-session + pg session store). Do not use JWTs stored in localStorage for primary auth — they can't be server-side invalidated. |
| Logout | Auth | Universally expected. | LOW | Server-side session destruction. Clear session cookie. |
| Change own password | Account | Any auth system without password change is incomplete. | LOW | Current password required before setting new password. Applies to all roles. |
| Forgot/reset password by email | Account | Expected whenever email is in the stack. | MEDIUM | "Forgot password" → enter email → receive reset link (time-limited token, same pattern as invite token, but stored in a `password_resets` table or reuses a general `tokens` table). Link → set new password. Token single-use, expires in 1 hour. |
| Admin can disable/revoke user | Account | Required when someone leaves the household. | LOW | `enabled` boolean on users table. Disabled users' sessions are invalidated on next request. Hard-delete is optional (disable is sufficient for household scale). |
| Admin vs member roles | Account | All-admin is a pitfall for multi-user (any user can invite more users, change SMTP, etc.). Two roles are sufficient. | LOW | Admin: invite users, revoke users, configure SMTP, change any user's role. Member: view all events/devices (same as today), manage alert rules (proposed), change own password. No per-user event isolation — all users see all data. |
| Email for invite and password reset | Email infra | Without email, the invite and reset flows require an admin to manually copy/paste links — workable but expected to be automated. | MEDIUM | Nodemailer + SMTP configuration (host, port, user, password, from address) stored in env vars. HTML emails with plain-text fallback. |
| Email alert delivery channel | Alert channel | Once email is in the stack, sending alert emails is the obvious extension of the existing webhook system. Users expect it. | MEDIUM | New channel type alongside webhooks. See schema dependency section below. |
| Per-rule channel selection | Alert channel | A rule that pages a webhook endpoint shouldn't also email — users need to choose. | LOW | `channel` column on `alert_rules` (values: `'webhook'` \| `'email'`). `target_url` becomes conditional on `channel='webhook'`; a `recipient_email` field (or comma-separated list) applies when `channel='email'`. |
| Alert delivery log includes channel | Alert channel | The existing `/api/alerts/deliveries` endpoint shows `target_url` and `response_code`. These are HTTP-shaped. Email delivery needs its own representation. | LOW | `response_code` goes nullable (already `null`-able in `createDelivery`). Add `channel` column to `alert_deliveries`. `error` field already handles both failure cases. |
| Graceful degradation when SMTP is not configured | Email infra | Many self-hosters won't configure SMTP initially. Hard failure at startup or invite time is hostile. | LOW | If SMTP is not configured: invite and reset flows surface a copyable link in the admin UI. The feature works without email — email is an enhancement. This is the Gitea/Vaultwarden model. |

### Differentiators (Competitive Advantage)

Features that add value beyond the minimum, worth building once table stakes are solid.

| Feature | Area | Value Proposition | Complexity | Notes |
|---------|------|-------------------|------------|-------|
| Copyable invite link in admin UI (SMTP-optional) | Auth | Self-hosters without SMTP can still invite users by copying the link and sharing it via Signal/iMessage. Gitea and Vaultwarden both do this — it's a genuine UX improvement for the self-hosted context. | LOW | Show full invite URL in a read-only input after generating the invite. "Copy link" button. Email is sent if SMTP is configured; link is always shown. |
| Admin can resend invite | Auth | Invite emails land in spam; admin shouldn't have to revoke and re-create. | LOW | Generates a fresh token, extends `expires_at`, re-sends email if SMTP configured. |
| Per-user display name | Account | Email addresses are ugly in the UI. Users want to appear as "Marc" not "marc@example.com". | LOW | `display_name` nullable column on users. Falls back to email prefix if unset. |
| SMTP configuration test button | Email infra | Self-hosters configure SMTP wrong constantly (port, TLS, credentials). A "send test email" button surfaces errors before they affect real flows. | LOW | POST `/api/setup/smtp/test` — sends a test email to the admin's address. Returns success or error message. |
| Alert email with event context | Alert channel | A webhook payload carries rich context; an email should too. "Motion detected in Kitchen (Hallway Camera) at 10:42 PM — Value changed from inactive to active." | LOW | HTML email template with event details from the existing `buildPayload()` structure. No new API needed. |
| Alert email recipient list per rule | Alert channel | Different household members may want different alerts. "Only Marc gets the door sensor alerts; everyone gets the smoke detector." | MEDIUM | Comma-separated `recipient_email` field on `alert_rules`. Parser validates each address. Alert processor fans out one email per recipient. Delivery log records per-recipient. |

### Anti-Features (Deliberately Excluded)

Features to explicitly not build for a single-household self-hosted app.

| Feature | Area | Why Requested | Why Excluded | Alternative |
|---------|------|---------------|--------------|-------------|
| Self-service signup ("Sign Up" button) | Auth | Every SaaS app has one | Invite-only is the explicit security model. A signup button undermines it — anyone who finds the URL can create an account. | Admin-only invite flow. First user bootstrap covers the only legitimate open-registration moment. |
| OAuth / SSO providers (Google, GitHub, etc.) | Auth | Convenience; no password to remember | Adds significant complexity (OAuth client registration, token exchange, session linkage). For a household app, password auth + invite is more than sufficient. SSO makes sense at org scale, not home scale. | Password auth with strong bcrypt hashing. |
| Mandatory MFA / TOTP | Auth | Security best practice in enterprise | Adds hardware/app dependency for household members (partner, kids) who don't use authenticator apps. A household Nginx instance is not accessible from the internet in the typical deployment. | Strong password enforcement (minimum length). Add MFA as an opt-in future enhancement only if the app gains public internet exposure. |
| Separate email verification step | Auth | Standard SaaS pattern (sign up → verify email → login) | The invite already proves the admin entered a valid, reachable address. A separate verify step adds friction for zero security gain in an invite-only model. | Invite acceptance = implicit verification. |
| Granular RBAC beyond admin/member | Account | "I want Bob to see events but not manage alert rules" | Two roles cover the household use case. Granular permissions multiply testing surface and UI complexity. No household has the org-chart complexity to need it. | Treat alert-rule management as a member capability (low risk: all users see all events anyway). Settings that affect infrastructure (SMTP, invites, retention) stay admin-only. |
| Per-user event isolation / filtering | Account | Privacy between household members | Explicitly out of scope per PROJECT.md. All users see all device events. This is a deliberate architectural decision, not an oversight. | Nothing. The shared-event model is the product. |
| Password rotation policies / complexity enforcement beyond minimum | Account | Enterprise compliance | No compliance requirement in a household. Complex rules increase forgotten-password support burden. | Minimum 8 characters (configurable via env). bcrypt does the security heavy lifting. |
| CAPTCHA on login/reset forms | Auth | Bot protection | Self-hosted on a home network with 2–5 users. Rate limiting (already in the codebase via `express-rate-limit`) provides sufficient protection. CAPTCHA requires external service dependency (Google reCAPTCHA, hCaptcha) and adds friction for legitimate users. | Existing rate limiting on auth routes. |
| Email open tracking / click tracking | Email infra | Know if the alert email was read | Requires a tracking pixel server, introduces privacy concerns, adds complexity. The `alert_deliveries` table records sent/failed; that's the needed signal. | Log `status='sent'` on successful SMTP handoff. That's the delivery guarantee the system can make. |
| SPF/DKIM/DMARC configuration in-app | Email infra | Email deliverability | This is DNS and SMTP server configuration — the user's domain and mail provider handle it, not the app. | Document SMTP configuration in README. The app's job is to hand off to the configured SMTP relay. |
| Webhook-to-email hybrid channel (single rule fires both) | Alert channel | "Belt and suspenders" | Adds channel fan-out complexity to the rule processing loop. One rule, one channel is simpler and auditable. If a user wants both, they create two rules. | Two rules with identical scope/filter, different channels. |
| Alert email HTML editor / custom templates | Alert channel | Branding, customization | Template customization means a template storage layer, preview UI, sanitization. Massive complexity for a home server where a sensible default template is sufficient. | Well-designed default template with event context. |

---

## Feature Dependencies

```
[Session Auth]
    └──requires──> [users table] (email, password_hash, role, enabled, display_name)
    └──requires──> [sessions table or pg session store] (express-session)
    └──replaces──> [API_TOKEN header auth for web UI reads]
    └──enables──> [Admin invite flow]
    └──enables──> [Account management endpoints]

[First-user Bootstrap]
    └──requires──> [Session Auth] (login after bootstrap completes)
    └──blocks──> [All other auth features] (must run first; gate on users table empty check)

[Admin Invite Flow]
    └──requires──> [Session Auth] (must be logged in as admin)
    └──requires──> [invites table] (email, token_hash, role, expires_at, status)
    └──optionally──> [SMTP / Nodemailer] (email sent if configured; link shown always)
    └──enables──> [Accept-invite-sets-password]

[Accept-invite-sets-password]
    └──requires──> [invites table] (token lookup + status update)
    └──requires──> [users table] (user creation on accept)
    └──requires──> [Session Auth] (auto-login after accept)

[Forgot/Reset Password]
    └──requires──> [Session Auth] (produces the new session on reset)
    └──requires──> [password_resets table] (token, user_id, expires_at, used_at)
    └──requires──> [SMTP / Nodemailer] (hard dependency — no fallback link like invites)

[SMTP / Nodemailer]
    └──enables──> [Invite email delivery]
    └──enables──> [Password reset email]
    └──enables──> [Email alert channel]
    └──soft dependency──> Invite + reset flows degrade gracefully (admin-copyable link shown)

[Email Alert Channel]
    └──requires──> [SMTP / Nodemailer]
    └──requires──> [alert_rules schema change] (add channel + recipient_email, make target_url conditional)
    └──requires──> [alert_deliveries schema change] (add channel column, nullable response_code already exists)
    └──reuses──> [suppression logic in alerts.js] (status='sent' check is channel-agnostic — no change needed)
    └──reuses──> [processAlertsForEvent() loop] (extend with email dispatch path alongside sendWebhook())
    └──conflicts──> [validateCreate() requiring target_url] (must become conditional on channel)
```

### Dependency Notes

- **Session auth before everything.** The invite and account management flows are all gated behind a session. The users/sessions tables must exist before any auth feature can be tested.
- **First-user bootstrap gates invite flow.** You cannot invite others until at least one admin exists. Bootstrap must ship in the same phase as session auth.
- **SMTP is a soft dependency for invite but a hard one for reset.** Invites can show a copyable link; password reset has no admin-visible link alternative (user's email is the reset delivery mechanism). If SMTP is unconfigured, password reset should surface a clear error rather than silently failing.
- **Alert schema change is surgical, not a rewrite.** The `alert_rules` table needs a `channel` column ('webhook'|'email', default 'webhook') and a `recipient_email` column (nullable). `target_url` stays but becomes conditional. `validateCreate()` in `alerts-router.js` needs to branch on `channel` before calling `validateWebhookTargetUrl()`. The suppression logic (`status='sent'` batch query in `processAlertsForEvent()`) carries over with zero changes.
- **`alert_deliveries` is already mostly channel-agnostic.** `response_code` is already nullable in `createDelivery()`. The only addition needed is a `channel` column so the delivery log shows 'email' vs 'webhook' — otherwise the UI row for an email delivery would show a blank `target_url` and null `response_code` with no explanation.
- **Invite token security.** Tokens must be stored as a hash (SHA-256 of random 32 bytes), not plaintext. The raw token goes in the link only. Same pattern as password reset tokens in every well-regarded open-source auth system.

---

## Invite Lifecycle States

| State | Trigger | Admin UI Display | User Experience |
|-------|---------|-----------------|----------------|
| `pending` | Admin generates invite | "Pending" — shows copyable link, resend button | Email received (if SMTP configured) or link shared out-of-band |
| `accepted` | User clicks link, sets password, submits | "Accepted" — shows joined date | Logged in; full access per role |
| `expired` | `expires_at` passes without acceptance | "Expired" — shows resend/revoke options | Link shows "This invite has expired" error |
| `revoked` | Admin clicks revoke | "Revoked" — shows re-invite option | Link shows "This invite is no longer valid" error |

---

## MVP Definition

### v1.4 Launch With

Minimum required for the auth milestone to be shippable and safe.

- [ ] Session-based auth (users table, pg sessions, login/logout) — foundational for all other features
- [ ] First-user bootstrap (empty-users-table redirect to `/setup`) — gates invite flow
- [ ] Admin invite flow with invite lifecycle states (pending/accepted/expired/revoked) — replaces shared token model
- [ ] Accept-invite-sets-password — required companion to invite
- [ ] Change own password — baseline account management
- [ ] Forgot/reset password by email — required when SMTP is configured; error message when not
- [ ] Admin disable/revoke user — required for access control
- [ ] Admin vs member roles (two roles only) — minimal RBAC
- [ ] SMTP configuration via env vars (nodemailer) — email infrastructure foundation
- [ ] Email channel on alert_rules (channel + recipient_email columns; target_url conditional) — schema migration
- [ ] Email dispatch in processAlertsForEvent() alongside existing sendWebhook() — alert delivery

### Add After Core Is Stable (v1.4.x)

- [ ] Copyable invite link in admin UI — SMTP-optional fallback, high value for self-hosters
- [ ] Admin resend invite — reduces friction when emails land in spam
- [ ] SMTP test email button — saves significant self-hoster debugging time
- [ ] Per-user display name — polish
- [ ] Alert email with full event context (HTML template) — upgrade from bare notification

### Future Consideration (v1.5+)

- [ ] Alert recipient list per rule (fan-out per member) — useful when household grows; adds delivery-log complexity
- [ ] Opt-in MFA/TOTP — only relevant if the app gains public internet exposure
- [ ] Audit log for admin actions (invite, revoke, role change) — nice-to-have for accountability

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Session auth + login/logout | HIGH | MEDIUM | P1 |
| First-user bootstrap | HIGH | LOW | P1 |
| Admin invite flow + lifecycle | HIGH | MEDIUM | P1 |
| Accept-invite sets password | HIGH | LOW | P1 |
| Forgot/reset password | HIGH | MEDIUM | P1 |
| Admin disable/revoke user | HIGH | LOW | P1 |
| Admin vs member roles | HIGH | LOW | P1 |
| SMTP configuration (nodemailer) | HIGH | LOW | P1 |
| Email alert channel (schema + dispatch) | HIGH | MEDIUM | P1 |
| Copyable invite link (no SMTP required) | HIGH | LOW | P2 |
| SMTP test button | MEDIUM | LOW | P2 |
| Alert email with event context template | MEDIUM | LOW | P2 |
| Per-user display name | LOW | LOW | P2 |
| Admin resend invite | MEDIUM | LOW | P2 |
| Alert recipient list per rule | MEDIUM | MEDIUM | P3 |
| Opt-in MFA/TOTP | LOW | HIGH | P3 |
| Admin audit log | LOW | MEDIUM | P3 |

**Priority key:**
- P1: Required to ship v1.4
- P2: Add within milestone if time allows; defer to v1.4.x otherwise
- P3: Future milestone

---

## Schema Dependency Analysis (Existing Code)

This section is grounded in direct reading of `listener/src/alerts.js` and `listener/src/alerts-router.js`.

### alert_rules changes required for email channel

Current `validateCreate()` calls `validateWebhookTargetUrl(body.targetUrl)` unconditionally and returns an error if it fails. A new `channel` field must gate this:

```
channel: 'webhook' | 'email'   (new column, default 'webhook')
recipient_email: string | null  (new column, null when channel='webhook')
target_url: string | null       (already nullable in DB; validate only when channel='webhook')
```

The `toApiRule()` serializer and `validateCreate()`/`validatePatch()` in `alerts-router.js` both need a `channel` branch. The GET `/rules` response currently strips `targetUrl` from the list view — the same strip should apply to `recipientEmail` for non-admin views (prevents harvesting member emails).

### alert_deliveries changes required for email channel

Current `createDelivery()` signature:
```
{ ruleId, eventId, status, targetUrl, responseCode, error }
```

`responseCode` is already passed as `null` in some paths (it is nullable in the INSERT). For email deliveries:
- `targetUrl` will be null (no URL to record) — the schema already allows null here implicitly, but the column should be confirmed nullable
- `responseCode` will always be null for email — already handled
- Add `channel` column ('webhook'|'email') so the delivery log UI can distinguish the two without relying on the presence/absence of `target_url`

### Suppression logic carries over unchanged

`processAlertsForEvent()` batches `status='sent'` lookups for quiet-period suppression. This is already channel-agnostic: the query looks at delivery status, not delivery mechanism. Email deliveries that succeed will be recorded as `status='sent'`, and suppression will work identically.

### Migration strategy

Add columns with defaults so existing rows and existing application code continue to work:
```sql
ALTER TABLE alert_rules ADD COLUMN channel TEXT NOT NULL DEFAULT 'webhook';
ALTER TABLE alert_rules ADD COLUMN recipient_email TEXT;
ALTER TABLE alert_deliveries ADD COLUMN channel TEXT NOT NULL DEFAULT 'webhook';
```

Existing webhook rules get `channel='webhook'` automatically. No data migration needed.

---

## Comparable Self-Hosted App Patterns

| Pattern | Gitea | Vaultwarden | Immich | Home Assistant | HomeChronicle v1.4 Approach |
|---------|-------|-------------|--------|----------------|------------------------------|
| First-user admin | Yes — first registrant becomes admin | Yes — first user is owner | Yes — first user during onboarding | Yes — initial setup wizard | First user on empty DB bootstraps as admin |
| Invite model | Admin invites OR open registration (configurable) | Admin-controlled user creation | Admin invites | Account creation in Settings | Invite-only; no self-registration |
| Invite email | Yes, with copyable link fallback | No email, admin creates password directly | Yes | Yes | Email + copyable link (SMTP-optional) |
| Token storage | Hashed in DB | Hashed in DB | Hashed in DB | Hashed in DB | SHA-256 hash; raw token in link only |
| Invite expiry | Configurable (7 days default) | N/A (no invite flow) | 7 days | No expiry | 72 hours default |
| Session type | Cookie-based + token for API | Cookie session | Cookie session | Long-lived token | HTTP-only cookie session (pg store) |
| Roles | Admin/org roles (complex) | Admin/member | Admin/member | Admin/user | Admin/member (two roles only) |
| Password reset | Email with time-limited link | Admin resets for user | Email | Profile page | Email with 1-hour token |
| SMTP optional | Yes — degraded mode | N/A | Yes — degraded mode | Yes — degraded mode | Yes — invite link always shown |

---

## Sources

- HomeChronicle codebase: `listener/src/alerts.js`, `listener/src/alerts-router.js` (direct code read)
- HomeChronicle `.planning/PROJECT.md` (constraint: no per-user event isolation; invite-only model)
- Gitea invite and user management: https://docs.gitea.com/administration/user-management
- Vaultwarden (Bitwarden self-hosted) user creation patterns: https://github.com/dani-garcia/vaultwarden/wiki/Creating-new-user
- Immich invite system: https://immich.app/docs/administration/user-management/
- Home Assistant user and auth model: https://www.home-assistant.io/docs/authentication/
- express-session + connect-pg-simple (pg session store): established Node.js patterns, HIGH confidence
- Nodemailer SMTP: https://nodemailer.com/about/ — standard Node.js email library
- OWASP password reset cheat sheet: https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html (token hashing, expiry, single-use)

---

*Feature research for: HomeChronicle v1.4 — multi-user auth, account management, email alert channel*
*Researched: 2026-06-09*
