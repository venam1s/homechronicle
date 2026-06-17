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
  # Optional 2nd arg overrides LISTENER_HOST so we can render both bridge
  # (hostname → resolver used) and host (IP literal → resolver unused) modes.
  listener_host=${2:-listener}
  auth=$(printf '%s' "$auth_raw" | tr '[:upper:]' '[:lower:]')
  case "$auth" in
    0 | false | no | off) NGINX_API_TOKEN="$SENTINEL" ;; # auth OFF -> inject real token (v1.3 revert)
    *) NGINX_API_TOKEN='' ;;                              # auth ON  -> no token, session-only
  esac
  # API_TOKEN forced empty so the pre-rename ${API_TOKEN} placeholder renders
  # deterministically and never receives the sentinel.
  export DOLLAR='$'
  export LISTENER_HOST="$listener_host"
  export LISTENER_PORT='3001'
  export API_TOKEN=''
  export NGINX_API_TOKEN
  # NGINX_RESOLVER must be in the allow-list AND exported, or the rendered config
  # keeps a literal ${NGINX_RESOLVER} and nginx fails to boot.
  export NGINX_RESOLVER="${NGINX_RESOLVER:-127.0.0.11}"
  envsubst '${DOLLAR} ${LISTENER_HOST} ${LISTENER_PORT} ${API_TOKEN} ${NGINX_API_TOKEN} ${NGINX_RESOLVER}' < "$TEMPLATE"
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

# -- FIX 1 (260617-f5d): per-request re-resolution + directive preservation --
rendered=$(render true)

# resolver directive rendered at server scope (NGINX_RESOLVER substituted)
if printf '%s\n' "$rendered" | grep -q 'resolver 127.0.0.11 valid=10s'; then
  echo "PASS: resolver directive rendered"
else
  echo "FAIL: resolver directive missing or unrendered"
  fail=1
fi

# variable proxy_pass forces per-request DNS resolution in all three /api blocks
set_count=$(printf '%s\n' "$rendered" | grep -c 'set \$hc_listener' || true)
pp_count=$(printf '%s\n' "$rendered" | grep -c 'proxy_pass http://\$hc_listener:' || true)
if [ "$set_count" -eq 3 ] && [ "$pp_count" -eq 3 ]; then
  echo "PASS: variable proxy_pass + set \$hc_listener present x3"
else
  echo "FAIL: expected set \$hc_listener x3 (got $set_count) / proxy_pass http://\$hc_listener: x3 (got $pp_count)"
  fail=1
fi

# Boot-fail guard: no literal \${...} placeholder may survive the render
if printf '%s\n' "$rendered" | grep -q '${'; then
  echo "FAIL: literal \${...} placeholder left in rendered config:"
  printf '%s\n' "$rendered" | grep '${'
  fail=1
else
  echo "PASS: no literal \${...} placeholders remain"
fi

# Preservation gates: existing directives must survive unchanged
xapi=$(printf '%s\n' "$rendered" | grep -c 'proxy_set_header X-API-Token' || true)
t300=$(printf '%s\n' "$rendered" | grep -c 'proxy_read_timeout 300s' || true)
t30=$(printf '%s\n' "$rendered" | grep -c 'proxy_read_timeout 30s' || true)
# Count the access_log USAGE only (the log_format definition also mentions the name)
clog=$(printf '%s\n' "$rendered" | grep -c 'access_log /var/log/nginx/access.log combined_no_query' || true)
if [ "$xapi" -eq 3 ] && [ "$t300" -eq 1 ] && [ "$t30" -eq 2 ] && [ "$clog" -eq 1 ]; then
  echo "PASS: preserved directives (X-API-Token x3, 300s x1, 30s x2, combined_no_query x1)"
else
  echo "FAIL: preservation gate (X-API-Token=$xapi/3, 300s=$t300/1, 30s=$t30/2, combined_no_query=$clog/1)"
  fail=1
fi

# Optional: nginx -t on BOTH bridge (hostname) and host (IP literal) renders.
# nginx -t validates syntax only and never contacts DNS, so it passes even when
# 127.0.0.11 is unreachable in host mode.
if command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; then
  tmpdir=$(mktemp -d)
  render true listener  > "$tmpdir/bridge.conf"
  render true 127.0.0.1 > "$tmpdir/host.conf"
  for mode in bridge host; do
    if docker run --rm -v "$tmpdir/$mode.conf:/etc/nginx/conf.d/default.conf:ro" nginx:alpine nginx -t >/dev/null 2>&1; then
      echo "PASS: nginx -t OK ($mode mode)"
    else
      echo "FAIL: nginx -t failed ($mode mode)"
      docker run --rm -v "$tmpdir/$mode.conf:/etc/nginx/conf.d/default.conf:ro" nginx:alpine nginx -t 2>&1 | sed 's/^/  /'
      fail=1
    fi
  done
  rm -rf "$tmpdir"
else
  echo "SKIP: docker unavailable — nginx -t syntax check skipped (render assertions still enforced)"
fi

if [ "$fail" -ne 0 ]; then
  echo "RESULT: FAIL"
  exit 1
fi
echo "RESULT: PASS"
