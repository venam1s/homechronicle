# Milestones

## v1.4 Multi-User Auth & Email (Shipped: 2026-06-15)

**Phases completed:** 7 phases (20-26), 45 plans, 35 tasks
**Git range:** `86a5b24` (20-01 install) → `dd81f86` (26 fix) on `main`
**Requirements:** 63/63 satisfied (AUTH/USER/PWD/EMAIL/ALERT/SEC + PREF + QH + MALERT)
**Tests at close:** listener 714/714, web 366/366

**Key accomplishments:**

- **Invite-only multi-user auth (Phase 20):** argon2id passwords (scrypt fallback) + custom DB-backed sessions + CSRF (synchronizer token), replacing the single shared-token model; React auth shell (AuthGate/LoginPage); `API_TOKEN` retained in parallel as a service token. `AUTH_ENABLED` flag fully reverts to the legacy path.
- **Email infrastructure + user management (Phase 21):** nodemailer SMTP with invite lifecycle (pending/accepted/expired/revoked), password reset, admin user CRUD, and graceful degradation (copyable-link fallback) when SMTP is unconfigured; SMTP secret isolated from the config API.
- **Email alert channel (Phase 22):** alert rules deliver by email through the same quiet-period suppression + `alert_deliveries` logging path as webhooks (additive migration 0005); channel picker UI. Live inbox delivery confirmed.
- **Security hardening + nginx cutover (Phase 23):** active-session list + per-row/bulk revoke ("log out other devices"), periodic invite/reset-token sweep (no new timer), and the SEC-07 nginx `X-API-Token` cutover making the session cookie the sole browser auth path under `AUTH_ENABLED=true`. Live no-login→401 keystone confirmed.
- **Per-user preferences + quiet hours (Phases 24-25):** a per-user JSONB preferences blob (migration 0007) behind a session-scoped `me-router` + `usePreference` layer (server-when-authenticated, localStorage-when-not); dashboard layout/ranges, appearance, muted devices, toast/grouping, and quiet hours all follow the account across devices.
- **Member self-serve alerts (Phase 26):** per-user owned alert rules (migration 0008 `alert_rules.user_id`, IDOR-safe owner-scoped CRUD), member email-recipient locked to the account email, SMTP-off rejection, and removal of the household admin-only enable gate so Alerts is always available to authenticated users.

**Known deferred items at close:** 3 (Phase 23 + Phase 26 live HUMAN-UAT skips — see STATE.md Deferred Items). Two headline live checks (SEC-07 no-login→401, real email delivery) passed live; remaining Phase 26 live checks (member browser flow, SMTP-off UI, live migration 0008 DDL) deferred — code-covered by automated suite + grep evidence. No git release tag created at close (releases cut separately via the v0.x GitLab CI flow).

---

## v1.3 Repair Reliability Fixes (Shipped: 2026-04-21)

**Phases completed:** 2 phases, 2 plans, 4 tasks
**Requirements:** 6/6 satisfied (REPAIR-01..06)
**Trigger:** 4-day event flatline (2026-04-17 → 2026-04-20) despite scheduler running. Diagnosed in `.planning/debug/scheduled-repair-no-logging.md`.

**Key accomplishments:**

1. Phase 18 — Scheduled repair now restarts the HAP subscriber after `savePairing` success in the `needsRepair` branch (mirrors manual `POST /api/setup/repair/:deviceId`). `resetSubscriberStats` moved to success-only paths so failed repairs no longer mask as healthy in the dashboard.
2. Phase 19 — Scheduler performs full `pairSetup()` via `hap-controller` for `needsRepair` devices with a stored PIN, producing new `longTermData`. Devices without a stored PIN are warn-skipped (not counted as failed). Manual repair endpoint preserved byte-identical.

**Post-shipping fixes (quick tasks):**

- `260427-ttq` (2026-04-28) — Added `lastHealthyAt` heartbeat refreshed on each HAP event + on subscribe success; threaded into `deriveDeviceHealth` rescue clause and `getRepairTargets` staleness check. Stops the daily repair scheduler from needlessly tearing down healthy long-lived connections.
- `260427-vch` (2026-04-28) — Added `subscriberConnected` short-circuit: `getSubscriberStats` exposes `Boolean(session?.client)`; `deriveDeviceHealth` rescue treats a live HAP subscription as itself the heartbeat, so quiet-but-connected devices stay `online` indefinitely.
- Combined: closes the user-reported "everything stale after a few days" symptom. Listener test count: 320 → 337.

**Archive:** See `milestones/v1.3-ROADMAP.md`, `milestones/v1.3-REQUIREMENTS.md`, and `milestones/v1.3-MILESTONE-AUDIT.md`.

---

## v1.2 UI Redesign (Shipped: 2026-04-16)

**Phases completed:** 8 phases, 25 plans
**Commits:** 81 | **Files changed:** 81 | **Lines:** +13,072 / -486
**Timeline:** 2 days (2026-04-14 → 2026-04-16)
**Requirements:** 23/23 satisfied

**Key accomplishments:**

1. Semantic design token system replacing all hardcoded Tailwind dark: classes — zero dark: utilities remain in web/src/
2. Collapsible vertical sidebar replacing top tab bar with 5 reorganized navigation sections
3. Modern card-based layout with Card compound component (Header/Body) and typography scale tokens
4. Responsive sidebar — auto-collapse on tablet, sheet drawer on mobile, preserved state across sessions
5. Dashboard widgets — KPI health cards with trend deltas, live activity feed with scroll-lock, room-by-room breakdown with health badges
6. Recharts v2 → v3 upgrade with gradient fills, smooth curves, sparkline mini-charts on KPI cards

**Archive:** See `milestones/v1.2-ROADMAP.md` and `milestones/v1.2-REQUIREMENTS.md`

---
