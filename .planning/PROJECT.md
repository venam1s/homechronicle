# HomeChronicle

## What This Is

HomeChronicle is a self-hosted event log for Apple HomeKit and Matter smart home devices. It runs as three Docker services (PostgreSQL, Node.js listener, React/Vite web UI) and provides real-time event capture, timeline visualization, device management, alerts, and analytics dashboards. The web UI features a modern sidebar-driven layout with semantic design tokens, responsive navigation, KPI health cards, and themed charts. Access is gated by invite-only multi-user authentication (session cookies) with email-driven invites and password reset; alerts deliver by webhook or email and are per-user owned; personal UI preferences follow each account across devices.

## Core Value

A reliable, maintainable codebase that self-hosted users can trust to run unattended for months without performance degradation or silent failures.

## Current State

**Shipped:** v1.4 Multi-User Auth & Email (2026-06-15) — invite-only multi-user authentication (argon2id + custom DB-backed sessions + CSRF) replacing the single shared-token model; nodemailer email infrastructure for invites and password reset; email as an alert delivery channel; security hardening with active-session revoke + the nginx X-API-Token cutover (session cookie is the sole browser auth path under `AUTH_ENABLED=true`); per-user server-backed UI preferences + quiet hours; member self-serve per-user-owned alert rules. `API_TOKEN` retained as a service token for non-browser callers; `AUTH_ENABLED=false` fully reverts to the legacy path.
**Active milestone:** v0.4 UI Overhaul — see below.

**Release note:** Milestone numbering was **realigned to the product release line at v0.4** (2026-08-30). Earlier milestones used an internal `v1.x` counter (v1.0–v1.4) that never corresponded to a git tag; the shipped product line is `v0.x` cut via GitLab CI tag-push (latest `v0.3.4`). From v0.4 on there is one number: the milestone label matches the release it ships as. Historical `v1.x` labels remain in `MILESTONES.md` and `.planning/milestones/` unchanged.

## Current Milestone: v0.4 UI Overhaul

**Goal:** Replace the generic dashboard aesthetic with a distinctive editorial interface ("Almanac"), give users twelve palettes across the spectrum with light/dark/system control, and keep every existing dashboard widget and its customization intact.

**Target features:**
- Palette + theme system — `data-palette` (12 worlds, designed light *and* dark token sets) replaces `data-accent` (8 tints); Light/Dark/**System** theme control; per-user and synced; migration from existing accent values
- Room color ramps — `--hc-room-1…6` categorical tokens (Vivid / Field / Mono ramps), stable assignment order, colour-blind validated, never colour-alone
- Almanac shell — masthead top navigation replacing the sidebar (FloatingNav retained on mobile), ruled sections instead of cards
- Dashboard restyle with the editable grid preserved — all 24 registered panels keep their ids and behaviour; 3 new panels (House Summary lede, room map, rhythm arc); new default arrangement
- Timeline / Devices / Settings restyle — headline-style episode entries, ruled device tables, new Appearance settings screen
- Chart restyle — Recharts driven by per-palette `--hc-chart-*` tokens, thin marks, direct peak labels

**Design inputs (authoritative):**
- Spec: `.planning/notes/ui-overhaul-design-spec.md`
- Mockups: `.planning/notes/ui-overhaul-mockups/` (38 artboards + screenshots)
- Canvas: https://claude.ai/code/artifact/475d3630-23bc-43d5-9181-15a789b76e47

## Requirements

### Validated

- ✓ HAP device discovery, pairing, and event subscription — existing
- ✓ Matter device commissioning and polling — existing
- ✓ Append-only event logging to PostgreSQL with retention sweep — existing
- ✓ REST API for events, stats, accessories, rooms, pairings — existing
- ✓ React SPA with sidebar navigation (Dashboard, Devices, Timeline, Alerts, Settings) — v1.2
- ✓ Webhook alert rules with quiet-period suppression — existing
- ✓ Auto re-pair for HAP auth failures with circuit breaker — existing
- ✓ Docker deployment with Nginx reverse proxy — existing
- ✓ API token authentication for write endpoints — existing
- ✓ Global error handlers (unhandledRejection, uncaughtException, Express error middleware) — v1.0
- ✓ Silent catch blocks converted to log.debug() — v1.0
- ✓ Formal database migration system (node-pg-migrate) — v1.0
- ✓ alert_deliveries retention sweep — v1.0
- ✓ Optimized COUNT(*) with reltuples for unfiltered pagination — v1.0
- ✓ Shared utilities and extracted routers (archive, stats, health, accessories, setup) — v1.0
- ✓ Integration tests for all extracted routers — v1.0
- ✓ Slim index.js orchestration entry point (~477 lines) — v1.0
- ✓ Scheduled repair for HAP devices (daily cycle, enable/disable from Settings) — v1.1
- ✓ Semantic design token system (zero hardcoded dark: classes) — v1.2
- ✓ Collapsible vertical sidebar with reorganized navigation — v1.2
- ✓ Modern card-based layout with Card compound component — v1.2
- ✓ Responsive sidebar (icon-only on tablet, sheet drawer on mobile) — v1.2
- ✓ KPI health cards with trend deltas and sparklines — v1.2
- ✓ Live activity feed with scroll-lock — v1.2
- ✓ Room-by-room breakdown with health badges — v1.2
- ✓ Recharts v3 with gradient fills, smooth curves, theme-aware colors — v1.2
- ✓ Scheduled repair restarts HAP subscriber after needsRepair success (REPAIR-01..03) — v1.3
- ✓ Scheduled repair performs full pairSetup() with stored PIN, warn-skips no-PIN devices (REPAIR-04..06) — v1.3
- ✓ Device-health heartbeat: lastHealthyAt refresh + subscriberConnected short-circuit ensure quiet-but-connected devices stay online (quick tasks 260427-ttq + 260427-vch) — v1.3 follow-up
- ✓ Invite-only multi-user auth: argon2id (scrypt fallback) + custom DB-backed sessions + CSRF, first-admin bootstrap, remember-me, React auth shell (AUTH-01..08, SEC-01..04) — v1.4
- ✓ Email infrastructure: nodemailer SMTP, invite lifecycle, password reset (no enumeration), admin user CRUD, secret-isolated SMTP config, graceful unconfigured degradation (USER-01..07, PWD-01..04, EMAIL-01..04) — v1.4
- ✓ Email alert delivery channel through the shared quiet-period suppression path (ALERT-01..04) — v1.4
- ✓ Security hardening: active-session list + revoke, periodic token sweep, nginx X-API-Token cutover (session-cookie sole browser path) (SEC-05..07) — v1.4
- ✓ Per-user server-backed UI preferences (JSONB blob + me-router + usePreference layer; localStorage fallback when unauthenticated) (PREF-01..11) — v1.4
- ✓ Per-user quiet hours via the preferences blob with shared-config fallback (QH-01..11) — v1.4
- ✓ Member self-serve alerts: per-user owned rules (IDOR-safe), member email-recipient lock, SMTP-off rejection, household enable-gate removed (MALERT-01..07) — v1.4

### Active

<!-- v0.4 UI Overhaul — see .planning/REQUIREMENTS.md for REQ-IDs -->

- [ ] Twelve user-selectable palettes, each with designed light and dark token sets
- [ ] Light / Dark / System theme control, per-user and synced
- [ ] Categorical room-colour token ramps, colour-blind validated, never colour-alone
- [ ] Masthead navigation shell replacing the desktop sidebar
- [ ] Almanac restyle of Dashboard, Timeline, Devices and Settings
- [ ] Editable dashboard grid and all 24 panels preserved through the restyle
- [ ] Appearance settings screen for theme + palette selection

### Out of Scope

- Centralized config.js for env vars — LOW priority, defer to future milestone
- HTTPS termination / TLS setup — documentation concern, not a code change
- Prometheus metrics endpoint — nice-to-have, not urgent
- Database backup scripts — operational docs, not code health
- Table partitioning for event_logs — premature for current scale
- Frontend test coverage expansion — separate concern
- E2E test coverage — separate concern
- Configurable repair interval — daily is sufficient; revisit if users request it
- Repair for Matter devices — Matter uses polling, not persistent connections
- Mobile-native app — web-first, responsive sidebar covers mobile use case
- ~~Draggable/rearrangeable dashboard widgets~~ — **superseded**: shipped in v0.2.0 (react-grid-layout, 24 registered panels, per-user layouts). Explicitly preserved by v0.4.
- WebSocket real-time push — polling via TanStack Query is sufficient
- Full hue slider for accent color — twelve curated palettes cover the use case; a free hue picker cannot guarantee colour-blind separation or contrast (reaffirmed v0.4)
- Per-room custom colour pickers beyond the palette ramp — undermines the validated categorical ramps; deferred pending the v0.4 precedence decision
- Backend/API changes — v0.4 is a `web/` presentation-layer milestone; no listener, schema, or endpoint changes expected
- Per-user event isolation — all users share the device event stream by design; isolation would require rearchitecting the listener (v1.4)
- Self-service public signup — invite-only is correct for a single household; open signup is an attack surface (v1.4)
- OAuth / SSO providers, mandatory MFA/TOTP, SMTP OAuth2 (XOAUTH2) — overkill for a self-hosted household app; basic SMTP + password suffices (v1.4)
- Granular RBAC beyond admin/member — two roles cover all household actions (v1.4)
- Separate email-verification step — invite acceptance and password reset already prove email ownership (v1.4)

## Context

- Listener: Node.js 22, Express 5; routers now include auth/users/smtp/me alongside events/alerts/matter/retention/archive/stats/health/accessories/setup; argon2id + custom DB-backed sessions + csrf-sync; nodemailer SMTP; 714 tests
- Web: React 19, Vite 8, Tailwind v4, Recharts v3, TanStack Query, Lucide icons, react-router-dom v7 (auth shell); AuthGate + usePreference layer + UserPreferencesProvider; 366 tests
- Auth: invite-only; `AUTH_ENABLED` flag (default on; false → legacy token path); `API_TOKEN` retained as service token; `SESSION_COOKIE_SECURE` opt-out for plain-HTTP self-host; `TRUST_PROXY` for rate-limit keying behind nginx
- Database: PostgreSQL 16, migrations 0001→0008 (0003 users+sessions, 0004 invites+reset, 0005 email alert channel, 0006 session metadata, 0007 user_preferences, 0008 alert_rules.user_id)
- Layout: Collapsible vertical sidebar with 5 sections, Card-based content areas, semantic CSS tokens; Settings restructured into tabbed Configuration with admin-only Danger Zone
- Dashboard: customizable react-grid-layout grid (v0.2.0) with 24 registered panels (12 core + 12 optional) in `web/src/lib/dashboardPanels.js`; per-user layouts and hidden-set persisted via `usePreference`
- AccessoryDetail: Per-device charts (state duration, event history, characteristic trends, firmware tracking)
- Theming: Light/dark mode toggle + 8 `data-accent` presets via CSS custom properties (v0.4 replaces this with 12 `data-palette` worlds + Light/Dark/System)
- Database: PostgreSQL 16 with versioned migrations (node-pg-migrate), append-only event_logs + archive
- Deployment: Docker Compose (3-service) or standalone single-container with supervisord

## Constraints

- **Self-hosted**: Changes must work for single-instance Docker deployments on home servers (RPi, NAS, etc.)
- **Zero downtime**: Migration system handles upgrades without data loss
- **Backward compatible**: Existing pairings.json, Docker volumes, and .env configs must continue to work
- **ES modules**: All new code uses `import`/`export` (no CommonJS)

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Extract routes following existing pattern | events-router.js, alerts-router.js already prove the pattern works | ✓ Good |
| Adopt formal migration tool | IF NOT EXISTS can't handle renames, type changes, or rollbacks | ✓ Good |
| Use estimated counts for unfiltered pagination | Avoids full table scan; exact count only when filters are applied | ✓ Good |
| Add integration tests alongside extraction | Prevents regressions during the refactor; follows existing test patterns | ✓ Good |
| Design tokens before new components | 339 hardcoded dark: classes must be replaced before any new component is written | ✓ Good |
| CSS transform for sidebar collapse | Prevents chart ResizeObserver re-renders on RPi vs transition: width | ✓ Good |
| Preserve --hc-accent-rgb as alias | 5 chart components using useAccentRgb() depend on it | ✓ Good |
| Stay on Recharts (v2→v3 upgrade) | Familiar API, gradient fills achievable, avoids full charting library migration | ✓ Good |
| Mirror manual repair order in scheduler success path | reset → stop → start; matches setup-router.js so behavior is consistent across both repair entry points | ✓ Good |
| Inject performPairSetupAndPersist as pre-wired closure | Keeps scheduler dep surface minimal vs threading HttpClient/savePairings; matches existing discoverDevice injection pattern | ✓ Good |
| Heartbeat via lastHealthyAt + subscriberConnected boolean (post-v1.3 quick fixes) | Refreshing on each event narrows but doesn't close the gap for quiet devices; live HAP client reference IS itself the heartbeat — short-circuit the rescue clause when the subscription is alive | ✓ Good |
| Read connected state lazily from subscriberSessions in getSubscriberStats | Single source of truth; avoids tracking a separate connected flag across many connect/disconnect sites | ✓ Good |
| Custom DB-backed sessions (not express-session) | Atomic validate-and-touch UPDATE…FROM users join; full control over revoke/remember-me; no extra session store | ✓ Good (v1.4) |
| argon2id with crypto.scrypt fallback | Native argon2 may not build on every target image; scrypt keeps auth working everywhere | ✓ Good (v1.4) |
| Keep API_TOKEN in parallel until a dedicated cutover phase | Additive rollout — sessions land without breaking scripts/HA; SEC-07 flips browsers to session-only last | ✓ Good (v1.4) |
| nginx token suppression via AUTH_ENABLED-gated NGINX_API_TOKEN (sourced .envsh) | Empty token when auth on = session-only browser path; .envsh sourcing (not .sh child-exec) is required for the var to reach envsubst (CR-01) | ✓ Good (v1.4) |
| Per-user prefs as a single whole-blob JSONB upsert behind one shared provider | Whole-blob replace is simple server-side; one provider + serialized flushes avoids racing last-writer-wins data loss across ~25 hook instances | ✓ Good (v1.4) |
| Quiet-hours endpoint reads per-user blob but stays uncached | cached() without a user-keyed key would leak one user's quiet-hours to others (QH-09) | ✓ Good (v1.4) |
| alert_rules owner-scoped in SQL (id AND user_id) | IDOR-safe member self-serve; another user's rule returns 404, not 403 | ✓ Good (v1.4) |
| Keep GSD milestone version (v1.x) separate from release tags (v0.x via GitLab CI) | Milestone archival is planning bookkeeping; releases are cut deliberately with changelog — no v1.4 git tag at close | ⚠️ Revisit → superseded at v0.4 |
| Realign milestone numbering to the product release line at v0.4 | Two parallel counters (internal v1.x, released v0.x) were a standing source of confusion with no upside; the milestone now names the release it ships as | — Pending (v0.4) |
| Twelve curated palettes rather than a free colour picker | Each palette needs a validated categorical room ramp in both light and dark; arbitrary hues cannot guarantee CVD separation or contrast | — Pending (v0.4) |
| Dark mode is a designed palette per world, not a filter over light | Inverting or dimming light tokens produces muddy surfaces and glowing room colours; each world re-derives surfaces, ink and a re-stepped room ramp | — Pending (v0.4) |
| Almanac layout ships as the dashboard's default arrangement, not a replacement for the grid | The customizable grid is shipped, used, and per-user persisted; the overhaul is a skin plus a new default layout, so all 24 panel ids survive | — Pending (v0.4) |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd:transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd:complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-08-30 — v0.4 UI Overhaul milestone started (numbering realigned to the product release line)*
