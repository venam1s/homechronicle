# Changelog

All notable changes to homechronicle are documented in this file.

## [0.1.5-beta.1] — 2026-03-21

### Changed
- Migrate container images from GHCR to Docker Hub
- Matter controller/runtime improvements and quiet hours exclusions
- Pass API_TOKEN to web container for nginx proxy auth
- Switch test stack to named Docker networks
- Container image cleanup workflow

## [0.1.4] — 2026-03-15

### Added
- Skeleton shimmer loading for all dashboard charts and lists
- Toast notification system (ToastProvider + useToast hook)
- Manage tab UX overhaul: default tab My Devices, sticky save bar, room autocomplete, save-flash animation
- Tab slide animations with CSS keyframes

### Fixed
- Dark mode fully applied to all Manage sub-tabs (Settings, Setup, MyDevices, AddDevices)

## [0.1.4-beta.14] — 2026-03-12

### Added
- Dark mode support for chart axes, titles, and tooltips
- Show bridge names instead of MAC addresses

### Fixed
- Replace hardcoded dark mode colors with CSS variables
- Fix initial poll flooding timeline
- Restore slate/alabaster themes

## [0.1.4-beta.12] — 2026-03-10

### Fixed
- Theme selector and heatmap accessory filter

## [0.1.4-beta.11] — 2026-03-09

### Added
- Real health checks to /api/health and Dockerfile
- Quiet-time muting

### Fixed
- Timeline jump crash and cap heatmap row count
- Theme styles and room color palette

## [0.1.4-beta.10] — 2026-03-08

### Fixed
- Dashboard dark mode for anomaly panel, quiet hours, and tooltips
- Poll initial characteristic values on connect so all accessories appear immediately

## [0.1.4-beta.9] — 2026-03-07

### Fixed
- Standalone build: add PGDG repo for PostgreSQL 16, replace su-exec with gosu

## [0.1.4-beta.7] — 2026-03-05

### Added
- Auto-generate API token on first standalone run
- Quiet hours API

### Changed
- Reorganize docs and lowercase branding across all files
- Dashboard polish and dark mode tooltip fixes

## [0.1.4-beta.6] — 2026-03-04

### Added
- Standalone Docker image (all-in-one: PostgreSQL + listener + web)

### Fixed
- MIT references updated to AGPL-3.0 in README and docs

## [0.1.4-beta.5] — 2026-03-03

### Added
- Protocol badges on device cards
- Improved room color hashing

### Changed
- License changed from MIT to AGPL-3.0

## [0.1.4-beta.3] — 2026-03-01

### Added
- Performance, security hardening, and accessibility improvements
- Slate and Alabaster themes

### Fixed
- Theme contrast improvements
- Dockerfile: use built-in node user instead of creating uid 1000

## [0.1.4-beta.2] — 2026-02-28

### Added
- New themes (Teal, Slate, Alabaster)
- Settings sections and UX polish
- "Accessories" terminology (replaces "devices" in UI)

### Changed
- Bump Express to v5, date-fns to v4, actions/checkout to v6

## [0.1.4-beta.1] — 2026-02-27

### Added
- Scene/episode tuning settings
- Accent-themed heatmap

## [0.1.3] — 2026-02-25

### Added
- Docsify documentation site at /guide/
- Update available indicator in footer
- Collapse bridge devices in accessories
- Archive before delete setting
- Device notes backend and UI
- Dark mode for PIN help and Matter help modals

### Changed
- Clean version tag in footer (remove Build prefix and commit hash)
- Dark mode audit fixes across all components

### Fixed
- Quiet hours configuration
- Close button visibility in dark mode

## [0.1.2] — 2026-02-20

### Added
- Accessory detail page: reliability score, metadata, anomalies, trends, protocol info

### Fixed
- Stale web cache loading
- Accessories back navigation

## [0.1.1] — 2026-02-15

### Added
- Portainer compose example and deployment docs
- GitHub security baseline (SECURITY.md, Dependabot, CodeQL, CI permissions)
- Copy button on docs site

### Changed
- Suppress Matter startup snapshot timeline events
- Update Docker compose for Portainer compatibility
- Document pod networking and listener host fallbacks

## [0.1.0] — 2026-02-01

### Added
- Initial release
- HomeKit device discovery and pairing via HAP
- Matter device commissioning via matter.js
- Event timeline with search and filtering
- Dashboard with activity analytics, trend charts, and heatmaps
- Accessory list with room assignment
- Webhook alert rules with quiet-period suppression
- Docker Compose deployment (PostgreSQL + listener + web)
- Dark mode support
- PWA-ready web interface

[0.1.5-beta.1]: https://gitlab.com/havuq/homechronicle/-/compare/v0.1.4-beta.16...v0.1.5-beta.1
[0.1.4]: https://gitlab.com/havuq/homechronicle/-/compare/v0.1.3...v0.1.4
[0.1.4-beta.14]: https://gitlab.com/havuq/homechronicle/-/compare/v0.1.4-beta.13...v0.1.4-beta.14
[0.1.4-beta.12]: https://gitlab.com/havuq/homechronicle/-/compare/v0.1.4-beta.11...v0.1.4-beta.12
[0.1.4-beta.11]: https://gitlab.com/havuq/homechronicle/-/compare/v0.1.4-beta.10...v0.1.4-beta.11
[0.1.4-beta.10]: https://gitlab.com/havuq/homechronicle/-/compare/v0.1.4-beta.9...v0.1.4-beta.10
[0.1.4-beta.9]: https://gitlab.com/havuq/homechronicle/-/compare/v0.1.4-beta.8...v0.1.4-beta.9
[0.1.4-beta.7]: https://gitlab.com/havuq/homechronicle/-/compare/v0.1.4-beta.6...v0.1.4-beta.7
[0.1.4-beta.6]: https://gitlab.com/havuq/homechronicle/-/compare/v0.1.4-beta.5...v0.1.4-beta.6
[0.1.4-beta.5]: https://gitlab.com/havuq/homechronicle/-/compare/v0.1.4-beta.4...v0.1.4-beta.5
[0.1.4-beta.3]: https://gitlab.com/havuq/homechronicle/-/compare/v0.1.4-beta.2...v0.1.4-beta.3
[0.1.4-beta.2]: https://gitlab.com/havuq/homechronicle/-/compare/v0.1.4-beta.1...v0.1.4-beta.2
[0.1.4-beta.1]: https://gitlab.com/havuq/homechronicle/-/compare/v0.1.3...v0.1.4-beta.1
[0.1.3]: https://gitlab.com/havuq/homechronicle/-/compare/v0.1.2...v0.1.3
[0.1.2]: https://gitlab.com/havuq/homechronicle/-/compare/v0.1.1...v0.1.2
[0.1.1]: https://gitlab.com/havuq/homechronicle/-/compare/v0.1.0...v0.1.1
[0.1.0]: https://gitlab.com/havuq/homechronicle/-/tags/v0.1.0
