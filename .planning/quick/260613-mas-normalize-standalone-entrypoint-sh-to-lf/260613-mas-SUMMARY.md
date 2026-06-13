---
quick_id: 260613-mas
slug: normalize-standalone-entrypoint-sh-to-lf
description: Normalize standalone entrypoint.sh to LF and add .gitattributes (PE-01)
date: 2026-06-13
mode: quick
status: complete
commit: 55789a0
---

# Quick Task 260613-mas — Summary

Fixed **PE-01** (surfaced during the Phase 23 code review): `docker/standalone/entrypoint.sh`
had CRLF line endings, making its `\`-continuation + `||` block a fatal bash parse
error so the standalone Docker image could not boot.

## What changed

- **`docker/standalone/entrypoint.sh`**: converted CRLF → LF in place (perl `-i`,
  exec bit preserved). No logic change. Updated the now-stale `# this file uses CRLF`
  comment; kept the `if/elif` AUTH_ENABLED compute.
- **`.gitattributes`** (new): `* text=auto` baseline + `eol=lf` for `*.sh`, `*.envsh`,
  and the standalone entrypoint, so CRLF cannot regress on checkin.

## Verification

- `bash -n docker/standalone/entrypoint.sh` → **exit 0** (was `syntax error near
  unexpected token '||'`).
- `file` no longer reports "CRLF line terminators"; 0 CR (0x0D) bytes remain.
- `git ls-files --eol docker/standalone/entrypoint.sh` → `i/lf w/lf attr/text eol=lf`
  (was `i/crlf w/crlf`).
- `git check-attr text eol` → `eol: lf` for the entrypoint, `*.sh`, `*.envsh`.
- AUTH_ENABLED → NGINX_API_TOKEN compute re-exercised across `true/TRUE/""/false/FALSE/
  off/no/0/garbage` → unchanged (auth on/unset/garbage suppress the token; legacy
  `0/false/no/off` inject the real token).

## Out of scope / follow-up

- **Standalone-image boot smoke test not run** — Docker daemon unavailable locally.
  Recommend `docker build -f Dockerfile.standalone . && docker run ...` (and ideally a
  CI standalone-boot check) to confirm end-to-end once a Docker runner is available.
  Confidence the parse fix is correct is high (bash parser is the same across versions;
  `bash -n` now passes), but actual boot is unverified.

## Commit

- `55789a0` fix(260613-mas): normalize standalone entrypoint to LF + enforce via .gitattributes (PE-01)
