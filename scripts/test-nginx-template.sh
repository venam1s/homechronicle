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

# -- Resolver override + auth-OFF + host-mode + composition guards (260830-0wr) --

# 1. Resolver override is rendered verbatim (the env var is honoured, not hard-coded).
override=$(NGINX_RESOLVER=10.0.0.53 render true)
if printf '%s\n' "$override" | grep -q 'resolver 10.0.0.53 valid=10s ipv6=off;'; then
  echo "PASS: NGINX_RESOLVER override rendered verbatim (10.0.0.53)"
else
  echo "FAIL: NGINX_RESOLVER override not rendered verbatim"
  fail=1
fi
override_resolver_line=$(printf '%s\n' "$override" | grep '^ *resolver ' || true)
if printf '%s\n' "$override_resolver_line" | grep -q '127.0.0.11'; then
  echo "FAIL: default resolver 127.0.0.11 leaked into the overridden resolver directive"
  fail=1
else
  echo "PASS: default resolver 127.0.0.11 does not appear in the overridden resolver directive"
fi

# 2. Exactly ONE resolver directive at server scope in the auth-ON render.
resolver_count=$(printf '%s\n' "$rendered" | grep -c '^ *resolver ' || true)
if [ "$resolver_count" -eq 1 ]; then
  echo "PASS: exactly one resolver directive at server scope"
else
  echo "FAIL: expected exactly one resolver directive (got $resolver_count)"
  fail=1
fi

# 3. Auth-OFF render carries the same per-request directives (fix must not depend
#    on the auth branch).
off=$(render false)
off_set_count=$(printf '%s\n' "$off" | grep -c 'set \$hc_listener' || true)
off_pp_count=$(printf '%s\n' "$off" | grep -c 'proxy_pass http://\$hc_listener:3001;' || true)
off_resolver_count=$(printf '%s\n' "$off" | grep -c '^ *resolver ' || true)
if [ "$off_set_count" -eq 3 ] && [ "$off_pp_count" -eq 3 ] && [ "$off_resolver_count" -ge 1 ]; then
  echo "PASS: auth-OFF render carries set \$hc_listener x3, proxy_pass :3001 x3, resolver present"
else
  echo "FAIL: auth-OFF render missing directives (set=$off_set_count/3, proxy_pass=$off_pp_count/3, resolver=$off_resolver_count)"
  fail=1
fi
if printf '%s\n' "$off" | grep -q '${'; then
  echo "FAIL: literal \${...} placeholder left in auth-OFF rendered config:"
  printf '%s\n' "$off" | grep '${'
  fail=1
else
  echo "PASS: no literal \${...} placeholders remain in the auth-OFF render"
fi

# 4. Host-mode render (standalone / LISTENER_HOST as an IP literal): no placeholders,
#    set/proxy_pass x3 using the IP literal directly.
host=$(render true 127.0.0.1)
host_pp_count=$(printf '%s\n' "$host" | grep -c 'proxy_pass http://\$hc_listener:3001;' || true)
host_set_count=$(printf '%s\n' "$host" | grep -c 'set \$hc_listener 127.0.0.1;' || true)
if [ "$host_pp_count" -eq 3 ] && [ "$host_set_count" -eq 3 ]; then
  echo "PASS: host-mode render carries proxy_pass :3001 x3, set \$hc_listener 127.0.0.1 x3"
else
  echo "FAIL: host-mode render missing directives (proxy_pass=$host_pp_count/3, set=$host_set_count/3)"
  fail=1
fi
if printf '%s\n' "$host" | grep -q '${'; then
  echo "FAIL: literal \${...} placeholder left in host-mode rendered config:"
  printf '%s\n' "$host" | grep '${'
  fail=1
else
  echo "PASS: no literal \${...} placeholders remain in the host-mode render"
fi

# 5. The rendered port is honoured in the auth-ON render too (checks 3/4 cover
#    auth-OFF and host-mode; the original FIX 1 check greps without the port).
on_pp_count=$(printf '%s\n' "$rendered" | grep -c 'proxy_pass http://\$hc_listener:3001;' || true)
if [ "$on_pp_count" -eq 3 ]; then
  echo "PASS: auth-ON render proxy_pass carries LISTENER_PORT :3001 x3"
else
  echo "FAIL: auth-ON render proxy_pass :3001 count = $on_pp_count (expected 3)"
  fail=1
fi

# 6. Composition guards: NGINX_RESOLVER must be DEFINED on every render path or
#    nginx fails to boot (the boot-fail landmine from 260617-f5d).
DOCKERFILE="$SCRIPT_DIR/../web/Dockerfile"
ENTRYPOINT="$SCRIPT_DIR/../docker/standalone/entrypoint.sh"

if grep -q '^ENV NGINX_RESOLVER=127.0.0.11' "$DOCKERFILE"; then
  echo "PASS: web/Dockerfile declares ENV NGINX_RESOLVER=127.0.0.11"
else
  echo "FAIL: web/Dockerfile does not declare ENV NGINX_RESOLVER=127.0.0.11"
  fail=1
fi

if grep -Fq 'export NGINX_RESOLVER="${NGINX_RESOLVER:-127.0.0.11}"' "$ENTRYPOINT"; then
  echo "PASS: docker/standalone/entrypoint.sh exports NGINX_RESOLVER with default 127.0.0.11"
else
  echo "FAIL: docker/standalone/entrypoint.sh does not export NGINX_RESOLVER with default 127.0.0.11"
  fail=1
fi

exp_line=$(grep -n 'export NGINX_RESOLVER=' "$ENTRYPOINT" | head -1 | cut -d: -f1 || true)
sub_line=$(grep -n 'envsubst <' "$ENTRYPOINT" | head -1 | cut -d: -f1 || true)
if [ -n "$exp_line" ] && [ -n "$sub_line" ] && [ "$exp_line" -lt "$sub_line" ]; then
  echo "PASS: entrypoint exports NGINX_RESOLVER (line $exp_line) before envsubst (line $sub_line)"
else
  echo "FAIL: entrypoint NGINX_RESOLVER export must precede its envsubst invocation (export=$exp_line, envsubst=$sub_line)"
  fail=1
fi

# 7. Template source guard: ${NGINX_RESOLVER} referenced exactly once, and every
#    proxy_pass in the template uses the variable form (no static fourth block).
resolver_ref_count=$(grep -c '${NGINX_RESOLVER}' "$TEMPLATE" || true)
if [ "$resolver_ref_count" -eq 1 ]; then
  echo "PASS: template references \${NGINX_RESOLVER} exactly once"
else
  echo "FAIL: template references \${NGINX_RESOLVER} $resolver_ref_count times (expected 1)"
  fail=1
fi

proxy_pass_total=$(grep -c 'proxy_pass ' "$TEMPLATE" || true)
proxy_pass_var=$(grep -c 'proxy_pass http://${DOLLAR}hc_listener' "$TEMPLATE" || true)
if [ "$proxy_pass_total" -eq 3 ] && [ "$proxy_pass_var" -eq 3 ]; then
  echo "PASS: all 3 proxy_pass lines in the template use the variable form (no static block)"
else
  echo "FAIL: template proxy_pass count mismatch (total=$proxy_pass_total, variable-form=$proxy_pass_var, expected 3/3)"
  fail=1
fi

# -- /etc/hosts pre-resolution of LISTENER_HOST (H-1, 260830-1pj) --
#
# The point of this section is to SOURCE the real hook (not re-implement its
# compute in-process) — a previous version of this script re-implemented the
# entrypoint's compute logic, which is exactly why H-1 escaped detection.
HOOK="$SCRIPT_DIR/../web/docker-entrypoint.d/15-compute-api-token.envsh"

# Runs the real hook in a subshell so it cannot clobber this script's own
# LISTENER_HOST / NGINX_API_TOKEN. Prints the resulting LISTENER_HOST on stdout.
# The hook's own log line is redirected to /dev/null so it can't pollute the
# captured value.
resolve_listener_host() {
  name=$1
  hosts_file=$2
  (
    LISTENER_HOST="$name"
    HC_HOSTS_FILE="$hosts_file"
    export LISTENER_HOST HC_HOSTS_FILE
    . "$HOOK" >/dev/null
    printf '%s' "$LISTENER_HOST"
  )
}

hosts_dir=$(mktemp -d)
hosts_fixture="$hosts_dir/hosts"
# Decoys are ordered BEFORE the real answer so a broken IPv6 guard, a broken
# comment-strip, or a broken whole-field match would all produce a WRONG
# result rather than accidentally passing:
#   - the commented line mentions host.docker.internal but must never match
#     (comment-strip correctness) — its "IP" 203.0.113.1 is a deliberately
#     different, stale address so a false match is distinguishable from case 1
#   - the IPv6 line also mentions host.docker.internal, on a line whose field 1
#     contains a colon (must be excluded, not treated as an IPv4 answer)
#   - the not-host.docker.internal-suffix line proves whole-field equality
#     (a substring match would wrongly fire here for "host.docker.internal")
#   - the real answer, 192.0.2.7, comes LAST
#   - the localhost line's field 1 (127.0.0.1) is reused by case 3 below to
#     double as a "field 1 is not a name" check
cat > "$hosts_fixture" <<HOSTS
# 203.0.113.1  host.docker.internal   (stale, commented)
::1  ip6-localhost host.docker.internal
198.51.100.9  not-host.docker.internal-suffix
192.0.2.7  host.docker.internal
127.0.0.1  localhost
HOSTS

# 1. Hosts-only name resolves to its IPv4, and that IP flows through render().
resolved=$(resolve_listener_host host.docker.internal "$hosts_fixture")
if [ "$resolved" = "192.0.2.7" ]; then
  echo "PASS: hosts-only name host.docker.internal resolved to 192.0.2.7"
else
  echo "FAIL: hosts-only name host.docker.internal resolved to '$resolved' (expected 192.0.2.7)"
  fail=1
fi
resolved_render=$(render true "$resolved")
resolved_set_count=$(printf '%s\n' "$resolved_render" | grep -c 'set \$hc_listener 192.0.2.7;' || true)
if [ "$resolved_set_count" -eq 3 ] && ! printf '%s\n' "$resolved_render" | grep -q '${'; then
  echo "PASS: resolved IP renders set \$hc_listener 192.0.2.7; x3, no literal \${...} left"
else
  echo "FAIL: resolved-IP render did not carry set \$hc_listener 192.0.2.7; x3 cleanly (got $resolved_set_count)"
  fail=1
fi

# 2. Compose alias (absent from the fixture) is left unchanged — the guard that
#    per-request re-resolution (260617-f5d) survives this fix.
alias_resolved=$(resolve_listener_host listener "$hosts_fixture")
if [ "$alias_resolved" = "listener" ]; then
  echo "PASS: compose alias 'listener' left unchanged (not in hosts fixture)"
else
  echo "FAIL: compose alias 'listener' resolved to '$alias_resolved' (expected unchanged)"
  fail=1
fi
alias_render=$(render true "$alias_resolved")
alias_set_count=$(printf '%s\n' "$alias_render" | grep -c 'set \$hc_listener listener;' || true)
if [ "$alias_set_count" -eq 3 ]; then
  echo "PASS: compose alias render carries set \$hc_listener listener; x3"
else
  echo "FAIL: compose alias render did not carry set \$hc_listener listener; x3 (got $alias_set_count)"
  fail=1
fi

# 3. IPv4 literal is left unchanged, even though 127.0.0.1 also appears as
#    field 1 of the fixture's localhost line (proves "field 1 is not a name").
ip_resolved=$(resolve_listener_host 127.0.0.1 "$hosts_fixture")
if [ "$ip_resolved" = "127.0.0.1" ]; then
  echo "PASS: IPv4 literal 127.0.0.1 left unchanged"
else
  echo "FAIL: IPv4 literal 127.0.0.1 resolved to '$ip_resolved' (expected unchanged)"
  fail=1
fi

# 4. Boot-fail guard: sourcing the hook under set -e for a name NOT in the
#    fixture must exit 0 and leave the value unchanged. A non-zero status here
#    means the container would fail to boot (CR-01 class regression).
set_e_output=$( (
  set -e
  LISTENER_HOST=not-in-fixture
  HC_HOSTS_FILE="$hosts_fixture"
  export LISTENER_HOST HC_HOSTS_FILE
  . "$HOOK" >/dev/null
  status=$?
  printf 'status=%s value=%s' "$status" "$LISTENER_HOST"
) )
set_e_status=$?
if [ "$set_e_status" -eq 0 ] && [ "$set_e_output" = "status=0 value=not-in-fixture" ]; then
  echo "PASS: hook survives set -e on the not-found path (exit 0, value unchanged)"
else
  echo "FAIL: hook did not survive set -e cleanly (subshell status=$set_e_status, output='$set_e_output')"
  fail=1
fi

# 5. Substring/comment safety: a superstring name resolves via whole-field
#    match (not substring), and a name appearing ONLY inside a comment must
#    not resolve to the commented (stale) IP — proven by case 1 returning the
#    real 192.0.2.7 answer, never the commented 203.0.113.1.
suffix_resolved=$(resolve_listener_host not-host.docker.internal-suffix "$hosts_fixture")
if [ "$suffix_resolved" = "198.51.100.9" ]; then
  echo "PASS: whole-field match resolves not-host.docker.internal-suffix to 198.51.100.9"
else
  echo "FAIL: not-host.docker.internal-suffix resolved to '$suffix_resolved' (expected 198.51.100.9)"
  fail=1
fi
if [ "$resolved" = "192.0.2.7" ]; then
  echo "PASS: commented stale IP (203.0.113.1) never surfaces — comment-stripping confirmed"
else
  echo "FAIL: comment-stripping regression — expected 192.0.2.7, got '$resolved'"
  fail=1
fi

rm -rf "$hosts_dir"

# 6. Composition guard, in the style of section 6 above: standalone's
#    entrypoint still pins an IPv4 literal, so the new hosts-resolution logic
#    is a documented no-op there and docker/standalone/entrypoint.sh needs no
#    change for H-1.
if grep -q '^export LISTENER_HOST=127.0.0.1' "$ENTRYPOINT"; then
  echo "PASS: docker/standalone/entrypoint.sh still pins export LISTENER_HOST=127.0.0.1 (IPv4 literal, no-op for H-1)"
else
  echo "FAIL: docker/standalone/entrypoint.sh no longer pins export LISTENER_HOST=127.0.0.1"
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
