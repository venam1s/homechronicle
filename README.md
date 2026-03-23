# homechronicle

![Last Commit](https://img.shields.io/gitlab/last-commit/homechronicle/homechronicle?gitlab_url=https://gitlab.com)![Docker Pulls](https://img.shields.io/docker/pulls/havuq/homechronicle-standalone?logo=docker)![Self Hosted](https://img.shields.io/badge/self--hosted-yes-purple)![HomeKit](https://img.shields.io/badge/apple-homekit-black?logo=apple)
![License](https://img.shields.io/gitlab/license/homechronicle/homechronicle?gitlab_url=https://gitlab.com)

homechronicle is a self-hosted event log for Apple HomeKit.
It shows what happened in your home over time, not just the current state.

## What You Get

- Timeline of HomeKit activity (what changed and when)
- Easy setup from the web app (no terminal pairing flow)
- Filter by room, device, and date
- Accessory activity dashboard and trends
- Works with Homebridge bridges and child devices
- Runs 24/7 with Docker

## Quick Start

The fastest way to get running — one command, everything included:

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

Open `http://localhost:3000` (or `http://<your-server-ip>:3000` from another device).

> **Bridge mode:** If you don't need HomeKit/Matter discovery, you can use `-p 3000:80` instead of `--network host`. See the [Standalone Docker docs](https://homechronicle.net/guide/#/standalone) for details.

### Docker Compose (alternative)

For more control (separate containers, external PostgreSQL access, per-service resource limits):

```bash
git clone https://gitlab.com/homechronicle/homechronicle.git
cd homechronicle
cp .env.example .env
# Set POSTGRES_PASSWORD and API_TOKEN in .env
docker compose up -d
```

For a complete list of available settings:
- Environment variables: [docs/environment-variables.md](docs/environment-variables.md)
- Minimal compose example: [docs/docker-compose.example.yml](docs/docker-compose.example.yml)
- Portainer stack example (`docker-compose.portainer.yml`): [docs/portainer.md](docs/portainer.md)

### 4. Pair your HomeKit devices

1. Open **Setup** in the app.
2. Click **Rescan Network**.
3. Enter your device PIN(s) (`111-22-333` format).
4. Click **Pair Selected**.

Events will begin showing in the Timeline once pairing succeeds.

## Daily Use

**Standalone:**
- `docker logs -f homechronicle` to view logs
- `docker restart homechronicle` if you need to reconnect device subscriptions

**Docker Compose:**
- `docker compose ps` to check containers
- `docker compose logs -f listener web postgres` to view logs
- `docker compose restart listener` if you need to reconnect device subscriptions

## Matter

Matter works out of the box — the listener uses matter.js (a pure TypeScript Matter implementation) for commissioning, polling, and subscriptions. Just pair devices through the Setup UI.

### Adding a Matter Device

If your Matter accessory is already in Apple Home, you can add it to homechronicle:

1. In Apple Home, open the accessory settings.
2. Open Matter settings and generate a setup code for another controller (wording varies by device/app).
3. In homechronicle Setup → Matter Devices, choose **Add From Apple Home**.
4. Enter a label + the setup code from Apple Home.
5. homechronicle commissions its own Matter controller entry and auto-allocates a `nodeId`.

> **VLAN users:** Matter requires IPv6 link-local connectivity between the Docker host and your devices. If your IoT devices are on a separate VLAN, you need a VLAN sub-interface on the host. See [VLAN / segregated IoT networks](limitations.md#platform-note-vlan--segregated-iot-networks).

## Update homechronicle

**Standalone:**
```bash
docker pull havuq/homechronicle-standalone:latest
docker stop homechronicle && docker rm homechronicle
# Re-run your original docker run command
```

**Docker Compose:**
```bash
git pull
docker compose pull
docker compose up -d
```

## Documentation

Full documentation is available at [homechronicle.net/guide](https://homechronicle.net/guide/).

## Limitations & Troubleshooting

See [limitations.md](limitations.md) for current constraints, supported Matter clusters, and troubleshooting steps.

## License

[AGPL-3.0](LICENSE)
