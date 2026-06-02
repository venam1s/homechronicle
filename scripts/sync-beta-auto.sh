#!/usr/bin/env bash
#
# sync-beta-auto.sh — unattended wrapper around sync-prod-to-beta.sh.
#
# Dockhand (the git-stack deployer) has no host post-deploy hook, so this is
# invoked two ways instead:
#   - by scripts/deploy-beta.sh, after it triggers the Dockhand sync API
#     (refresh beta right after each beta deploy)
#   - by a nightly cron / systemd timer (top up beta between deploys)
#
# Adds the things a bare manual script lacks for unattended use:
#   - flock lock so two runs never overlap (deploy + cron firing together)
#   - waits for prod/beta containers to be Running before syncing
#     (a deploy-triggered run may fire while beta is still starting)
#   - timestamped logging to stdout AND a log file (cron mails stdout on error)
#
# Run on the Dockhand host. Passes any extra args (e.g. --dry-run) through.
#
# Usage:  ./scripts/sync-beta-auto.sh [--dry-run]
#
# Config (override via env):
#   LOG_FILE        log destination (default /var/log/homechronicle-beta-sync.log)
#   LOCK_FILE       flock path      (default /tmp/homechronicle-beta-sync.lock)
#   WAIT_SECONDS    container-ready wait budget (default 120)
#   PROD_PG / BETA_PG / BETA_LISTENER  container names (passed through to sync)

set -euo pipefail

# cron runs with a minimal PATH (typically /usr/bin:/bin) and does not source a
# login profile, so docker/flock/pg tooling installed elsewhere (e.g. snap,
# /usr/local/bin) would be missing and every `docker` call would silently fail.
# Prepend the common locations, keeping any inherited PATH as a fallback.
export PATH="/usr/local/bin:/usr/bin:/bin:/sbin:/usr/sbin:/snap/bin:${PATH:-}"

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SYNC_SCRIPT="${ROOT_DIR}/scripts/sync-prod-to-beta.sh"

LOG_FILE="${LOG_FILE:-/var/log/homechronicle-beta-sync.log}"
LOCK_FILE="${LOCK_FILE:-/tmp/homechronicle-beta-sync.lock}"
WAIT_SECONDS="${WAIT_SECONDS:-120}"

# Container names (defaults mirror sync-prod-to-beta.sh; override if your
# Dockhand project names differ).
PROD_STACK="${PROD_STACK:-homechronicle}"
BETA_STACK="${BETA_STACK:-homechronicle-beta}"
PROD_PG="${PROD_PG:-${PROD_STACK}-postgres-1}"
BETA_PG="${BETA_PG:-${BETA_STACK}-postgres-1}"
BETA_LISTENER="${BETA_LISTENER:-${BETA_STACK}-listener-1}"
export PROD_STACK BETA_STACK PROD_PG BETA_PG BETA_LISTENER

# -- Logging: tee everything to the log file (best-effort) --------------------
# Pick the first writable log destination. /var/log is root-only on most hosts,
# so under a non-root cron we fall back to a repo-local then temp path rather
# than /dev/null — an unattended run must always leave evidence somewhere.
if ! { : >>"$LOG_FILE"; } 2>/dev/null; then
  for candidate in "${ROOT_DIR}/.beta-sync.log" "${TMPDIR:-/tmp}/homechronicle-beta-sync.log"; do
    if { : >>"$candidate"; } 2>/dev/null; then
      echo "[auto] WARN: cannot write ${LOG_FILE}; logging to ${candidate}" >&2
      LOG_FILE="$candidate"
      break
    fi
  done
  if ! { : >>"$LOG_FILE"; } 2>/dev/null; then
    echo "[auto] WARN: no writable log file; logging to stdout only" >&2
    LOG_FILE=/dev/null
  fi
fi
exec > >(while IFS= read -r line; do printf '%s %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$line"; done | tee -a "$LOG_FILE") 2>&1

log() { printf '[auto] %s\n' "$*"; }

# -- Single-instance lock -----------------------------------------------------
# Prefer flock (auto-releases if the process is killed); fall back to an atomic
# mkdir lock on hosts without flock (e.g. macOS) so this stays portable.
if command -v flock >/dev/null 2>&1; then
  exec 9>"$LOCK_FILE"
  if ! flock -n 9; then
    log "another sync is already running (lock: ${LOCK_FILE}); exiting"
    exit 0
  fi
else
  LOCK_DIR="${LOCK_FILE}.d"
  if ! mkdir "$LOCK_DIR" 2>/dev/null; then
    log "another sync is already running (lock: ${LOCK_DIR}); exiting"
    exit 0
  fi
  trap 'rmdir "$LOCK_DIR" 2>/dev/null || true' EXIT
fi

[[ -x "$SYNC_SCRIPT" ]] || { log "ERROR: sync script not executable: ${SYNC_SCRIPT}"; exit 1; }

# -- Wait for containers to be Running ----------------------------------------
container_running() {
  docker inspect -f '{{.State.Running}}' "$1" 2>/dev/null | grep -qx true
}

log "waiting up to ${WAIT_SECONDS}s for containers: ${PROD_PG}, ${BETA_PG}, ${BETA_LISTENER}"
deadline=$(( $(date +%s) + WAIT_SECONDS ))
until container_running "$PROD_PG" && container_running "$BETA_PG" && container_running "$BETA_LISTENER"; do
  if (( $(date +%s) >= deadline )); then
    log "ERROR: containers not all Running within ${WAIT_SECONDS}s; aborting"
    log "  ${PROD_PG}=$(container_running "$PROD_PG" && echo up || echo down)" \
        "${BETA_PG}=$(container_running "$BETA_PG" && echo up || echo down)" \
        "${BETA_LISTENER}=$(container_running "$BETA_LISTENER" && echo up || echo down)"
    exit 1
  fi
  sleep 3
done
log "containers ready"

# -- Run the sync -------------------------------------------------------------
log "starting sync-prod-to-beta.sh $*"
if "$SYNC_SCRIPT" "$@"; then
  log "sync completed OK"
else
  rc=$?
  log "ERROR: sync failed (exit ${rc})"
  exit "$rc"
fi
