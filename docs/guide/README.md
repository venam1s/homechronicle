# homechronicle Documentation

homechronicle is a self-hosted event log for Apple HomeKit and Matter devices. It captures every state change from your accessories and presents them in a searchable timeline with activity analytics.

## What It Does

- **Records every event** — lights turning on, motion detected, temperature changes, door locks, and more
- **Searchable timeline** — filter by room, accessory, characteristic, or date range
- **Activity analytics** — daily trends, hourly distributions, heatmaps, device rankings
- **Device management** — discover, pair, and monitor accessories from the web UI
- **Multi-user accounts** — optional login with invite-only members, admin/member roles, and DB-backed sessions ([details](accounts.md))
- **Email** — SMTP for user invitations, password resets, and email alert delivery ([details](email.md))
- **Webhook & email alerts** — get notified when specific events occur (enable with `ALERTS_ENABLED=true`)
- **Scheduled repair** — daily automated repair cycle for stale HomeKit pairings ([details](devices.md#scheduled-repair))
- **Firmware tracking** — detects and logs firmware version changes on reconnect ([details](devices.md#firmware-tracking))
- **Quiet hours** — flag unexpected activity during a defined time window
- **Dark mode & accent themes** — system/light/dark toggle and six color themes ([details](appearance.md))

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

### Configuration
- [Environment Variables](environment-variables.md) — complete variable reference
- [Networking](networking.md) — host vs bridge mode, web-to-listener routing, VLANs
- [Security](security.md) — API tokens, CORS, session auth, webhook validation, retention & quiet hours
- [Email (SMTP)](email.md) — SMTP setup for invites, password resets, and email alerts

### Usage
- [Accounts & Users](accounts.md) — login, invite members, roles, sessions, per-user preferences
- [Device Setup](devices.md) — discover, pair, and manage HomeKit & Matter accessories
- [Appearance](appearance.md) — dark mode, color themes
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

The listener must run on the same network segment as your HomeKit accessories. On Linux, set `LISTENER_NETWORK_MODE=host` in `.env` so the container can use mDNS. On macOS, use `DISCOVER_IFACE=<interface>` (e.g., `en0`) to specify the network interface. Verify with `docker compose logs listener | grep -i discover`.

**Pairing fails with `M2: Error: 6`**

This means the device is already paired to another controller (such as Apple Home) and is rejecting a new pair-setup. If you use Homebridge, enable insecure mode (`-I` flag) in Homebridge settings — this allows HomeChronicle to register as an additional controller. For native HomeKit devices (TP-Link, Ecobee, etc.), use the **Add as Controller** panel in the Manage tab instead. See [Troubleshooting](troubleshooting.md#m2-error-6--device-already-paired-to-another-controller) for full details.

**`API_TOKEN` left empty causes write endpoints to be unprotected**

Generate a token with `openssl rand -hex 32` and set `API_TOKEN=<value>` in `.env` before exposing the listener to any network beyond localhost. The listener will accept unauthenticated write requests if `API_TOKEN` is unset.

**Port conflicts on startup**

If `WEB_PORT=3000` or `POSTGRES_PORT=5432` is already in use, edit those values in `.env` and run `docker compose up -d` again. Check running containers with `docker compose ps`.
