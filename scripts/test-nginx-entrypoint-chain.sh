#!/bin/sh
# test-nginx-entrypoint-chain.sh — boundary-faithful regression test for the SEC-07
# nginx X-API-Token cutover (Phase 23, CR-01 / WR-02).
#
# WHY THIS EXISTS (and why test-nginx-template.sh is not enough):
# test-nginx-template.sh renders the template with NGINX_API_TOKEN already exported in
# its OWN shell, so it validates only the template's substitution sites — it is
# structurally blind to whether the production entrypoint actually DELIVERS the variable
# to envsubst. CR-01 was exactly that blind spot: the compute hook was a *.sh file, which
# the stock nginx /docker-entrypoint.sh EXECUTES in a child process, so its
# `export NGINX_API_TOKEN` died before the separately-run 20-envsubst-on-templates.sh —
# leaving the literal ${NGINX_API_TOKEN} in the rendered config and aborting nginx.
#
# This test reproduces the real boundary:
#   * dispatch over the ACTUAL web/docker-entrypoint.d/ hooks by extension, exactly as
#     the stock entrypoint does: SOURCE *.envsh (exports persist), EXECUTE *.sh (exports
#     die in the child);
#   * then run envsubst with the same "only substitute defined env vars" whitelist the
#     stock 20-envsubst-on-templates.sh uses, so an UNDEFINED ${NGINX_API_TOKEN} is left
#     LITERAL (not blank).
# Crucially it never computes NGINX_API_TOKEN itself — the real hook must deliver it
# across that boundary. If the hook is renamed back to *.sh (re-introducing CR-01), the
# export is lost, the literal ${NGINX_API_TOKEN} survives, and this test FAILS.
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
REPO_ROOT=$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)
HOOK_DIR="$REPO_ROOT/web/docker-entrypoint.d"
TEMPLATE="$REPO_ROOT/web/nginx.conf.template"
SENTINEL='__SEC07_REAL_TOKEN__'
LITERAL='${NGINX_API_TOKEN}'

if ! command -v envsubst >/dev/null 2>&1; then
  echo "SKIP: envsubst not available (install gettext-base) — skipping entrypoint-chain test"
  exit 0
fi

if [ ! -f "$TEMPLATE" ]; then
  echo "FAIL: template not found at $TEMPLATE"
  exit 1
fi

# Render by running the REAL hook chain the way the stock nginx entrypoint does, then
# envsubst with the stock defined-env whitelist. Runs in a subshell so each invocation
# starts clean and no NGINX_API_TOKEN leaks between cases or from the caller.
render() {
  (
    export AUTH_ENABLED="$1"
    export API_TOKEN="$2"
    export DOLLAR='$'
    export LISTENER_HOST='listener'
    export LISTENER_PORT='3001'
    unset NGINX_API_TOKEN 2>/dev/null || true

    # Stock /docker-entrypoint.sh dispatch: source *.envsh, execute *.sh (skip others).
    for f in "$HOOK_DIR"/*; do
      [ -f "$f" ] || continue
      case "$f" in
        *.envsh) [ -x "$f" ] && . "$f" ;;
        *.sh)    [ -x "$f" ] && "$f" ;;
        *) : ;;
      esac
    done

    # Stock 20-envsubst-on-templates.sh whitelist: only env-present vars are substituted,
    # so an undefined ${NGINX_API_TOKEN} is left LITERAL.
    defined_envs=$(awk 'END { for (n in ENVIRON) printf "${%s} ", n }' </dev/null)
    envsubst "$defined_envs" < "$TEMPLATE"
  )
}

fail=0

check() {
  mode="$1"; api_token="$2"; expect_sentinel="$3"
  out=$(render "$mode" "$api_token")

  # PRIMARY guard: the hook's export must have reached envsubst — no literal survives.
  lit=$(printf '%s\n' "$out" | grep -cF "$LITERAL" || true)
  if [ "$lit" -eq 0 ]; then
    echo "PASS: AUTH_ENABLED=$mode -> no literal \${NGINX_API_TOKEN} survived (export reached envsubst)"
  else
    echo "FAIL: AUTH_ENABLED=$mode -> literal \${NGINX_API_TOKEN} survived ${lit}x — compute hook export lost before envsubst (CR-01: hook must be *.envsh, sourced)"
    fail=1
  fi

  # SECONDARY: the real token value appears only on the v1.3-revert (auth-off) path.
  cnt=$(printf '%s\n' "$out" | grep -cF "$SENTINEL" || true)
  if [ "$cnt" -eq "$expect_sentinel" ]; then
    echo "PASS: AUTH_ENABLED=$mode -> real token count = $cnt (expected $expect_sentinel)"
  else
    echo "FAIL: AUTH_ENABLED=$mode -> real token count = $cnt (expected $expect_sentinel)"
    fail=1
  fi
}

# auth ON (default): real token suppressed -> count 0, and no literal.
check true  "$SENTINEL" 0
# auth OFF (v1.3 full-revert): real token injected into all three proxy blocks -> count 3.
check false "$SENTINEL" 3

if [ "$fail" -ne 0 ]; then
  echo "RESULT: FAIL"
  exit 1
fi
echo "RESULT: PASS"
