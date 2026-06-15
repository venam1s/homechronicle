# Requirements: HomeChronicle

**Defined:** 2026-04-02
**Core Value:** A reliable, maintainable codebase that self-hosted users can trust to run unattended for months without performance degradation or silent failures.

## v1.0 Requirements (Complete)

All v1.0 requirements validated — see MILESTONES archive for details.

<details>
<summary>v1.0 Code Health (30 requirements, all complete)</summary>

### Error Handling

- [x] **ERR-01**: Listener registers `process.on('unhandledRejection')` handler that logs the error without exiting
- [x] **ERR-02**: Listener registers `process.on('uncaughtException')` handler that logs the error and calls `process.exit(1)`
- [x] **ERR-03**: Express app has a global error middleware as the last `app.use()` that logs errors and returns a structured JSON response
- [x] **ERR-04**: All silent `catch {}` blocks in discovery and Matter cleanup paths are replaced with `log.debug()` calls

### Database Migrations

- [x] **MIG-01**: `node-pg-migrate` v8 is installed and configured with a programmatic runner called at listener startup
- [x] **MIG-02**: Existing schema is captured as migration 0001 that is auto-skipped on existing installs
- [x] **MIG-03**: `listener/migrations/` directory contains versioned migration files
- [x] **MIG-04**: `db/init.sql` is retired — migrations are the sole schema source
- [x] **MIG-05**: `migrateDb()` function is removed or reduced to only call the migration runner

### Performance

- [x] **PERF-01**: Unfiltered `/api/events` pagination uses `reltuples` estimate instead of `COUNT(*)`
- [x] **PERF-02**: Filtered `/api/events` pagination continues to use exact `COUNT(*)`
- [x] **PERF-03**: API response includes an `estimated: true` flag when estimated count is used
- [x] **PERF-04**: `alert_deliveries` table has a retention sweep
- [x] **PERF-05**: `alert_deliveries` table has an index on `sent_at`

### Router Extraction

- [x] **RTR-01**: Shared utilities extracted to `listener/src/utils.js`
- [x] **RTR-02**: Archive routes extracted to `listener/src/archive-router.js`
- [x] **RTR-03**: Stats routes extracted to `listener/src/stats-router.js`
- [x] **RTR-04**: Health endpoint extracted to `listener/src/health-router.js`
- [x] **RTR-05**: Accessories routes extracted to `listener/src/accessories-router.js`
- [x] **RTR-06**: Setup routes extracted to `listener/src/setup-router.js`
- [x] **RTR-07**: Factory function pattern used consistently
- [x] **RTR-08**: `discoveryCache` passed via getter/setter callbacks
- [x] **RTR-09**: `retentionSettings` passed via callback
- [x] **RTR-10**: `index.js` reduced to ~477 lines

### Testing

- [x] **TST-01**: Integration tests for `archive-router.js`
- [x] **TST-02**: Integration tests for `stats-router.js`
- [x] **TST-03**: Integration tests for `health-router.js`
- [x] **TST-04**: Integration tests for `accessories-router.js`
- [x] **TST-05**: Integration tests for `setup-router.js`
- [x] **TST-06**: All existing tests pass after extraction

</details>

## v1.1 Requirements (Complete)

<details>
<summary>v1.1 Scheduled Repair (5 requirements, all complete)</summary>

### Scheduled Repair

- [x] **SREP-01**: User can enable/disable scheduled repair from Manage > Settings (disabled by default)
- [x] **SREP-02**: When enabled, listener runs a daily repair cycle that re-pairs only HomeKit devices flagged as `needs_repair`
- [x] **SREP-03**: Scheduled repair setting persists across container restarts via JsonObjectStore
- [x] **SREP-04**: Settings UI explains why users might want scheduled repair enabled (informational text)
- [x] **SREP-05**: Scheduled repair runs and outcomes are logged (which devices were repaired, skipped, or failed)

</details>

## v1.2 Requirements

Requirements for milestone v1.2 — UI Redesign.

### Theming

- [x] **THEME-01**: User can switch between light and dark modes with a toggle in the sidebar
- [x] **THEME-02**: All components use semantic design tokens — no hardcoded dark: classes remain
- [x] **THEME-03**: User can choose from 3-5 accent color presets (e.g., blue, purple, teal, amber, rose)
- [x] **THEME-04**: User's theme and accent preferences persist across sessions via localStorage
- [x] **THEME-05**: Existing chart components render correctly with the new token system (--hc-accent-rgb compatibility)

### Navigation

- [x] **NAV-01**: User sees a vertical sidebar with reorganized navigation sections replacing the top tab bar
- [x] **NAV-02**: User can collapse the sidebar to icon-only mode
- [x] **NAV-03**: User's sidebar collapse preference persists across sessions
- [x] **NAV-04**: On mobile, user accesses navigation via a slide-out sheet drawer
- [x] **NAV-05**: Active page is clearly indicated in the sidebar with visual highlight

### Layout

- [x] **LAYOUT-01**: User sees a modern card-based layout with clean spacing, soft shadows, and contemporary typography
- [x] **LAYOUT-02**: App.jsx is restructured into a slim shell with extracted page components
- [x] **LAYOUT-03**: All existing functionality (Dashboard, Timeline, Accessories, Manage) remains accessible

### Widgets

- [x] **WIDGET-01**: User sees KPI health summary cards on the dashboard (online/offline/stale device counts)
- [x] **WIDGET-02**: KPI cards show trend deltas compared to previous period
- [x] **WIDGET-03**: User sees a live activity feed widget with recent events
- [x] **WIDGET-04**: Activity feed pauses scrolling when user is reading (scroll-lock behavior)
- [x] **WIDGET-05**: User sees room-by-room breakdown cards with device counts and health badges

### Charts

- [x] **CHART-01**: Charts use modern styling with gradient fills, smooth curves, and theme-aware colors
- [x] **CHART-02**: KPI cards include sparkline/mini trend visualizations
- [x] **CHART-03**: Existing chart types (activity, heatmap, state duration, event history) are preserved with updated styling

### Responsive

- [x] **RESP-01**: Sidebar auto-collapses to icon-only on narrow viewports
- [x] **RESP-02**: Dashboard widgets reflow to single-column on mobile

## v1.3 Requirements (Complete)

All v1.3 requirements validated — see `milestones/v1.3-REQUIREMENTS.md` for full details.

<details>
<summary>v1.3 Repair Reliability Fixes (6 requirements, all complete)</summary>

### Scheduled Repair — Subscriber Restart (Phase 18)

- [x] **REPAIR-01**: needsRepair success branch restarts HAP subscriber (stopSubscriber + startSubscriber)
- [x] **REPAIR-02**: resetSubscriberStats called only on confirmed success, not at top of loop
- [x] **REPAIR-03**: Three unit tests in repair-scheduler.test.js (success, failure, isStale regression)

### Scheduled Repair — Full Re-Pair Capability (Phase 19)

- [x] **REPAIR-04**: Full pairSetup() via hap-controller using stored PIN; produces new longTermData
- [x] **REPAIR-05**: No-PIN devices warn-skipped, not counted as failed
- [x] **REPAIR-06**: Three tests in repair-scheduler.test.js (pairSetup success, no-PIN skip, pairSetup failure)

</details>

## v1.4 Requirements (Active) — Multi-User Auth & Email

**Defined:** 2026-06-09
Invite-only multi-user authentication replacing the single shared-token model, plus email infrastructure for invites, password reset, and alert delivery. Events stay shared across all users (no per-user isolation). Built additively — the existing `API_TOKEN` + nginx token-injection runs in parallel with sessions until the final hardening phase.

### Authentication & Sessions

- [x] **AUTH-01**: First-run bootstrap creates an admin account (first user becomes admin); the bootstrap endpoint self-disables once any user exists
- [x] **AUTH-02**: User can log in with email + password and receives a session cookie
- [x] **AUTH-03**: User can log out, destroying the server-side session
- [x] **AUTH-04**: Session persists across browser refresh and expires after a configured lifetime
- [x] **AUTH-05**: Passwords are hashed with argon2id (built-in `crypto.scrypt` fallback if the native build is unavailable on the target image)
- [x] **AUTH-06**: Login offers a "remember me" option that issues a longer-lived session
- [x] **AUTH-07**: Frontend gates all app routes behind an auth check; unauthenticated users see a login page (react-router shell, existing tab navigation preserved)
- [x] **AUTH-08**: The shared `API_TOKEN` remains valid as a service token for non-browser callers (scripts, Home Assistant, CI) alongside sessions

### User Management & Invites

- [x] **USER-01**: Admin can invite a user by email; an invite link is generated and shown as a copyable link in the admin UI
- [x] **USER-02**: Invitee accepts via the link and sets their password; acceptance doubles as email verification (no separate verify step)
- [x] **USER-03**: Invite tokens are single-use, expiring, and stored as SHA-256 hashes; lifecycle states are pending / accepted / expired / revoked
- [x] **USER-04**: Admin can revoke a pending invite
- [x] **USER-05**: Two roles exist (admin, member); admin-only actions are enforced server-side
- [x] **USER-06**: Admin can disable or remove a user, which revokes that user's active sessions
- [x] **USER-07**: Admin can view the list of users with their role and status

### Password Management

- [x] **PWD-01**: Logged-in user can change their own password
- [x] **PWD-02**: User can request a password reset by email; the reset link is single-use and expiring
- [x] **PWD-03**: Forgot-password returns an identical response for known and unknown emails (no account enumeration)
- [x] **PWD-04**: Password set/reset enforces strength rules (minimum length/complexity) with strength feedback in the UI

### Email Infrastructure

- [x] **EMAIL-01**: Listener sends email via SMTP (nodemailer) with connection and socket timeouts so a slow SMTP server never blocks request/event processing
- [x] **EMAIL-02**: Admin can configure SMTP (host/port/user/pass/from) from the Settings UI, with env-var fallback
- [x] **EMAIL-03**: Email flows degrade gracefully when SMTP is unconfigured — invites fall back to a copyable link; password reset surfaces a clear error
- [x] **EMAIL-04**: SMTP credentials are stored securely (never in plaintext JSON config exposed to the API)

### Email Alert Channel

- [x] **ALERT-01**: Alert rules support a delivery channel (webhook or email) via additive schema (`channel` + `target_email` columns, `target_url` nullable for email rules)
- [x] **ALERT-02**: An email-channel rule has a recipient address validated at rule-creation time
- [x] **ALERT-03**: Email alert delivery routes through the existing quiet-period suppression and is logged in `alert_deliveries` with its channel
- [x] **ALERT-04**: The Alerts UI lets the user pick a delivery channel and configure the email recipient

### Security Hardening

- [x] **SEC-01**: `SESSION_COOKIE_SECURE` env var (default-safe) lets HTTP-only self-hosted deployments work without lockout; session cookies are httpOnly + SameSite=Lax
- [x] **SEC-02**: CSRF protection (synchronizer token) is enforced on all mutating endpoints; pre-auth routes (login, claim-admin, accept-invite, reset) are exempt
- [x] **SEC-03**: A dedicated rate limiter protects auth routes (login, reset-request, accept-invite) separately from the write limiter
- [x] **SEC-04**: Login regenerates the session id (anti-fixation); logout destroys the session
- [x] **SEC-05**: A user can view active sessions in Settings and revoke them ("log out other devices")
- [x] **SEC-06**: Expired sessions and used/expired tokens are swept periodically
- [x] **SEC-07**: At cutover, nginx `X-API-Token` injection is removed; the session-or-service-token gate becomes the sole browser auth path

### Member Self-Serve Alerts (Phase 26)

- [ ] **MALERT-01**: Alert rules are per-user owned; each user sees and manages only their own rules
- [ ] **MALERT-02**: Any authenticated user (admin or member) can create, edit, and delete their own alert rules; no admin role required
- [ ] **MALERT-03**: `alert_rules` gains a `user_id` FK → `users(id) ON DELETE CASCADE` (migration `0008`); existing rows are backfilled to the bootstrap admin; the change is additive and existing webhook rules continue to work
- [ ] **MALERT-04**: Rule edit/delete is owner-scoped in SQL (IDOR-safe); accessing another user's rule returns 404
- [ ] **MALERT-05**: A member's email-channel rule recipient is forced server-side to the member's own account email; admins may use arbitrary recipients
- [ ] **MALERT-06**: The email channel is disabled in the UI (with an explanatory message) and rejected server-side when SMTP is unconfigured
- [ ] **MALERT-07**: The household-wide alerts enable gate is removed; the Alerts section is always available to authenticated users; the admin-only enable toggle is removed from Settings

## v1.5 Requirements (Active) — Per-User UI Preferences

**Defined:** 2026-06-13
Personal UI preferences follow the logged-in account across devices (server-backed), while genuine infrastructure settings stay household-shared. A single per-user JSONB preferences blob in Postgres, read/written as a whole; a session-scoped `me-router`; and a frontend `usePreference` layer (server-when-authenticated, localStorage-when-not). `AUTH_ENABLED=false` stays pure localStorage. Source spec: `docs/superpowers/specs/2026-06-13-per-user-preferences-design.md`. No listener/stats computation changes (per-user quiet hours deferred to Phase 2).

### Data Model & API

- [x] **PREF-01**: Migration `0007_user_preferences` adds a `user_preferences` table (`user_id` BIGINT PRIMARY KEY FK → `users(id)` ON DELETE CASCADE, `prefs` JSONB NOT NULL DEFAULT `'{}'`, `updated_at` TIMESTAMPTZ); purely additive, with a clean up/down following the existing migration format
- [x] **PREF-02**: A new session-required `me-router` mounted at `/api/me` exposes `GET /preferences` (returns `{ prefs: {} }` when no row) and `PUT /preferences` (upsert that **replaces** the blob and returns the stored blob)
- [x] **PREF-03**: `me-router` guards reject a non-object `prefs` and serialized payloads over ~256 KB with 400; unauthenticated requests get 401, matching existing router conventions

### Preference Layer

- [x] **PREF-04**: A frontend `usePreference` layer resolves values from the server blob when authenticated (localStorage as the synchronous first-paint cache and a write-through mirror), and from localStorage only when not authenticated
- [x] **PREF-05**: When `AUTH_ENABLED=false` or the user is logged out, the preference path is pure localStorage and behaviorally identical to today (no server calls)
- [x] **PREF-11**: On the first authenticated load where the server blob is empty, the blob is seeded exactly once from the existing localStorage snapshot plus the user's current shared toast/grouping values, then becomes authoritative

### Consumer Refactor

- [x] **PREF-06**: Dashboard grid layout and hidden panels (`useDashboardLayout`) become per-user via the preference layer
- [x] **PREF-07**: Dashboard time ranges — global, per-panel (`RoomChart`/`TopDevices`/`TrendChart`/`WeekdayHeatmap` `*_days`), and the sync toggle — become per-user
- [x] **PREF-08**: Appearance preferences (`useTheme`, `useSkin`, `useAccent`, sidebar-collapsed) become per-user
- [x] **PREF-09**: Muted devices (`useMutedDevices`) become per-user
- [x] **PREF-10**: Toast preferences and episode/scene grouping params (`episodeWindowMinutes`, `sceneWindowSeconds`, `episodeMinEventCount`) move off shared `retention.json` reads to the per-user blob when authenticated

## v1.6 Requirements (Active) — Per-User Quiet Hours (Phase 2)

**Defined:** 2026-06-13
Quiet hours become per-user by building on the Phase-24 preferences blob. The listener's `GET /api/stats/quiet-hours` endpoint applies the requesting session user's quiet-hours config (enabled/start/end/excluded accessories) read from their `user_preferences` JSONB blob, with the shared `retention.json` household config as whole-config fallback; the SettingsTab quiet-hours controls route through the `usePreference` layer when authenticated. No-session / `AUTH_ENABLED=false` paths keep today's shared behavior unchanged. Source spec: `docs/superpowers/specs/2026-06-13-per-user-preferences-design.md` (Phase 2). Decisions: D-25-01..04 (`25-CONTEXT.md`).

### Listener — Session-Aware Endpoint

- [x] **QH-01**: `GET /api/stats/quiet-hours` reads `req.hcSession?.user_id`; when present, reads the four quiet-hours keys from the user's `user_preferences` blob (one parameterized round-trip), falling back to shared `retention.json` when the blob has no quiet-hours keys or there is no session (D-25-01)
- [x] **QH-02**: Whole-config fallback — if the user's blob contains none of the quiet-hours keys (presence predicate: `quietHoursEnabled` present), the endpoint uses the shared `retention.json` config exclusively, with no partial merge (D-25-02)
- [x] **QH-03**: Blob quiet-hours values are normalized (type-coerced + range-checked) via `normalizeRetentionSettings` before use, so malformed blob inputs cannot cause 500s or malformed SQL
- [x] **QH-04**: Requests with no `req.hcSession` (service `API_TOKEN` path, `AUTH_ENABLED=false`) fall back to shared config only — byte-for-byte identical to pre-Phase-25 behavior
- [x] **QH-05**: `quietHoursExcludedAccessories` (quiet-hours stat flagging) and `mutedDevices` (toast suppression) remain separate per-user blob keys with distinct semantics — do not unify them (D-25-04)
- [x] **QH-09**: The endpoint must NOT wrap the per-user quiet-hours query in `cached()` unless the cache key includes `user_id` (it is uncached today; keep it uncached or user-key it) — prevents cross-user data leak

### Frontend — SettingsTab Wiring

- [x] **QH-06**: SettingsTab quiet-hours controls (enabled/start/end/excluded accessories) route through `usePreference` when authenticated; the shared-config path is unchanged when anonymous (D-25-01)
- [x] **QH-07**: Quiet-hours controls prefill from effective values (per-user blob if the keys are present, else shared config) via a presence check — not `usePreference`'s default — and do not write to the blob on mount (D-25-03)
- [x] **QH-08**: Any authed quiet-hours change in SettingsTab writes all four keys to the blob together, so the presence predicate stays consistent (no partial-key writes)

### Validation

- [x] **QH-10**: Listener integration tests for `GET /stats/quiet-hours` cover three paths: (a) no session → shared fallback, (b) authed user with quiet-hours keys → per-user config, (c) authed user without quiet-hours keys → shared fallback
- [x] **QH-11**: Web component tests for the SettingsTab quiet-hours controls cover authed (writes to blob) vs anon (writes to shared retention config) paths plus effective-value prefill

## Future Requirements

Deferred to future milestones.

### Observability

- **OBS-01**: Centralized `config.js` module for all environment variable parsing
- **OBS-02**: Optional JSON structured logging format for production
- **OBS-03**: Request ID propagation through log entries
- **OBS-04**: Optional Prometheus metrics endpoint

### Scalability

- **SCAL-01**: Database connection pool tuning via environment variables
- **SCAL-02**: In-memory query cache LRU eviction with max-entries limit
- **SCAL-03**: Keyset/cursor pagination for events API
- **SCAL-04**: Time-based table partitioning for event_logs

## Out of Scope

| Feature | Reason |
|---------|--------|
| HTTPS/TLS termination | Documentation concern, not code |
| Database backup scripts | Operational docs, not code health |
| Frontend test coverage | Separate concern |
| E2E test expansion | Separate concern |
| Configurable repair interval | Daily is sufficient; revisit if users request it |
| Matter device repair | Matter uses polling, not persistent connections |
| Draggable/rearrangeable widgets | High complexity, limited value for single-user app |
| WebSocket real-time push | Polling via TanStack Query is sufficient |
| Full hue slider for accent color | Preset swatches cover the use case with less complexity |
| Mobile-native app | Web-first, responsive sidebar covers mobile use case |
| Self-service public signup (v1.4) | Invite-only model is correct for a single household; open signup is an attack surface |
| OAuth / SSO providers (v1.4) | Overkill for a self-hosted household app; basic SMTP + password is sufficient |
| Mandatory MFA / TOTP (v1.4) | Not warranted for single-household scope; revisit if users request it |
| Per-user event isolation (v1.4) | All users share the same device event stream by design; isolation would require rearchitecting the listener |
| Granular RBAC beyond admin/member (v1.4) | Two roles cover all needed actions for a household |
| Separate email-verification step (v1.4) | Invite acceptance and password reset already prove email ownership |
| SMTP OAuth2 (Gmail/Outlook XOAUTH2) (v1.4) | Basic SMTP user/pass ships first; OAuth2 is a possible follow-up |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| THEME-01 | Phase 10 | Complete |
| THEME-02 | Phase 10, 17 | Complete |
| THEME-03 | Phase 10 | Complete |
| THEME-04 | Phase 10 | Complete |
| THEME-05 | Phase 10 | Complete |
| NAV-01 | Phase 11, 16 | Complete |
| NAV-02 | Phase 11, 16 | Complete |
| NAV-03 | Phase 11, 16 | Complete |
| NAV-04 | Phase 13 | Complete |
| NAV-05 | Phase 11, 16 | Complete |
| LAYOUT-01 | Phase 12, 17 | Complete |
| LAYOUT-02 | Phase 11, 16 | Complete |
| LAYOUT-03 | Phase 12, 16 | Complete |
| WIDGET-01 | Phase 14 | Complete |
| WIDGET-02 | Phase 14 | Complete |
| WIDGET-03 | Phase 14 | Complete |
| WIDGET-04 | Phase 14 | Complete |
| WIDGET-05 | Phase 14 | Complete |
| CHART-01 | Phase 15 | Complete |
| CHART-02 | Phase 15, 16 | Complete |
| CHART-03 | Phase 15, 17 | Complete |
| RESP-01 | Phase 13 | Complete |
| RESP-02 | Phase 13 | Complete |

**Coverage:**
- v1.2 requirements: 23 total
- Mapped to phases: 23 (7 also assigned to gap closure phases 16-17)
- Unmapped: 0

### v1.3 Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| REPAIR-01 | Phase 18 | Complete |
| REPAIR-02 | Phase 18 | Complete |
| REPAIR-03 | Phase 18 | Complete |
| REPAIR-04 | Phase 19 | Complete |
| REPAIR-05 | Phase 19 | Complete |
| REPAIR-06 | Phase 19 | Complete |

**Coverage:**
- v1.3 requirements: 6 total
- Mapped to phases: 6
- Unmapped: 0

### v1.4 Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| AUTH-01 | Phase 20 | Complete |
| AUTH-02 | Phase 20 | Complete |
| AUTH-03 | Phase 20 | Complete |
| AUTH-04 | Phase 20 | Complete |
| AUTH-05 | Phase 20 | Complete |
| AUTH-06 | Phase 20 | Complete |
| AUTH-07 | Phase 20 | Complete |
| AUTH-08 | Phase 20 | Complete |
| SEC-01 | Phase 20 | Complete |
| SEC-02 | Phase 20 | Complete |
| SEC-03 | Phase 20 | Complete |
| SEC-04 | Phase 20 | Complete |
| USER-01 | Phase 21 | Complete |
| USER-02 | Phase 21 | Complete |
| USER-03 | Phase 21 | Complete |
| USER-04 | Phase 21 | Complete |
| USER-05 | Phase 21 | Complete |
| USER-06 | Phase 21 | Complete |
| USER-07 | Phase 21 | Complete |
| PWD-01 | Phase 21 | Complete |
| PWD-02 | Phase 21 | Complete |
| PWD-03 | Phase 21 | Complete |
| PWD-04 | Phase 21 | Complete |
| EMAIL-01 | Phase 21 | Complete |
| EMAIL-02 | Phase 21 | Complete |
| EMAIL-03 | Phase 21 | Complete |
| EMAIL-04 | Phase 21 | Complete |
| ALERT-01 | Phase 22 | Complete |
| ALERT-02 | Phase 22 | Complete |
| ALERT-03 | Phase 22 | Complete |
| ALERT-04 | Phase 22 | Complete |
| SEC-05 | Phase 23 | Complete |
| SEC-06 | Phase 23 | Complete |
| SEC-07 | Phase 23 | Complete |
| PREF-01 | Phase 24 | Complete |
| PREF-02 | Phase 24 | Complete |
| PREF-03 | Phase 24 | Complete |
| PREF-04 | Phase 24 | Complete |
| PREF-05 | Phase 24 | Complete |
| PREF-06 | Phase 24 | Complete |
| PREF-07 | Phase 24 | Complete |
| PREF-08 | Phase 24 | Complete |
| PREF-09 | Phase 24 | Complete |
| PREF-10 | Phase 24 | Complete |
| PREF-11 | Phase 24 | Complete |
| QH-01 | Phase 25 | Active |
| QH-02 | Phase 25 | Active |
| QH-03 | Phase 25 | Active |
| QH-04 | Phase 25 | Active |
| QH-05 | Phase 25 | Active |
| QH-06 | Phase 25 | Active |
| QH-07 | Phase 25 | Active |
| QH-08 | Phase 25 | Active |
| QH-09 | Phase 25 | Active |
| QH-10 | Phase 25 | Active |
| QH-11 | Phase 25 | Active |
| MALERT-01 | Phase 26 | Active |
| MALERT-02 | Phase 26 | Active |
| MALERT-03 | Phase 26 | Active |
| MALERT-04 | Phase 26 | Active |
| MALERT-05 | Phase 26 | Active |
| MALERT-06 | Phase 26 | Active |
| MALERT-07 | Phase 26 | Active |

**Coverage:**
- v1.4 requirements: 41 total (34 auth/email/alert/sec + 7 MALERT member self-serve alerts, Phase 26)
- v1.5 requirements: 11 total (PREF-01..11)
- v1.6 requirements: 11 total (QH-01..11)
- Mapped to phases: 63
- Unmapped: 0

---
*Requirements defined: 2026-04-02*
*2026-06-15 — Member Self-Serve Alerts (MALERT-01..07 mapped to Phase 26) folded into v1.4*
*2026-06-13 — v1.6 Per-User Quiet Hours defined (QH-01..11 mapped to Phase 25)*
*Last updated: 2026-06-13 — v1.5 Per-User UI Preferences defined (PREF-01..11 mapped to Phase 24)**
*2026-06-09 — v1.4 Multi-User Auth & Email roadmap defined (AUTH-01..08, USER-01..07, PWD-01..04, EMAIL-01..04, ALERT-01..04, SEC-01..07 mapped to Phases 20-23)*
