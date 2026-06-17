#!/bin/bash
# set -eu: fail fast on errors AND on references to unset vars — for a security-
# sensitive entrypoint wiring auth tokens and Postgres credentials, a silently-empty
# expansion is worse than a loud failure. Every expansion below is guarded (:= / :-)
# or assigned earlier on an unconditional path, so -u is safe (matches the web hook).
set -eu

# ── Defaults ────────────────────────────────────────────────────────────────
: "${POSTGRES_USER:=homekit}"
: "${POSTGRES_PASSWORD:=changeme}"
if [ "$POSTGRES_PASSWORD" = "changeme" ]; then
  echo "WARNING: Using default POSTGRES_PASSWORD=changeme. Set a strong password via -e POSTGRES_PASSWORD=<secret>"
fi
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
export TZ

# ── API token auto-generation ───────────────────────────────────────────────
# If no API_TOKEN is provided, generate one on first run and persist it so
# the same token survives container restarts.
TOKEN_FILE="/app/listener/data/.api_token"
if [ -z "${API_TOKEN:-}" ]; then
  if [ -f "$TOKEN_FILE" ]; then
    API_TOKEN="$(cat "$TOKEN_FILE")"
  else
    API_TOKEN="$(openssl rand -hex 32)"
    # Write after listener data dir is created (below), so defer via a flag
    _WRITE_TOKEN=1
  fi
fi
export API_TOKEN

# ── Nginx env substitution ──────────────────────────────────────────────────
export LISTENER_HOST=127.0.0.1
export LISTENER_PORT="$API_PORT"
export DOLLAR='$'
# Standalone is host-local (LISTENER_HOST=127.0.0.1, an IP literal) so the
# resolver is never queried at runtime — but the template still renders it, and
# this bare envsubst would emit `resolver  valid=10s ...` (empty → nginx -t fail)
# if the var were unset. Default it so the rendered config is always valid.
export NGINX_RESOLVER="${NGINX_RESOLVER:-127.0.0.11}"

# SEC-07 cutover: compute NGINX_API_TOKEN from AUTH_ENABLED before envsubst.
# Fail-safe default true → empty token (session-only browser auth, T-23-BYPASS);
# only legacy 0/false/no/off inject the real API_TOKEN (v1.3 full-revert, D-07/D-09).
auth_enabled_lc=$(printf '%s' "${AUTH_ENABLED:-true}" | tr '[:upper:]' '[:lower:]')
# This file is now LF (normalized — PE-01); .gitattributes enforces eol=lf so it
# stays that way. The if/elif here is kept (it works fine; no need to churn to `case`).
if [ "$auth_enabled_lc" = "0" ] || [ "$auth_enabled_lc" = "false" ] || [ "$auth_enabled_lc" = "no" ] || [ "$auth_enabled_lc" = "off" ]; then
  NGINX_API_TOKEN="${API_TOKEN:-}"  # legacy: inject the real token (v1.3 full-revert)
else
  NGINX_API_TOKEN=''                # auth on (default): suppress the token (T-23-BYPASS)
fi
export NGINX_API_TOKEN

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
  gosu postgres /usr/lib/postgresql/16/bin/initdb -D "$PGDATA" \
    --username="$POSTGRES_USER" --pwfile=<(echo "$POSTGRES_PASSWORD")

  # Configure: Unix socket only, no TCP listener
  cat >> "$PGDATA/postgresql.conf" <<PGCONF
listen_addresses = ''
unix_socket_directories = '${PG_SOCKET_DIR}'
PGCONF

  # Start postgres temporarily for schema init
  gosu postgres /usr/lib/postgresql/16/bin/pg_ctl -D "$PGDATA" -w start

  # Create database if it doesn't exist
  gosu postgres psql -U "$POSTGRES_USER" -tc \
    "SELECT 1 FROM pg_database WHERE datname='${POSTGRES_DB}'" | grep -q 1 \
    || gosu postgres createdb -U "$POSTGRES_USER" "$POSTGRES_DB"

  # Schema is created by the listener's migrateDb() on first startup

  gosu postgres /usr/lib/postgresql/16/bin/pg_ctl -D "$PGDATA" -w stop
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
local   all   all   scram-sha-256
EOF

# ── Listener data dir ───────────────────────────────────────────────────────
mkdir -p /app/listener/data
chown -R node:node /app/listener/data

# Persist auto-generated token (deferred from above so data dir exists)
if [ "${_WRITE_TOKEN:-}" = "1" ]; then
  echo -n "$API_TOKEN" > "$TOKEN_FILE"
  chown node:node "$TOKEN_FILE"
  chmod 600 "$TOKEN_FILE"
  echo "============================================================"
  echo "  AUTO-GENERATED API TOKEN (saved to $TOKEN_FILE):"
  echo "  ${API_TOKEN:0:8}...$(echo -n "$API_TOKEN" | tail -c 4) (truncated — full token in $TOKEN_FILE)"
  echo ""
  echo "  Pass -e API_TOKEN=<token> to use your own token instead."
  echo "============================================================"
fi

# ── Launch everything via supervisord ───────────────────────────────────────
exec /usr/bin/supervisord -c /etc/supervisord.conf
