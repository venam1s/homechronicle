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
| `LISTENER_HOST` | `host.docker.internal` (compose); `127.0.0.1` (web image default) | web proxy | Host/IP the web container uses to proxy `/api` to the listener. A name that exists only in the container's `/etc/hosts` (such as `host.docker.internal`) is resolved once when the container starts; a Compose service name (such as `listener`) is re-resolved on every request. |
| `LISTENER_PORT` | Same as `API_PORT` | web proxy | Listener port used by web proxy |
| `NGINX_RESOLVER` | `127.0.0.11` | web proxy | DNS server nginx uses to re-resolve `LISTENER_HOST` on each request. The default is Docker's embedded DNS; change it only if your container runtime uses a different one. |
| `AUTH_ENABLED` | `true` | web proxy | Must match the listener's `AUTH_ENABLED`. With login on, nginx does not forward `API_TOKEN`, so the browser authenticates by session cookie only; with login off, nginx injects `API_TOKEN` into proxied requests. |
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
| `API_TOKEN` | — | Service token for scripts and integrations (`X-API-Token` or `Authorization: Bearer`). Required only when `NODE_ENV=production` and `AUTH_ENABLED=false` — the listener refuses to start in that case if it is empty. See [API Authentication](#api-authentication). |
| `API_TOKEN_READS_ENABLED` | `false` | Require the token for GET/HEAD routes too. Only applies when `AUTH_ENABLED=false`; with login on, every non-public route already needs a session or the token. |
| `API_JSON_LIMIT` | `256kb` | Max JSON body size |
| `CORS_ALLOWED_ORIGINS` | — | Comma-separated origin allow-list |
| `CORS_ALLOW_LOCALHOST` | `false` when `NODE_ENV` is `production` or unset; `true` otherwise | Allow localhost/loopback browser origins when no allow-list is set |
| `DISCOVER_IFACE` | auto | Network interface for mDNS (e.g., `en0`, `eth0`) |
| `DISCOVERY_SCAN_ENABLED` | `true` | Enable periodic background discovery |
| `NOTES_FILE` | `/app/data/notes.json` | Device notes JSON storage path |
| `CATEGORIES_FILE` | `/app/data/categories.json` | Device category overrides JSON storage path |
| `STORE_REFRESH_INTERVAL_MS` | `30000` | JSON store refresh interval |

## Multi-User Auth & Sessions

| Variable | Default | Description |
|----------|---------|-------------|
| `AUTH_ENABLED` | `true` | Set `false` to disable the session/user system and revert to the legacy API_TOKEN-only gate. See [Accounts & Users](accounts.md). |
| `SESSION_COOKIE_SECURE` | `false` | Set `true` on HTTPS deployments so the `hc_session` cookie is only sent over encrypted connections. **Warning:** setting this to `true` on plain HTTP (including behind a reverse proxy terminating TLS at a different host) will cause a login loop. Leave `false` for home LAN HTTP. |
| `SESSION_MAX_AGE_DEFAULT` | `604800000` | Session lifetime in milliseconds when "remember me" is not checked (default 7 days). |
| `SESSION_MAX_AGE_REMEMBER` | `2592000000` | Session lifetime in milliseconds when "remember me" is checked (default 30 days). |
| `TRUST_PROXY` | unset in the listener; the stock `docker-compose.yml` sets `1` | Express trust-proxy setting: the **number of proxies** between the client and the listener that append to `X-Forwarded-For`. Set `1` for the bundled nginx alone (the stock compose topology). Set `2` when a TLS terminator (Traefik, Caddy, Cloudflare Tunnel, another nginx) sits in front of the bundled nginx — nginx always appends its own hop, so the terminator makes it two. Too **low** keys every rate limiter on the proxy's own address, collapsing the whole household into one bucket (10 failed logins from anyone locks everyone out); too **high** walks past the real client into attacker-controlled header territory. Accepts a hop count (e.g. `1`, `2`), `true`/`false`, or a subnet. |
| `ARGON2_MEMORY_COST` | `19456` | argon2id memory cost in KiB (19 MiB). Accepted range `8192`–`1048576`; out-of-range values fall back to the default. |
| `ARGON2_TIME_COST` | `2` | argon2id iteration count. Accepted range `1`–`10`. |
| `AUTH_RATE_LIMIT_WINDOW_MS` | `900000` | Auth rate limit window (15 min). Applies to login and claim-admin endpoints. |
| `AUTH_RATE_LIMIT_MAX` | `10` | Max auth attempts per window per client IP. |

## Email (SMTP)

All SMTP variables are optional. If `SMTP_HOST` or `SMTP_PASS` is not set, email features are disabled and the listener boots normally. See [Email (SMTP)](email.md).

| Variable | Default | Description |
|----------|---------|-------------|
| `SMTP_HOST` | — | SMTP server hostname. |
| `SMTP_PORT` | `587` | SMTP port. Use `587` for STARTTLS (default) or `465` for implicit TLS. |
| `SMTP_USER` | — | SMTP account username. |
| `SMTP_PASS` | — | SMTP password or app-password. Stored in `smtp-secret.json` (0600); never returned by any API. Overrides the UI-saved secret. |
| `SMTP_FROM` | — | From header for outbound emails (e.g. `HomeChronicle <noreply@yourdomain>`). |
| `SMTP_SECURE` | unset | Implicit TLS. When unset, the value saved in Settings is used; if none was saved, it is on when the port is `465` and off otherwise. |
| `SMTP_REQUIRE_TLS` | `true` | Require STARTTLS on non-TLS ports instead of silently falling back to plaintext. Set `false` only for a local relay that does not support STARTTLS. |
| `SMTP_CONFIG_FILE` | `/app/data/smtp-config.json` | Where SMTP settings saved from the UI are stored. |
| `SMTP_SECRET_FILE` | `/app/data/smtp-secret.json` | Where the SMTP password saved from the UI is stored (mode 0600). |
| `APP_BASE_URL` | — | Public base URL of this instance. Required to build invite and password-reset links. Must include scheme and host, no trailing slash (e.g. `https://home.example.net`). |

## Rate Limits

| Variable | Default | Description |
|---|---|---|
| `API_WRITE_RATE_LIMIT_WINDOW_MS` | `60000` | Write route rate limit window |
| `API_WRITE_RATE_LIMIT_MAX` | `60` | Max write requests per window |
| `API_STATS_RATE_LIMIT_WINDOW_MS` | `60000` | Stats/accessories rate limit window |
| `API_STATS_RATE_LIMIT_MAX` | `120` | Max stats requests per window |
| `EVENTS_RATE_LIMIT_WINDOW_MS` | `60000` | Events rate limit window |
| `EVENTS_RATE_LIMIT_MAX` | `300` | Max events requests per window |
| `EVENTS_EXPORT_RATE_LIMIT_MAX` | `10` | Max event exports (`GET /api/events/export`) per events window |
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
| `ARCHIVE_MAX_EXPORT_ROWS` | `500000` | Max rows returned by an archive export (`GET /api/archive/export`), 1000–10000000 |
| `EVENTS_MAX_EXPORT_ROWS` | `500000` | Max rows in a Timeline export (`GET /api/events/export`), 1000–10000000 |

## Alerts / Subscriber

| Variable | Default | Description |
|---|---|---|
| `ALERTS_WEBHOOK_TIMEOUT_MS` | — | Webhook delivery timeout in ms. When set, it overrides the timeout saved in Settings and locks that field; unset, the Settings value (default 5000) applies |
| `ALERTS_ALLOW_PRIVATE_TARGETS` | `true` | Allow RFC1918 webhook targets (set `false` to block private IPs) |
| `ALERTS_MAX_RULES_PER_USER` | `25` | Max alert rules one user can own. Creating another returns 400. |
| `ALERTS_MAX_RULES_TOTAL` | `100` | Max alert rules across the whole household. Creating another returns 400, even for a user under their own limit. |
| `ALERTS_FANOUT_CONCURRENCY` | `4` | Max deliveries sent at once for one event (1–32). |
| `ALERTS_MAX_INFLIGHT` | `50` | Max deliveries in flight across all events (1–1000). Rules beyond this are skipped with a log warning. |
| `ALERTS_FAILURE_BACKOFF_MS` | `60000` | Minimum wait after a failed delivery before the same rule is tried again, even when its quiet period is 0. |
| `ALERTS_SETTINGS_FILE` | `/app/data/alerts-settings.json` | Alert settings JSON storage path |
| `RECONNECT_BASE_MS` | `5000` | Initial reconnect delay |
| `RECONNECT_MAX_MS` | `60000` | Max reconnect delay |
| `HAP_REQUEST_TIMEOUT_MS` | `30000` | Upper bound for a single HomeKit request (1000–300000). On expiry the connection is dropped and the normal reconnect path takes over. Also bounds the metadata fetch behind Devices › Browse. |
| `HAP_PAIR_TIMEOUT_MS` | `60000` | Upper bound for a HomeKit pair-setup during auto or scheduled repair (1000–300000). |
| `HAP_UNREACHABLE_RETRY_MS` | `600000` | How often to retry a paired HomeKit device that has failed to connect 5 times in a row while discovery can't find it on the network at all (60000–86400000). Before that it is retried with the normal backoff. The listener logs one line when a device becomes unreachable and one when it is back, and Devices › Manage Accessories shows it as **Not on network**. |

## Matter

| Variable | Default | Description |
|---|---|---|
| `MATTER_SUBSCRIBE_ENABLED` | `true` | Use native Matter subscriptions, so devices report changes as they happen. Set `false` to go back to polling. |
| `MATTER_RECONCILE_INTERVAL_MS` | `300000` | With subscriptions on, how often every attribute is re-read as a safety net in case a subscription quietly stops (default 5 min). Values below `30000` fall back to `30000`. |
| `MATTER_POLL_INTERVAL_MS` | `5000` | Polling interval. Only used when `MATTER_SUBSCRIBE_ENABLED=false`. Values below `1000` fall back to `30000`. After 10 consecutive errors a node is polled less often (backing off up to 10 min), but polling never stops. |
| `MATTER_SUBSCRIBE_RESTART_DELAY_MS` | `2000` | Starting delay before re-establishing a failed subscription. Doubles on each consecutive failure, capped at 5 min. Values below `250` fall back to `2000`. |
| `MATTER_SUBSCRIBE_MIN_INTERVAL_SEC` | `1` | Min subscription report interval |
| `MATTER_SUBSCRIBE_MAX_INTERVAL_SEC` | `30` | Max subscription report interval |
| `MATTER_STORAGE_PATH` | `/app/data/matter-storage` | Matter.js controller state directory |
| `MATTER_SCAN_TIMEOUT_MS` | `15000` | Discovery scan timeout |
| `MATTER_LOG_LEVEL` | `info` | matter.js SDK log verbosity, separate from `LOG_LEVEL`: `debug`, `info`, `notice`, `warn`, `error`, `fatal` |
| `MATTER_LOG_FORMAT` | `plain` | matter.js log format: `plain`, `ansi`, `html` |

## Update Check

The listener checks the project's GitHub releases, falling back to its GitLab releases, so **Settings › About** can show whether a newer version exists. Your browser never contacts a third-party site; it asks the listener (`GET /api/updates/latest`).

| Variable | Default | Description |
|---|---|---|
| `UPDATE_CHECK_ENABLED` | `true` | Set `false` to turn off the outbound check entirely. |
| `UPDATE_CHECK_URL` | *(unset: GitHub, then GitLab)* | A single releases API to query instead, with no fallback. GitHub and GitLab release JSON are both understood. A successful result is cached for 12 hours, a failure for 15 minutes; each request times out after 8 seconds. |

## API Authentication

**Login on (`AUTH_ENABLED=true`, the default):**

- Every route except the public sign-in routes, `/api/health` and `/api/updates/latest` needs a session cookie or `API_TOKEN` — including GETs
- `API_TOKEN` is optional; set it if scripts or integrations need to call the API without a session
- `API_TOKEN_READS_ENABLED` has no effect

**Login off (`AUTH_ENABLED=false`):**

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
| `REPAIR_HOUR` | `3` | Hour of day (0–23, UTC) when the daily HomeKit pairing repair cycle runs. Only the initial default; once set in Settings, the saved hour wins |
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

These are read by Vite at dev-server or build time, not by the running containers, and cannot be overridden with a `.env` file after the image is built. A production build always calls the API at the relative path `/api`, through the web container's proxy.

| Variable | Default | Description |
|---|---|---|
| `VITE_API_BASE_URL` | `http://localhost:3001` | Target of the Vite dev server's `/api` proxy (`npm run dev`). Not used by production builds. |
| `VITE_API_TOKEN` | — | Token the dev server adds to proxied `/api` requests during local development. Ignored by production builds. |
| `VITE_BUILD_VERSION` | git short hash | Version string injected into the build (the web Docker image passes a tag, default `unknown`) |

## Config File Format

Runtime configuration is split between environment variables (above) and JSON files persisted to disk by the listener. The JSON files are managed automatically — you do not edit them directly.

**JSON store files** (location controlled by the store path variables above):

| File | Contents |
|---|---|
| `pairings.json` | Keyed by device ID; each entry holds the HAP pairing credentials |
| `rooms.json` | Map of accessory ID to room name string |
| `display-names.json` | Map of accessory ID to user-assigned display name |
| `notes.json` | Map of accessory ID to free-text note |
| `categories.json` | Map of accessory ID to device category override |
| `retention.json` | Persisted overrides for retention days, archive flag, and stale threshold |
| `repair.json` | Last repair cycle result and next scheduled time |
| `matter-storage/` | Directory; Matter.js controller state (fabric, session, and node data) |

All JSON files are written atomically (write to a temp file then rename) by `JsonObjectStore` in `listener/src/store.js`.

## Per-Environment Overrides

HomeChronicle does not use `.env.development` / `.env.production` layering. All configuration comes from a single `.env` file (or Docker environment variables). Use `NODE_ENV` to switch between development and production behavior:

- `NODE_ENV=production` (default in Docker): requires `API_TOKEN` when `AUTH_ENABLED=false`, blocks localhost CORS origins by default, uses `/app/data/` paths for JSON stores
- `NODE_ENV=development`: skips `API_TOKEN` enforcement, allows localhost CORS origins, uses `./data/` paths relative to the listener working directory

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
```
