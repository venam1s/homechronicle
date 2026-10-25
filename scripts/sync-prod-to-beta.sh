#!/usr/bin/env bash
#
# sync-prod-to-beta.sh — refresh the beta stack with a snapshot of prod's
# Postgres database and display config (rooms / display-names / notes /
# retention / alerts). Beta's HAP/Matter pairings are NOT copied — beta
# starts in viewer mode (no live subscriptions, no conflict with prod).
#
# Run on the Dockhand host. Both stacks must be up.
#
# Usage:  ./scripts/sync-prod-to-beta.sh [--dry-run]
#
# Safety:
#   - Beta listener is stopped during sync, restarted at the end
#   - Prod is read-only (pg_dump only)
#   - Beta's tables are reloaded with prod's DATA only (beta keeps its own
#     schema and pgmigrations — see docker/beta-sync-tables.sh); a beta dump is
#     taken first
#   - Account tables (users, sessions, invites, password_reset_tokens,
#     user_preferences) and pgmigrations are never touched; alert_rules owners
#     are nulled. The reload runs --single-transaction so it is atomic
#   - Existing beta pairings.json / matter-storage/ are moved to .bak.<ts>
#     (NOT deleted) before sync — beta will boot pairing-free

set -euo pipefail

# cron / non-login shells run with a minimal PATH and may not find docker (snap,
# /usr/local/bin, rootless installs). Prepend common locations so `docker` and
# `pg_*` resolve when this is invoked unattended. Keep inherited PATH as fallback.
export PATH="/usr/local/bin:/usr/bin:/bin:/sbin:/usr/sbin:/snap/bin:${PATH:-}"

# -- Config (override via env) -------------------------------------------------

PROD_STACK="${PROD_STACK:-homechronicle}"
BETA_STACK="${BETA_STACK:-homechronicle-beta}"

PROD_PG="${PROD_PG:-${PROD_STACK}-postgres-1}"
BETA_PG="${BETA_PG:-${BETA_STACK}-postgres-1}"
BETA_LISTENER="${BETA_LISTENER:-${BETA_STACK}-listener-1}"

PROD_DATA_DIR="${PROD_DATA_DIR:-/mnt/Primary/apps/homechronicle/listener_data}"
BETA_DATA_DIR="${BETA_DATA_DIR:-/mnt/Primary/apps/hc-beta/listener-data-beta}"

BETA_HEALTH_URL="${BETA_HEALTH_URL:-http://127.0.0.1:3002/api/health}"

DRY_RUN=0
[[ "${1:-}" == "--dry-run" ]] && DRY_RUN=1

# Display config files copied from prod -> beta (everything that is "what the
# UI shows" but not "what devices we own"). Add to this list as new
# JsonObjectStore files are introduced.
DISPLAY_CONFIG_FILES=(
  rooms.json
  display-names.json
  notes.json
  retention.json
  alerts.json
)

TS="$(date -u +%Y%m%dT%H%M%SZ)"
BACKUP_DIR="${BETA_DATA_DIR}/.sync-backup/${TS}"

# -- Helpers -------------------------------------------------------------------

log()  { printf '[sync] %s\n' "$*"; }
warn() { printf '[sync] WARN: %s\n' "$*" >&2; }
die()  { printf '[sync] ERROR: %s\n' "$*" >&2; exit 1; }

run() {
  if (( DRY_RUN )); then
    printf '[dry-run] %s\n' "$*"
  else
    eval "$@"
  fi
}

require_container() {
  local name="$1"
  docker inspect -f '{{.State.Running}}' "$name" 2>/dev/null | grep -qx true \
    || die "container not running: $name"
}

# -- Shared prod->beta exclusion list (single source of truth, M-13/M-14) ----
# This runs unattended from cron (via deploy-beta.sh / sync-beta-auto.sh), so
# a missing list is fatal here — silently dumping prod's auth tables into beta
# is the exact failure this plan fixes, and there is no interactive operator
# to notice a degraded skip like the in-container path allows.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BETA_SYNC_TABLES_FILE="${BETA_SYNC_TABLES_FILE:-${SCRIPT_DIR}/../docker/beta-sync-tables.sh}"
[[ -r "$BETA_SYNC_TABLES_FILE" ]] || die "shared exclusion list not found/readable: $BETA_SYNC_TABLES_FILE"
# shellcheck source=../docker/beta-sync-tables.sh
source "$BETA_SYNC_TABLES_FILE"

# -- Pre-flight ----------------------------------------------------------------

log "prod stack: ${PROD_STACK}  (pg=${PROD_PG})"
log "beta stack: ${BETA_STACK}  (pg=${BETA_PG}, listener=${BETA_LISTENER})"
log "prod data : ${PROD_DATA_DIR}"
log "beta data : ${BETA_DATA_DIR}"
log "timestamp : ${TS}"
(( DRY_RUN )) && log "DRY RUN — no changes will be made"

require_container "$PROD_PG"
require_container "$BETA_PG"
require_container "$BETA_LISTENER"

[[ -d "$PROD_DATA_DIR" ]] || die "prod data dir not found: $PROD_DATA_DIR"
[[ -d "$BETA_DATA_DIR" ]] || die "beta data dir not found: $BETA_DATA_DIR"

# Verify Postgres credentials are exported in container env
docker exec "$PROD_PG" sh -c 'test -n "$POSTGRES_USER" && test -n "$POSTGRES_DB"' \
  || die "prod postgres container missing POSTGRES_USER/POSTGRES_DB env"
docker exec "$BETA_PG"  sh -c 'test -n "$POSTGRES_USER" && test -n "$POSTGRES_DB"' \
  || die "beta postgres container missing POSTGRES_USER/POSTGRES_DB env"

# -- Step 1: backup beta ------------------------------------------------------

log "step 1: backing up beta DB to ${BACKUP_DIR}/beta-pre-sync.sql.gz"
run "mkdir -p '${BACKUP_DIR}'"
run "docker exec '${BETA_PG}' sh -c 'pg_dump -U \"\$POSTGRES_USER\" -d \"\$POSTGRES_DB\" --clean --if-exists --no-owner' | gzip > '${BACKUP_DIR}/beta-pre-sync.sql.gz'"

# -- Step 2: stop beta listener -----------------------------------------------

log "step 2: stopping beta listener (${BETA_LISTENER})"
run "docker stop '${BETA_LISTENER}'"

# -- Step 3: pg_dump prod -> beta ---------------------------------------------

DUMP_EXCLUDE="$(beta_sync_exclude_flags)"
PROD_TABLES="$(docker exec "$PROD_PG" sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tAqc "SELECT string_agg(tablename, '"' '"' ORDER BY tablename) FROM pg_tables WHERE schemaname = '"'public'"'"')"
[[ -n "$PROD_TABLES" ]] || die "could not list prod's tables"
SYNC_TABLES="$(beta_sync_tables_to_copy "$PROD_TABLES")"
log "step 3: reloading beta from prod data (streaming, single-transaction; tables: ${SYNC_TABLES}; untouched: ${BETA_SYNC_EXCLUDED_TABLES} ${BETA_SYNC_BETA_OWNED_TABLES})"
run "( beta_sync_pre_restore_sql '${SYNC_TABLES}'
    docker exec '${PROD_PG}' sh -c 'pg_dump -U \"\$POSTGRES_USER\" -d \"\$POSTGRES_DB\" --data-only --no-owner${DUMP_EXCLUDE}'
    beta_sync_post_restore_sql ) \
  | docker exec -i '${BETA_PG}' sh -c 'psql -U \"\$POSTGRES_USER\" -d \"\$POSTGRES_DB\" -v ON_ERROR_STOP=1 --single-transaction -q' \
  >/dev/null"

# -- Step 4: copy display config (NOT pairings) -------------------------------

log "step 4: copying display config files"
for f in "${DISPLAY_CONFIG_FILES[@]}"; do
  src="${PROD_DATA_DIR}/${f}"
  dst="${BETA_DATA_DIR}/${f}"
  if [[ -f "$src" ]]; then
    if [[ -f "$dst" ]]; then
      run "cp -p '${dst}' '${BACKUP_DIR}/${f}.bak'"
    fi
    run "cp -p '${src}' '${dst}'"
    log "  copied ${f}"
  else
    log "  skip   ${f} (not present in prod)"
  fi
done

# -- Step 5: quarantine stale beta pairings -----------------------------------
#
# These are intentionally NOT copied from prod — sharing pairing identity
# between two concurrent listeners makes both fight for HAP secured sessions.
# Move existing beta pairings (if any) into the backup dir so beta boots
# pairing-free. Restore manually if you ever want them back.

log "step 5: quarantining beta pairings + matter-storage (no copy from prod)"
for item in pairings.json matter-storage; do
  path="${BETA_DATA_DIR}/${item}"
  if [[ -e "$path" ]]; then
    run "mv '${path}' '${BACKUP_DIR}/${item}'"
    log "  moved  ${item} -> ${BACKUP_DIR}/${item}"
  else
    log "  absent ${item} (nothing to move)"
  fi
done

# -- Step 6: restart beta listener --------------------------------------------

log "step 6: starting beta listener"
run "docker start '${BETA_LISTENER}'"

# -- Step 7: health check -----------------------------------------------------

if (( DRY_RUN )); then
  log "dry-run: skipping health check"
else
  log "step 7: waiting for beta health (${BETA_HEALTH_URL})"
  for i in $(seq 1 30); do
    if curl -fsS --max-time 3 "$BETA_HEALTH_URL" >/dev/null 2>&1; then
      log "  beta healthy after ${i}s"
      break
    fi
    sleep 1
    [[ $i -eq 30 ]] && warn "beta did not become healthy in 30s — check 'docker logs ${BETA_LISTENER}'"
  done

  # Compare event counts so you immediately see if the dump landed
  prod_n=$(docker exec "$PROD_PG" sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tAqc "SELECT COUNT(*) FROM event_logs"' 2>/dev/null || echo "?")
  beta_n=$(docker exec "$BETA_PG"  sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tAqc "SELECT COUNT(*) FROM event_logs"' 2>/dev/null || echo "?")
  log "event_logs rows — prod=${prod_n}  beta=${beta_n}"
fi

log "done. backup: ${BACKUP_DIR}"
log "to restore beta DB:  gunzip -c ${BACKUP_DIR}/beta-pre-sync.sql.gz | docker exec -i ${BETA_PG} psql -U <user> -d <db>"
log "to restore beta pairings:  mv ${BACKUP_DIR}/{pairings.json,matter-storage} ${BETA_DATA_DIR}/"
