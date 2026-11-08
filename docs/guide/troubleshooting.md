# Troubleshooting

## Device Discovery

### No devices found during scan

- Verify the listener is running: `docker compose ps`
- Check if `network_mode: host` is set for the listener in your compose file
- On Linux, ensure `avahi-daemon` is running on the host: `systemctl status avahi-daemon`
- Try specifying the network interface: set `DISCOVER_IFACE=eth0` (or your interface name) in `.env`
- Check listener logs for mDNS errors: `docker compose logs listener | grep -i discover`
- On macOS, Docker Desktop gives the listener container no access to the Mac's network interfaces, so mDNS announcements don't reach it. Run the listener natively instead: see [macOS Installation](macos.md)

### Devices show up but pairing fails

- Double-check the PIN code (format: `111-22-333`)
- Ensure the device is on the same network/VLAN as the listener
- Some devices need to be in pairing mode — check the manufacturer's instructions
- If the device was previously paired with homechronicle and uncleanly removed, it may need a factory reset
- If you see `M2: Error: 6`, the device is already paired to another controller — see [below](#m2-error-6--device-already-paired-to-another-controller)

### Devices discovered but IP addresses are wrong

- The listener runs a background discovery scan every hour to update addresses
- Force an immediate scan with **Scan Network** in **Devices › Add Accessories**, or via `POST /api/setup/scan`
- Check if your router's DHCP is assigning new IPs — consider using static IPs or DHCP reservations

### `M2: Error: 6` — device already paired to another controller

**What it looks like:**

```
[setup] Pairing failed for 0E:10:F5:8E:BF:97: M2: Error: 6
```

All or most devices fail with `M2: Error: 6` during pairing, but they work fine in Apple Home.

**What's happening:**

Error 6 (`kTLVError_Unavailable`) means the device is already paired to another controller (e.g. Apple Home) and is refusing pair-setup. The HomeKit protocol only allows one pair-setup per device — additional controllers must be added via the add-pairing mechanism.

**How to fix:**

1. **Homebridge users (recommended):** Enable insecure mode in Homebridge.
   - Open Homebridge UI > **Settings** (gear icon)
   - Toggle **Enable UI Accessory Control –I**
   - Restart Homebridge
   - This allows pair-setup even when already paired to Apple Home

2. **Use Add-Pairing:** If you have another HomeChronicle instance already paired to these devices, use the **Add as Controller** panel in **Devices › Add Accessories** to register this instance using the other instance's credentials.

3. **Native HomeKit devices** (TP-Link, Ecobee, etc.) accept only one controller and have no insecure mode. To keep one in Apple Home and log it in HomeChronicle, remove it from Apple Home and run it through a Homebridge plugin on your main bridge instead. See [Multiple Controllers](devices.md#option-3-put-native-devices-behind-homebridge).

> Don't pair a native device with HomeChronicle first and then try to re-add it to Apple Home. Once HomeChronicle has it, the device refuses Apple Home with this same error.

## Connectivity

### `M4: Error: 2` — pairing authentication failure

**What it looks like:**

```
[subscriber] Levoit E860: getAccessories failed: M4: Error: 2
[subscriber] Pet Feeder 052C: getAccessories failed: M4: Error: 2
[subscriber] Homebridge BF97 A0DD: getAccessories failed: M4: Error: 2
```

Every paired device fails with `M4: Error: 2` on a loop, and no new events are recorded. The devices still work normally in Apple Home.

**What's happening:**

`M4: Error: 2` is a HAP (HomeKit Accessory Protocol) authentication failure during the pair-verify handshake. Error code 2 (`kTLVError_Authentication`) means the accessory no longer recognizes HomeChronicle as a paired controller. The long-term cryptographic keys stored in HomeChronicle's `pairings.json` are valid, but the accessory has lost or deleted its copy of the pairing record.

This is a **permanent** error — retrying will not fix it. The pairing must be re-established.

**Common causes:**

- **Homebridge/hub restart with lost data** — if Homebridge's `persist/` directory is not properly volume-mounted, container recreation wipes all pairing records. This is the most common cause when all devices on the same bridge fail simultaneously.
- **Bridge identity reset** — changing Homebridge's bridge `username` (MAC address) in config, or clicking "Reset" / "Unpair All" in the Homebridge UI.
- **Pairing slot eviction** — HAP accessories support a limited number of paired controllers (typically 16). If the limit is reached and HomeChronicle's slot is removed, this error occurs.
- **Factory reset** — the accessory was factory-reset, clearing all pairing data.

> **Why does Apple Home still work?** HomeKit maintains its own pairing through iCloud, which automatically re-syncs. HomeChronicle's pairing is independent and has no such recovery mechanism.

**Related error — `M2: Signature verification failed`:**

This is a similar authentication failure at an earlier step in the pair-verify process. The cause and fix are the same as `M4: Error: 2`.

**How to fix — re-pair the affected devices:**

1. Open the HomeChronicle web UI and go to **Devices › Add Accessories**
2. Click **Scan Network** to discover devices on the network
3. For each affected device, enter its PIN code and click **Pair**
   - The PIN is the 8-digit code (format `111-22-333`) printed on the device label, packaging, or shown in the manufacturer's app
   - For Homebridge, the PIN is in the Homebridge web UI under **Settings**
4. HomeChronicle will automatically replace the old pairing with fresh keys and begin subscribing to events immediately

You do **not** need to delete the old pairing first — pairing the same device again overwrites the existing entry.

**What data is lost:**

- **No event history is lost.** All previously recorded events remain in the database.
- **No room assignments are lost.** Room names are stored separately from pairing data and are keyed by device ID, which doesn't change.
- **No display names or notes are lost.** These are also stored independently.
- The only thing that changes is the cryptographic keys in `pairings.json`. You will see a gap in the timeline for the period between when the pairing broke and when you re-paired.

**Prevention:**

If you use Homebridge, ensure its `persist/` directory is on a durable Docker volume that survives container restarts:

```yaml
volumes:
  - homebridge_data:/homebridge
```

Avoid recreating the container with `docker compose up --force-recreate` unless necessary. A regular `docker compose restart` preserves volumes.

### Events stop arriving

1. Check the badge in **Devices › Manage Accessories** (see [Connection status](devices.md#connection-status)). **Not on network** means the device isn't announcing itself on mDNS and isn't answering — check it's powered on and on the same network as the listener; it is retried every 10 minutes and reconnects on its own. **Needs Repair** means the pairing keys were rejected — use **Repair**.
2. Check listener logs: `docker compose logs -f listener`
3. Look for reconnection and `PROBE` messages — a quiet device is asked for its name every 10 minutes, and one that stops answering is reconnected automatically
4. If the device is on a bridge with more than one address (Homebridge on two networks), the detail page's **Also announced at** shows the alternatives; the listener switches to one that works on its own
5. Try restarting the listener: `docker compose restart listener`

### 502 Bad Gateway from the web UI

The web container can't reach the listener API.

- Verify `LISTENER_HOST` and `LISTENER_PORT` are correct in `.env`
- If you're on 0.3.2 with the stock compose file (`LISTENER_HOST=host.docker.internal`), every request returns 502 — upgrade to 0.3.3 or later, which resolves `host.docker.internal` once when the web container starts
- If `LISTENER_HOST` is a name that only exists in `/etc/hosts` (like `host.docker.internal`) and the host's address changes, restart the web container so it picks up the new address. Compose service names are re-resolved on every request and recover on their own.
- Check that `API_PORT` and `LISTENER_PORT` match (default: `3001`)
- If login is enabled on the listener, make sure the web container has the same `AUTH_ENABLED` value

### Web UI loads but shows no data

- Check if the listener is healthy: `curl http://localhost:3001/api/health`
- With login disabled and `API_TOKEN_READS_ENABLED=true`, make sure the web container has the same `API_TOKEN`
- With login enabled, make sure you're signed in — every API request needs a session
- Check browser console for CORS errors — you may need to set `CORS_ALLOWED_ORIGINS`

## Database

### Listener fails to start with database errors

- Check PostgreSQL is running: `docker compose ps postgres`
- Wait for the health check to pass — the listener depends on `service_healthy`
- Verify `DATABASE_URL` matches your PostgreSQL credentials
- Check PostgreSQL logs: `docker compose logs postgres`

### Database is growing too large

- Check current retention settings: `GET /api/setup/retention`
- Lower `RETENTION_DAYS` (default 365) to keep fewer days of history
- Set `RETENTION_ARCHIVE=false` if you don't need the archive table
- The retention sweep runs every 24 hours by default (`RETENTION_SWEEP_MS`)
- Check archive table size: `docker compose exec postgres psql -U homekit homekit_events -c "SELECT count(*) FROM event_logs_archive;"`

## Docker

### Listener container keeps restarting

- Check logs: `docker compose logs listener`
- With login disabled (`AUTH_ENABLED=false`), `API_TOKEN` must be set or the listener exits immediately (unless `NODE_ENV` is set to something other than `production`)
- Verify `DATABASE_URL` is correct and PostgreSQL is reachable

### D-Bus / avahi errors

The listener mounts the host's D-Bus socket for mDNS. If you see D-Bus errors:

- Check the socket exists on the host: `ls -la /run/dbus/system_bus_socket`
- Verify `HOST_DBUS_SOCKET` in `.env` points to the correct path
- Install and start avahi-daemon on the host: `sudo apt install avahi-daemon && sudo systemctl enable --now avahi-daemon`

### Cannot pull images

If `docker compose pull` fails:

- Check your internet connection
- The images are hosted on Docker Hub
- No authentication is required for public images
- Try pulling manually: `docker pull havuq/homechronicle-listener:latest`

## Matter

### Matter devices not discovered

- Matter discovery uses BLE/WiFi — the host machine needs BLE or WiFi capability
- Check Matter runtime status: `GET /api/setup/matter/runtime`
- Increase scan timeout: `MATTER_SCAN_TIMEOUT_MS=30000`

### Matter commissioning times out

- Commissioning can take up to 5 minutes (the Nginx proxy timeout is 300s)
- Ensure the device is in commissioning mode
- Check listener logs for Matter-specific errors

### Matter device changes not arriving

- Check the runtime: `GET /api/setup/matter/runtime`. `mode` is `subscribe+reconcile` (the default) or `poll` (when `MATTER_SUBSCRIBE_ENABLED=false`). For each node, `subscriptionActive` says whether its live subscription is up and `lastError` shows the most recent failure.
- If `controllerReady` is `false`, or the endpoint returns 503 "Matter runtime unavailable", the Matter controller hasn't started — check the listener logs for `[matter]` errors.
- With subscriptions on, a change should appear within seconds. If a subscription has quietly stopped, the background re-read still picks up the current state every 5 minutes (`MATTER_RECONCILE_INTERVAL_MS`), and the subscription is restarted with a back-off of up to 5 minutes.
- A device that keeps failing is read less often (up to every 10 minutes) but never dropped; it recovers on its own once it's reachable again. Check it's powered and on the network.
- If you need fixed-interval polling instead, set `MATTER_SUBSCRIBE_ENABLED=false` (polls every `MATTER_POLL_INTERVAL_MS`, default 5 s).
- Only some Matter clusters produce events — see [Supported Matter clusters](devices.md#supported-matter-clusters).

## Alerts

### Webhooks not firing

- Check the rule is enabled on the **Alerts** page (each rule has its own toggle — there is no household-wide alerts switch)
- Check the scope and match value against a real event on the Timeline — **Equals** is case-sensitive and compares the stored value (for example `1` rather than `on`). See [Alerts](alerts.md#match-operator).
- If the rule's owner has been disabled, the rule no longer fires
- Check **Recent Deliveries** on the Alerts page (or `GET /api/alerts/deliveries`) — look for `failed` or `suppressed` status
- If status is `suppressed`, the quiet period hasn't elapsed yet
- Test your webhook URL independently with curl

### Webhook delivery fails

- Check the `error` field in the delivery log
- By default, private IP targets are allowed (`ALERTS_ALLOW_PRIVATE_TARGETS=true`). Set to `false` to block them. `localhost`, loopback and link-local are always blocked — see [Alerts](alerts.md#target-restrictions)
- A target that keeps failing is retried at most once a minute (`ALERTS_FAILURE_BACKOFF_MS`)
- Timeout defaults to 5 seconds. Change it in **Settings › Configuration › Data management**, or with `ALERTS_WEBHOOK_TIMEOUT_MS`, which wins when set

## Updates

### Settings › About says "Couldn't check for updates"

The update check runs on the listener, not in your browser. About shows this when the listener couldn't reach GitLab, or its own request failed.

- Check the listener's answer: `curl http://localhost:3001/api/updates/latest`. This endpoint is public, so no token is needed. `"enabled": false` means `UPDATE_CHECK_ENABLED=false` is set; `"upstreamOk": false` means the last fetch from GitLab failed.
- The listener needs outbound HTTPS access to `gitlab.com`. On a network without internet access, the check can't work — compare your version with the [CHANGELOG](https://gitlab.com/havuq/homechronicle/-/blob/main/CHANGELOG.md) instead.
- Results are cached for 12 hours (15 minutes after a failure), so a just-published release may take a while to show. Restarting the listener clears the cache.
- If About says **Up to date** but you expected a release: if you run a stable version, beta releases are not offered.
- Check this browser hasn't turned the check off: `localStorage.getItem('hc_disable_update_check')` should not be `'true'`.

## Performance

### Web UI is slow

- Reduce the dashboard date range if the dataset is very large
- Check database query performance: long queries may indicate missing indexes (should auto-create on first run)
- Expensive queries (stats, heartbeat) are cached server-side with stale-while-revalidate

### High memory usage on listener

- If you have many paired devices, memory usage scales with the number of active HAP connections
- The in-memory value cache and accessory metadata cache grow with the number of subscribed characteristics

## Logs

### Changing log verbosity

Change the log level at runtime without restarting:

```bash
curl -X PATCH http://localhost:3001/api/setup/log-level \
  -H "Content-Type: application/json" \
  -H "X-API-Token: <token>" \
  -d '{"level": "debug"}'
```

Available levels: `error`, `warn`, `info`, `debug`.

### Viewing logs

```bash
# All services
docker compose logs -f

# Just the listener
docker compose logs -f listener

# Last 100 lines
docker compose logs --tail=100 listener
```
