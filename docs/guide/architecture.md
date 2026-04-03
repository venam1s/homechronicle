# Architecture Overview

homechronicle runs as three Docker services on your local network. No cloud services are involved — everything stays on your machine.

## System Diagram

```
HomeKit / Matter Devices
        │
        │  HAP events / Matter polling
        ▼
┌─────────────────────┐     ┌──────────────────┐
│     Listener         │────▶│   PostgreSQL 16   │
│  (Node.js / Express) │     │                  │
│                      │     │  event_logs      │
│  - HAP subscriber    │     │  alert_rules     │
│  - Matter runtime    │     │  alert_deliveries│
│  - REST API          │     │  event_logs_     │
│  - Alert engine      │     │   archive        │
└──────────┬───────────┘     └──────────────────┘
           │
           │  /api/* proxy
           ▼
┌─────────────────────┐
│        Web           │
│  (React + Nginx)     │
│                      │
│  - Dashboard         │
│  - Timeline          │
│  - Accessories       │
│  - Manage/Setup      │
└─────────────────────┘
```

## Listener

The listener is the core service. It runs on Node.js with ES modules and serves two roles: device communication and the REST API.

### Key Modules

| File | Purpose |
|------|---------|
| `index.js` | Express server entry point; boots API routes, subscribers, scheduled repair, and background tasks |
| `subscriber.js` | Maintains persistent HAP event subscriptions via `hap-controller` |
| `matter-runtime.js` | Matter.js polling loop and subscription management |
| `matter-controller.js` | Matter commissioning and controller lifecycle |
| `db.js` | PostgreSQL pool, `insertEvent()`, schema migrations, retention sweep |
| `store.js` | `JsonObjectStore` for persistent JSON files (pairings, rooms, retention) |
| `events-router.js` | GET endpoints for events with filtering and pagination |
| `alerts-router.js` | CRUD for alert rules and delivery log |
| `repair-router.js` | GET/PATCH endpoints for scheduled repair settings |
| `repair-scheduler.js` | Daily scheduled repair cycle for stale HomeKit pairings |
| `retention-router.js` | Retention and settings configuration endpoints |
| `setup-helpers.js` | Pairing normalization and store helper factory |
| `discovery-helpers.js` | Discovery scan and repair helper factory |
| `alerts.js` | Rule matching and webhook dispatch with quiet-period suppression |
| `discover.js` | CLI tool for mDNS network scanning |
| `pairing.js` | CLI tool for HAP pair-setup |
| `accessory-metadata.js` | Caches device identity (manufacturer, model, serial, firmware) |
| `device-health.js` | Derives health status from event timestamps and heartbeat intervals |
| `anomaly-detection.js` | Z-score outlier detection on event patterns |
| `logger.js` | Structured logging with runtime-configurable levels |
| `security.js` | Constant-time token comparison, webhook URL validation |

### Event Flow

1. A HomeKit accessory changes state (e.g., light turns on)
2. The HAP subscriber receives the characteristic change event
3. `old_value` is read from the in-memory value cache
4. A row is inserted into `event_logs` with all metadata
5. Alert rules are evaluated against the new event
6. Matching rules trigger webhook delivery (with quiet-period checks)
7. The value cache is updated

### Background Tasks

- **Discovery scan**: Runs every hour, updates accessory addresses in pairings
- **Retention sweep**: Runs every 24 hours, archives and/or deletes old events
- **Scheduled repair**: Runs daily at a configurable hour, re-discovers and re-subscribes stale devices
- **Firmware detection**: On each reconnect, compares firmware versions and logs changes as events
- **Store refresh**: Re-reads JSON stores from disk every 30 seconds

### Reconnection Strategy

When a HomeKit device becomes unreachable, the subscriber uses exponential backoff:

- Base delay: 5 seconds
- Maximum delay: 60 seconds
- Multiplied by 2 on each failure, with jitter

For Matter, polling stops after 10 consecutive errors per node.

## Web

The web frontend is a React single-page application built with Vite and styled with Tailwind CSS v4.

### Tabs

| Tab | Description |
|-----|-------------|
| **Dashboard** | KPI cards, trend charts, hourly distribution, room breakdown, device rankings, heatmaps, anomaly detection, stale device alerts |
| **Timeline** | Chronological event feed grouped by day, with episode grouping for events within 30s of each other |
| **Accessories** | Device inventory with room grouping, health indicators, and drill-down detail view |
| **Manage** | Discovery, pairing, room assignment, retention settings, log level |
| **Alerts** | Rule management and delivery log (visible when `ALERTS_ENABLED=true`) |

### Anomaly Detection (Active Outliers)

The dashboard's **Active Outliers** panel flags devices or rooms whose recent activity is unusually high or low compared to their historical baseline.

**How baselines are built:**

1. The API queries the last 31 days of events from `event_logs`.
2. For each device (and separately each room), it calculates per-hour-of-day averages and standard deviations using days 2–31 (excluding the most recent 24 hours).
3. A device/room-hour needs at least **7 days** of historical data to be eligible for comparison.

**How outliers are detected:**

The `anomaly-detection.js` module compares the last 24 hours against the baseline using z-scores:

- **Spike**: flagged when the z-score ≥ 3 *and* the event count exceeds the baseline average by at least 3. The spread used in the z-score calculation is `max(stddev, √avg, 1)` to handle low-variance baselines.
- **Drop-off**: flagged when the baseline average is ≥ 2 events but 0 events were observed in the last 24 hours.

Each outlier is assigned a severity based on its score: **medium** (score 3–4), **high** (4–5), or **critical** (5+). Results are sorted by severity then score, and the panel shows up to 8.

**Refresh cadence:** The API response is cached for 2 minutes server-side; the frontend refetches every 60 seconds.

### Appearance

The UI supports light and dark modes (or follows system preference) and six color themes: Ocean, Graphite, Sunrise, Red, Yellow, and Purple. Preferences are stored in the browser's localStorage.

### Key Libraries

- **React 19** with hooks
- **TanStack Query** for data fetching and caching
- **Recharts** for charts and visualizations
- **Lucide** for icons
- **Tailwind CSS v4** for styling

### Build and Serving

The web app is built at Docker image build time using Vite. The resulting static files are served by Nginx, which also proxies `/api/*` requests to the listener with a 300-second timeout (to accommodate long-running Matter commissioning requests).

## Database

PostgreSQL 16 with the `pg_trgm` extension for fast accessory name search.

### Tables

**`event_logs`** (main, append-only):

| Column | Type | Notes |
|--------|------|-------|
| `id` | BIGSERIAL | Primary key |
| `timestamp` | TIMESTAMPTZ | Event time |
| `accessory_id` | TEXT | Protocol-specific device ID |
| `accessory_name` | TEXT | Human-readable name |
| `room_name` | TEXT | Nullable (manually assigned) |
| `service_type` | TEXT | e.g., "Lightbulb", "MotionSensor" |
| `characteristic` | TEXT | e.g., "On", "MotionDetected" |
| `old_value` | TEXT | Previous value (nullable) |
| `new_value` | TEXT | New value |
| `protocol` | TEXT | `homekit` or `matter` |
| `transport` | TEXT | `ip`, `thread`, etc. |
| `endpoint_id` | INT | Matter endpoint |
| `cluster_id` | BIGINT | Matter cluster |
| `attribute_id` | BIGINT | Matter attribute |
| `raw_iid` | INT | HAP instance ID |

**`event_logs_archive`**: Same schema, receives records before retention deletion.

**`alert_rules`**: Stores webhook alert rule definitions.

**`alert_deliveries`**: Log of webhook sends with status (`sent`, `failed`, `suppressed`).

### Indexes

Indexes are optimized for the primary query pattern (timestamp descending):

- `(timestamp DESC, id DESC)` — main event queries
- `(accessory_name, timestamp DESC)` — accessory filtering
- `(room_name, timestamp DESC)` — room filtering
- `(characteristic, timestamp DESC)` — characteristic filtering
- `date_trunc('hour', timestamp AT TIME ZONE 'UTC')` — stats aggregation
- GIN trigram index on `accessory_name` — ILIKE search

### Schema Initialization

The schema is managed by versioned migrations in `listener/migrations/`. On the first `docker compose up`, the listener runs all migrations in sequence to create the full schema. On upgraded installs, migration 0001 is fake-applied (already-present schema is skipped) and only new migrations run. `db/init.sql` is a historical reference only and is not used by any Docker service.

## Networking

- **Listener**: Uses `network_mode: host` on Linux for mDNS discovery (Bonjour) and Matter IPv6 link-local. On Docker Desktop (macOS/Windows), host mode works differently — see [Troubleshooting](troubleshooting.md).
- **Web**: Runs in bridge network. Nginx proxies `/api/*` to the listener. The `LISTENER_HOST` variable controls routing.
- **PostgreSQL**: Bridge network, port bound to `127.0.0.1` by default.
- **D-Bus**: The listener container mounts the host's D-Bus socket for avahi-daemon integration.
