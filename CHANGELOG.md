# Changelog

All notable changes to homechronicle are documented in this file.

## [0.1.8] — 2026-04-11

### Security
- **Docker image security patches** — `apt-get upgrade` (Debian) and `apk upgrade` (Alpine) applied to all Dockerfiles; fixes OpenSSL, libxml2, curl, libpng, libexpat CVEs on rebuild
- **Rate limiters added** — Matter router (30/min), retention router (20/min), and health router (120/min) endpoints now rate-limited
- **CORS production default** — `CORS_ALLOW_LOCALHOST` now defaults to `false` in production (set to `true` explicitly if needed)
- **Matter credentials validation** — `credentials` field constrained to string type, max 4096 chars
- **Error message sanitization** — scan warning responses no longer expose internal `err.message` details
- **Standalone entrypoint fix** — removed broken `init.sql` reference; schema handled by `migrateDb()`

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
- **Activity chart timezone** — UTC-to-local hour conversion uses `Math.floor` instead of `Math.round` for half-hour timezone correctness
- **API base URL consistency** — `useEvents.js` now imports `API_BASE` from `api.js` instead of hardcoded `/api`
- **CSV export BOM** — archive CSV export includes UTF-8 BOM for Excel compatibility with accented characters
- **PIN vault comments** — corrected misleading `localStorage` references to match actual `sessionStorage` implementation
- **Duplicate return value** — removed duplicate `savedDisplayNames` from `useSetup` return object

### Accessibility
- **AnomalyPanel** — clickable outlier cards now have `role="button"`, `tabIndex`, and keyboard event handlers
- **StaleDevicesPanel** — clickable device cards now have `role="button"`, `tabIndex`, and keyboard event handlers

## [0.1.7] — 2026-04-09

### Added
- **Device health: subscriber-aware staleness** — `deriveDeviceHealth()` now factors in active subscriber connections; devices reconnected by nightly repair no longer show as stale when they haven't produced new events yet
- **Clickable live event toasts** — tapping a live event toast navigates to the Timeline filtered by that accessory
- **Clickable dashboard rows** — stale devices and anomaly outlier rows navigate to Accessory Detail on click
- **Bridge child accessories** — all bridge children now appear in the Accessories tab via on-demand metadata cache refresh
- **Help & Links in Settings** — Documentation and Report an Issue links added to the Settings tab for easy access
- **CI: auto-create GitLab releases** — version tags now automatically generate GitLab releases

### Changed
- **State Duration chart** — high-cardinality characteristics capped at 6 slices with an "Other" aggregate bucket

### Fixed
- **Scene group accent color** — replaced hardcoded blue with theme accent variable for consistent theming
- **Toast navigation** — restored clickable toast navigation that was lost during a worktree merge
- **CI runner** — switched from Docker-in-Docker to host Docker socket for self-hosted runner; fixed TLS context error

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

[0.1.8]: https://gitlab.com/havuq/homechronicle/-/compare/v0.1.7...v0.1.8
[0.1.7]: https://gitlab.com/havuq/homechronicle/-/compare/v0.1.6...v0.1.7
[0.1.6]: https://gitlab.com/havuq/homechronicle/-/compare/v0.1.5...v0.1.6
[0.1.5]: https://gitlab.com/havuq/homechronicle/-/compare/v0.1.4...v0.1.5
[0.1.4]: https://gitlab.com/havuq/homechronicle/-/compare/v0.1.3...v0.1.4
[0.1.3]: https://gitlab.com/havuq/homechronicle/-/compare/v0.1.2...v0.1.3
[0.1.2]: https://gitlab.com/havuq/homechronicle/-/compare/v0.1.1...v0.1.2
[0.1.1]: https://gitlab.com/havuq/homechronicle/-/compare/v0.1.0...v0.1.1
[0.1.0]: https://gitlab.com/havuq/homechronicle/-/tags/v0.1.0
