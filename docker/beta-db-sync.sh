#!/bin/sh
#
# beta-db-sync.sh — one-shot in-stack prod→beta refresh, run by the `db-sync`
# service in docker-compose.beta.yml before the beta listener starts.
#
# Mirrors only the SAFE parts of scripts/sync-prod-to-beta.sh, but over TCP
# instead of `docker exec` (the host script runs on the Dockhand host; this runs
# inside the stack). It:
#   - pg_dumps prod (READ-ONLY) and restores into beta's own postgres
#   - copies display config JSONs (rooms/display-names/notes/retention/alerts)
#   - NEVER copies pairings / matter-storage (beta stays viewer-mode)
#   - NEVER writes to prod
#
# Networking: this service runs with `network_mode: host`, so prod and beta
# postgres are reached at their host-loopback published ports (prod 127.0.0.1:5432,
# beta 127.0.0.1:5433). A bridge container cannot reach those loopback ports.
#
# Failure policy (SYNC_REQUIRED, default false): on a prod outage or a failed
# dump/restore, best-effort mode logs loudly and exits 0 so the beta listener
# still starts with prior/empty data; SYNC_REQUIRED=true makes such a failure
# exit non-zero and block the deploy.
#
# POSIX sh ONLY — postgres:16-alpine ships busybox ash, not bash. No arrays,
# no bash double-bracket test expressions; use POSIX single-bracket tests.

set -u
set -o pipefail 2>/dev/null || true  # busybox ash supports pipefail; tolerate if not

# -- Config (env with defaults) -----------------------------------------------
PROD_DB_HOST="${PROD_DB_HOST:-127.0.0.1}"
PROD_DB_PORT="${PROD_DB_PORT:-5432}"
PROD_DB_USER="${PROD_DB_USER:-}"
PROD_DB_NAME="${PROD_DB_NAME:-}"
PROD_DB_PASSWORD="${PROD_DB_PASSWORD:-}"

BETA_DB_HOST="${BETA_DB_HOST:-127.0.0.1}"
BETA_DB_PORT="${BETA_DB_PORT:-5433}"
BETA_DB_USER="${BETA_DB_USER:-homekit}"
BETA_DB_NAME="${BETA_DB_NAME:-homekit_events}"
BETA_DB_PASSWORD="${BETA_DB_PASSWORD:-}"

SYNC_REQUIRED="${SYNC_REQUIRED:-false}"
PROD_DATA_DIR="${PROD_DATA_DIR:-/prod}"
BETA_DATA_DIR="${BETA_DATA_DIR:-/app/data}"

# -- Logging ------------------------------------------------------------------
log()  { printf '%s [db-sync] %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*"; }
warn() { printf '%s [db-sync] WARN: %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*" >&2; }
err()  { printf '%s [db-sync] ERROR: %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*" >&2; }

# is_true VALUE — case-insensitive truthy check (true/1/yes).
is_true() {
  case "$(printf '%s' "${1:-}" | tr '[:upper:]' '[:lower:]')" in
    true|1|yes) return 0 ;;
    *) return 1 ;;
  esac
}

# fail_or_skip MSG — loud failure honoring the SYNC_REQUIRED policy.
fail_or_skip() {
  err "$1"
  if is_true "$SYNC_REQUIRED"; then
    err "SYNC_REQUIRED=true — failing the deploy (beta listener will not start)."
    exit 1
  fi
  warn "SYNC_REQUIRED is not set — proceeding so the beta listener still starts with prior/empty data."
  exit 0
}

# -- Validate required env ----------------------------------------------------
# Missing creds go through the SYNC_REQUIRED policy (default: skip the sync and
# let the deploy succeed) rather than hard-failing — an unconfigured optional
# refresh should not break the beta deploy pipeline. Set SYNC_REQUIRED=true to
# make a misconfigured/unreachable sync block the deploy.
missing=""
[ -n "$PROD_DB_USER" ]     || missing="$missing PROD_DB_USER"
[ -n "$PROD_DB_NAME" ]     || missing="$missing PROD_DB_NAME"
[ -n "$PROD_DB_PASSWORD" ] || missing="$missing PROD_DB_PASSWORD"
[ -n "$BETA_DB_PASSWORD" ] || missing="$missing BETA_DB_PASSWORD"
if [ -n "$missing" ]; then
  fail_or_skip "missing required env:$missing — set these in .env.beta on the host (PROD_DB_PASSWORD is a new secret). Skipping prod→beta sync."
fi

log "starting prod→beta refresh (prod=${PROD_DB_HOST}:${PROD_DB_PORT}/${PROD_DB_NAME}, beta=${BETA_DB_HOST}:${BETA_DB_PORT}/${BETA_DB_NAME})"

# -- Beta readiness guard (~60s) ----------------------------------------------
i=0
until PGPASSWORD="$BETA_DB_PASSWORD" pg_isready -h "$BETA_DB_HOST" -p "$BETA_DB_PORT" -U "$BETA_DB_USER" -d "$BETA_DB_NAME" >/dev/null 2>&1; do
  i=$((i + 1))
  if [ "$i" -ge 30 ]; then
    fail_or_skip "beta postgres not reachable at ${BETA_DB_HOST}:${BETA_DB_PORT} after ~60s"
  fi
  sleep 2
done
log "beta postgres ready"

# -- Prod precheck (turns silent connection-refused into a diagnosable error) -
if ! PGPASSWORD="$PROD_DB_PASSWORD" pg_isready -h "$PROD_DB_HOST" -p "$PROD_DB_PORT" -U "$PROD_DB_USER" -d "$PROD_DB_NAME" >/dev/null 2>&1; then
  fail_or_skip "prod postgres not reachable at ${PROD_DB_HOST}:${PROD_DB_PORT} — on a Linux host a bridge container CANNOT reach a loopback-published port; db-sync must run network_mode: host"
fi
log "prod postgres reachable"

# -- Dump prod (READ-ONLY) → restore beta -------------------------------------
# The Phase 20/21 auth tables must NEVER be overwritten from prod (prod predates
# them and has no users) — exclude them so the dump never touches beta's accounts.
# pgmigrations is NOT excluded: excluding it leaves a dangling DROP SEQUENCE
# pgmigrations_id_seq that fails because the kept table still depends on it. Instead
# pgmigrations is synced whole (prod's history replaces beta's), then beta's own
# extra migration rows (e.g. 0003/0004) are re-applied by name below so the listener
# never replays them on restart.
DUMP_EXCLUDE=""
for t in users sessions invites password_reset_tokens; do
  DUMP_EXCLUDE="$DUMP_EXCLUDE --exclude-table=public.${t}"
done

# Capture beta's migration rows BEFORE the refresh as name-keyed, idempotent inserts.
BETA_MIGRATIONS_SQL="$(PGPASSWORD="$BETA_DB_PASSWORD" psql -h "$BETA_DB_HOST" -p "$BETA_DB_PORT" -U "$BETA_DB_USER" -d "$BETA_DB_NAME" -tAqc \
  "SELECT string_agg(format('INSERT INTO pgmigrations (name, run_on) SELECT %L, %L WHERE NOT EXISTS (SELECT 1 FROM pgmigrations WHERE name = %L);', name, run_on, name), E'\n') FROM pgmigrations" 2>/dev/null || true)"

log "dumping prod and restoring into beta (--clean --if-exists, single-transaction; excluding auth tables)"
PGPASSWORD="$PROD_DB_PASSWORD" pg_dump -h "$PROD_DB_HOST" -p "$PROD_DB_PORT" -U "$PROD_DB_USER" -d "$PROD_DB_NAME" --clean --if-exists --no-owner $DUMP_EXCLUDE \
  | PGPASSWORD="$BETA_DB_PASSWORD" psql -h "$BETA_DB_HOST" -p "$BETA_DB_PORT" -U "$BETA_DB_USER" -d "$BETA_DB_NAME" -v ON_ERROR_STOP=1 --single-transaction -q
rc=$?
if [ "$rc" -ne 0 ]; then
  fail_or_skip "prod→beta dump/restore failed (exit ${rc})"
fi

# Re-apply beta's own migration rows (name-keyed, no duplicates) and fix the
# sequence so the listener sees 0003/0004 as already applied and does not replay.
if [ -n "$BETA_MIGRATIONS_SQL" ]; then
  printf '%s\nSELECT setval('\''pgmigrations_id_seq'\'', (SELECT MAX(id) FROM pgmigrations));\n' "$BETA_MIGRATIONS_SQL" \
    | PGPASSWORD="$BETA_DB_PASSWORD" psql -h "$BETA_DB_HOST" -p "$BETA_DB_PORT" -U "$BETA_DB_USER" -d "$BETA_DB_NAME" -v ON_ERROR_STOP=1 --single-transaction -q \
    || log "WARN: could not re-stamp beta migration rows — verify pgmigrations before restarting the listener"
fi

beta_rows="$(PGPASSWORD="$BETA_DB_PASSWORD" psql -h "$BETA_DB_HOST" -p "$BETA_DB_PORT" -U "$BETA_DB_USER" -d "$BETA_DB_NAME" -tAqc 'SELECT COUNT(*) FROM event_logs' 2>/dev/null || echo '?')"
log "restore OK — beta event_logs rows: ${beta_rows}"

# -- Copy display config (NEVER pairings / matter-storage) --------------------
log "copying display config from ${PROD_DATA_DIR} to ${BETA_DATA_DIR}"
for f in rooms.json display-names.json notes.json retention.json alerts.json; do
  if [ -f "${PROD_DATA_DIR}/${f}" ]; then
    if cp -p "${PROD_DATA_DIR}/${f}" "${BETA_DATA_DIR}/${f}" 2>/dev/null; then
      log "copied ${f}"
    else
      warn "could not copy ${f} (continuing)"
    fi
  else
    log "skip ${f} (not present in prod)"
  fi
done

log "db-sync complete"
exit 0
