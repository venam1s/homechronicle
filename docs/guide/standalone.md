# Standalone Docker Deployment

The standalone image bundles PostgreSQL, the listener, and the web UI into a single container. One command gets you a fully running homechronicle instance — no compose file, no multi-container networking, no external database.

## When to Use Standalone vs Docker Compose

| | Standalone | Docker Compose |
|--|-----------|----------------|
| **Setup** | Single `docker run` command | Clone repo, configure `.env`, `docker compose up` |
| **Containers** | 1 | 3 (postgres, listener, web) |
| **Database** | Embedded PostgreSQL (managed for you) | External PostgreSQL (you manage backups, tuning) |
| **Best for** | Quick installs, trying it out, simple home servers | Production setups, existing Postgres, NAS with Portainer |
| **Database access** | Unix socket only (not accessible from host) | Exposed on `localhost:5432` for external tools |
| **Resource control** | Single container limits | Per-service CPU/memory limits |
| **Updates** | Pull new image, restart | Pull images per-service, rolling restarts possible |

**Choose standalone if** you want the simplest possible install — one container, two volumes, done.

**Choose Docker Compose if** you want fine-grained control, already run PostgreSQL, or need to integrate with tools like pgAdmin or a backup pipeline.

## Prerequisites

- **Docker Engine** installed
- A machine on the same local network as your HomeKit/Matter accessories
- HomeKit accessory PIN codes (8-digit, format `111-22-333`)

## Quick Start

### Bridge Mode (simplest)

```bash
docker run -d \
  --name homechronicle \
  -p 3000:80 \
  -v hc-db:/var/lib/postgresql/data \
  -v hc-data:/app/listener/data \
  havuq/homechronicle-standalone
```

Open `http://localhost:3000` in your browser.

> **Note:** Bridge mode does not support HomeKit/Matter device discovery. Use host network mode below for full functionality.

### Host Network Mode (recommended for discovery)

HomeKit discovery (mDNS) and Matter commissioning (IPv6 link-local) require direct access to your local network. Use `--network host` for this:

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

Open `http://your-server-ip:3000` in your browser.

**What each flag does:**

| Flag | Purpose |
|------|---------|
| `--network host` | Gives the container direct access to the host network for mDNS/Matter |
| `-e WEB_PORT=3000` | Sets the web UI port (default is 80, which may conflict in host mode) |
| `-v hc-db:...` | Persists the PostgreSQL database across restarts |
| `-v hc-data:...` | Persists device pairings, room assignments, and settings |
| `-v /run/dbus/...` | Connects to host mDNS daemon for HomeKit discovery (Linux) |

> **Note:** With `--network host`, the `-p` flag is ignored — the container binds directly to host ports. Set `WEB_PORT` to control which port the web UI listens on.

## Configuration

All configuration is done via environment variables passed with `-e`:

```bash
docker run -d \
  --name homechronicle \
  --network host \
  -e WEB_PORT=3000 \
  -e API_TOKEN=your-secret-token \
  -e TZ=America/New_York \
  -e RETENTION_DAYS=90 \
  -v hc-db:/var/lib/postgresql/data \
  -v hc-data:/app/listener/data \
  -v /run/dbus/system_bus_socket:/run/dbus/system_bus_socket:ro \
  havuq/homechronicle-standalone
```

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `WEB_PORT` | `80` | Port for the web dashboard |
| `API_PORT` | `3001` | Internal listener API port |
| `API_TOKEN` | *(empty)* | Auth token for write endpoints (generate with `openssl rand -hex 32`) |
| `POSTGRES_USER` | `homekit` | PostgreSQL username |
| `POSTGRES_PASSWORD` | `changeme` | PostgreSQL password |
| `POSTGRES_DB` | `homekit_events` | PostgreSQL database name |
| `TZ` | `UTC` | Container timezone |
| `RETENTION_DAYS` | `365` | How long to keep events |
| `ALERTS_ENABLED` | `false` | Enable webhook alert rules |
| `DISCOVER_IFACE` | *(auto)* | Force mDNS discovery to a specific network interface (e.g., `bond0`, `eth0`) |

For the full variable reference, see [Environment Variables](environment-variables.md).

## Managing the Container

### View logs

```bash
docker logs -f homechronicle
```

### Check health

```bash
docker inspect --format='{{.State.Health.Status}}' homechronicle
```

Or hit the health endpoint directly:

```bash
curl http://localhost:3000/api/health
```

### Stop and start

```bash
docker stop homechronicle
docker start homechronicle
```

### Update to a new version

```bash
docker pull havuq/homechronicle-standalone:latest
docker stop homechronicle
docker rm homechronicle
# Re-run your original docker run command
```

Your data is safe in the named volumes (`hc-db` and `hc-data`) and will survive container removal.

## Backup

### Database

```bash
docker exec homechronicle su-exec postgres pg_dump -U homekit homekit_events > backup.sql
```

### Pairing data

```bash
docker cp homechronicle:/app/listener/data ./listener-data-backup
```

## Troubleshooting

**Web UI not loading:**
- Check the container is running: `docker ps`
- Check logs: `docker logs homechronicle`
- Verify the port: `curl -sf http://localhost:3000/api/health`

**Devices not discovered:**
- Ensure you're using `--network host` mode
- Mount the D-Bus socket: `-v /run/dbus/system_bus_socket:/run/dbus/system_bus_socket:ro`
- If on a multi-NIC system, set `DISCOVER_IFACE` to the correct interface
- Check the listener logs for mDNS activity: `docker logs homechronicle 2>&1 | grep -i discover`

**Port conflict in host mode:**
- Change `WEB_PORT` to an unused port (e.g., `-e WEB_PORT=8080`)
- PostgreSQL uses a Unix socket internally and will not conflict with a host PostgreSQL installation

**Database initialization failed:**
- Check that the `hc-db` volume is not corrupted: `docker volume inspect hc-db`
- To start fresh, remove the volume: `docker volume rm hc-db` (this deletes all event data)
