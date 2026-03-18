#!/bin/bash
set -e

# ── Defaults ────────────────────────────────────────────────────────────────
: "${POSTGRES_USER:=homekit}"
: "${POSTGRES_PASSWORD:=changeme}"
: "${POSTGRES_DB:=homekit_events}"
: "${API_PORT:=3001}"
: "${WEB_PORT:=80}"
: "${TZ:=UTC}"

# Use a Unix socket for PostgreSQL so there is no TCP port conflict when
# the container runs with --network host.
PG_SOCKET_DIR="/var/run/postgresql"
mkdir -p "$PG_SOCKET_DIR"
chown postgres:postgres "$PG_SOCKET_DIR"

export DATABASE_URL="postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@/${POSTGRES_DB}?host=${PG_SOCKET_DIR}"
export NODE_ENV="${NODE_ENV:-production}"
export API_PORT
export API_TOKEN="${API_TOKEN:-}"
export TZ

# ── Nginx env substitution ──────────────────────────────────────────────────
export LISTENER_HOST=127.0.0.1
export LISTENER_PORT="$API_PORT"
export DOLLAR='$'

# Rewrite the listen directive to use WEB_PORT (matters in host network mode)
envsubst < /etc/nginx/templates/default.conf.template > /etc/nginx/conf.d/default.conf
sed -i "s/listen 80;/listen ${WEB_PORT};/" /etc/nginx/conf.d/default.conf

# ── PostgreSQL init ─────────────────────────────────────────────────────────
PGDATA="/var/lib/postgresql/data"
export PGDATA

mkdir -p "$PGDATA"
chown -R postgres:postgres "$PGDATA"

if [ ! -s "$PGDATA/PG_VERSION" ]; then
  echo "==> Initializing PostgreSQL database..."
  su-exec postgres /usr/lib/postgresql/16/bin/initdb -D "$PGDATA" \
    --username="$POSTGRES_USER" --pwfile=<(echo "$POSTGRES_PASSWORD")

  # Configure: Unix socket only, no TCP listener
  cat >> "$PGDATA/postgresql.conf" <<PGCONF
listen_addresses = ''
unix_socket_directories = '${PG_SOCKET_DIR}'
PGCONF

  # Start postgres temporarily for schema init
  su-exec postgres /usr/lib/postgresql/16/bin/pg_ctl -D "$PGDATA" -w start

  # Create database if it doesn't exist
  su-exec postgres psql -U "$POSTGRES_USER" -tc \
    "SELECT 1 FROM pg_database WHERE datname='${POSTGRES_DB}'" | grep -q 1 \
    || su-exec postgres createdb -U "$POSTGRES_USER" "$POSTGRES_DB"

  # Run schema
  su-exec postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -f /docker-entrypoint-initdb.d/init.sql

  su-exec postgres /usr/lib/postgresql/16/bin/pg_ctl -D "$PGDATA" -w stop
  echo "==> PostgreSQL initialized."
else
  echo "==> PostgreSQL data directory already exists, skipping init."
  # Ensure socket-only config on existing installs
  if ! grep -q "^listen_addresses = ''" "$PGDATA/postgresql.conf" 2>/dev/null; then
    cat >> "$PGDATA/postgresql.conf" <<PGCONF
listen_addresses = ''
unix_socket_directories = '${PG_SOCKET_DIR}'
PGCONF
  fi
fi

# Configure pg_hba for local socket auth
cat > "$PGDATA/pg_hba.conf" <<EOF
local   all   all   trust
EOF

# ── Listener data dir ───────────────────────────────────────────────────────
mkdir -p /app/listener/data
chown -R node:node /app/listener/data

# ── Launch everything via supervisord ───────────────────────────────────────
exec /usr/bin/supervisord -c /etc/supervisord.conf
