# homechronicle Documentation

homechronicle is a self-hosted event log for Apple HomeKit and Matter devices. It captures every state change from your accessories and presents them in a searchable timeline with activity analytics.

## What It Does

- **Records every event** — lights turning on, motion detected, temperature changes, door locks, and more
- **Readable timeline** — entries lead with what happened, grouped into scenes and episodes; search and filter by room, accessory, characteristic, or date range ([details](timeline.md))
- **Customizable dashboard** — a one-line House Summary, a room map, a daily rhythm arc, trends, heatmaps and device rankings; drag, resize, and hide panels ([details](dashboard.md))
- **Twelve colour palettes** — each with a designed light and dark version, plus Light / Dark / System theme ([details](appearance.md))
- **Device management** — discover, pair, and monitor HomeKit and Matter accessories from the web UI, grouped by room ([details](devices.md))
- **Live Matter updates** — Matter devices report changes as they happen through native subscriptions, with a background re-read as a safety net ([details](devices.md#how-matter-devices-report-changes))
- **Webhook & email alerts** — get notified when specific events occur, with per-rule quiet periods ([details](alerts.md))
- **Multi-user accounts** — optional login with invite-only members, admin/member roles, and per-user preferences that follow you across devices ([details](accounts.md))
- **Email** — SMTP for user invitations, password resets, and email alert delivery ([details](email.md))
- **Scheduled repair** — daily automated repair cycle for stale HomeKit pairings ([details](devices.md#scheduled-repair))
- **Firmware tracking** — detects and logs firmware version changes on reconnect ([details](devices.md#firmware-tracking))
- **Quiet hours** — flag unexpected activity during a defined time window
- **Update check** — Settings › About tells you when a new release is out, checked through your own server ([details](settings.md#update-check))

## Quick Start

```bash
docker run -d \
  --name homechronicle \
  --network host \
  -e WEB_PORT=3000 \
  -v hc-db:/var/lib/postgresql/data \
  -v hc-data:/app/listener/data \
  -v /run/dbus/system_bus_socket:/run/dbus/system_bus_socket:ro \
  havuq/homechronicle-standalone
```

Open `http://localhost:3000` in your browser. See [Standalone Docker](standalone.md) for full details, or [Docker Compose](docker-compose.md) for multi-container deployments.

## Architecture at a Glance

| Service | Role |
|---------|------|
| **PostgreSQL 16** | Stores events, alert rules, and delivery logs |
| **Listener** (Node.js) | Subscribes to HomeKit/Matter devices, serves the REST API |
| **Web** (React + Nginx) | Dashboard UI, proxies API requests to the listener |

## Documentation

### Installation
- [Standalone Docker](standalone.md) — one command, everything included (recommended)
- [Docker Compose](docker-compose.md) — separate containers with full control
- [Portainer](portainer.md) — deploy from Portainer's stack UI
- [Upgrading](upgrading.md) — upgrading to 0.4 and between versions

### Configuration
- [Environment Variables](environment-variables.md) — complete variable reference
- [Networking](networking.md) — host vs bridge mode, web-to-listener routing, VLANs
- [Security](security.md) — API tokens, CORS, session auth, webhook validation, retention & quiet hours
- [Email (SMTP)](email.md) — SMTP setup for invites, password resets, and email alerts

### Usage
- [Accounts & Users](accounts.md) — login, invite members, roles, sessions, per-user preferences
- [Dashboard & Analytics](dashboard.md) — customizable panels, default and optional panel reference
- [Timeline](timeline.md) — reading entries, scenes and episodes, filters, activity heatmap
- [Alerts](alerts.md) — webhook and email alert rules, quiet periods, delivery history
- [Device Setup](devices.md) — discover, pair, and manage HomeKit & Matter accessories
- [Appearance](appearance.md) — theme and the twelve colour palettes
- [Settings](settings.md) — About, Admin, Configuration, Appearance, and Account sections
- [Mobile Install (PWA)](mobile-install.md) — add to your home screen

### Reference
- [API Reference](api-reference.md) — all REST endpoints
- [Architecture](architecture.md) — system diagram, modules, event flow, database schema

### Help
- [Troubleshooting](troubleshooting.md) — common issues and fixes

## Requirements

- Docker Engine (Docker Compose also needed for multi-container setup)
- A machine on the same network as your HomeKit accessories (NAS, Raspberry Pi, desktop, etc.)
- HomeKit accessory PINs (the 8-digit code from the device label or Apple Home)
- **Homebridge users:** Enable insecure mode (`-I` flag) in Homebridge settings to allow HomeChronicle to pair alongside Apple Home. See [Device Setup](devices.md#multiple-controllers-homekit) for details.

## Installation Steps

For the **Docker Compose** multi-container setup:

```bash
# Clone the repository
git clone https://gitlab.com/havuq/homechronicle.git
cd homechronicle

# Create the persistent data directory
mkdir -p listener/data

# Copy the example environment file and configure it
cp .env.example .env

# Generate a secure API token and set it in .env
openssl rand -hex 32
# Edit .env: paste the token as API_TOKEN=<generated-value>
# Also set POSTGRES_PASSWORD to something other than 'changeme'

# Start all services
docker compose up -d
```

For the **standalone** single-container setup, see the Quick Start above. No cloning required.

## Common Setup Issues

**Devices not discovered after first run**

The listener must run on the same network segment as your HomeKit accessories. On Linux, set `LISTENER_NETWORK_MODE=host` in `.env` so the container can use mDNS, and verify with `docker compose logs listener | grep -i discover`. On macOS, Docker can't see HomeKit accessories at all: run the listener natively as described in [macOS Installation](macos.md).

**Pairing fails with `M2: Error: 6`**

This means the device is already paired to another controller (such as Apple Home) and is rejecting a new pair-setup. If you use Homebridge, enable insecure mode (`-I` flag) in Homebridge settings — this allows HomeChronicle to register as an additional controller. For native HomeKit devices (TP-Link, Ecobee, etc.), use the **Add as Controller** panel in **Devices › Add Accessories** instead. See [Troubleshooting](troubleshooting.md#m2-error-6--device-already-paired-to-another-controller) for full details.

**`API_TOKEN` and login**

With login enabled (`AUTH_ENABLED=true`, the default), every API request except a few public ones needs a signed-in session or the API token. If you set `AUTH_ENABLED=false`, the API token is the only protection, and the listener won't start without one unless `NODE_ENV` is set to a non-production value — in which case anyone who can reach the listener can change settings and devices. Generate a token with `openssl rand -hex 32` and set `API_TOKEN=<value>` in `.env` before exposing the listener beyond localhost. See [Security](security.md).

**Port conflicts on startup**

If `WEB_PORT=3000` or `POSTGRES_PORT=5432` is already in use, edit those values in `.env` and run `docker compose up -d` again. Check running containers with `docker compose ps`.
