# Docker Compose Installation

Docker Compose runs homechronicle as three separate containers (PostgreSQL, listener, web), giving you fine-grained control over each service.

> **Want something simpler?** The [Standalone Docker](standalone.md) image bundles everything into a single `docker run` command.

## Prerequisites

- **Docker Engine** and **Docker Compose** plugin installed
- A machine on the same local network as your HomeKit/Matter accessories
- HomeKit accessory PIN codes (8-digit, format `111-22-333`)

```bash
docker --version
docker compose version
```

## Install

```bash
# Clone the repository
git clone https://github.com/venam1s/homechronicle.git
cd homechronicle

# Create the persistent data directory
mkdir -p listener/data

# Copy the example environment file
cp .env.example .env

# Generate an API token and add it to .env
openssl rand -hex 32
# Edit .env and paste the token as API_TOKEN=<token>

# Start all services
docker compose up -d
```

Open `http://localhost:3000` in your browser.

## Required Configuration

Edit `.env` with at minimum:

| Variable | Description |
|----------|-------------|
| `POSTGRES_PASSWORD` | Database password (change from default) |
| `API_TOKEN` | Auth token for write endpoints (generate with `openssl rand -hex 32`) |

## Common Settings

| Variable | Default | Description |
|----------|---------|-------------|
| `TZ` | `UTC` | Container timezone |
| `WEB_PORT` | `3000` | Port for the web dashboard |
| `API_PORT` | `3001` | Port for the listener API |
| `RETENTION_DAYS` | `365` | How long to keep events |
| `STALE_THRESHOLD_HOURS` | `12` | Hours without an event before a device is flagged stale |

For the full list, see [Environment Variables](environment-variables.md).

## Updating

```bash
docker compose pull
docker compose up -d
```

The database schema is migrated automatically on startup.

## Viewing Logs

```bash
# All services
docker compose logs -f

# Just the listener
docker compose logs -f listener

# Last 100 lines
docker compose logs --tail=100 listener
```

## Data Persistence

| Path | Contents | Notes |
|------|----------|-------|
| `listener/data/pairings.json` | Device pairing keys | Never commit this file |
| `listener/data/rooms.json` | Room assignments | Created via API/UI |
| `listener/data/notes.json` | Device notes | Created via API/UI |
| `listener/data/categories.json` | Device category overrides | Created via API/UI |
| `listener/data/retention.json` | Retention settings | Created via API/UI |
| PostgreSQL volume | All event data | Named volume `postgres-data` by default |

## Local Development

For development without Docker (listener and web run natively):

```bash
./scripts/dev-local.sh
```

This starts PostgreSQL in Docker, then runs the listener (port 3001) and Vite dev server (port 5173) locally.

### Running Tests

```bash
# Listener tests
cd listener && npm test

# Web tests
cd web && npm test
```

## Multi-Architecture Builds

The published images support both `linux/amd64` and `linux/arm64`. Docker pulls the correct variant automatically for your host architecture — no extra configuration needed.

Images are built with Docker Buildx by GitLab CI on every release tag and pushed to Docker Hub as `havuq/homechronicle-listener` and `havuq/homechronicle-web` (plus `havuq/homechronicle-standalone` for stable releases). Image tags drop the leading `v` of the release tag:

| Release | Image tags |
|---------|------------|
| Stable (`v0.4.0`) | `0.4.0`, `0.4`, `0`, `latest` |
| Beta (`v0.4.1-beta.1`) | `0.4.1-beta.1`, `beta` |

To pin to a specific release rather than `latest`, set the image variables in `.env`:

```bash
LISTENER_IMAGE=havuq/homechronicle-listener:0.4.0
WEB_IMAGE=havuq/homechronicle-web:0.4.0
```

## Resource Limits

The default `docker-compose.yml` sets resource limits for each service:

| Service | CPU limit | Memory limit |
|---------|-----------|--------------|
| `postgres` | 1 CPU | 1 GB |
| `listener` | 2 CPUs | 512 MB |
| `web` | 0.5 CPU | 256 MB |

These defaults are conservative and suited for a home server or Raspberry Pi. To raise or lower them, add a `docker-compose.override.yml` in the project root:

```yaml
services:
  listener:
    deploy:
      resources:
        limits:
          cpus: '1'
          memory: 256M
```

## Backup and Restore

### Backing Up

All persistent state lives in two places: the `postgres-data` volume and the `listener/data/` directory.

```bash
# Dump the PostgreSQL database (pg_dump takes a consistent snapshot while the stack runs)
docker compose exec -T postgres \
  sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB"' > homechronicle-$(date +%Y%m%d).sql

# Archive the listener data directory (pairings, rooms, notes, retention)
tar -czf homechronicle-data-$(date +%Y%m%d).tar.gz listener/data/
```

### Restoring

```bash
# Stop the stack
docker compose stop

# Restore listener data
tar -xzf homechronicle-data-<date>.tar.gz

# Start only PostgreSQL, then restore the dump into it
# (restore into an empty database — e.g. after removing the postgres-data volume)
docker compose up -d postgres
docker compose exec -T postgres \
  sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"' < homechronicle-<date>.sql

# Start remaining services
docker compose up -d
```

> **Pairings:** `listener/data/pairings.json` contains cryptographic pairing keys for your HomeKit devices. Loss of this file requires re-pairing every device. Include it in every backup and never commit it to version control.

## Upgrading Between Versions

The database schema is managed by versioned migrations in `listener/migrations/` and runs automatically at listener startup. No manual SQL steps are required between releases.

The general upgrade procedure is:

1. Review the release notes for any breaking changes or required `.env` additions before upgrading.
2. Pull the new images and restart:
   ```bash
   docker compose pull
   docker compose up -d
   ```
3. Watch the listener log to confirm migrations complete successfully:
   ```bash
   docker compose logs -f listener
   ```
   Look for `[db] migrations complete` (or similar) before declaring the upgrade done.
4. If something goes wrong, restore from the backup taken in the previous step and redeploy the prior image tag by pinning `LISTENER_IMAGE` and `WEB_IMAGE` in `.env`.

> **Before every upgrade:** take a PostgreSQL dump and archive `listener/data/` as described in [Backup and Restore](#backup-and-restore).
