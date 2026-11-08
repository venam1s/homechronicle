# Upgrading

This page covers upgrading to **0.5.0** and **0.4**, then the general steps for any upgrade. The full list of changes in each release is in the [CHANGELOG](https://gitlab.com/havuq/homechronicle/-/blob/main/CHANGELOG.md).

## Upgrading to 0.5.0

0.5.0 adds threshold and goes-quiet alert rules, Timeline export, device categories, display names that apply everywhere, and a steadier HomeKit listener. No `.env` changes are required. Read the notes below before upgrading; most matter only if you rely on the behaviour they describe.

### Database migrations

The listener applies migrations 0009–0013 on first start. One of them adds an index to the archive table, so on an install with a large archive the first start takes longer than usual — watch the listener log for `[db] Schema ready.` before you worry. Take the usual database dump first (see [the general steps](#upgrading-between-versions) below).

If you go back to 0.4.3 afterwards, it runs on the upgraded database, but threshold and goes-quiet rules don't fire, and display names apply only to events recorded before you went back.

### More HomeKit events

Nine HomeKit characteristic codes were wrong until now. Temperature, contact sensor, ambient light level, color temperature and low-battery events are logged for the first time, and smoke detected, window-covering position, heating/cooling state and active status are logged under their correct names. Expect more events than before and a faster-growing database; adjust `RETENTION_DAYS` if needed (see [Settings › Data management](settings.md#data-management)).

### Event names

New events from a single-service accessory are named after the accessory (`Front Door`) instead of `Front Door · ContactSensor`. Older events keep their old names, so **Top Devices** and the heatmap may list such a device twice until the old events age out. Anomaly baselines and accessory-scoped alert rules match both forms, so nothing needs re-creating.

### Alert rules

- Rules on `ContactSensorState`, `CurrentTemperature` or `StatusLowBattery` now fire for HomeKit accessories; they never could before.
- Blinds no longer report as `ContactSensorState`, and smoke moves from `PM2_5Density` to `SmokeDetected`. A rule written against the old name needs its characteristic changed.
- Battery percentage no longer counts as low battery.

### Display names rewrite history

Setting a display name under **Devices › Manage Accessories** now renames that device's past events too, so the Timeline, search, exports and alerts all use the new name. Clearing the name puts the original back. Rules and muted devices that referred to the old name follow it. See [Managing devices](devices.md#managing-devices).

### Connection status means something different

A device that sent nothing for 30 minutes used to be reported as not connected and shown as **Stale**. Now the listener checks a quiet device is alive by asking for its name, so quiet devices stay **Logging**, a device that stops answering is reconnected, and a device that has vanished from the network is shown as **Not on network** and retried every 10 minutes (`HAP_UNREACHABLE_RETRY_MS`). `GET /api/health` gains `idle` and `unreachable` counts. If you watch health externally, expect `connected` to be higher and `stale` lower than before. See [Connection status](devices.md#connection-status).

### Optional new settings

`EVENTS_EXPORT_RATE_LIMIT_MAX`, `EVENTS_MAX_EXPORT_ROWS`, `CATEGORIES_FILE` and `HAP_UNREACHABLE_RETRY_MS` — all have sensible defaults; see [Environment Variables](environment-variables.md).

## Upgrading to 0.4

0.4 is a redesign of the interface — twelve colour palettes, a top navigation bar, and a restyled dashboard, Timeline and Devices page — plus live Matter subscriptions. There are no new database migrations and no required `.env` changes.

### Before you upgrade: Matter users

Matter devices now use **live subscriptions** instead of polling every 5 seconds. Changes arrive as they happen, and a background re-read every 5 minutes covers a subscription that quietly stops. This happens automatically.

If you'd rather keep the old polling behaviour, set this in `.env` (or pass it with `-e` to the standalone container) before upgrading:

```
MATTER_SUBSCRIBE_ENABLED=false
```

Matter readings also now use the same names and units as HomeKit — 23.5 °C rather than `2350`, brightness as a percentage. Events recorded before the upgrade keep their old form, so an alert rule written against raw Matter values may need its match value updated. See [Device Setup](devices.md#how-matter-devices-report-changes).

### Your colour choice carries over

The old accent colours are replaced by palettes. Your accent is mapped to the nearest palette the first time 0.4 loads:

| Old accent | New palette |
|------------|-------------|
| Ocean | Tide |
| Graphite | Graphite |
| Sunrise, Yellow | Harvest |
| Red | Ember |
| Purple | Iris |
| Slate | Atlas |
| Pink | Dusk |

With sign-in enabled this also applies on a new device or after you sign out and back in. Change it any time in **Settings › Appearance** — see [Appearance](appearance.md).

### Alerts are enabled per rule

`PATCH /api/setup/alerts` now rejects an `enabled` field with a 400 error ("Alerts are enabled per rule, not household-wide. Disable individual rules instead."). The household-wide switch was retired in 0.3.0 and already did nothing. If a script of yours sends `enabled`, remove it and turn individual rules on or off instead — see [Alerts](alerts.md).

### What else changes when you upgrade

- **Navigation.** On desktop, a top navigation bar replaces the sidebar. Phones and tablets keep the floating navigation button (bottom left).
- **Dashboard panels.** Three new panels — House Summary, Where Things Happen and Today's Rhythm — are added to your existing dashboard automatically. Your saved layout and hidden panels are kept. See [Dashboard & Analytics](dashboard.md).
- **Preferences now sync to your account.** Between 0.3.0 and 0.4.0, every attempt to save a signed-in user's preferences was rejected by the server, so theme, dashboard layout and other settings only lived in the browser where you set them. From 0.4.0 they're saved to your account. After upgrading, check your theme, palette and dashboard layout in each browser and set them again if needed — from then on they follow you.
- **Update check.** Settings › About now shows whether a newer release is available, checked through your own listener. See [Settings](settings.md#update-check).
- **What's new.** The first time you open the app after upgrading, the changelog opens so you can see what changed. It's also under **Settings › About › What's new**.

## Upgrading to 0.4.1

Most of these fixes need nothing from you; check the first two if they apply.

- **Scheduled Repair runs at the hour Settings shows, whatever the container's `TZ`.** The saved hour is UTC, and the scheduler now counts in UTC too. If you set `TZ` on the listener container, the repair used to run offset by your UTC offset and now runs at the hour shown in **Settings › Configuration › Device Management**. With the default `TZ=UTC`, nothing changes. `REPAIR_HOUR` is now read as a UTC hour.
- **Webhook timeout from Settings now applies.** The **Webhook timeout** field in **Settings › Configuration › Data management** used to be saved and ignored. It's now used for deliveries unless `ALERTS_WEBHOOK_TIMEOUT_MS` is set, which still wins (and locks the field), so an existing `.env` value keeps working.
- **Default quiet period now applies.** New alert rules start with the **Default quiet period** from the same section, instead of 0. Existing rules keep their own value.
- **Local time everywhere.** Today's Rhythm and the Timeline's activity heatmap used to plot UTC hours; both now use your local time like the rest of the app.
- **Sign out on phones and tablets.** It's at the bottom of the floating navigation menu.
- **Settings › About** shows **Couldn't check for updates** when the update check fails, instead of **Up to date**.
- **Unpairing a Matter device keeps its event history**, as the unpair screen says and as HomeKit already did. To remove a device's history, use the **Danger Zone** in **Settings › Configuration › Advanced** (see [Settings](settings.md#danger-zone)).

## Upgrading between versions

Database changes are applied by versioned migrations that run automatically when the listener starts. You never need to run SQL by hand.

### 1. Back up

Back up both the database and the data directory before every upgrade. The data directory holds your HomeKit pairing keys (`pairings.json`), rooms, names, notes and settings — losing `pairings.json` means re-pairing every device.

**Docker Compose** (stack running):

```bash
docker compose exec -T postgres \
  sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB"' > homechronicle-$(date +%Y%m%d).sql
tar -czf homechronicle-data-$(date +%Y%m%d).tar.gz listener/data/
```

Run this from the directory with your `docker-compose.yml`. If you changed `LISTENER_DATA_SOURCE`, archive that directory instead of `listener/data/`.

**Standalone:**

```bash
docker exec homechronicle su-exec postgres pg_dump -U homekit homekit_events > backup.sql
docker cp homechronicle:/app/listener/data ./listener-data-backup
```

### 2. Read the release notes

Check the [CHANGELOG](https://gitlab.com/havuq/homechronicle/-/blob/main/CHANGELOG.md) for **Upgrade notes** in every release between your version and the new one.

### 3. Pull and restart

**Docker Compose:**

```bash
docker compose pull
docker compose up -d
```

If you pin versions with `LISTENER_IMAGE` and `WEB_IMAGE` in `.env`, update both tags first (for example to `0.4.0`). Keep the listener and web images on the same version. See [Docker Compose](docker-compose.md).

**Standalone:**

```bash
docker pull havuq/homechronicle-standalone:latest
docker stop homechronicle
docker rm homechronicle
# Re-run your original docker run command
```

Your data stays in the `hc-db` and `hc-data` volumes. See [Standalone Docker](standalone.md).

### 4. Check it worked

Watch the listener start and apply any migrations:

```bash
docker compose logs -f listener      # Compose
docker logs -f homechronicle         # Standalone
```

Look for `[db] Schema ready.`, then open the web UI. **Settings › About** shows the new version.

### If something goes wrong

Pin the previous image tags, restore the database dump and data directory from step 1 (see [Docker Compose › Backup and Restore](docker-compose.md#backup-and-restore)), and start the stack again. Then [report an issue](https://gitlab.com/havuq/homechronicle/-/issues).
