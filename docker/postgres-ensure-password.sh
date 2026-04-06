#!/bin/bash
# Wrapper around the official postgres entrypoint that syncs the password
# from POSTGRES_PASSWORD into the running cluster on every startup.
#
# Why: The official image only sets the password during the first initdb.
# If the volume already exists, POSTGRES_PASSWORD is silently ignored,
# causing "password authentication failed" on every restart when the
# compose file password doesn't match what's baked into the volume.
set -e

# Start the real entrypoint in the background
docker-entrypoint.sh postgres &
PG_PID=$!

# Wait for postgres to accept connections
until pg_isready -U "${POSTGRES_USER:-postgres}" -q 2>/dev/null; do
  sleep 1
done

# Sync password via local Unix socket (trust auth — no password needed)
if [ -n "$POSTGRES_PASSWORD" ]; then
  psql -U "${POSTGRES_USER:-postgres}" \
       --host /var/run/postgresql \
       -d "${POSTGRES_DB:-postgres}" \
       -c "ALTER USER \"${POSTGRES_USER:-postgres}\" PASSWORD '${POSTGRES_PASSWORD}';" \
       >/dev/null 2>&1 || true
fi

# Hand off to the postgres process
wait $PG_PID
