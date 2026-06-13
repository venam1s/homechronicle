---
phase: 23-security-hardening-nginx-cutover
plan: 03
subsystem: infra
tags: [nginx, envsubst, docker, docker-compose, auth, security]

# Dependency graph
requires:
  - phase: 23-security-hardening-nginx-cutover
    provides: scripts/test-nginx-template.sh RED scaffold (Plan 01)
provides:
  - nginx template injects ${NGINX_API_TOKEN} (computed from AUTH_ENABLED) on all 3 proxy blocks
  - web container compute hook 15-compute-api-token.sh + Dockerfile ENV AUTH_ENABLED=true
  - standalone entrypoint inline NGINX_API_TOKEN compute
  - AUTH_ENABLED propagated to the web service in all 3 compose files
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "AUTH_ENABLED-gated nginx token injection (fail-safe default true → token suppressed)"

key-files:
  created:
    - web/docker-entrypoint.d/15-compute-api-token.sh
  modified:
    - web/nginx.conf.template
    - web/Dockerfile
    - docker/standalone/entrypoint.sh
    - docker-compose.yml
    - docker-compose.beta.yml
    - docker-compose.portainer.yml

key-decisions:
  - "Standalone entrypoint uses if/elif (not case) for the AUTH_ENABLED branch: docker/standalone/entrypoint.sh has CRLF line endings and `case ... in\\r` breaks parsing where `if ... then` (already used throughout the file) tolerates the trailing CR. The web container hook keeps `case` because it is a fresh LF file (sh -n clean)."
  - "scripts/test-nginx-template.sh asserts the token VALUE count (sentinel), not directive presence — the rendered file legitimately keeps `proxy_set_header X-API-Token \"\";` when auth is on; nginx omits only the runtime upstream header (REVIEW HIGH BLOCKER 1)."
  - "Fail-safe default AUTH_ENABLED=true everywhere (Dockerfile ENV + all 3 compose web services + entrypoint defaults) → non-propagation suppresses the token, never injects it (T-23-BYPASS)."

patterns-established:
  - "15- entrypoint.d prefix orders the compute hook before the stock 20-envsubst-on-templates.sh"

requirements-completed: [SEC-07]

# Metrics
duration: ~25min
completed: 2026-06-13
---

# Phase 23 / Plan 03: Nginx X-API-Token Cutover Summary

**SEC-07: nginx no longer auto-authenticates browser requests with a real API_TOKEN under AUTH_ENABLED=true — the render test proves the real token value appears 0× (auth on) / 3× (auth off); session cookie becomes the sole browser auth path while the service-token path stays intact.**

## Accomplishments
- `web/nginx.conf.template`: all 3 proxy blocks now inject `${NGINX_API_TOKEN}` (0 `${API_TOKEN}` remain).
- `web/docker-entrypoint.d/15-compute-api-token.sh` (new, LF): AUTH_ENABLED→NGINX_API_TOKEN compute, runs before stock 20-envsubst; `web/Dockerfile` COPYs+chmods it and adds `ENV AUTH_ENABLED=true`.
- `docker/standalone/entrypoint.sh`: inline NGINX_API_TOKEN compute (if/elif, CRLF-safe) before its hand-rolled envsubst.
- `AUTH_ENABLED: ${AUTH_ENABLED:-true}` added to the **web** service env in docker-compose.yml, docker-compose.beta.yml, docker-compose.portainer.yml (gitlab-runner untouched — it has no web service).
- Plan-01 `scripts/test-nginx-template.sh` now GREEN (0 / 3).

## Task Commits
1. **Task 1: template rename + web compute hook + Dockerfile** — `feat(23-03): nginx X-API-Token cutover — NGINX_API_TOKEN template + compute hook + Dockerfile`
2. **Task 2: standalone inline compute + AUTH_ENABLED on 3 compose web services** — `feat(23-03): standalone entrypoint NGINX_API_TOKEN compute + AUTH_ENABLED on all web services`

## Self-Check: PASSED (checkpoint approved on render-test evidence)
- `scripts/test-nginx-template.sh` → PASS (token value count 0 auth-on / 3 auth-off).
- `sh -n web/docker-entrypoint.d/15-compute-api-token.sh` clean; standalone entrypoint `bash -n` shows only the pre-existing bash-3.2 `||` quirk (container bash 4+ unaffected), no error from the new block.
- AUTH_ENABLED confirmed under each web service env (yml/beta/portainer); gitlab-runner untouched.

## Human-verify checkpoint
Approved by developer on the automated render-test evidence (token value 0/3). The following live/standalone-runtime checks are DEFERRED to deployment and recorded as HUMAN-UAT items:
1. Standalone (supervisord) image: rendered default.conf carries empty X-API-Token under AUTH_ENABLED=true; real token ×3 under AUTH_ENABLED=false.
2. Live browser, AUTH_ENABLED=true: unauthenticated API calls → 401 (T-23-BYPASS); session-cookie login works.
3. `curl -H "x-api-token: $API_TOKEN"` still succeeds (service-token path intact, both modes).
