# Changelog

All notable changes to homechronicle are documented in this file.

## [0.1.6-beta.2] — 2026-04-03

### Added
- **Scheduled repair** — daily automated repair cycle for stale HomeKit pairings; configurable hour in Settings, REST API at `GET/PATCH /api/setup/repair`
- **Firmware version tracking** — detects firmware changes on reconnect, logs them as `FirmwareRevision` events, and shows update history in Accessory Detail

### Changed
- Removed dead code and unused exports from listener source files

## [0.1.6-beta.1] — 2026-04-03

### Added
- **Formal database migration system** — `node-pg-migrate` v8 replaces `CREATE IF NOT EXISTS`; versioned migration files in `listener/migrations/`
- **Alert deliveries retention sweep** — automatic cleanup of old alert delivery records (default 90 days)
- **Process-level error handlers** — `unhandledRejection` and `uncaughtException` handlers prevent silent failures
- **Global Express error middleware** — structured JSON error responses for unhandled route errors
- **COUNT optimization** — unfiltered `/api/events` uses `pg_class.reltuples` estimate instead of full table scan
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
- Slate and Alabaster themes
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

[0.1.6-beta.2]: https://gitlab.com/havuq/homechronicle/-/compare/v0.1.6-beta.1...v0.1.6-beta.2
[0.1.6-beta.1]: https://gitlab.com/havuq/homechronicle/-/compare/v0.1.5...v0.1.6-beta.1
[0.1.5]: https://gitlab.com/havuq/homechronicle/-/compare/v0.1.4...v0.1.5
[0.1.4]: https://gitlab.com/havuq/homechronicle/-/compare/v0.1.3...v0.1.4
[0.1.3]: https://gitlab.com/havuq/homechronicle/-/compare/v0.1.2...v0.1.3
[0.1.2]: https://gitlab.com/havuq/homechronicle/-/compare/v0.1.1...v0.1.2
[0.1.1]: https://gitlab.com/havuq/homechronicle/-/compare/v0.1.0...v0.1.1
[0.1.0]: https://gitlab.com/havuq/homechronicle/-/tags/v0.1.0
