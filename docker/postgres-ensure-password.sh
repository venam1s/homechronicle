#!/bin/bash
# Wrapper around the official postgres entrypoint that syncs the password
# from POSTGRES_PASSWORD into the running cluster on every startup.
#
# Why: The official image only sets the password during the first initdb.
# If the volume already exists, POSTGRES_PASSWORD is silently ignored,
# causing "password authentication failed" on every restart when the
# compose file password doesn't match what's baked into the volume.
set -e

PG_USER="${POSTGRES_USER:-postgres}"
PG_PASS="$POSTGRES_PASSWORD"

# Start the real entrypoint in the background
docker-entrypoint.sh postgres &
PG_PID=$!

# Forward SIGTERM/SIGINT to postgres so it shuts down cleanly.
# Without this, bash (PID 1) swallows the signal and docker SIGKILLs
# postgres after the grace period, causing "not properly shut down" on restart.
trap "kill -TERM $PG_PID; wait $PG_PID" SIGTERM SIGINT

# Wait for postgres to accept connections
until pg_isready -U "$PG_USER" -d postgres -q 2>/dev/null; do
  sleep 1
done

# Sync password via local Unix socket (trust auth — no password needed).
# Connect to 'postgres' database which always exists.
if [ -n "$PG_PASS" ]; then
  if psql -U "$PG_USER" --host /var/run/postgresql -d postgres \
       -c "ALTER USER \"$PG_USER\" PASSWORD '$PG_PASS';" 2>&1; then
    echo "ensure-password: synced password for user '$PG_USER'"
  else
    echo "ensure-password: WARNING — failed to sync password" >&2
  fi
fi

# Hand off to the postgres process
wait $PG_PID
