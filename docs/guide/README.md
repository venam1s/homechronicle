# homechronicle Documentation

homechronicle is a self-hosted event log for Apple HomeKit and Matter devices. It captures every state change from your accessories and presents them in a searchable timeline with activity analytics.

## What It Does

- **Records every event** — lights turning on, motion detected, temperature changes, door locks, and more
- **Searchable timeline** — filter by room, accessory, characteristic, or date range
- **Activity analytics** — daily trends, hourly distributions, heatmaps, device rankings
- **Device management** — discover, pair, and monitor accessories from the web UI
- **Webhook alerts** — get notified when specific events occur (enable with `ALERTS_ENABLED=true`)
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
- [Security](security.md) — API tokens, CORS, webhook validation, retention & quiet hours

### Usage
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
