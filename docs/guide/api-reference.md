# API Reference

Base URL: `http://<listener-host>:<API_PORT>` (default port 3001), or through the web proxy at `http://<web-host>:<WEB_PORT>/api`.

## Authentication

Write routes (`POST`, `PATCH`, `DELETE`) require an API token. Send it as a header:

```
X-API-Token: <token>
```

or:

```
Authorization: Bearer <token>
```

Read routes are open by default. Set `API_TOKEN_READS_ENABLED=true` to require auth for all routes.

---

## Health

### `GET /api/health`

No authentication required.

**Response:**
```json
{
  "status": "ok",
  "paired": 12,
  "matter": {
    "commissionConfigured": true,
    "pollingConfigured": true,
    "activeNodes": 2
  }
}
```

---

## Events

### `GET /api/events`

Fetch events with pagination and filtering.

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
  "events": [
    {
      "id": 5432,
      "timestamp": "2025-01-15T14:30:00.000Z",
      "accessory_id": "AA:BB:CC:DD:EE:FF",
      "accessory_name": "Living Room Light",
      "room_name": "Living Room",
      "service_type": "Lightbulb",
      "characteristic": "On",
      "old_value": "false",
      "new_value": "true",
      "protocol": "homekit",
      "transport": "ip",
      "raw_iid": 10
    }
  ]
}
```

### `GET /api/events/jump`

Find the page containing a specific hour's events. Useful for timeline navigation.

**Query Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `accessory` | string | Accessory name filter |
| `hour` | integer | Hour of day (0-23) |
| `limit` | integer | Page size (must match your events query) |
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
    "last_seen": "2025-01-15T14:30:00.000Z",
    "event_count": 1234,
    "address": "192.168.1.50",
    "paired_at": "2025-01-01T00:00:00.000Z",
    "manufacturer": "Philips",
    "model": "Hue",
    "reliability": {
      "connect_attempts": 5,
      "disconnects": 1,
      "last_connected_at": "2025-01-15T14:00:00.000Z"
    },
    "health": {
      "status": "ok",
      "lastSeen": "2025-01-15T14:30:00.000Z",
      "heartbeatSeconds": 300,
      "heartbeatHealthy": true
    }
  }
]
```

Health status values: `ok`, `unknown`, `stale`, `unreachable`.

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

## Statistics

### `GET /api/stats/hourly`

Event counts by hour of day (last 30 days).

**Response:** `[{ "hour": 0, "count": 45 }, ...]`

### `GET /api/stats/daily`

Event counts by day.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `days` | integer | `30` | Number of days |

**Response:** `[{ "day": "2025-01-15", "count": 234 }, ...]`

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
  "generatedAt": "2025-01-15T14:30:00.000Z",
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

---

## Setup / Discovery

### `GET /api/setup/discovered`

Returns cached mDNS discovery results.

### `POST /api/setup/scan`

Trigger a new network scan (~10s). Returns discovered accessories.

### `POST /api/setup/pair`

Pair a HomeKit accessory.

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

### `DELETE /api/setup/pairing/:deviceId`

Remove a pairing and stop its subscriber.

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

### `PATCH /api/setup/note`

Set or clear a note for an accessory.

**Body:**
```json
{
  "accessoryId": "AA:BB:CC:DD:EE:FF",
  "note": "Firmware updated 2025-01"
}
```

Send an empty or missing `note` to clear.

### `GET /api/setup/notes`

Get all device notes as `{ accessoryId: note }`.

### `GET /api/setup/pairings`

List all pairings (HomeKit and Matter).

### `GET /api/setup/retention`

Get retention and health settings.

### `PATCH /api/setup/retention`

Update retention settings.

**Body (all fields optional):**
```json
{
  "retentionDays": 365,
  "staleThresholdHours": 12,
  "archiveBeforeDelete": true,
  "autoScanHomeKit": true
}
```

### `GET /api/setup/repair`

Get scheduled repair settings.

**Response:**
```json
{
  "enabled": true,
  "hour": 3,
  "lastRunAt": "2026-04-03T03:00:12.000Z",
  "lastRunResult": { "attempted": 2, "repaired": 1, "failed": 1 }
}
```

The `hour` is in UTC (0–23). The web UI converts to local time for display.

### `PATCH /api/setup/repair`

Update scheduled repair settings.

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

---

### `GET /api/setup/log-level`

Get the current log level.

### `PATCH /api/setup/log-level`

Change log level at runtime (no restart needed).

**Body:**
```json
{
  "level": "debug"
}
```

---

## Alerts

Each alert rule carries its own `enabled` flag; there is no global switch.

### `GET /api/alerts/rules`

List all alert rules.

### `POST /api/alerts/rules`

Create an alert rule.

**Body:**
```json
{
  "name": "Front door opened",
  "scopeType": "accessory",
  "scopeValue": "Front Door Lock",
  "characteristic": "LockCurrentState",
  "operator": "equals",
  "matchValue": "0",
  "targetUrl": "https://hooks.example.com/webhook",
  "quietMinutes": 5,
  "enabled": true
}
```

| Field | Type | Description |
|-------|------|-------------|
| `name` | string | Rule name |
| `scopeType` | enum | `all`, `room`, `accessory`, or `characteristic` |
| `scopeValue` | string | Value to match against (not needed for `all`) |
| `characteristic` | string | Optional characteristic filter |
| `operator` | enum | `equals`, `not_equals`, `contains` |
| `matchValue` | string | Value to match in `new_value` |
| `targetUrl` | string | Webhook URL |
| `quietMinutes` | integer | Suppress re-firing for this many minutes (0-10080) |
| `enabled` | boolean | Whether the rule is active |

### `PATCH /api/alerts/rules/:id`

Update a rule (partial update, any fields from create).

### `DELETE /api/alerts/rules/:id`

Delete a rule. Associated deliveries are also deleted.

### `GET /api/alerts/deliveries`

Webhook delivery log.

**Query Parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `page` | integer | `1` | Page number |
| `limit` | integer | `50` | Results per page |

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
      "targetUrl": "https://hooks.example.com/webhook",
      "responseCode": 200,
      "error": null,
      "sentAt": "2025-01-15T14:30:00.000Z"
    }
  ]
}
```

Delivery status values: `sent`, `failed`, `suppressed`.

---

## Data Management

### `DELETE /api/data/accessory`

Delete all events for a specific accessory.

**Body:**
```json
{
  "accessoryId": "AA:BB:CC:DD:EE:FF"
}
```

### `DELETE /api/data/all`

Delete all events and room assignments.

---

## Matter

### `GET /api/setup/matter/runtime`

Matter runtime status and active nodes.

### `GET /api/setup/matter/discovered`

Cached Matter device scan results.

### `POST /api/setup/matter/scan`

Trigger Matter device discovery.

### `POST /api/setup/matter/pair`

Commission and pair a Matter device.

**Body:**
```json
{
  "name": "My Device",
  "setupCode": "<setup-code>",
  "nodeId": null
}
```

If `setupCode` is provided, the device is commissioned first. `name` is required.

### `DELETE /api/setup/matter/pairing/:nodeId`

Remove a Matter device pairing.

### `GET /api/setup/matter/pairings`

List all Matter pairings.

---

## Rate Limits

All limits are per-IP and configurable via environment variables.

| Endpoint Group | Default Limit |
|---------------|---------------|
| Events (`/api/events*`) | 300 req / 60s |
| Stats & Accessories | 120 req / 60s |
| Alerts read | 180 req / 60s |
| Write routes (POST/PATCH/DELETE) | 60 req / 60s |

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
    { "timestamp": "2025-01-15T08:00:00.000Z", "new_value": "21.5" },
    { "timestamp": "2025-01-15T09:00:00.000Z", "new_value": "22.1" }
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

## Archive

Endpoints for the `event_logs_archive` table, which holds events moved out of the live table by the retention sweep when `archiveBeforeDelete=true`.

### `GET /api/archive/count`

Returns the number of rows currently in the archive table.

**Response:**
```json
{ "count": 150432 }
```

### `GET /api/archive/export`

Downloads the full archive as a CSV file. Returns `404` if the archive is empty.

**Response headers:**
```
Content-Type: text/csv; charset=utf-8
Content-Disposition: attachment; filename="homechronicle-archive.csv"
```

CSV columns: `source_id`, `timestamp`, `accessory_id`, `accessory_name`, `room_name`, `service_type`, `characteristic`, `old_value`, `new_value`, `protocol`, `transport`, `endpoint_id`, `cluster_id`, `attribute_id`, `archived_at`.

Rows are streamed in batches of 5000, ordered by `timestamp ASC`. For large archives this endpoint may take several seconds. There is no pagination — the full archive is always returned as a single download.

---

## Setup / Device Management (additional endpoints)

### `POST /api/setup/repair/:deviceId`

Re-pair a HomeKit accessory that has lost its connection credentials. Discovers the device on the network, runs the pairing setup flow, saves updated credentials, and restarts the subscriber.

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

Import HomeKit pairings from another controller's `pairings.json` export without re-running the pairing setup flow. Useful when migrating from Apple Home or another HomeKit controller that supports the Add Pairing HAP procedure.

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

### `PATCH /api/setup/display-name`

Set or clear a custom display name for an accessory. Display names override the HAP-reported name in the UI.

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

---

## Matter (additional endpoints)

### `POST /api/setup/matter/commission`

Commission a Matter device without saving a full pairing record. Use this when you want to run the commissioning flow standalone and capture the assigned `nodeId` before deciding whether to save the pairing.

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

Returns `503` if the Matter runtime is not initialized.

### `POST /api/matter/events`

Ingest one or more Matter attribute-change events from an external source (e.g., a standalone Matter controller). Events are validated, normalized, and written to `event_logs`.

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

## Statistics (additional endpoints)

### `GET /api/stats/quiet-hours`

Returns devices that fired events during the configured quiet-hours window in the last 24 hours. Returns `{ "enabled": false }` if quiet hours are not enabled in retention settings.

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
      "lastSeenAt": "2025-01-15T04:12:00.000Z"
    }
  ]
}
```

Up to 20 accessories are returned, sorted by event count descending. Accessories listed in `quietHoursExcludedAccessories` (from retention settings) are omitted.

---

## Retention Settings (full field reference)

The `GET /api/setup/retention` response and `PATCH /api/setup/retention` body support more fields than the core section above lists. All fields are optional on `PATCH`.

| Field | Type | Default | Range / Values | Description |
|-------|------|---------|----------------|-------------|
| `retentionDays` | integer | 365 | 1–3650 | Days before events are archived or deleted |
| `archiveBeforeDelete` | boolean | true | — | Move events to archive table instead of hard-deleting |
| `staleThresholdHours` | integer | 12 | 1–720 | Hours of silence before an accessory is marked stale |
| `autoScanHomeKit` | boolean | true | — | Run an mDNS scan automatically on startup |
| `quietHoursEnabled` | boolean | false | — | Enable quiet-hours tracking |
| `quietHoursStart` | integer | 23 | 0–23 | UTC hour when quiet period begins |
| `quietHoursEnd` | integer | 6 | 0–23 | UTC hour when quiet period ends |
| `quietHoursExcludedAccessories` | string[] | [] | — | Accessory IDs exempt from quiet-hours reporting |
| `episodeWindowMinutes` | integer | 3 | 1–30 | Maximum gap between events to group into one episode |
| `sceneWindowSeconds` | integer | 5 | 1–30 | Maximum gap between events to group into a scene |
| `episodeMinEventCount` | integer | 3 | 1–20 | Minimum events required to form an episode |
| `toastsEnabled` | boolean | true | — | Show live event toast notifications in the UI |
| `liveEventToastsEnabled` | boolean | false | — | Enable polling-based live event toasts |
| `toastAccessories` | string[] | [] | — | Accessory IDs to show toasts for (empty = all) |
| `toastPosition` | string | `bottom-right` | `bottom-right`, `top-right`, `bottom-left`, `top-left`, `bottom-center`, `top-center` | Toast notification position |
| `toastDuration` | integer | 3 | 2, 3, 5, 7 | Toast display duration in seconds |
| `toastMaxVisible` | integer | 3 | 1, 2, 3, 5 | Maximum simultaneously visible toasts |

The response also includes a `sweepMs` field (read-only) showing the duration in milliseconds of the last retention sweep run.

---

## Data Management (clarification)

### `DELETE /api/data/all` — required body

The existing entry above omits a required field. This endpoint requires a confirmation string to prevent accidental data loss:

**Body:**
```json
{ "confirm": "DELETE ALL" }
```

The request returns `400` if the `confirm` field is absent or does not equal the exact string `DELETE ALL`.
