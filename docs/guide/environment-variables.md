# Environment Variables

This documents all supported environment variables for homechronicle.

Use `.env.example` for a minimal setup, then add only what you need from this reference.

## Compose / Deployment

| Variable | Default | Used by | Description |
|---|---|---|---|
| `TZ` | `UTC` | all | Container timezone |
| `POSTGRES_IMAGE` | `postgres:16-alpine` | compose | Override Postgres image tag |
| `LISTENER_IMAGE` | `havuq/homechronicle-listener:latest` | compose | Override listener image tag |
| `WEB_IMAGE` | `havuq/homechronicle-web:latest` | compose | Override web image tag |
| `WEB_PORT` | `3000` | compose | Host port for web container |
| `POSTGRES_PORT` | `5432` | compose | Host port for PostgreSQL |
| `POSTGRES_DATA_SOURCE` | `postgres-data` | compose | Source for PostgreSQL data mount (named volume or host path) |
| `LISTENER_DATA_SOURCE` | `./listener/data` | compose | Source for listener `/app/data` mount |
| `LISTENER_NETWORK_MODE` | `host` | compose | Listener network mode (`host` recommended for mDNS) |
| `HOST_DBUS_SOCKET` | `/run/dbus/system_bus_socket` | compose | Host D-Bus socket for avahi-daemon |
| `LISTENER_HOST` | `host.docker.internal` | web proxy | Host/IP web uses to proxy `/api` to listener |
| `LISTENER_PORT` | Same as `API_PORT` | web proxy | Listener port used by web proxy |
| `DATABASE_URL` | auto-built from PG vars | listener | Explicit PostgreSQL connection string |

### Web-to-Listener Routing Presets

**Host-network listener (default):**

```
LISTENER_NETWORK_MODE=host
LISTENER_HOST=host.docker.internal
```

**Bridge-network listener:**

```
LISTENER_NETWORK_MODE=bridge
LISTENER_HOST=listener
```

Keep `API_PORT` and `LISTENER_PORT` aligned (default `3001`) or `/api` requests will fail with `502`.

## PostgreSQL

| Variable | Default | Description |
|---|---|---|
| `POSTGRES_USER` | `homekit` | Database user |
| `POSTGRES_PASSWORD` | — | Database password (required) |
| `POSTGRES_DB` | `homekit_events` | Database name |

## Listener Core / API

| Variable | Default | Description |
|---|---|---|
| `API_PORT` | `3001` | Listener API listen port |
| `NODE_ENV` | `production` | Runtime mode |
| `API_TOKEN` | — | Write-route auth token (required in production) |
| `API_TOKEN_READS_ENABLED` | `false` | Require auth for GET/HEAD routes |
| `API_JSON_LIMIT` | `256kb` | Max JSON body size |
| `CORS_ALLOWED_ORIGINS` | — | Comma-separated origin allow-list |
| `CORS_ALLOW_LOCALHOST` | `true` | Allow localhost/loopback origins |
| `DISCOVER_IFACE` | auto | Network interface for mDNS (e.g., `en0`, `eth0`) |
| `DISCOVERY_SCAN_ENABLED` | `true` | Enable periodic background discovery |
| `NOTES_FILE` | `/app/data/notes.json` | Device notes JSON storage path |
| `STORE_REFRESH_INTERVAL_MS` | `30000` | JSON store refresh interval |

## Rate Limits

| Variable | Default | Description |
|---|---|---|
| `API_WRITE_RATE_LIMIT_WINDOW_MS` | `60000` | Write route rate limit window |
| `API_WRITE_RATE_LIMIT_MAX` | `60` | Max write requests per window |
| `API_STATS_RATE_LIMIT_WINDOW_MS` | `60000` | Stats/accessories rate limit window |
| `API_STATS_RATE_LIMIT_MAX` | `120` | Max stats requests per window |
| `EVENTS_RATE_LIMIT_WINDOW_MS` | `60000` | Events rate limit window |
| `EVENTS_RATE_LIMIT_MAX` | `300` | Max events requests per window |
| `ALERTS_READ_RATE_LIMIT_WINDOW_MS` | `60000` | Alerts read rate limit window |
| `ALERTS_READ_RATE_LIMIT_MAX` | `180` | Max alerts read requests per window |
| `ALERTS_WRITE_RATE_LIMIT_WINDOW_MS` | `60000` | Alerts write rate limit window |
| `ALERTS_WRITE_RATE_LIMIT_MAX` | `60` | Max alerts write requests per window |

## Retention / Health

| Variable | Default | Description |
|---|---|---|
| `RETENTION_DAYS` | `365` | Event retention window in days |
| `RETENTION_SWEEP_MS` | `86400000` | Sweep interval (default 24h) |
| `RETENTION_ARCHIVE` | `true` | Archive events before deletion |
| `STALE_THRESHOLD_HOURS` | `12` | Hours without event before device is flagged stale |

## Alerts / Subscriber

| Variable | Default | Description |
|---|---|---|
| `ALERTS_ENABLED` | `false` | Enable alert rule processing |
| `ALERTS_WEBHOOK_TIMEOUT_MS` | `5000` | Webhook delivery timeout |
| `ALERTS_ALLOW_PRIVATE_TARGETS` | `true` | Allow RFC1918 webhook targets (set `false` to block private IPs) |
| `RECONNECT_BASE_MS` | `5000` | Initial reconnect delay |
| `RECONNECT_MAX_MS` | `60000` | Max reconnect delay |

## Matter

| Variable | Default | Description |
|---|---|---|
| `MATTER_POLL_INTERVAL_MS` | `5000` | Polling interval |
| `MATTER_SUBSCRIBE_ENABLED` | `false` | Enable long-lived Matter subscriptions |
| `MATTER_SUBSCRIBE_RESTART_DELAY_MS` | `2000` | Delay before restarting failed subscriptions |
| `MATTER_SUBSCRIBE_MIN_INTERVAL_SEC` | `1` | Min subscription report interval |
| `MATTER_SUBSCRIBE_MAX_INTERVAL_SEC` | `30` | Max subscription report interval |
| `MATTER_STORAGE_PATH` | `/app/data/matter-storage` | Matter.js controller state directory |
| `MATTER_SCAN_TIMEOUT_MS` | `15000` | Discovery scan timeout |

## API Authentication

- If `NODE_ENV=production` and `API_TOKEN` is empty, the listener refuses to start
- If `API_TOKEN` is set, write routes require `X-API-Token` or `Authorization: Bearer` header
- GET/HEAD routes are open unless `API_TOKEN_READS_ENABLED=true`

Generate a token:

```bash
openssl rand -hex 32
```

## Additional Variables

The following variables are supported but not listed in the sections above.

### Logging

| Variable | Default | Description |
|---|---|---|
| `LOG_LEVEL` | `info` | Log verbosity: `error`, `warn`, `info`, `debug`. Adjustable at runtime via `PATCH /api/setup/log-level` |

### Network Binding

| Variable | Default | Description |
|---|---|---|
| `API_BIND_ADDRESS` | `0.0.0.0` | Listener bind address. Set to `127.0.0.1` to restrict to localhost only |

### Accessories Rate Limit

| Variable | Default | Description |
|---|---|---|
| `ACCESSORIES_RATE_LIMIT_WINDOW_MS` | `60000` | Accessories endpoint rate limit window |
| `ACCESSORIES_RATE_LIMIT_MAX` | `120` | Max accessories requests per window |

### Alert Delivery Retention

| Variable | Default | Description |
|---|---|---|
| `ALERT_RETENTION_DAYS` | `90` | Days to keep alert delivery records before purging |

### Subscriber Behavior

| Variable | Default | Description |
|---|---|---|
| `RUN_CYCLE_OFF_DELAY_MS` | `900000` | Delay (15 min) before treating a run-cycle characteristic as off after it reports active |

### Repair Scheduler

| Variable | Default | Description |
|---|---|---|
| `REPAIR_HOUR` | `3` | Hour of day (0–23, local time) when the daily HomeKit pairing repair cycle runs |
| `REPAIR_FILE` | `/app/data/repair.json` | Path to repair state JSON file |

### JSON Store File Paths

These override the default storage locations. In production the defaults resolve to `/app/data/`; in development they resolve to `./data/` relative to the listener working directory.

| Variable | Production default | Development default | Description |
|---|---|---|---|
| `PAIRINGS_FILE` | `/app/data/pairings.json` | `./data/pairings.json` | HomeKit pairing data |
| `ROOMS_FILE` | `/app/data/rooms.json` | `./data/rooms.json` | Room assignments |
| `DISPLAY_NAMES_FILE` | `/app/data/display-names.json` | `./data/display-names.json` | Custom display names |
| `RETENTION_FILE` | `/app/data/retention.json` | `./data/retention.json` | Persisted retention settings |

### Matter Advanced

| Variable | Default | Description |
|---|---|---|
| `MATTER_COUNTRY_CODE` | `XX` | Two-letter country code passed to the Matter controller |
| `MATTER_CONTROLLER_ID` | `homechronicle` | Unique identifier for the Matter controller instance |

### Web Build Variables

These are Vite build-time variables set at Docker image build time (via `ARG`/`ENV` in `web/Dockerfile`). They are not read at runtime and cannot be overridden with a `.env` file after the image is built.

| Variable | Default | Description |
|---|---|---|
| `VITE_API_BASE_URL` | `http://localhost:3001` | Base URL the built web app uses to reach the listener API (dev proxy target) |
| `VITE_API_TOKEN` | — | API token baked into the web build for local dev use; not recommended for production |
| `VITE_BUILD_VERSION` | `unknown` | Version string injected into the build (git hash or tag) |

## Config File Format

Runtime configuration is split between environment variables (above) and JSON files persisted to disk by the listener. The JSON files are managed automatically — you do not edit them directly.

**JSON store files** (location controlled by the store path variables above):

| File | Contents |
|---|---|
| `pairings.json` | Keyed by device ID; each entry holds the HAP pairing credentials |
| `rooms.json` | Map of accessory ID to room name string |
| `display-names.json` | Map of accessory ID to user-assigned display name |
| `notes.json` | Map of accessory ID to free-text note |
| `retention.json` | Persisted overrides for retention days, archive flag, and stale threshold |
| `repair.json` | Last repair cycle result and next scheduled time |
| `matter-storage/` | Directory; Matter.js controller state (fabric, session, and node data) |

All JSON files are written atomically (write to a temp file then rename) by `JsonObjectStore` in `listener/src/store.js`.

## Per-Environment Overrides

HomeChronicle does not use `.env.development` / `.env.production` layering. All configuration comes from a single `.env` file (or Docker environment variables). Use `NODE_ENV` to switch between development and production behavior:

- `NODE_ENV=production` (default in Docker): enforces `API_TOKEN`, uses `/app/data/` paths for JSON stores
- `NODE_ENV=development`: skips `API_TOKEN` enforcement, uses `./data/` paths relative to the listener working directory

**Development override example** (for `npm run dev` in `listener/`):

```bash
NODE_ENV=development
DATABASE_URL=postgres://homekit:changeme@localhost:5432/homekit_events
DISCOVER_IFACE=en0
LOG_LEVEL=debug
```

**Production `.env` example** (Docker Compose):

```bash
NODE_ENV=production
POSTGRES_USER=homekit
POSTGRES_PASSWORD=<strong-password>
POSTGRES_DB=homekit_events
API_TOKEN=<openssl rand -hex 32>
LISTENER_NETWORK_MODE=host
LISTENER_HOST=host.docker.internal
RETENTION_DAYS=365
ALERTS_ENABLED=true
```
