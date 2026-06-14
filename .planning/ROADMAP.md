# Roadmap: HomeChronicle

## Milestones

- ✅ **v1.0 Code Health** — Phases 1-7 (shipped 2026-04-06)
- ✅ **v1.1 Scheduled Repair** — Phases 8-9 (shipped 2026-04-08)
- ✅ **v1.2 UI Redesign** — Phases 10-17 (shipped 2026-04-16)
- ✅ **v1.3 Repair Reliability Fixes** — Phases 18-19 (shipped 2026-04-21)
- 🔲 **v1.4 Multi-User Auth & Email** — Phases 20-23 (active)

## Phases

<details>
<summary>✅ v1.0 Code Health (Phases 1-7) — SHIPPED 2026-04-06</summary>

- [x] Phase 1: Error Handler Foundation (2/2 plans) — completed
- [x] Phase 2: Migration System (2/2 plans) — completed
- [x] Phase 3: Count Optimization (1/1 plan) — completed
- [x] Phase 4: Router Extraction — Simple Groups (3/3 plans) — completed
- [x] Phase 5: Router Extraction — Accessories (2/2 plans) — completed
- [x] Phase 6: Router Extraction — Setup (2/2 plans) — completed
- [x] Phase 7: Tech Debt Cleanup (2/2 plans) — completed

See `milestones/v1.0-ROADMAP.md` for full details.

</details>

<details>
<summary>✅ v1.1 Scheduled Repair (Phases 8-9) — SHIPPED 2026-04-08</summary>

- [x] Phase 8: Scheduled Repair Backend (2/2 plans) — completed
- [x] Phase 9: Scheduled Repair UI (1/1 plan) — completed

See `milestones/v1.1-ROADMAP.md` for full details.

</details>

<details>
<summary>✅ v1.2 UI Redesign (Phases 10-17) — SHIPPED 2026-04-16</summary>

- [x] Phase 10: Design Token Foundation (4/4 plans) — completed 2026-04-14
- [x] Phase 11: Sidebar Navigation Shell (3/3 plans) — completed 2026-04-14
- [x] Phase 12: Page Extraction & Card Layout (3/3 plans) — completed 2026-04-15
- [x] Phase 13: Responsive Sidebar (3/3 plans) — completed 2026-04-15
- [x] Phase 14: Dashboard Widgets (3/3 plans) — completed 2026-04-15
- [x] Phase 15: Chart Styling (3/3 plans) — completed 2026-04-15
- [x] Phase 16: Verification Sweep & Requirements Update (2/2 plans) — completed 2026-04-16
- [x] Phase 17: Token Debt Cleanup (4/4 plans) — completed 2026-04-16

See `milestones/v1.2-ROADMAP.md` for full details.

</details>

<details>
<summary>✅ v1.3 Repair Reliability Fixes (Phases 18-19) — SHIPPED 2026-04-21</summary>

- [x] Phase 18: Scheduled Repair — Subscriber Restart Fix (1/1 plan) — completed 2026-04-20
- [x] Phase 19: Scheduled Repair — Full pairSetup() Capability (1/1 plan) — completed 2026-04-21

See `milestones/v1.3-ROADMAP.md` for full details.

</details>

### v1.4 Multi-User Auth & Email

- [x] **Phase 20: Auth Foundation** — Users, sessions, token-OR-session gate, first-admin bootstrap, CSRF protection, LoginPage + AuthGate (executed 2026-06-10; 13 plans incl. gap-closure 20-11/12/13; UAT 4/4 PASS live on beta, VERIFICATION verified) (completed 2026-06-11)
- [x] **Phase 21: Email Infrastructure + Invites + Password Reset** — nodemailer SMTP, invite lifecycle, password reset, user management UI (completed 2026-06-12)
- [x] **Phase 22: Email Alert Channel** — Email delivery channel on alert rules, schema migration, channel selector UI (UAT gap closed by 22-05: explicit Edit control on Active Rules rows) (completed 2026-06-13)
- [x] **Phase 23: Security Hardening + Nginx Cutover** — Active-session revoke UI, token sweep, nginx X-API-Token injection removal (completed 2026-06-13)
- [ ] **Phase 24: Per-User UI Preferences (Phase 1)** — Per-user JSONB preferences blob (migration 0007) + `me-router` (`GET/PUT /api/me/preferences`) + `usePreference` layer; dashboard layout/ranges, appearance, muted, toast + grouping become per-account (localStorage fallback when unauthenticated/`AUTH_ENABLED=false`)
- [ ] **Phase 25: Per-User Quiet Hours (Phase 2)** — Quiet hours per-user; `/stats/quiet-hours` applies the requesting session user's config (shared household value as fallback)

## Phase Details

### Phase 20: Auth Foundation
**Goal**: Users can securely create accounts, log in with session cookies, and reach the existing app; the API_TOKEN service-token path remains fully operational in parallel
**Depends on**: Nothing (first phase of v1.4)
**Requirements**: AUTH-01, AUTH-02, AUTH-03, AUTH-04, AUTH-05, AUTH-06, AUTH-07, AUTH-08, SEC-01, SEC-02, SEC-03, SEC-04
**Success Criteria** (what must be TRUE):
  1. A first-run admin can claim an account via POST /api/auth/claim-admin; the endpoint self-disables once any user exists
  2. A user can log in with email and password and receive an HttpOnly session cookie that persists across browser refreshes
  3. A user can log out, destroying the server-side session so subsequent requests return 401
  4. A plain-HTTP self-hosted deployment (e.g., RPi on http://nas.local) can log in without cookie lockout because SESSION_COOKIE_SECURE=false is respected
  5. All mutating endpoints are CSRF-protected; the React frontend fetches a CSRF token after login and includes it on mutations; pre-auth routes (login, claim-admin) are exempt
**Plans**: 10 plans (5 waves)
- [x] 20-01-PLAN.md — Listener package gate + install (argon2, cookie-parser, csrf-sync)
- [x] 20-02-PLAN.md — Web package gate + install (react-router-dom v7)
- [x] 20-03-PLAN.md — security.js crypto helpers (argon2id hash/verify, hashToken, generateToken)
- [x] 20-04-PLAN.md — Migration 0003 (users+sessions) + db.js user/session CRUD
- [x] 20-05-PLAN.md — React router shell + AuthGate + useAuth/useUserCount + api.js credentials/CSRF
- [x] 20-06-PLAN.md — csrf-sync async-hook spike (gates CSRF coupling)
- [x] 20-07-PLAN.md — auth-router public (login/claim-admin/csrf-token/user-count, anti-fixation, auth limiter)
- [x] 20-08-PLAN.md — auth-router protected (/me, /logout) + csrf.js coupling
- [x] 20-09-PLAN.md — index.js gate replacement + middleware wiring + .env.example
- [x] 20-10-PLAN.md — LoginPage + SetupAdminPage (first-run) + ResetPasswordPage + routing
- [x] 20-13-PLAN.md — Gap closure (GAP-1): Sidebar Sign out control wired to useAuth().logoutMutation (AUTH-03)
**UI hint**: yes

### Phase 21: Email Infrastructure + Invites + Password Reset
**Goal**: Admins can invite new users by email; invited users can accept and set a password; users can reset forgotten passwords; SMTP infrastructure is operational with graceful degradation when unconfigured
**Depends on**: Phase 20
**Requirements**: USER-01, USER-02, USER-03, USER-04, USER-05, USER-06, USER-07, PWD-01, PWD-02, PWD-03, PWD-04, EMAIL-01, EMAIL-02, EMAIL-03, EMAIL-04
**Success Criteria** (what must be TRUE):
  1. An admin can generate an invite link (shown as copyable even without SMTP); when SMTP is configured the invite is also emailed to the recipient
  2. An invited user can accept the link, set a password meeting strength requirements, and land in the app — this single step also verifies their email address
  3. A user who forgets their password can request a reset; the system returns an identical response for known and unknown emails (no account enumeration); the single-use reset link expires after 1 hour
  4. Admin can view all users with role and status, revoke pending invites, and disable or remove a user (revoking their active sessions immediately)
  5. SMTP credentials are never returned by any settings API endpoint; when SMTP is unconfigured the app continues to function with copyable-link fallback for invites and a clear error for password reset
**Plans**: 10 plans (6 waves)
- [x] 21-01-PLAN.md — Migration 0004 + nodemailer install + Wave 0 test stubs + .env.example
- [x] 21-02-PLAN.md — Password strength: validatePasswordStrength + blocklist (listener) + strength.js (web)
- [x] 21-03-PLAN.md — db.js invite/reset-token/user-mgmt CRUD + validateSession disabled_at guard
- [x] 21-04-PLAN.md — emails.js transport + SMTP secret isolation + smtp-router (GET/PUT/test)
- [x] 21-05-PLAN.md — auth-router public (accept-invite/forgot-password/reset-confirm) + change-password
- [x] 21-06-PLAN.md — users-router CRUD + invite mgmt + last-admin/self guards
- [x] 21-07-PLAN.md — index.js email/router wiring + nginx /api/auth/* log redaction
- [x] 21-08-PLAN.md — PasswordStrengthMeter + AcceptInvitePage + functional ResetPasswordPage + routes
- [x] 21-09-PLAN.md — useUsers hooks + SMTPConfigSection + ChangePasswordSection
- [x] 21-10-PLAN.md — Settings restructure shell + UsersPanel + InviteCreateModal + human-verify
**UI hint**: yes

### Phase 22: Email Alert Channel
**Goal**: Alert rules can deliver notifications by email through the same quiet-period suppression path as webhooks; the Alerts UI lets users configure email-channel rules
**Depends on**: Phase 21
**Requirements**: ALERT-01, ALERT-02, ALERT-03, ALERT-04
**Success Criteria** (what must be TRUE):
  1. An admin can create an alert rule with channel = email and a recipient address; the address is validated at rule-creation time
  2. When a matching device event fires, an email alert is delivered to the configured recipient and logged in alert_deliveries
  3. Email alerts are suppressed by the same quiet-period logic as webhooks — a rapid-fire sequence of events produces at most one delivery per quiet period
  4. Existing webhook-channel alert rules continue to work without modification after the schema migration
**Plans**: 5 plans (4 waves)
- [x] 22-01-PLAN.md — Migration 0005 (additive email-channel schema) + Wave 0 test scaffolds
- [x] 22-02-PLAN.md — Backend send branch: sendEmailAlert + channel branch + delivery logging + startup emailFrom wiring
- [x] 22-03-PLAN.md — Alerts API: channel/target_email validation, toApiRule exposure (D-08), INSERT/PATCH/GET wiring
- [x] 22-04-PLAN.md — Alerts UI: channel picker + conditional email field + admin-email prefill + SMTP hint (ALERT-04)
- [x] 22-05-PLAN.md — Gap closure (UAT test 5): explicit Edit control on Active Rules rows (ALERT-04)
**UI hint**: yes

### Phase 23: Security Hardening + Nginx Cutover
**Goal**: Browser authentication transitions to session-only; nginx no longer injects X-API-Token; users can view and revoke active sessions; expired sessions and tokens are swept periodically
**Depends on**: Phase 22
**Requirements**: SEC-05, SEC-06, SEC-07
**Success Criteria** (what must be TRUE):
  1. A user can view all their active sessions in Settings and revoke any of them ("log out other devices"); revoking a session invalidates it immediately
  2. Expired sessions and used or expired invite/reset tokens are deleted automatically (on startup and periodically), keeping the database clean without manual intervention
  3. After nginx X-API-Token injection is removed, browser users authenticate via session cookie only; API_TOKEN continues to work for direct API callers (scripts, Home Assistant) via x-api-token header
**Plans**: 5 plans (3 waves)
- [x] 23-01-PLAN.md — Migration 0006 (session metadata) + Wave 0 RED scaffolds (nginx render test, auth-gate empty-token, db.js stubs)
- [x] 23-02-PLAN.md — SEC-05 backend: listSessionsForUser/revokeSessionById + UA/IP capture + GET/DELETE /api/auth/sessions
- [x] 23-03-PLAN.md — SEC-07 nginx cutover: NGINX_API_TOKEN template + entrypoints (web + standalone) + AUTH_ENABLED in 3 compose files
- [x] 23-04-PLAN.md — SEC-06 token sweep: runInviteTokenSweep/runPasswordResetTokenSweep folded into runRetentionSweepSafe
- [x] 23-05-PLAN.md — SEC-05 frontend: useSessions/useRevokeSession + ActiveSessionsPanel under Settings → Account
**UI hint**: yes

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1-7 | v1.0 | 14/14 | Complete | 2026-04-06 |
| 8-9 | v1.1 | 3/3 | Complete | 2026-04-08 |
| 10-17 | v1.2 | 25/25 | Complete | 2026-04-16 |
| 18 | v1.3 | 1/1 | Complete | 2026-04-20 |
| 19 | v1.3 | 1/1 | Complete | 2026-04-21 |
| 20 | v1.4 | 13/13 | Complete   | 2026-06-11 |
| 21 | v1.4 | 10/10 | Complete    | 2026-06-12 |
| 22 | v1.4 | 5/5 | Complete    | 2026-06-13 |
| 23 | v1.4 | 5/5 | Complete    | 2026-06-13 |

## Candidates / Backlog

> Parked ideas not yet committed to a milestone. Promote via `/gsd:review-backlog` or `/gsd:new-milestone` when ready.

### Opt-in Update Check & Anonymous Telemetry (candidate, suggested v1.4)

**Problem:** Docker pull counts conflate CI rebuilds, curious tire-kickers, and running instances. No visibility into who is actually running HomeChronicle, on what version, or on what platform.

**Proposal:** Daily update-check ping from the listener to a small versions endpoint. Drives an in-UI "update available" badge and gives the maintainer DAU + version distribution + platform split.

**Payload (sketch):**
```json
{
  "instanceId": "uuid-v4 stored once in /app/data/instance.json",
  "version": "0.1.10",
  "platform": "linux/arm64",
  "uptime_hours": 168,
  "accessory_count_bucket": "10-49"
}
```

**Privacy posture (non-negotiable for this audience):**
- Default **OFF**. Opt-in via Manage → Privacy with first-boot modal showing the full payload preview.
- All counts bucketed (never raw values).
- No IP logging server-side; aggregate counters only.
- Full payload documented in README and surfaced in `/api/setup` response so power users can verify.

**Server side:** Cloudflare Worker + D1 (or KV counters). ~$0/mo at expected scale. Dashboard: SQL views for `daily_active_instances`, `version_distribution`, `platform_split`.

**Cheap signals to enable first** (no code, this week):
- GitLab → Analytics → Repository (unique visitors, clones).
- GitHub mirror → Insights → Traffic (rolling 14-day).
- GitLab Container Registry → per-tag pull counts (compare `:latest` vs versioned tags).
- Turn on GitHub Discussions; pin a "Show your setup" thread; link from web UI footer.

**Open questions before promoting to a milestone:**
- Domain/host for the versions endpoint (`versions.homechronicle.dev`?).
- Worker vs. self-hosted endpoint (avoids Cloudflare dependency).
- Bucket boundaries for `accessory_count_bucket` and any future fields.
- Should the in-UI badge use the same endpoint or a separate `/latest.json` GitHub Pages file (cheaper, no infra)?

### Phase 24: Per-User UI Preferences (Phase 1)

**Goal:** Personal UI preferences follow the logged-in account across devices (server-backed), while infrastructure settings stay household-shared. Add a per-user JSONB preferences blob in Postgres (migration `0007_user_preferences`: `user_id` PK FK → `users(id)` ON DELETE CASCADE), a session-scoped `me-router` with `GET/PUT /api/me/preferences` (size-capped, object-validated), and a frontend `usePreference` layer (server-when-authenticated, localStorage-when-not; `AUTH_ENABLED=false` stays pure localStorage). Refactor consumers: `useDashboardLayout`, dashboard ranges (`DashboardPage` + `RoomChart`/`TopDevices`/`TrendChart`/`WeekdayHeatmap` `*_days` keys + sync toggle), `useTheme`/`useSkin`/`useAccent`/sidebar-collapsed, `useMutedDevices`, and the toast + episode/scene grouping controls in `SettingsTab` (these move off shared `retention.json` reads to the per-user blob). Seed the blob once on first authenticated load from existing localStorage + the user's current shared toast/grouping values. No listener/stats computation changes.
**Spec:** `docs/superpowers/specs/2026-06-13-per-user-preferences-design.md`
**Requirements**: PREF-01, PREF-02, PREF-03, PREF-04, PREF-05, PREF-06, PREF-07, PREF-08, PREF-09, PREF-10, PREF-11
**Depends on:** Phase 20 (auth/sessions/users table)
**Plans:** 3/6 plans executed

Plans:
- [x] 24-01-PLAN.md — Wave 0: migration 0007 (BIGINT FK) + me-router skeleton + RED test stubs (listener + web)
- [x] 24-02-PLAN.md — me-router GET/PUT /preferences implementation + /api/me mount + integration tests
- [x] 24-03-PLAN.md — frontend preference layer (usePreference + useUserPreferences) + merging debounce + once-only seeding
- [ ] 24-04-PLAN.md — consumers: useDashboardLayout (layout/hidden) + DashboardPage global range/sync
- [ ] 24-05-PLAN.md — consumers: four per-panel *_days ranges + useMutedDevices
- [ ] 24-06-PLAN.md — consumers: theme/accent/sidebar + toast/grouping (blob-when-authed, App.jsx owner) + seed shared values

### Phase 25: Per-User Quiet Hours (Phase 2)

**Goal:** Quiet hours become per-user. The listener's `GET /stats/quiet-hours` endpoint applies the requesting session user's quiet-hours config (enabled/start/end/excluded), with the shared household value as fallback; move the quiet-hours controls in `SettingsTab` into the per-user preferences blob from Phase 24.
**Spec:** `docs/superpowers/specs/2026-06-13-per-user-preferences-design.md` (Phase 2 section)
**Requirements**: TBD (derive during plan-phase from spec)
**Depends on:** Phase 24
**Plans:** 0 plans

Plans:
- [ ] TBD (run /gsd-plan-phase 25 to break down)
