#!/usr/bin/env bash
#
# deploy-beta.sh — deploy the beta stack via the Dockhand git-stack sync API,
# then refresh beta's DB from prod once the new containers are up.
#
# Dockhand (http://172.16.1.15:30328) is an API-triggered git-stack deployer:
# it pulls the repo and runs `compose up`, but does NOT run a host-side
# post-deploy hook. So "refresh beta from prod on every deploy" is done by
# inverting control — this script drives the deploy, then drives the sync.
#
#   homechronicle-beta = git stack id 10 (repo id 4,
#   composePath docker-compose.beta.yml, envFilePath .env.beta)
#
# Run on the Dockhand host (it shells out to sync-beta-auto.sh, which uses
# `docker exec` against the beta/prod containers).
#
# Usage:  ./scripts/deploy-beta.sh [--dry-run] [--no-sync]
#
# Config (override via env):
#   DOCKHAND_URL     default http://172.16.1.15:30328
#   STACK_ID         git stack id (default 10)
#   DOCKHAND_TOKEN   optional bearer token (if your Dockhand requires auth)
#   SYNC_TIMEOUT     seconds to wait for syncStatus=synced (default 300)

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
AUTO_SYNC="${ROOT_DIR}/scripts/sync-beta-auto.sh"

DOCKHAND_URL="${DOCKHAND_URL:-http://172.16.1.15:30328}"
STACK_ID="${STACK_ID:-10}"
SYNC_TIMEOUT="${SYNC_TIMEOUT:-300}"

DRY_RUN=0
RUN_SYNC=1
for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=1 ;;
    --no-sync) RUN_SYNC=0 ;;
    *) echo "[deploy] unknown arg: $arg" >&2; exit 2 ;;
  esac
done

log()  { printf '[deploy] %s\n' "$*"; }
die()  { printf '[deploy] ERROR: %s\n' "$*" >&2; exit 1; }

command -v curl >/dev/null 2>&1 || die "curl not found on host"

AUTH=()
[[ -n "${DOCKHAND_TOKEN:-}" ]] && AUTH=(-H "Authorization: Bearer ${DOCKHAND_TOKEN}")

STACK_URL="${DOCKHAND_URL}/api/git/stacks/${STACK_ID}"

# -- Step 1: trigger the git-stack sync (deploy) ------------------------------
log "triggering Dockhand sync: POST ${STACK_URL}/sync"
if (( DRY_RUN )); then
  log "dry-run: skipping POST"
else
  code="$(curl -sS -o /tmp/dockhand-sync-resp.json -w '%{http_code}' \
            -X POST "${AUTH[@]}" "${STACK_URL}/sync" || echo 000)"
  [[ "$code" =~ ^2 ]] || die "sync POST failed (HTTP ${code}); response: $(cat /tmp/dockhand-sync-resp.json 2>/dev/null)"
  log "sync accepted (HTTP ${code})"
fi

# -- Step 2: poll for syncStatus=synced ---------------------------------------
# Dockhand reports {"syncStatus":"synced"} when the deploy settles. Polling is
# best-effort: if the field can't be read, fall back to a short fixed wait —
# sync-beta-auto.sh independently waits for containers to be Running anyway.
if (( DRY_RUN )); then
  log "dry-run: skipping sync-status poll"
else
  log "waiting up to ${SYNC_TIMEOUT}s for syncStatus=synced"
  deadline=$(( $(date +%s) + SYNC_TIMEOUT ))
  settled=0
  while (( $(date +%s) < deadline )); do
    body="$(curl -sS "${AUTH[@]}" "${STACK_URL}" 2>/dev/null || true)"
    if printf '%s' "$body" | grep -qE '"syncStatus"[[:space:]]*:[[:space:]]*"synced"'; then
      settled=1; log "stack reports synced"; break
    fi
    if printf '%s' "$body" | grep -qE '"syncStatus"[[:space:]]*:[[:space:]]*"(error|failed)"'; then
      die "Dockhand reports sync error; check the Dockhand UI for stack ${STACK_ID}"
    fi
    sleep 5
  done
  if (( ! settled )); then
    log "WARN: never observed syncStatus=synced within ${SYNC_TIMEOUT}s; proceeding (container wait will gate the sync)"
    sleep 15
  fi
fi

# -- Step 3: refresh beta DB from prod ----------------------------------------
if (( ! RUN_SYNC )); then
  log "--no-sync: deploy done, skipping prod->beta data refresh"
  exit 0
fi

[[ -x "$AUTO_SYNC" ]] || die "not executable: ${AUTO_SYNC}"
log "running prod->beta data refresh"
if (( DRY_RUN )); then
  "$AUTO_SYNC" --dry-run
else
  "$AUTO_SYNC"
fi
log "deploy + refresh complete"
