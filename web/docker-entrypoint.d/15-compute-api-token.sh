#!/bin/sh
# 15-compute-api-token.sh — SEC-07 nginx X-API-Token cutover (Phase 23).
#
# Computes NGINX_API_TOKEN from AUTH_ENABLED and exports it BEFORE the stock
# nginx 20-envsubst-on-templates.sh renders nginx.conf.template (the 15- prefix
# guarantees ordering). The template injects ${NGINX_API_TOKEN} as the upstream
# X-API-Token header value on all three proxy blocks.
#
# Fail-safe default: AUTH_ENABLED unset/true -> NGINX_API_TOKEN is EMPTY, so nginx
# sends `X-API-Token ""` (no real token) and the browser must authenticate by
# session cookie alone (T-23-BYPASS). Only the explicit legacy values
# 0/false/no/off inject the real API_TOKEN for the v1.3 full-revert path (D-07/D-09).
set -eu

auth=$(printf '%s' "${AUTH_ENABLED:-true}" | tr '[:upper:]' '[:lower:]')
case "$auth" in
  0 | false | no | off)
    NGINX_API_TOKEN="${API_TOKEN:-}"  # legacy: inject the real token
    ;;
  *)
    NGINX_API_TOKEN=''                # auth on (default): suppress the token
    ;;
esac
export NGINX_API_TOKEN
