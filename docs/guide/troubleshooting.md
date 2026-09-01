# Troubleshooting

## Device Discovery

### No devices found during scan

- Verify the listener is running: `docker compose ps`
- Check if `network_mode: host` is set for the listener in your compose file
- On Linux, ensure `avahi-daemon` is running on the host: `systemctl status avahi-daemon`
- Try specifying the network interface: set `DISCOVER_IFACE=eth0` (or your interface name) in `.env`
- Check listener logs for mDNS errors: `docker compose logs listener | grep -i discover`

### Devices show up but pairing fails

- Double-check the PIN code (format: `111-22-333`)
- Ensure the device is on the same network/VLAN as the listener
- Some devices need to be in pairing mode — check the manufacturer's instructions
- If the device was previously paired with homechronicle and uncleanly removed, it may need a factory reset
- If you see `M2: Error: 6`, the device is already paired to another controller — see [below](#m2-error-6--device-already-paired-to-another-controller)

### Devices discovered but IP addresses are wrong

- The listener runs a background discovery scan every hour to update addresses
- Force an immediate scan from the **Manage** tab or via `POST /api/setup/scan`
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

2. **Use Add-Pairing:** If you have another HomeChronicle instance already paired to these devices, use the **Add as Controller** panel in **Manage > Add Devices** to register this instance using the other instance's credentials.

3. **Pair HomeChronicle first:** Remove devices from Apple Home, pair with HomeChronicle, then re-add to Apple Home.

> **Native HomeKit devices** (TP-Link, Ecobee, etc.) do not support insecure mode. For these, use option 2 or 3.

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

1. Open the HomeChronicle web UI and go to **Manage > Add Devices**
2. Click **Scan** to discover devices on the network
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

1. Check device health in the **Accessories** tab — look for `stale` or `unreachable` status
2. Check listener logs: `docker compose logs -f listener`
3. Look for reconnection messages — the subscriber auto-reconnects with backoff
4. Verify the device is still powered on and reachable on the network
5. Try restarting the listener: `docker compose restart listener`

### 502 Bad Gateway from the web UI

The web container can't reach the listener API.

- Verify `LISTENER_HOST` and `LISTENER_PORT` are correct in `.env`
- If using `host.docker.internal`, check that it resolves: `docker compose exec web ping host.docker.internal`
- On Linux Docker without Docker Desktop, `host.docker.internal` may not work — use your server's LAN IP instead
- Check that `API_PORT` and `LISTENER_PORT` match (default: `3001`)

### Web UI loads but shows no data

- Check if the listener is healthy: `curl http://localhost:3001/api/health`
- If using `API_TOKEN_READS_ENABLED=true`, make sure the web container has the same `API_TOKEN`
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
- In production mode (`NODE_ENV=production`), `API_TOKEN` must be set or the listener exits immediately
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

### Matter polling stops

- After 10 consecutive errors, polling stops for that node
- Restart the listener to retry: `docker compose restart listener`
- Check if the device is still powered and reachable

## Alerts

### Webhooks not firing

- Verify the rule itself is enabled (each rule has its own toggle — there is no global alerts switch)
- Check that your rule is enabled: `GET /api/alerts/rules`
- Check the delivery log: `GET /api/alerts/deliveries` — look for `failed` or `suppressed` status
- If status is `suppressed`, the quiet period hasn't elapsed yet
- Test your webhook URL independently with curl

### Webhook delivery fails

- Check the `error` field in the delivery log
- By default, private IP targets are allowed (`ALERTS_ALLOW_PRIVATE_TARGETS=true`). Set to `false` to block RFC1918 targets. Loopback and link-local are always blocked
- Timeout defaults to 5 seconds (`ALERTS_WEBHOOK_TIMEOUT_MS`)

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
