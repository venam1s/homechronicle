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
git clone https://gitlab.com/havuq/homechronicle.git
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
| `ALERTS_ENABLED` | `false` | Enable webhook alert rules |

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
