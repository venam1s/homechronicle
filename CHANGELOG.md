# Changelog

All notable changes to homechronicle are documented in this file.

## [0.3.4] — 2026-08-30

### Fixed
- **Devices › Browse never loaded when a paired HomeKit bridge was unreachable** — `/api/accessories` waited for a live metadata fetch from every bridge with no cached children, and a bridge at a stale address (for example after a network change) held the response for the OS connect timeout (~2 minutes), well past the proxy's 30 s limit, so the page showed loading placeholders forever. The fetch now runs in the background with a timeout (`HAP_REQUEST_TIMEOUT_MS`), the response is sent immediately with what is cached, and an unreachable bridge is not re-dialled on every poll. The per-accessory capabilities lookup is bounded the same way.

## [0.3.3] — 2026-08-30

### Fixed
- **502 errors on every API request with the default Docker Compose setup** — since 0.3.2, the web container could no longer reach the listener at `host.docker.internal`, so every `/api/*` request returned a 502. The address is now resolved once when the container starts, so the proxy works again. Setups that use a Compose service name for the listener were unaffected and continue to recover automatically after a listener restart.
- **All-in-one standalone image failing to start** — the container restarted in a loop because required database migration files were missing from the image. They are now included, along with a dependency patch that was also missing.
- **Listener could freeze at 100% CPU on a corrupted HomeKit frame** — a single undecryptable encrypted frame from an accessory made the HomeKit client loop forever on the main thread, stalling the whole listener. The connection is now dropped and re-established instead (same class of bug as the mDNS fix in 0.1.11).
- **A HomeKit device that stopped answering could stay dead until restart** — HomeKit requests had no timeout, so an accessory that accepted the connection but never replied left its subscription (or the nightly repair job) stuck forever. All HomeKit round-trips are now bounded (`HAP_REQUEST_TIMEOUT_MS`, default 30 s; `HAP_PAIR_TIMEOUT_MS`, default 60 s) and recover through the normal reconnect path.
- **Matter devices were silently dropped after ~50 s of unreachability** — polling stopped permanently after 10 consecutive errors. Polling now backs off (up to 10 min) and keeps retrying.
- **Scheduled repair stopped running after a single failed cycle** — one error (for example a failed settings write) ended all future scheduled repairs until restart. The scheduler now always re-arms.
- **Clean shutdown on `docker stop` / redeploy** — the listener now handles SIGTERM/SIGINT: it closes HomeKit and Matter sessions, stops the scheduler, and drains the database pool instead of being killed mid-write. Leftover `*.tmp-*` files from earlier abrupt stops are swept from the data directory at startup.
- **Per-user preferences could be wiped by a race on first load** — a preference saved before the initial preferences fetch finished could overwrite the whole server-side blob. Saves now wait for the fetch, and the server merges keys instead of replacing the blob.
- **Timeline grouping and Quiet Hours "Exclude" did nothing for signed-in users** — both wrote to a different store than the one being read. Per-user grouping preferences are now honoured on the Timeline, and the dashboard's Quiet Hours exclude button writes the per-user setting (with an error toast if it fails).
- **Sidebar collapse state now persists**, logout now clears every per-user preference key, and the app no longer polls `/api/auth/me` when login is disabled.
- **Alert rules of a disabled user kept firing** — rules whose owner has been disabled are now skipped, and admins can list (`?scope=all`) and delete any user's rules.
- **Alert rules were unmanageable when login is disabled** (service-token mode); rule create/edit/delete works again there, and editing a webhook rule that still carried a stale email field no longer fails.
- **SMTP settings reported success even when the connection test failed**; the response now says whether email is actually enabled, and port/host are validated.
- **Password reset** now invalidates any other outstanding reset links for the account once one is used.

### Security
- **Rate limiting could be bypassed with a forged `X-Forwarded-For` header** when running behind the bundled nginx (the default). Limits are now keyed on the proxy-derived client address. `TRUST_PROXY` docs now explain it is the number of proxies in front of the listener (`1` for nginx alone, `2` behind Traefik/Caddy/NPM).
- **Password changes are now rate-limited**, and the admin self-disable/self-remove guards work again (they compared IDs of different types).
- **Alert webhook fan-out is now bounded** — per-user (`ALERTS_MAX_RULES_PER_USER`, default 25) and total (`ALERTS_MAX_RULES_TOTAL`, default 100) rule caps, a concurrency pool and in-flight ceiling for deliveries, back-off for targets that keep failing, and 200-character caps on rule text fields.
- **SMTP now requires STARTTLS** on non-TLS ports (`SMTP_REQUIRE_TLS`, default `true`) instead of silently falling back to plaintext, and nodemailer's file/URL access is disabled. Invitation and admin-claim emails are validated; email links are attribute-escaped and `APP_BASE_URL` is validated at startup.
- **Dependencies:** `npm audit` is clean in both packages (nodemailer 9, react-router-dom 7.18, and transitive fixes). A dead `fast-xml-parser` override was removed.

### Internal
- CI now runs the test suite on release tags and blocks image builds and the release on it.
- Beta sync scripts share one exclusion list for account-related tables (now including preferences and alert rules), restore in a single transaction, and the beta listener no longer mounts production's data directory.

## [0.3.2] — 2026-08-30

### Fixed
- **502 errors after a listener restart** — the web container's nginx cached the listener's IP address once at startup, so when the listener container was recreated (a redeploy or restart) every `/api/*` request failed with 502 until the web container was restarted too. Nginx now re-resolves the listener on each request and recovers on its own within seconds.
- **Login page error copy** — a backend outage was reported as "Incorrect email or password". The login page now distinguishes a genuine wrong-credentials response from a backend that is unreachable and says so.

### Changed
- **Branded HTML emails** — invitation, password-reset, and alert emails now use a shared HomeChronicle HTML layout instead of plain text.

### Security
- Alert email subjects/headings are HTML-escaped to prevent markup injection from device or rule names.

### Internal
- `NGINX_RESOLVER` (default `127.0.0.11`, Docker's embedded DNS) is now rendered into the nginx config in all deployment modes (compose, standalone).

## [0.3.1] — 2026-06-15

### Fixed
- **Settings:** the **Advanced** controls (log level and the Danger Zone) now live on their own *Advanced* tab under Configuration, instead of appearing beneath every Settings category. (Admin-only visibility is unchanged.)

## [0.3.0] — 2026-06-15

### Added
- **Optional multi-user accounts with login** — HomeChronicle can now require sign-in (`AUTH_ENABLED`); when off, the app behaves exactly as before with no login. Passwords are hashed with argon2id; sessions are database-backed with optional "remember me".
- **Invite-only user management** — first run claims an admin; admins invite household members by email, assign admin/member roles, and disable accounts. The invite link doubles as email verification.
- **Email support (SMTP)** — configure SMTP from Settings to send invitations and password resets; includes accept-invite and reset-password pages and a password-strength meter.
- **Email alert channel** — alert rules can deliver to an email address in addition to webhooks. Members can create and own their own rules (email-to-self or webhook), with the same quiet-period suppression and delivery history.
- **Per-user interface preferences** — theme, skin, dashboard layout and panel sizes, per-panel date ranges, toast settings, sidebar state, and muted devices are now saved per user on the server and follow you across devices and browsers.
- **Per-user quiet hours** — quiet-hours settings and the Quiet Hours score are now per signed-in user.
- **Active sessions management** — view your sessions (device/IP, last seen) and revoke your own from Settings.
- **New mobile & tablet navigation** — a floating navigation control replaces the old slide-in drawer and top bar on screens below 1024px.

### Changed
- **Settings reorganized** — a tabbed Configuration area for everyday settings, with Advanced controls and the Danger Zone (device/data deletion) restricted to admins, and consistent titled-card section headers throughout.

### Security
- HttpOnly session cookies with CSRF protection on all mutating requests; login is rejected for disabled accounts and rate-limited per client behind a trusted proxy (`TRUST_PROXY`).
- Sessions record the user agent and IP at login (capped), can only be revoked by their owner, and are swept on expiry during retention.
- When login is enabled, nginx conditionally injects the API token so the session cookie is the sole browser credential; with login disabled, the previous behavior is preserved.
- Webhook `target_url` is redacted from alert rule and delivery responses; minimum password length raised to 12; assorted hardening across the listener and Docker images.

### Internal
- New database migrations 0003–0008 (sessions, invites & password reset, email alert channel, session metadata, per-user preferences, alert-rule ownership) — run automatically at startup and backward compatible with existing volumes.
- Test coverage expanded to 714 listener tests and 373 web tests.

## [0.2.0] — 2026-06-07

### Added
- **Customizable dashboard** — the dashboard is now a drag-and-drop grid you can arrange to taste. Click **Customize** to enter edit mode, then:
  - **Drag** any panel by its header to move it anywhere on the grid.
  - **Resize** a panel from its bottom-right corner (both width and height); charts and lists reflow to fit.
  - **Remove** a panel with the ✕ button — hidden panels collect in a tray and can be added back at any time.
  - **Reset** restores the original layout and brings every panel back.
  Your layout, panel sizes, and hidden panels are saved in the browser (`localStorage`) and persist across reloads. On phones the grid collapses to a single scrollable column and resize is disabled.
- **12 optional dashboard panels**, all off by default and addable from the Hidden-panels tray:
  - *Activity & trends:* Week over Week, Day vs Night, Top Movers, Room Trends, Recent Episodes, Event Types.
  - *Health & environment:* Device Health, Alerts Summary, Quiet Hours Score, Sensor Environment (latest temperature/humidity per device), Battery Levels, Retention Health.
- The Monthly Activity heatmap is now its own independent panel (previously nested under the Weekly pattern), so it can be moved, resized, or removed on its own.
- Quiet Hours is now a customizable dashboard panel too (previously a fixed banner), so it can be repositioned, resized, or hidden like any other panel.

### Changed
- **Page width standardized** to a medium centered column across the Devices, Alerts, and Timeline pages, and the redundant white content boxes were removed — content now sits directly on the page background.
- **Timeline filters moved into the page header** — the full-width white filter strip is gone; the toggles now sit directly under the page title.
- The Daily Activity and Events-by-Hour charts, and the Live Activity feed, now scale to fill their panel — resizing a panel taller grows the content area instead of leaving empty space below it.
- Dashboard controls regrouped: the date-range window (7d/30d/90d) and the chart Sync toggle now sit together on the left, with Customize on the right (Customize is icon-only when idle).
- The Quiet Hours gauge is now driven by CSS variables, so it tracks light/dark mode and skins correctly instead of using fixed colors.
- The pairing-health banner is now dismissable.

### Fixed
- Corrected the inverted Top Movers status color (up/down trends were shown in the wrong colors).
- Saved oversize Week-over-Week layouts now clamp to a sane height on load.
- The Live Activity feed and Quiet Hours panels now fill their grid cells when resized.

### Security
- Blocked an IPv6-mapped IPv4 literal SSRF bypass in webhook URL validation.
- The webhook `target_url` is now redacted in the `GET /api/alerts/rules` listing.
- The `/matter/events` bulk insert is capped and wrapped in a transaction; the `/api/alerts/deliveries` page parameter is bounded.
- Docker hardening: lockfile-faithful `npm ci` in all build stages, nginx base image bumped (CVE-2026-42945), curl/dns tools dropped from the runtime images, and dependency overrides for the picomatch, path-to-regexp, and tmp advisories.

### Internal
- Four new read-only stats endpoints back the Tier 2 panels (`sensor-environment`, `battery-levels`, `retention-health`, `characteristic-breakdown`) — no schema changes or migrations.
- New web dependencies `react-grid-layout` + `react-resizable`, isolated into a dedicated `vendor-grid` bundle chunk (~19 kB gzipped). Verified to install and run cleanly under React 19 (react-grid-layout v2 passes `nodeRef` to react-draggable, so the React 19 `findDOMNode` removal does not break drag/resize).
- New dashboard layout model: a serializable panel registry (`web/src/lib/dashboardPanels.js`) plus a `useDashboardLayout` hook that persists layout + visibility and makes `onLayoutChange` idempotent to avoid the react-grid-layout feedback loop. Panels are wrapped in a `forwardRef` container (required by react-grid-layout on React 19).
- New `useStatusColors` hook reads theme CSS variables so Recharts SVG fills stay correct across theme toggles.
- Added an in-memory `localStorage` polyfill to the web test setup (alongside the existing `ResizeObserver`/`matchMedia` shims).
- New tests for the layout model, panel registry, and the new panels (web suite grown from 91 to 130+).

## [0.1.11] — 2026-05-28

### Fixed
- **Listener could be pegged at 100% CPU and stop responding to healthchecks if it ever received a malformed mDNS packet** — the bundled `dnssd@0.4.1` library follows DNS name-compression pointers (RFC 1035 §4.1.4) without any cycle detection or iteration budget. A single packet whose pointers form a cycle would spin the parser forever on one CPU core, silently (no log line, no exception), until the HTTP healthcheck timed out and Docker killed the container. Now patched via `patch-package` to detect pointer cycles and enforce a hard 128-iteration budget; malformed packets throw cleanly and are discarded by the existing dnssd error-handling.

### Internal
- New runtime dep `patch-package` with a `postinstall` script in `listener/package.json` — re-applies the dnssd patch automatically on every `npm install` / `npm ci` (including Docker builds, which use `npm install --omit=dev`).
- `listener/Dockerfile` build stage now copies `patches/` into the image before `npm install --omit=dev` so patch-package can find the patch file in the build context.
- New regression test `listener/test/dnssd-fqdn-cycle.test.js` covering both the cycle case (must throw within 1s, exercised inside a worker_threads Worker so the test runner can bound the pre-patch infinite loop) and the positive compression case (legitimate compressed FQDNs still parse).
- Listener test count: 343 → 345.

## [0.1.10] — 2026-05-15

### Fixed
- **Listener CPU pegged at 100% on devices with invalid stored credentials** — when a HomeKit device's stored long-term keys started failing M4 auth, the auto re-pair flow would succeed but then schedule another retry every 60 seconds forever (the success path defeated the 3-attempt circuit breaker). Each retry runs full HAP pair-setup crypto (SRP-6a + Curve25519 + ChaCha20 + Ed25519), pegging a CPU core. Fix: the 60s retry timer is now only scheduled on the failure path; the success path resumes the normal subscription cleanly.
- **Matter.js SDK no longer floods logs at DEBUG level** — the upstream Matter SDK defaulted to dumping every packet's full inspected payload (certificates, ACLs, fabric data, hex) plus ANSI escape codes that don't render in Docker logs. On listeners with a paired Matter device this was the dominant CPU consumer. Now defaults to INFO + plain format.

### Added
- **`MATTER_LOG_LEVEL`** env var (`debug | info | notice | warn | error | fatal`, default `info`) — controls matter.js SDK log verbosity independently of the listener's own `LOG_LEVEL`.
- **`MATTER_LOG_FORMAT`** env var (`plain | ansi | html`, default `plain`) — controls matter.js log output format.

### Internal
- New regression tests for subscriber auto re-pair (success path schedules no timer; failure path still retries). Listener tests: 341 → 343.
- New `scripts/sync-prod-to-beta.sh` for self-hosted operators running a beta stack alongside prod — DB-only sync that leaves pairings on prod to avoid HAP/Matter controller-identity conflict.

## [0.1.9] — 2026-04-28

### Added
- **Scheduled repair now fully recovers paired devices** — when a HomeKit device's stored credentials get rejected (the most common cause of "stale" status), the daily scheduled repair now performs a full re-pair using the stored PIN and resumes event logging without needing to click "Repair All" in the UI. Devices without a stored PIN are skipped with a warning rather than failing the cycle.
- **Original dashboard KPI cards restored** — Events Today, This Week, Top Device, and Top Room are back as the headline metrics, all describing the same window (today + weekly leaders) regardless of dashboard range toggle.
- **Clickable rows throughout** — live activity feed entries and quiet-hours rows on the dashboard navigate to filtered Timeline / Accessory Detail.
- **Devices page widened** for better readability of long device lists.

### Changed
- **Device health is now connection-aware** — the "everything stale after a few days" symptom is fixed. Health now treats a live HomeKit subscription as itself a heartbeat, so quiet-but-connected sensors (a temperature sensor not crossing a delta, an unused switch) correctly stay "online" instead of false-flagging as stale.
- **Daily repair cycle leaner** — the scheduler no longer needlessly tears down healthy long-lived connections; only acts on devices that are actually offline or broken.
- **TOP DEVICE / TOP ROOM cards labeled "(7d)"** — explicit qualifier so the window is clear next to today's KPIs.
- **Timeline visual chrome flatter**, room badge contrast fixed, system-theme icon corrected, dashboard section ordering refined.

### Fixed
- **THIS WEEK KPI was wrong on 30d/90d windows** — was summing the dashboard range total under a "last 7 days" label. Now uses 7 days exactly.
- **Timeline row keyboard navigation broken** — nested clickable elements produced 3 tab-stops per row and confused screen readers. Cleaned up.
- **Subscriber liveness gate too loose** — a hung HAP socket could mask as online indefinitely. Now requires recent activity (≤30 min) plus an explicit subscribed flag.
- Scheduled repair would update a device's IP address but fail to restart the underlying HAP subscriber, leaving event logging silently flatlined.
- A failed repair would clear the device's "needs repair" state, making the dashboard report broken devices as healthy.

### Internal
- Listener test count: 320 → 341 (21 new tests across repair scheduler, device-health rescue, HAP subscriber liveness gate, and pair-and-persist helper).
- Web test count: 89 → 91.
- Playwright added as dev dependency for end-to-end testing.

## [0.1.8] — 2026-04-12

### Added
- **Multi-service accessory splitting** — accessories with multiple HomeKit services (e.g. TemperatureSensor + HumiditySensor) now appear as separate rows in the Accessories tab with independent event counts
- **Device health: subscriber-aware staleness** — `deriveDeviceHealth()` now factors in active subscriber connections; devices reconnected by nightly repair no longer show as stale when they haven't produced new events yet
- **Clickable live event toasts** — tapping a live event toast navigates to the Timeline filtered by that accessory
- **Clickable dashboard rows** — stale devices and anomaly outlier rows navigate to Accessory Detail on click
- **Clickable quiet hours events** — clicking a quiet hours event row navigates to the Timeline filtered by that accessory
- **Bridge child accessories** — all bridge children now appear in the Accessories tab via on-demand metadata cache refresh
- **Help & Links in Settings** — Documentation and Report an Issue links added to the Settings tab for easy access
- **CI: auto-create GitLab releases** — version tags now automatically generate GitLab releases

### Changed
- **State Duration chart** — high-cardinality characteristics capped at 6 slices with an "Other" aggregate bucket

### Security
- Security fixes and housekeeping

### Fixed
- **Store race condition** — `refresh()` now checks file mtime before overwriting cache, preventing data loss from concurrent writes
- **Subscriber connection leak** — `connectAccessory()` closes previous HAP client and removes event handlers before creating a new connection
- **Subscriber auto-repair leak** — repair client explicitly closed after pair-setup completes
- **Matter ID room lookup** — `parentBridgeId()` now handles Matter `nodeId:endpointId` format for correct room fallback
- **Timeline jump accuracy** — `/events/jump` count query now includes accessory name filter for correct page numbers
- **Cache staleness bound** — query cache enforces 5-minute max staleness; forces synchronous refresh when exceeded
- **Bridge metadata fetch** — on-demand HAP metadata fetches run in parallel via `Promise.allSettled` instead of sequentially blocking
- **Matter connect race** — `node.connect()` now awaited in both `poll()` and `subscribe()`
- **Archive delete resilience** — DELETE endpoints use best-effort JSON store cleanup with per-store error handling
- **Discovery error handling** — `IPDiscovery` constructor failure uses consistent `fail()` path
- **Repair cache invalidation** — `repairPairingMutation` now invalidates correct query key `['setup', 'pairings']`
- **Toast stale closure** — `addToast` uses ref for settings to avoid stale duration/maxVisible after config change
- **Timeline backfill stability** — backfill effect uses stringified `filtersKey` instead of object reference in dependency array
- **Live toast dependency** — `onNavigateToAccessory` added to `useLiveEventToasts` effect dependency array
- **Scene grouping** — `groupIntoScenes` filters invalid timestamps before grouping instead of silently including them
- **Scene group accent color** — replaced hardcoded blue with theme accent variable for consistent theming
- **Activity chart timezone** — UTC-to-local hour conversion uses `Math.floor` instead of `Math.round` for half-hour timezone correctness
- **API base URL consistency** — `useEvents.js` now imports `API_BASE` from `api.js` instead of hardcoded `/api`
- **CSV export BOM** — archive CSV export includes UTF-8 BOM for Excel compatibility with accented characters
- **PIN vault comments** — corrected misleading `localStorage` references to match actual `sessionStorage` implementation
- **Duplicate return value** — removed duplicate `savedDisplayNames` from `useSetup` return object
- **Toast navigation** — restored clickable toast navigation that was lost during a worktree merge
- **CI runner** — switched from Docker-in-Docker to host Docker socket for self-hosted runner; fixed TLS context error

### Accessibility
- **AnomalyPanel** — clickable outlier cards now have `role="button"`, `tabIndex`, and keyboard event handlers
- **StaleDevicesPanel** — clickable device cards now have `role="button"`, `tabIndex`, and keyboard event handlers

## [0.1.6] — 2026-04-06

### Added
- **Scheduled repair** — daily automated repair cycle for stale HomeKit pairings; configurable hour in Settings, REST API at `GET/PATCH /api/setup/repair`
- **Firmware version tracking** — detects firmware changes on reconnect, logs them as `FirmwareRevision` events, and shows update history in Accessory Detail
- **Formal database migration system** — `node-pg-migrate` v8 replaces `CREATE IF NOT EXISTS`; versioned migration files in `listener/migrations/`
- **Alert deliveries retention sweep** — automatic cleanup of old alert delivery records (default 90 days)
- **Process-level error handlers** — `unhandledRejection` and `uncaughtException` handlers prevent silent failures
- **Global Express error middleware** — structured JSON error responses for unhandled route errors
- **COUNT optimization** — unfiltered `/api/events` uses `pg_class.reltuples` estimate instead of full table scan
- **Clickable brand logo** — HomeChronicle logo in the header navigates to the Dashboard
- **Settings guide page** — new documentation page covering all Manage > Settings sections
- **Toast center positions** — added top-center and bottom-center toast position options
- **Sticky header** — app header now sticks to the top and collapses on scroll
- **Episode/scene card styling** — distinct card styles for episode and scene groups on the Timeline
- **Pink color scheme** — replaces Alabaster with a pink accent theme
- **Integration tests** for archive-router, stats-router, health-router, accessories-router, setup-router (80+ new tests)
- **Unit tests** for setup-helpers pure functions (32 new tests)

### Changed
- **Listener architecture overhaul** — extracted monolithic `index.js` (2,100 lines) into modular routers:
  - `utils.js` — shared utility functions
  - `archive-router.js` — archive and data management routes
  - `stats-router.js` — statistics and aggregation routes
  - `health-router.js` — health endpoint
  - `accessories-router.js` — accessory list, detail, and characteristic history
  - `setup-router.js` — pairing, rooms, display-names, notes, log-level (18 route handlers)
  - `setup-helpers.js` — pairing normalization, store helper factory
  - `discovery-helpers.js` — discovery scan and repair helper factory
- `index.js` reduced from 2,100 to 477 lines (store init, bootstrap, middleware, router mounts)
- Silent `catch {}` blocks replaced with `log.debug()` calls across discovery and Matter cleanup paths
- `db/init.sql` retired — migrations are the sole schema source for fresh and upgraded installs
- Pure functions (isHomeKitPairing, mapReliabilityStats, etc.) now imported directly by routers instead of injected as callbacks
- **Settings tab reorganization** — reordered and renamed sections: Device Management, Data & Retention, Alerts & Quiet Hours, Timeline, Appearance, Advanced, Danger Zone
- Removed dead code and unused exports from listener source files

### Security
- **Webhook SSRF hardening** — pin resolved IP in fetch to prevent DNS rebinding; disable redirect following
- **Token comparison** — HMAC-hash both values before timing-safe comparison to prevent length oracle
- **CSP hardened** — removed `unsafe-inline` from `script-src` in Nginx config
- **Error message sanitization** — generic error responses for bridge-children and Matter endpoints
- **CSV injection protection** — prefix formula-triggering characters in archive export
- **PIN storage** — moved from `localStorage` to `sessionStorage` (cleared on tab close)
- **DOM selector sanitization** — `CSS.escape()` on event IDs in Timeline querySelector
- **Security headers** — added COOP and CORP headers to Express middleware
- **Default DB password warning** — standalone entrypoint warns when using `changeme`
- **API token truncated in logs** — only prefix+suffix shown in container stdout

### Technical debt
- `JsonObjectStore` — fixed TOCTOU between stat/readFile, clone `getByKey` return values, added `modify()` for atomic read-modify-write
- `useTheme` — `resolvedTheme` now tracks system theme changes via React state
- Timeline query key unified to canonical `['setup', 'retention']`
- Timeline backfill effect dependency stabilized with string key
- `useLiveEventToasts` accessorySet memo stabilized via JSON key
- `useMutedDevices` and PIN helpers wrapped in try/catch for private browsing
- `accessoryId` length validation (256 char max) on all accessory routes
- HAP client connections explicitly closed on subscriber stop
- ChangelogModal dismissible via Escape key
- Archive export capped at 500K rows (configurable via `ARCHIVE_MAX_EXPORT_ROWS`)

### Fixed
- **PairingHealthBanner** — "View Details" button now correctly navigates to the Manage tab
- **Matter live toast notifications** — Matter devices using `nodeId:endpointId` format were silently skipped by toast matching
- **Toast offset** — adjusted toast position to clear sticky header
- **Room autocomplete** — replaced native datalist with custom themed dropdown
- **Pink theme dark mode** — saturated accent colors for solid logo appearance; reduced gradient contrast
- **Remove pairings button** — matched style to wipe all event data pattern

## [0.1.5] — 2026-03-31

### Added
- **Add-pairing support** — register as additional controller on devices already paired to Apple Home, with web UI panel and API endpoint
- **Paired-elsewhere detection** — amber warning badge for devices with sf=0, with actionable guidance
- **Repair flow** — per-device repair button, guided RepairFlow modal, health banner on Dashboard
- **Repair All / Remove All Pairings** — bulk actions in My Accessories toolbar
- **Live event toasts** — polling hook with per-accessory bell toggle, configurable position/duration/max visible in Settings
- **Toast notification system** — centered pill banners using skin accent colors, wired into save/delete flows
- **Quiet hours API** and muting support
- **Auto re-pair** — stored PIN with circuit breaker for automatic re-pairing on auth failure
- **Connection recovery** — re-discover device on connection failure before reconnect
- **Multi-platform Docker builds** (amd64 + arm64)

### Changed
- Migrate container images from GHCR to Docker Hub
- Matter controller/runtime improvements and quiet hours exclusions
- Container image cleanup workflow
- Reorganize docs and lowercase branding
- Multiple controllers documentation with Homebridge insecure mode guidance

### Fixed
- Dark mode consistency across Settings, My Accessories, FilterBar, chart axes, tooltips
- Light mode readability, skin-aware charts, room label colors
- API hardening and security improvements
- Error 6 message now says "Device is already paired" instead of "Device is unavailable"
- Discovery API preserves device sf status flag
- Initial poll flooding timeline, dashboard empty state
- Standalone build fixes (PGDG repo, gosu, recursive chown)

## [0.1.4] — 2026-03-15

### Added
- Skeleton shimmer loading for dashboard charts and lists
- Toast notification system (ToastProvider + useToast hook)
- Manage tab UX overhaul: default tab, sticky save bar, room autocomplete, save-flash animation
- Tab slide animations
- Dark mode for chart axes, bridge names instead of MAC addresses
- Real health checks, quiet-time muting
- Standalone Docker image (all-in-one: PostgreSQL + listener + web)
- Auto-generate API token on first standalone run
- Protocol badges on device cards
- Slate and Pink themes
- Scene/episode tuning settings, accent-themed heatmap

### Changed
- Bump Express to v5, date-fns to v4, actions/checkout to v6
- License changed from MIT to AGPL-3.0
- "Accessories" terminology replaces "devices" in UI

### Fixed
- Dark mode across all Manage sub-tabs
- Theme selector and heatmap accessory filter
- Timeline jump crash, heatmap row count cap
- Standalone build (PostgreSQL 16 PGDG repo, gosu)
- Dockerfile: use built-in node user

## [0.1.3] — 2026-02-25

### Added
- Docsify documentation site at /guide/
- Update available indicator, collapsible bridge devices, archive before delete, device notes
- Dark mode for PIN help and Matter help modals

### Fixed
- Quiet hours configuration, close button visibility in dark mode

## [0.1.2] — 2026-02-20

### Added
- Accessory detail page: reliability score, metadata, anomalies, trends, protocol info

### Fixed
- Stale web cache, accessories back navigation

## [0.1.1] — 2026-02-15

### Added
- Portainer compose example and deployment docs
- GitHub security baseline (SECURITY.md, Dependabot, CodeQL)

### Changed
- Suppress Matter startup snapshot events
- Pod networking and listener host fallback docs

## [0.1.0] — 2026-02-01

### Added
- Initial release: HomeKit discovery/pairing (HAP), Matter commissioning, event timeline, dashboard analytics, accessory management, webhook alerts, Docker Compose deployment, dark mode, PWA

[0.1.8]: https://gitlab.com/havuq/homechronicle/-/compare/v0.1.6...v0.1.8
[0.1.6]: https://gitlab.com/havuq/homechronicle/-/compare/v0.1.5...v0.1.6
[0.1.5]: https://gitlab.com/havuq/homechronicle/-/compare/v0.1.4...v0.1.5
[0.1.4]: https://gitlab.com/havuq/homechronicle/-/compare/v0.1.3...v0.1.4
[0.1.3]: https://gitlab.com/havuq/homechronicle/-/compare/v0.1.2...v0.1.3
[0.1.2]: https://gitlab.com/havuq/homechronicle/-/compare/v0.1.1...v0.1.2
[0.1.1]: https://gitlab.com/havuq/homechronicle/-/compare/v0.1.0...v0.1.1
[0.1.0]: https://gitlab.com/havuq/homechronicle/-/tags/v0.1.0
