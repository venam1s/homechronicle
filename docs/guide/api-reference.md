# API Reference

Base URL: `http://<listener-host>:<API_PORT>` (default port 3001), or through the web proxy at `http://<web-host>:<WEB_PORT>/api`.

All request and response bodies are JSON. Errors come back as `{ "error": "<message>" }` with a 4xx or 5xx status.

## Authentication

How a request is authorized depends on `AUTH_ENABLED` (default `true`).

### With sign-in enabled (`AUTH_ENABLED=true`)

Every route needs credentials **except** these public ones:

| Public route | Purpose |
|--------------|---------|
| `GET /api/health` | Liveness check |
| `GET /api/updates/latest` | Published release tags |
| `GET /api/auth/csrf-token` | Fetch a CSRF token |
| `GET /api/auth/user-count` | Whether an admin has been claimed yet |
| `GET /api/auth/config` | Whether sign-in is enabled |
| `GET /api/auth/invite-status` | Check an invite link before accepting it |
| `POST /api/auth/login` | Sign in |
| `POST /api/auth/claim-admin` | Create the first admin account |
| `POST /api/auth/accept-invite` | Create an account from an invite |
| `POST /api/auth/forgot-password` | Request a password-reset email |
| `POST /api/auth/reset-confirm` | Set a new password from a reset link |

Everything else — including `GET` routes — needs one of:

- **A session cookie** (`hc_session`), set by `login`, `claim-admin` or `accept-invite`. This is what the web UI uses.
- **The service token** (`API_TOKEN`), sent as a header:

  ```
  X-API-Token: <token>
  ```

  or:

  ```
  Authorization: Bearer <token>
  ```

Requests without either get `401 { "error": "Unauthorized" }`. `API_TOKEN_READS_ENABLED` has no effect in this mode.

**CSRF:** when you authenticate with a session cookie, every `POST`, `PUT`, `PATCH` and `DELETE` must also carry an `X-CSRF-Token` header. Get the token from `GET /api/auth/csrf-token` (sent with your cookie). A missing or wrong token returns `403 { "error": "Invalid or missing CSRF token" }`. Requests authenticated with the service token skip the CSRF check.

**Roles:** routes marked *Admin only* below return `403 Forbidden` to a signed-in member. A service-token caller is treated as admin on those routes. A few routes act on "you" and need a real session — the service token is rejected there (noted per route).

### With sign-in disabled (`AUTH_ENABLED=false`)

The older token-only behaviour:

- If `API_TOKEN` is empty, every route is open.
- If `API_TOKEN` is set, write routes (`POST`, `PUT`, `PATCH`, `DELETE`) need the token (header as above). Read routes (`GET`) are open unless `API_TOKEN_READS_ENABLED=true`, which makes them need the token too.

No CSRF token is needed in this mode.

```bash
curl http://localhost:3001/api/events?limit=10 \
  -H "X-API-Token: <token>"
```

---

## Health

### `GET /api/health`

Public. Returns `200` when healthy, `503` when not.

**Response:**
```json
{
  "status": "ok",
  "db": "ok",
  "subscribers": {
    "total": 12,
    "connected": 11,
    "idle": 1,
    "stale": 0,
    "unreachable": 1,
    "needsRepair": 0,
    "lastConnectedAt": "2026-11-08T08:00:00.000Z"
  },
  "paired": 12,
  "matter": {
    "commissionConfigured": true,
    "pollingConfigured": true,
    "activeNodes": 2
  }
}
```

| Field | Description |
|-------|-------------|
| `status` | `ok` or `unhealthy` |
| `db` | `ok` or `unreachable` |
| `subscribers` | HomeKit subscription counts. `connected` devices have an open subscription and a sign of life in the last 30 minutes (quiet devices are asked for their name after 10 minutes). `idle` is the subset of connected devices with nothing to watch. `stale` counts devices not connected for more than 10 minutes. `unreachable` counts devices that failed five times in a row while absent from the network and are retried every `HAP_UNREACHABLE_RETRY_MS`. See [Connection status](devices.md#connection-status) |
| `paired` | Number of entries in `pairings.json` (HomeKit and Matter) |
| `matter` | Matter runtime summary, or `null` when the Matter runtime is not running |

The status is `unhealthy` when the database is unreachable, or when there are HomeKit pairings but none are connected and none has connected in the last 2 minutes.

---

## Updates

### `GET /api/updates/latest`

Public. Recent releases of HomeChronicle, newest first, fetched by the listener from the project's GitHub and GitLab releases and merged (a tag on both appears once). The listener caches the result for 12 hours (15 minutes after a failed fetch), so calling this does not reach out each time.

**Response:**
```json
{
  "enabled": true,
  "releases": [
    {
      "tag": "v0.4.0",
      "url": "https://gitlab.com/havuq/homechronicle/-/releases/v0.4.0",
      "prerelease": false,
      "publishedAt": "2026-10-11T00:00:00.000Z"
    }
  ],
  "checkedAt": "2026-10-11T09:00:00.000Z",
  "upstreamOk": true,
  "sources": ["github", "gitlab"]
}
```

`prerelease` is `true` for tags containing `-alpha`, `-beta` or `-rc`. `sources` lists the hosts that answered: `github`, `gitlab`, or `custom` for an `UPDATE_CHECK_URL` on another host. Releases are sorted by version, newest first. If either host answers, `upstreamOk` is `true`; when neither can be reached, `releases` and `sources` are empty and `upstreamOk` is `false`. With `UPDATE_CHECK_ENABLED=false` the response is `{ "enabled": false, "releases": [] }` and no outbound request is made. `UPDATE_CHECK_URL` points the check at a single different releases URL, with no fallback.

---

## Auth

All routes are under `/api/auth`. The ones listed as public in [Authentication](#authentication) work without a session; the rest need one.

### `GET /api/auth/config`

Public. `{ "authEnabled": true }`.

### `GET /api/auth/user-count`

Public. `{ "count": 3 }` — `0` means no admin has been claimed yet.

### `GET /api/auth/csrf-token`

Public. Returns `{ "csrfToken": "<64 hex chars>" }`. Send it with your session cookie so the token is bound to your session. Add `?refresh=1` to force a new token.

### `POST /api/auth/claim-admin`

Public. Creates the first admin account and signs it in. Only works while there are no users; afterwards it returns `409 { "error": "Admin account already exists" }`.

**Body:**
```json
{ "email": "you@example.com", "password": "<at least 12 characters>" }
```

**Response:** `{ "user": { "id": "1", "email": "you@example.com", "role": "admin" } }` plus an `hc_session` cookie.

### `POST /api/auth/login`

Public.

**Body:**
```json
{ "email": "you@example.com", "password": "<password>", "rememberMe": true }
```

**Response:** `{ "user": { "id": "1", "email": "you@example.com", "role": "admin" } }` plus an `hc_session` cookie (HttpOnly, SameSite=Lax; `Secure` when `SESSION_COOKIE_SECURE=true`). Sessions last 7 days, or 30 days with `rememberMe` (`SESSION_MAX_AGE_DEFAULT` / `SESSION_MAX_AGE_REMEMBER`, in milliseconds).

A wrong password, unknown email or disabled account all return `401 { "error": "Invalid credentials" }`.

```bash
curl -c cookies.txt -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "you@example.com", "password": "<password>"}'
```

### `GET /api/auth/invite-status?token=<token>`

Public. Returns `{ "valid": true }`, or `{ "valid": false, "reason": "invalid" | "revoked" | "used" | "expired" }`.

### `POST /api/auth/accept-invite`

Public. Creates the invited account and signs it in. The invite link can only be used once.

**Body:** `{ "token": "<invite token>", "password": "<password>" }`

**Response:** `{ "ok": true, "user": { "email": "...", "role": "member" } }` plus an `hc_session` cookie. An invalid, used or expired invite returns `400`.

### `POST /api/auth/forgot-password`

Public. **Body:** `{ "email": "you@example.com" }`. Always returns `{ "message": "If that address is registered, a reset link has been sent." }`, whether or not the address exists. Reset links expire after 1 hour.

### `POST /api/auth/reset-confirm`

Public. **Body:** `{ "token": "<reset token>", "password": "<new password>" }`. Sets the new password, cancels any other outstanding reset links for the account, and signs the account out everywhere. Returns `{ "ok": true }`, or `400` if the link has expired or was already used.

### `GET /api/auth/me`

Session required. `{ "user": { "id": "1", "role": "admin", "email": "you@example.com" } }`, or `401` without a session.

### `DELETE /api/auth/logout`

Ends the current session and clears the cookie. `{ "ok": true }`.

### `PATCH /api/auth/password`

Session required. **Body:** `{ "currentPassword": "...", "newPassword": "..." }`. On success every session for the account is revoked, including the current one, so you have to sign in again. A wrong current password returns `400 { "error": "Current password is incorrect." }`.

### `GET /api/auth/sessions`

Session required. Your own active sessions:

```json
{
  "sessions": [
    {
      "id": "42",
      "created_at": "2026-10-01T12:00:00.000Z",
      "last_seen_at": "2026-10-11T08:00:00.000Z",
      "expires_at": "2026-10-31T12:00:00.000Z",
      "user_agent": "Mozilla/5.0 ...",
      "ip_address": "192.168.1.20",
      "current": true
    }
  ]
}
```

### `DELETE /api/auth/sessions/:id`

Session required. Revokes one of your own sessions. Returns `404` for a session that isn't yours.

**Password rules** (claim-admin, accept-invite, reset-confirm, change password): at least 12 characters and not a common password.

---

## Users

Admin only, and a signed-in admin session is required — the service token gets `401`. All routes are under `/api/users`.

### `GET /api/users`

```json
[
  { "id": "1", "email": "you@example.com", "role": "admin", "status": "active" }
]
```

`status` is `active` or `disabled`.

### `GET /api/users/invites`

Invites with `id`, `email`, `role`, `status` and `expiresAt`.

### `POST /api/users/invite`

**Body:** `{ "email": "member@example.com", "role": "member" }` (`role` is `admin` or `member`, default `member`).

**Response:**
```json
{ "inviteUrl": "https://<APP_BASE_URL>/accept-invite?token=...", "emailed": true, "email": "member@example.com" }
```

The link is always returned so you can share it yourself; `emailed` says whether the invite email was sent (it needs SMTP). Invites expire after 72 hours. Inviting an address that already has an account or a pending invite returns `400`.

### `POST /api/users/invites/:id/resend`

Replaces the invite with a fresh link and a new 72-hour expiry, and emails it again. Same response as `POST /api/users/invite`.

### `DELETE /api/users/invites/:id`

Revokes a pending invite.

### `PATCH /api/users/:id`

**Body** — one of:

```json
{ "action": "disable" }
{ "action": "enable" }
{ "action": "setRole", "role": "admin" }
```

Disabling a user also signs them out everywhere. You can't disable yourself, and the last active admin can't be disabled or demoted (`400`).

### `DELETE /api/users/:id`

Removes a user. You can't remove yourself, and the last active admin can't be removed.

---

## Me

Your own per-user preferences (theme, palette, dashboard layout and so on). A signed-in session is required — the service token gets `401`.

### `GET /api/me/preferences`

`{ "prefs": { ... } }` — an empty object if nothing has been saved yet.

### `PUT /api/me/preferences`

**Body:** `{ "prefs": { "theme": "dark", "palette": "tide" } }`

The keys you send are merged into what is stored (a shallow merge: each top-level key you send replaces that key; keys you don't send are kept; keys can't be removed). The response is the full stored object, `{ "prefs": { ... } }`. `prefs` must be a JSON object, and the stored result must stay under 256 KB, otherwise you get `400`.

---

## Events

### `GET /api/events`

Fetch events with pagination and filtering, newest first.

**Query Parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `page` | integer | `1` | Page number |
| `limit` | integer | `50` | Results per page (1-200) |
| `room` | string | — | Filter by room (exact match) |
| `accessory` | string | — | Filter by accessory name (partial, case-insensitive) |
| `characteristic` | string | — | Filter by characteristic (exact match) |
| `from` | ISO 8601 | — | Start of date range |
| `to` | ISO 8601 | — | End of date range |

**Response:**
```json
{
  "total": 5432,
  "page": 1,
  "limit": 50,
  "pages": 109,
  "estimated": false,
  "events": [
    {
      "id": 5432,
      "timestamp": "2026-10-11T14:30:00.000Z",
      "accessory_id": "AA:BB:CC:DD:EE:FF",
      "accessory_name": "Living Room Light",
      "room_name": "Living Room",
      "service_type": "Lightbulb",
      "characteristic": "On",
      "old_value": "false",
      "new_value": "true",
      "protocol": "homekit",
      "transport": "ip",
      "endpoint_id": null,
      "cluster_id": null,
      "attribute_id": null,
      "raw_iid": 10
    }
  ]
}
```

With no filters, `total` comes from PostgreSQL's table statistics instead of a full count and `estimated` is `true`, which keeps the request fast on large tables. With any filter, `total` is exact and `estimated` is `false`.

### `GET /api/events/export`

Download every event matching the same filters as `GET /api/events` (`room`, `accessory`, `characteristic`, `from`, `to`), oldest first, streamed as a file.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `format` | `csv` \| `json` | `csv` | CSV with a header row (UTF-8 with BOM), or a JSON array of event objects |
| `unit` | `c` \| `f` | `c` | With `f`, `old_value` and `new_value` of `CurrentTemperature`, `TargetTemperature`, `HeatingThresholdTemperature` and `CoolingThresholdTemperature` rows are converted to Fahrenheit (one decimal, plain numbers). Other rows are untouched. The web UI sends the signed-in user's unit. |

Columns / fields: `id`, `timestamp`, `accessory_id`, `accessory_name`, `room_name`, `service_type`, `characteristic`, `old_value`, `new_value`, `protocol`, `transport`, `endpoint_id`, `cluster_id`, `attribute_id`, `raw_iid`. `room_name` reflects current room assignments.

Response headers: `X-Export-Total` (events matching the filters), `X-Export-Rows` (events in the file) and, when the match exceeds `EVENTS_MAX_EXPORT_ROWS` (default 500,000), `X-Export-Truncated: true` — the file then holds the oldest rows. Rate limited separately (`EVENTS_EXPORT_RATE_LIMIT_MAX`, default 10 per events window).

```bash
curl -o events.csv "http://localhost:3001/api/events/export?format=csv&room=Kitchen" \
  -H "x-api-token: $API_TOKEN"
```

### `GET /api/events/jump`

Find the page containing the most recent event for an accessory in a given hour. Useful for timeline navigation.

**Query Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `accessory` | string | Accessory name (required) |
| `hour` | integer | Hour of day, 0-23, in UTC (required) |
| `limit` | integer | Page size (must match your events query, default 50) |
| `room` | string | Room filter |
| `from` | ISO 8601 | Start of date range |
| `to` | ISO 8601 | End of date range |

**Response:**
```json
{
  "page": 3,
  "eventId": "1234"
}
```

Both fields are `null` when no event matches.

---

## Accessories

### `GET /api/accessories`

List all accessories with metadata and health status.

**Response:**
```json
[
  {
    "accessory_id": "AA:BB:CC:DD:EE:FF",
    "accessory_name": "Living Room Light",
    "room_name": "Living Room",
    "service_type": "Lightbulb",
    "protocol": "homekit",
    "last_seen": "2026-10-11T14:30:00.000Z",
    "event_count": 1234,
    "address": "192.168.1.50",
    "paired_at": "2026-01-01T00:00:00.000Z",
    "manufacturer": "Philips",
    "model": "Hue",
    "reliability": {
      "connect_attempts": 5,
      "disconnects": 1,
      "last_connected_at": "2026-10-11T14:00:00.000Z"
    },
    "health": {
      "status": "ok",
      "lastSeen": "2026-10-11T14:30:00.000Z",
      "heartbeatSeconds": 300,
      "heartbeatHealthy": true
    }
  }
]
```

Health status values: `ok`, `unknown`, `stale`, `unreachable`.

The response is sent straight away from cached device metadata. Metadata for a bridge that hasn't been read yet is fetched in the background (bounded by `HAP_REQUEST_TIMEOUT_MS`), so an unreachable bridge doesn't hold up the list.

### `GET /api/accessories/:accessoryId/detail`

Detailed view for a single accessory including activity history.

**Query Parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `days` | integer | `30` | Activity window (7-365) |
| `page` | integer | `1` | Event history page |
| `limit` | integer | `100` | Events per page (1-500) |

**Response includes:** accessory metadata, uptime stats, current state per characteristic, daily activity counts, and paginated event history.

### `GET /api/accessories/:accessoryId/capabilities`

Query the device for its services and characteristics (HomeKit only).

---

## Accessory Analytics

Additional per-accessory endpoints beyond the core detail view.

### `GET /api/accessories/:accessoryId/characteristics/:characteristic/trend`

Time-series data for a single characteristic's value over time. Useful for numeric sensors (temperature, brightness level).

**Query Parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `days` | integer | `30` | Lookback window (1-365) |

**Response:**
```json
{
  "points": [
    { "timestamp": "2026-10-11T08:00:00.000Z", "new_value": "21.5" },
    { "timestamp": "2026-10-11T09:00:00.000Z", "new_value": "22.1" }
  ]
}
```

Maximum 2000 points returned, ordered oldest-first.

### `GET /api/accessories/:accessoryId/heatmap`

Event counts broken down by day-of-week and hour for a single accessory.

**Query Parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `days` | integer | `90` | Lookback window (7-365) |

**Response:**
```json
{
  "days": 90,
  "cells": [
    { "dow": 0, "hour": 8, "count": 12 },
    { "dow": 1, "hour": 14, "count": 7 }
  ]
}
```

`dow` follows PostgreSQL convention: 0 = Sunday, 6 = Saturday.

### `GET /api/accessories/:accessoryId/state-duration`

Time spent in each state per characteristic over the lookback window.

**Query Parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `days` | integer | `30` | Lookback window (1-365) |

**Response:**
```json
{
  "days": 30,
  "durations": [
    {
      "characteristic": "On",
      "new_value": "true",
      "duration_seconds": 72345.6
    },
    {
      "characteristic": "On",
      "new_value": "false",
      "duration_seconds": 2218054.4
    }
  ]
}
```

The final state in each window has its duration measured to the current time.

### `GET /api/accessories/:accessoryId/char-summary`

Statistical summary (min, max, average, distinct values) per characteristic over the lookback window.

**Query Parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `days` | integer | `30` | Lookback window (1-365) |

**Response:**
```json
{
  "days": 30,
  "characteristics": [
    {
      "characteristic": "CurrentTemperature",
      "change_count": 288,
      "min_val": 18.5,
      "max_val": 26.2,
      "avg_val": 21.8,
      "numeric_count": 288,
      "distinct_values": 47
    }
  ]
}
```

`min_val`, `max_val`, and `avg_val` are `null` for characteristics whose values are not numeric.

---

## Statistics

### `GET /api/stats/hourly`

Event counts by hour of day (last 30 days).

**Response:** `[{ "hour": 0, "count": 45 }, ...]`

### `GET /api/stats/daily`

Event counts by day.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `days` | integer | `30` | Number of days (7-365) |

**Response:** `[{ "day": "2026-10-11", "count": 234 }, ...]`

### `GET /api/stats/top-devices`

Top 10 most active accessories.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `days` | integer | `7` | Lookback window |

**Response:** `[{ "accessory_name": "Motion Sensor", "event_count": 567, "room_name": "Hallway" }, ...]`

### `GET /api/stats/rooms`

Event counts by room.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `days` | integer | `7` | Lookback window |

### `GET /api/stats/weekday`

Heatmap data: events by day-of-week and hour.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `days` | integer | `90` | Lookback window |

**Response:** `[{ "day_of_week": 1, "hour": 8, "count": 34 }, ...]`

### `GET /api/stats/heatmap`

Accessory-by-hour heatmap (last 7 days).

**Response:** `[{ "accessory_name": "Light", "hour": 14, "count": 12 }, ...]`

### `GET /api/stats/device-patterns`

Device activity patterns over 30 days.

### `GET /api/stats/anomalies`

Outlier detection using z-score analysis.

**Response:**
```json
{
  "generatedAt": "2026-10-11T14:30:00.000Z",
  "outlierCount": 3,
  "devices": [
    {
      "scope_name": "Motion Sensor",
      "hour": 3,
      "baseline_avg": 2.5,
      "baseline_std": 1.2,
      "event_count": 15,
      "zscore": 10.4
    }
  ],
  "rooms": []
}
```

### `GET /api/stats/quiet-hours`

Returns devices that fired events during the quiet-hours window in the last 24 hours. Returns `{ "enabled": false }` if quiet hours are off.

For a signed-in user who has saved their own quiet-hours settings, those are used. Otherwise (no saved settings, the service token, or `AUTH_ENABLED=false`) the shared settings from `/api/setup/retention` apply.

**Response (when enabled):**
```json
{
  "enabled": true,
  "quietHoursStart": 23,
  "quietHoursEnd": 6,
  "excludedAccessories": [],
  "events": [
    {
      "accessoryId": "AA:BB:CC:DD:EE:FF",
      "accessoryName": "Motion Sensor",
      "room": "Hallway",
      "count": 14,
      "lastSeenAt": "2026-10-11T04:12:00.000Z"
    }
  ]
}
```

`quietHoursStart` and `quietHoursEnd` are UTC hours. Up to 20 accessories are returned, sorted by event count descending. Excluded accessories are omitted.

### `GET /api/stats/sensor-environment`

Latest temperature and humidity per accessory over the last 7 days, for HomeKit and Matter sensors. Values are in °C and % (Matter readings are converted). Cached for 1 minute.

**Response:**
```json
[
  {
    "accessoryId": "AA:BB:CC:DD:EE:FF",
    "accessoryName": "Hallway Sensor",
    "roomName": "Hallway",
    "temperature": 21.5,
    "humidity": 48.2,
    "lastUpdated": "2026-10-11T14:25:00.000Z"
  }
]
```

`temperature` or `humidity` is `null` when the accessory doesn't report it.

### `GET /api/stats/battery-levels`

Latest `BatteryLevel` and `StatusLowBattery` per accessory over the last 30 days. Accessories flagged low come first, then lowest level first. Cached for 5 minutes.

**Response:**
```json
[
  {
    "accessoryId": "AA:BB:CC:DD:EE:FF",
    "accessoryName": "Front Door Sensor",
    "roomName": "Entry",
    "batteryLevel": 12,
    "lowBattery": true,
    "lastUpdated": "2026-10-11T06:00:00.000Z"
  }
]
```

### `GET /api/stats/retention-health`

Database and retention metrics. Cached for 5 minutes.

**Response:**
```json
{
  "totalRows": 1250000,
  "oldestEvent": "2025-10-12T00:00:00.000Z",
  "newestEvent": "2026-10-11T14:30:00.000Z",
  "avgEventsPerDay": 3400,
  "dbSizeBytes": 734003200,
  "tableSizeBytes": 612368384,
  "retentionDays": 365,
  "eventsPastRetention": 0,
  "archivedRows": 150432
}
```

`avgEventsPerDay` is averaged over the last 30 days. `eventsPastRetention` counts events older than the retention cutoff that the next sweep will remove. `archivedRows` is `null` if the archive table can't be read.

### `GET /api/stats/characteristic-breakdown`

Event counts per characteristic: the top 8, with the rest combined into an `Other` entry. Cached for 1 minute.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `days` | integer | `7` | Lookback window (1-90) |

**Response:** `[{ "characteristic": "MotionDetected", "count": 812 }, ..., { "characteristic": "Other", "count": 95 }]`

### `GET /api/stats/categories`

Events and devices per [device category](devices.md#device-categories) for the last `days`, with the same-length period before it. Each device is counted in one category: its override, or the category implied by every service type it reported. Categories with no devices in either period are left out; the rest are sorted by events. The event aggregate is cached for 1 minute; overrides apply immediately.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `days` | integer | `7` | Lookback window (1-90) |

**Response:**
```json
{
  "days": 7,
  "categories": [
    {
      "id": "security",
      "label": "Security",
      "events": 1204,
      "previousEvents": 1150,
      "devices": 6,
      "topDevices": [{ "accessoryId": "AA:BB:CC:DD:EE:FF:3", "name": "Hall Motion", "events": 512 }]
    }
  ]
}
```

`topDevices` holds up to three devices with events in the current period.

---

## Setup / Discovery

### `GET /api/setup/discovered`

Returns cached mDNS discovery results.

### `POST /api/setup/scan`

*Admin only.* Trigger a new network scan (~10s). Returns discovered accessories.

### `POST /api/setup/pair`

*Admin only.* Pair a HomeKit accessory.

**Body:**
```json
{
  "deviceId": "AA:BB:CC:DD:EE:FF",
  "pin": "111-22-333",
  "protocol": "homekit"
}
```

### `GET /api/setup/bridge-children/:deviceId`

List child accessories behind a bridge.

### `GET /api/setup/pairings`

List HomeKit pairings (`id`, `protocol`, `name`, `address`, `port`, `category`, `pairedAt`). Matter pairings are listed by [`GET /api/setup/matter/pairings`](#get-apisetupmatterpairings).

### `DELETE /api/setup/pairing/:deviceId`

*Admin only.* Remove a HomeKit pairing and stop its subscriber. Event history is kept.

### `PATCH /api/setup/room`

Assign a room to an accessory.

**Body:**
```json
{
  "accessoryId": "AA:BB:CC:DD:EE:FF",
  "roomName": "Living Room"
}
```

### `GET /api/setup/rooms`

Get all room assignments as `{ accessoryId: roomName }`.

### `PATCH /api/setup/display-name`

Set or clear a custom display name for an accessory. The name replaces the reported name everywhere — Timeline, dashboard, alerts, exports — and past events are renamed too (in the background; the request waits up to 10 seconds for it). Accessory-scoped alert rules and muted devices follow the new name. Clearing the name restores the reported name on past events as well.

**Body:**
```json
{
  "accessoryId": "AA:BB:CC:DD:EE:FF",
  "displayName": "Front Porch Light"
}
```

Send an empty or missing `displayName` to clear the override and revert to the device's reported name.

### `GET /api/setup/display-names`

Get all custom display name overrides as `{ accessoryId: displayName }`.

### `PATCH /api/setup/note`

Set or clear a note for an accessory.

**Body:**
```json
{
  "accessoryId": "AA:BB:CC:DD:EE:FF",
  "note": "Firmware updated 2026-01"
}
```

Send an empty or missing `note` to clear.

### `GET /api/setup/notes`

Get all device notes as `{ accessoryId: note }`.

### `PATCH /api/setup/category`

Set or clear a device's [category](devices.md#device-categories) override.

**Body:**
```json
{
  "accessoryId": "AA:BB:CC:DD:EE:FF:4",
  "category": "cleaning"
}
```

`category` is one of `security`, `safety`, `access`, `climate`, `lighting`, `power`, `cleaning`, `other`. Send an empty or missing `category` to go back to automatic. The detail endpoint (`GET /api/accessories/:id/detail`) reports `category`, `category_auto` and `category_override` for the device.

### `GET /api/setup/categories`

The category list (`[{ id, label }]`, in display order) and all overrides as `{ accessoryId: category }`:

```json
{ "categories": [{ "id": "security", "label": "Security" }, ...], "overrides": { "AA:BB:CC:DD:EE:FF:4": "cleaning" } }
```

### `POST /api/setup/repair/:deviceId`

*Admin only.* Re-pair a HomeKit accessory that has lost its connection credentials. Discovers the device on the network, runs the pairing setup flow, saves updated credentials, and restarts the subscriber.

**Path parameter:** `deviceId` — the accessory ID (MAC address format).

**Body (optional):**
```json
{
  "pin": "111-22-333"
}
```

If `pin` is omitted, the PIN stored at pairing time is used. Returns `400` if no PIN is available.

**Response (success):**
```json
{ "success": true, "name": "Living Room Light" }
```

**Response (failure):**
```json
{
  "error": "The PIN was rejected. Double-check the code on the device or in its admin interface.",
  "code": "WRONG_PIN",
  "guidance": "..."
}
```

Error codes: `NOT_FOUND`, `NOT_HOMEKIT`, `NO_PIN`, `NOT_FOUND_NETWORK`, `UNAVAILABLE`, `WRONG_PIN`, `MAX_PEERS`, `UNREACHABLE`, `UNKNOWN`.

### `POST /api/setup/add-pairing`

*Admin only.* Register this instance as an additional controller on HomeKit accessories, using another controller's `pairings.json` (the **Add as Controller** option on **Devices › Add Accessories**). The source pairings must have admin rights on the devices.

**Body:**
```json
{
  "sourcePairings": {
    "AA:BB:CC:DD:EE:FF": {
      "protocol": "homekit",
      "longTermData": { "...": "..." }
    }
  }
}
```

`sourcePairings` must be an object matching the structure of `pairings.json`. Only HomeKit entries with `longTermData` are processed; Matter entries are ignored.

**Response:**
```json
{
  "results": [
    { "deviceId": "AA:BB:CC:DD:EE:FF", "ok": true }
  ],
  "summary": { "total": 1, "succeeded": 1, "failed": 0 }
}
```

### `GET /api/setup/log-level`

Get the current log level.

### `PATCH /api/setup/log-level`

*Admin only.* Change log level at runtime (no restart needed).

**Body:**
```json
{
  "level": "debug"
}
```

---

## Retention Settings

### `GET /api/setup/retention`

Get retention, health, quiet-hours, timeline-grouping and toast settings.

### `PATCH /api/setup/retention`

*Admin only.* Update any of the fields below. All are optional.

| Field | Type | Default | Range / Values | Description |
|-------|------|---------|----------------|-------------|
| `retentionDays` | integer | 365 | 1–3650 | Days before events are archived or deleted |
| `archiveBeforeDelete` | boolean | true | — | Move events to the archive table instead of hard-deleting |
| `staleThresholdHours` | integer | 12 | 1–720 | Hours of silence before an accessory is marked stale |
| `autoScanHomeKit` | boolean | true | — | Run the hourly background HomeKit mDNS scan |
| `quietHoursEnabled` | boolean | false | — | Enable quiet-hours tracking |
| `quietHoursStart` | integer | 23 | 0–23 | UTC hour when quiet period begins |
| `quietHoursEnd` | integer | 6 | 0–23 | UTC hour when quiet period ends |
| `quietHoursExcludedAccessories` | string[] | [] | — | Accessory IDs exempt from quiet-hours reporting |
| `episodeWindowMinutes` | integer | 3 | 1–30 | Maximum gap between events to group into one episode |
| `sceneWindowSeconds` | integer | 5 | 1–30 | Maximum gap between events to group into a scene |
| `episodeMinEventCount` | integer | 3 | 1–20 | Minimum events required to form an episode |
| `toastsEnabled` | boolean | true | — | Show toast notifications in the UI |
| `liveEventToastsEnabled` | boolean | false | — | Show a toast when selected accessories change |
| `toastAccessories` | string[] | [] | — | Accessory IDs to show live toasts for |
| `toastPosition` | string | `bottom-right` | `bottom-right`, `top-right`, `bottom-left`, `top-left`, `bottom-center`, `top-center` | Toast notification position |
| `toastDuration` | integer | 3 | 2, 3, 5, 7 | Toast display duration in seconds |
| `toastMaxVisible` | integer | 3 | 1, 2, 3, 5 | Maximum simultaneously visible toasts |

These are the shared household settings. When sign-in is enabled, quiet hours, grouping and toast settings can also be saved per user (see [Me](#me)); the web UI uses those for signed-in users.

The response also includes a read-only `sweepMs` field: the configured interval between retention sweeps in milliseconds (`RETENTION_SWEEP_MS`).

---

## Scheduled Repair

### `GET /api/setup/repair`

Get scheduled repair settings.

**Response:**
```json
{
  "enabled": true,
  "hour": 3,
  "lastRunAt": "2026-10-11T03:00:12.000Z",
  "lastRunResult": { "attempted": 2, "repaired": 1, "failed": 1 }
}
```

### `PATCH /api/setup/repair`

*Admin only.* Update scheduled repair settings.

**Body (all fields optional):**
```json
{
  "enabled": true,
  "hour": 3
}
```

| Field | Type | Description |
|-------|------|-------------|
| `enabled` | boolean | Enable or disable the daily repair cycle |
| `hour` | integer | UTC hour (0–23) when the repair runs |

The hour is UTC whatever `TZ` the container runs in. The web UI shows it converted to your browser's local time.

---

## Alert Settings

Household-wide defaults for alert delivery. Alerts themselves are switched on and off per rule.

### `GET /api/setup/alerts`

```json
{ "defaultQuietMinutes": 0, "webhookTimeoutMs": 5000, "webhookTimeoutFromEnv": false }
```

`webhookTimeoutMs` is the timeout deliveries actually use. When `ALERTS_WEBHOOK_TIMEOUT_MS` is set on the listener it reports that value and `webhookTimeoutFromEnv` is `true`.

### `PATCH /api/setup/alerts`

*Admin only.*

| Field | Type | Range | Description |
|-------|------|-------|-------------|
| `defaultQuietMinutes` | integer | 0–10080 | Default quiet period for new rules |
| `webhookTimeoutMs` | integer | 1000–30000 | How long to wait for a webhook to respond. Returns `400` while `ALERTS_WEBHOOK_TIMEOUT_MS` is set |

Sending an `enabled` field returns `400 { "error": "Alerts are enabled per rule, not household-wide. Disable individual rules instead." }`. A body with no supported fields returns `400`.

---

## SMTP

Outbound email settings for invites, password resets and email alerts. Admin only, and a signed-in admin session is required — the service token gets `403`. See [Email (SMTP)](email.md).

### `GET /api/setup/smtp`

```json
{
  "host": "smtp.example.com",
  "port": 587,
  "user": "you@example.com",
  "from": "HomeChronicle <you@example.com>",
  "secure": false,
  "passwordConfigured": true,
  "envFields": ["host"]
}
```

The password is never returned. `envFields` lists fields set by environment variables, which take precedence over values saved here.

### `PUT /api/setup/smtp`

**Body (all fields optional):** `host`, `port` (1–65535), `user`, `from`, `secure`, `password`. Leave `password` out or empty to keep the stored one.

**Response:** `{ "ok": true, "emailEnabled": true }`. If the settings saved but the connection test failed, `emailEnabled` is `false` and a `warning` explains that email stays off until the settings are fixed.

### `POST /api/setup/smtp/test`

Sends a test email to the signed-in admin's address. Returns `{ "ok": true }`, `503` if email isn't configured, or `502` with the SMTP error if sending fails.

---

## Alerts

Alert rules belong to the user who created them. Each rule has its own `enabled` flag; there is no global switch.

A signed-in user sees and changes only their own rules and deliveries. Callers without a session (the service token, or `AUTH_ENABLED=false`) act as the household owner: they see every rule and delivery and can change any rule.

### `GET /api/alerts/rules`

Your rules, most recently updated first. Admins can add `?scope=all` to list every user's rules; those entries also carry `ownerUserId`, `ownerEmail` and `ownerDisabled`. Members get `403` for `?scope=all`.

`targetUrl` is never returned (webhook URLs often contain secrets). `targetEmail` is returned.

### `POST /api/alerts/rules`

Create an alert rule. Returns `201` with the created rule.

**Body:**
```json
{
  "name": "Front door opened",
  "scopeType": "accessory",
  "scopeValue": "Front Door Lock",
  "characteristic": "LockCurrentState",
  "operator": "equals",
  "matchValue": "0",
  "channel": "webhook",
  "targetUrl": "https://hooks.example.com/webhook",
  "quietMinutes": 5,
  "enabled": true
}
```

| Field | Type | Description |
|-------|------|-------------|
| `name` | string | Rule name (required, max 200 characters) |
| `scopeType` | enum | `all`, `room`, `accessory`, or `characteristic` (default `all`) |
| `scopeValue` | string | Value to match against (required unless `scopeType` is `all`, max 200) |
| `characteristic` | string | Optional characteristic filter (max 200) |
| `operator` | enum | `equals`, `not_equals`, `contains`, `above`, `below`, `silent_for` (default `equals`). `above`/`below` need a numeric `matchValue` and a characteristic (`characteristic`, or `scopeType: characteristic`), and fire when a reading crosses the threshold. `silent_for` takes a `matchValue` in hours (0.25–720) and fires when nothing in scope reports for that long. |
| `matchValue` | string | Value to match in `new_value` (required, max 200) |
| `channel` | enum | `webhook` (default) or `email` |
| `targetUrl` | string | Webhook URL (required for `webhook`) |
| `targetEmail` | string | Recipient (required for `email`) |
| `quietMinutes` | integer | Suppress re-firing for this many minutes (0-10080). If omitted, the household default from `GET /api/setup/alerts` is used |
| `enabled` | boolean | Whether the rule is active (default `true`) |

Notes:

- `targetUrl` is checked before saving: it must be `http` or `https`, and `localhost`, loopback, link-local, multicast and reserved addresses are refused. Private network addresses are allowed unless `ALERTS_ALLOW_PRIVATE_TARGETS=false`.
- The `email` channel needs working SMTP; otherwise the request returns `400`.
- Alert emails show temperature readings in the rule owner's unit (Settings › Appearance › Units); rules with no owner, and webhook payloads, stay in °C.
- For members, an email rule always goes to their own account address, whatever `targetEmail` says. Admins can set any recipient.
- Each user can have at most `ALERTS_MAX_RULES_PER_USER` rules (default 25) and the household at most `ALERTS_MAX_RULES_TOTAL` (default 100). Over either limit, the request returns `400`.
- Rules fire for HomeKit and Matter events alike.

### `PATCH /api/alerts/rules/:id`

Update a rule (partial update, any fields from create). Switching `channel` to `email` needs a `targetEmail`; switching to `webhook` clears it. Returns `404` for a rule you don't own.

### `DELETE /api/alerts/rules/:id`

Delete a rule. Associated deliveries are also deleted. Members can delete their own rules; admins can delete any rule.

### `GET /api/alerts/deliveries`

Delivery log for your rules, newest first.

**Query Parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `page` | integer | `1` | Page number |
| `limit` | integer | `50` | Results per page (1-200) |

**Response:**
```json
{
  "total": 100,
  "page": 1,
  "limit": 50,
  "pages": 2,
  "deliveries": [
    {
      "id": 1,
      "ruleId": 5,
      "ruleName": "Front door opened",
      "eventId": 1234,
      "status": "sent",
      "channel": "webhook",
      "recipient": null,
      "responseCode": 200,
      "error": null,
      "sentAt": "2026-10-11T14:30:00.000Z"
    }
  ]
}
```

Delivery status values: `sent`, `failed`, `suppressed`. `recipient` is the email address for email deliveries; webhook URLs are not included.

---

## Matter

### `GET /api/setup/matter/runtime`

Matter runtime status. Returns `503 { "error": "Matter runtime unavailable" }` when the Matter runtime isn't running.

**Response:**
```json
{
  "pollingConfigured": true,
  "commissionConfigured": true,
  "controllerReady": true,
  "missingConfig": [],
  "mode": "subscribe+reconcile",
  "subscriptionEnabled": true,
  "pollIntervalMs": 300000,
  "reconcileIntervalMs": 300000,
  "nodes": [
    {
      "nodeId": "0X1234ABCD5678EF01",
      "active": true,
      "pollingEnabled": true,
      "subscriptionActive": true,
      "lastPolledAt": "2026-10-11T14:25:00.000Z",
      "lastError": null,
      "lastErrorAt": null,
      "lastEventAt": "2026-10-11T14:29:41.000Z"
    }
  ]
}
```

| Field | Description |
|-------|-------------|
| `mode` | `subscribe+reconcile` (default) or `poll` when `MATTER_SUBSCRIBE_ENABLED=false` |
| `pollIntervalMs` | How often each node is read: the re-read interval (`MATTER_RECONCILE_INTERVAL_MS`) with subscriptions on, or `MATTER_POLL_INTERVAL_MS` in poll mode |
| `reconcileIntervalMs` | The background re-read interval, or `null` in poll mode |
| `nodes[].subscriptionActive` | Whether a live subscription is open for the node |
| `nodes[].lastPolledAt` | Last full read of the node |

### `GET /api/setup/matter/discovered`

Cached Matter device scan results.

### `POST /api/setup/matter/scan`

*Admin only.* Trigger Matter device discovery.

### `POST /api/setup/matter/pair`

*Admin only.* Commission and pair a Matter device.

**Body:**
```json
{
  "name": "My Device",
  "setupCode": "<setup-code>",
  "nodeId": null
}
```

If `setupCode` is provided, the device is commissioned first. `name` is required. Without a `setupCode`, `nodeId` is required.

### `POST /api/setup/matter/commission`

*Admin only.* Commission a Matter device without saving a pairing record. Use this when you want to run the commissioning flow on its own and capture the assigned `nodeId` before saving the pairing.

**Body:**
```json
{
  "setupCode": "MT:Y.K9042C00KA0648G00",
  "nodeId": null,
  "address": null,
  "port": null,
  "transport": null,
  "commissioningMethod": null
}
```

`setupCode` is required. All other fields are optional. `nodeId` may be provided to request a specific node ID; if omitted the Matter controller assigns one.

**Response:**
```json
{
  "success": true,
  "nodeId": "0X1234ABCD5678EF01"
}
```

Returns `503` if the Matter runtime is not running.

### `DELETE /api/setup/matter/pairing/:nodeId`

*Admin only.* Remove a Matter pairing, plus the room and note assignments for the node and its endpoints. The event history is kept. Returns `{ "success": true }`.

### `GET /api/setup/matter/pairings`

List Matter pairings (`id`, `protocol`, `nodeId`, `name`, `transport`, `address`, `port`, `pairedAt`, `commissionedAt`).

### `POST /api/matter/events`

Ingest one or more Matter attribute-change events from an external source (e.g., a standalone Matter controller). Events are validated, normalized, and written to `event_logs`. Up to 1000 events per request.

**Body:**
```json
{
  "events": [
    {
      "nodeId": "0X1234ABCD5678EF01",
      "accessoryId": "0X1234ABCD5678EF01:1",
      "accessoryName": "Smart Plug",
      "characteristic": "OnOff",
      "newValue": "true",
      "oldValue": "false",
      "endpointId": 1,
      "clusterId": 6,
      "attributeId": 0,
      "serviceType": "OnOff",
      "roomName": null,
      "transport": "ip"
    }
  ]
}
```

A single event may also be sent under the key `event` instead of `events`.

| Field | Required | Description |
|-------|----------|-------------|
| `nodeId` | Yes | Matter node ID (also accepted as `deviceId` or `pairingId`) |
| `newValue` | Yes | New attribute value |
| `characteristic` | One of | Characteristic name string, OR both `clusterId` + `attributeId` |
| `clusterId` + `attributeId` | One of | Used to derive a characteristic label if `characteristic` is absent |
| `accessoryId` | No | Defaults to `nodeId:endpointId` |
| `accessoryName` | No | Defaults to the paired device's name or `nodeId` |
| `endpointId` | No | Matter endpoint number |
| `oldValue` | No | Previous attribute value |
| `serviceType` / `deviceType` | No | Used as `service_type` in the event record |
| `roomName` | No | Falls back to the stored room assignment |
| `transport` | No | Falls back to the pairing's stored transport |

**Response:**
```json
{ "success": true, "inserted": 1 }
```

---

## Archive

Endpoints for the `event_logs_archive` table, which holds events moved out of the live table by the retention sweep when `archiveBeforeDelete=true`.

### `GET /api/archive/count`

Returns the number of rows currently in the archive table.

**Response:**
```json
{ "count": 150432 }
```

### `GET /api/archive/export`

Downloads the archive as a CSV file. Returns `404` if the archive is empty.

**Response headers:**
```
Content-Type: text/csv; charset=utf-8
Content-Disposition: attachment; filename="homechronicle-archive.csv"
```

CSV columns: `source_id`, `timestamp`, `accessory_id`, `accessory_name`, `room_name`, `service_type`, `characteristic`, `old_value`, `new_value`, `protocol`, `transport`, `endpoint_id`, `cluster_id`, `attribute_id`, `archived_at`.

Rows are streamed in batches of 5000, oldest first. The export stops after `ARCHIVE_MAX_EXPORT_ROWS` rows (default 500,000), so a larger archive is cut off at that point. There is no pagination.

---

## Data Management

### `DELETE /api/data/accessory`

*Admin only.* Delete all events for one accessory, along with its room, display name and note.

**Body:**
```json
{
  "accessoryId": "AA:BB:CC:DD:EE:FF"
}
```

**Response:** `{ "success": true, "deleted": 1234 }`

### `DELETE /api/data/all`

*Admin only.* Delete all events, room assignments, display names and notes. Pairings are kept.

**Body (required):**
```json
{ "confirm": "DELETE ALL" }
```

The request returns `400` if `confirm` is absent or not exactly `DELETE ALL`.

---

## Rate Limits

Limits are counted per client IP address. Behind a reverse proxy, set `TRUST_PROXY` to the number of proxies in front of the listener so the real client address is used (see [Environment Variables](environment-variables.md)). Over the limit, requests get `429`.

**Configurable** (window in milliseconds, then maximum requests per window):

| Endpoint group | Default | Environment variables |
|----------------|---------|-----------------------|
| Events (`/api/events*`) | 300 / 60 s | `EVENTS_RATE_LIMIT_WINDOW_MS`, `EVENTS_RATE_LIMIT_MAX` |
| Events export (`/api/events/export`) | 10 / 60 s | `EVENTS_RATE_LIMIT_WINDOW_MS`, `EVENTS_EXPORT_RATE_LIMIT_MAX` |
| Stats (`/api/stats/*`) and archive reads | 120 / 60 s | `API_STATS_RATE_LIMIT_WINDOW_MS`, `API_STATS_RATE_LIMIT_MAX` |
| Accessories (`/api/accessories*`) | 120 / 60 s | `ACCESSORIES_RATE_LIMIT_WINDOW_MS`, `ACCESSORIES_RATE_LIMIT_MAX` |
| Alerts reads | 180 / 60 s | `ALERTS_READ_RATE_LIMIT_WINDOW_MS`, `ALERTS_READ_RATE_LIMIT_MAX` |
| Alerts writes | 60 / 60 s | `ALERTS_WRITE_RATE_LIMIT_WINDOW_MS`, `ALERTS_WRITE_RATE_LIMIT_MAX` |
| Setup writes and data deletes | 60 / 60 s | `API_WRITE_RATE_LIMIT_WINDOW_MS`, `API_WRITE_RATE_LIMIT_MAX` |
| Sign-in routes (login, claim-admin, accept-invite, forgot-password, reset-confirm) | 10 / 15 min | `AUTH_RATE_LIMIT_WINDOW_MS`, `AUTH_RATE_LIMIT_MAX` |
| Change password | 10 / 15 min (separate count) | `AUTH_RATE_LIMIT_WINDOW_MS`, `AUTH_RATE_LIMIT_MAX` |

**Fixed:**

| Endpoint | Limit |
|----------|-------|
| `GET /api/health` | 120 / min |
| `GET /api/updates/latest` | 60 / min |
| `PATCH /api/setup/retention` | 20 / min |
| `PATCH /api/setup/repair` | 10 / min |
| `PATCH /api/setup/alerts` | 10 / min |
| `PUT /api/setup/smtp`, `POST /api/setup/smtp/test` | 20 / min |
| `/api/users` writes | 60 / min |
| Matter writes (scan, commission, pair, unpair, `/api/matter/events`) | 30 / min |
