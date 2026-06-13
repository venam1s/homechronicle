#!/bin/sh
# test-nginx-template.sh — Docker-free render assertion for the SEC-07 nginx
# X-API-Token cutover (Phase 23, Plan 01 RED scaffold / Plan 03 GREEN).
#
# Security property under test (D-07): the REAL upstream API token value must be
# injected into the rendered nginx config ONLY when AUTH_ENABLED is off (v1.3
# revert). When auth is on, the session cookie is the sole browser auth path and
# the token value must appear nowhere.
#
# We assert the COUNT of the token VALUE (a distinctive sentinel), NOT the
# presence of the `proxy_set_header X-API-Token` directive — that directive
# legitimately stays in the file (rendered as `"";`) when auth is on; nginx only
# omits the upstream header at RUNTIME. Counting the directive name would be a
# false signal (REVIEW HIGH BLOCKER 1).
#
# RED until Plan 03: the template still references ${API_TOKEN}, not the new
# ${NGINX_API_TOKEN}, so the sentinel (exported as NGINX_API_TOKEN) is never
# substituted into the three proxy blocks → the auth-off count is 0, not 3.
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
TEMPLATE="$SCRIPT_DIR/../web/nginx.conf.template"
SENTINEL='__SEC07_REAL_TOKEN__'

if ! command -v envsubst >/dev/null 2>&1; then
  echo "SKIP: envsubst not available (install gettext-base) — skipping local render test"
  exit 0
fi

if [ ! -f "$TEMPLATE" ]; then
  echo "FAIL: template not found at $TEMPLATE"
  exit 1
fi

# Render the template for a given AUTH_ENABLED value, applying the same
# AUTH_ENABLED -> NGINX_API_TOKEN compute logic the container entrypoints use.
render() {
  auth_raw=$1
  auth=$(printf '%s' "$auth_raw" | tr '[:upper:]' '[:lower:]')
  case "$auth" in
    0 | false | no | off) NGINX_API_TOKEN="$SENTINEL" ;; # auth OFF -> inject real token (v1.3 revert)
    *) NGINX_API_TOKEN='' ;;                              # auth ON  -> no token, session-only
  esac
  # API_TOKEN forced empty so the pre-rename ${API_TOKEN} placeholder renders
  # deterministically and never receives the sentinel.
  export DOLLAR='$'
  export LISTENER_HOST='listener'
  export LISTENER_PORT='3001'
  export API_TOKEN=''
  export NGINX_API_TOKEN
  envsubst '${DOLLAR} ${LISTENER_HOST} ${LISTENER_PORT} ${API_TOKEN} ${NGINX_API_TOKEN}' < "$TEMPLATE"
}

fail=0

count_on=$(render true | grep -c "$SENTINEL" || true)
if [ "$count_on" -eq 0 ]; then
  echo "PASS: AUTH_ENABLED=true  -> token value count = 0 (expected 0)"
else
  echo "FAIL: AUTH_ENABLED=true  -> token value count = $count_on (expected 0)"
  fail=1
fi

count_off=$(render false | grep -c "$SENTINEL" || true)
if [ "$count_off" -eq 3 ]; then
  echo "PASS: AUTH_ENABLED=false -> token value count = 3 (expected 3)"
else
  echo "FAIL: AUTH_ENABLED=false -> token value count = $count_off (expected 3)"
  fail=1
fi

if [ "$fail" -ne 0 ]; then
  echo "RESULT: FAIL"
  exit 1
fi
echo "RESULT: PASS"
