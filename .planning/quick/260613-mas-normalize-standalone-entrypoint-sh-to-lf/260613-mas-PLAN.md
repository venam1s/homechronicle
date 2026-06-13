---
quick_id: 260613-mas
slug: normalize-standalone-entrypoint-sh-to-lf
description: Normalize standalone entrypoint.sh to LF and add .gitattributes (PE-01)
date: 2026-06-13
mode: quick
status: planned
---

# Quick Task 260613-mas: Fix PE-01 — standalone entrypoint CRLF parse error

## Problem

`docker/standalone/entrypoint.sh` is the **only** CRLF-line-ending shell script in the
repo. Its `\`-continuation lines (76, 89, 90) end with `\<CR><LF>`. bash treats `\<LF>`
as a line continuation but `\<CR>` as an escaped CR (CR is not special to any bash
version), so the continuation does not join the lines and the trailing
`|| gosu ... createdb` begins a command with `||` → `syntax error near unexpected
token '||'`. The standalone Docker image therefore cannot boot. Long-standing
(CR present back through HEAD~12; not a Phase 23 regression). Surfaced as PE-01 in
`.planning/phases/23-security-hardening-nginx-cutover/23-REVIEW.md`.

## Tasks

### Task 1 — Normalize entrypoint.sh to LF
- **files:** `docker/standalone/entrypoint.sh`
- **action:** Strip CR bytes (CRLF → LF) in place, preserving the executable bit and
  all script logic (the `if/elif` AUTH_ENABLED compute stays — it works under LF too;
  the `case`-avoidance comment becomes moot but is left as historical context or lightly
  updated). No logic changes.
- **verify:** `bash -n docker/standalone/entrypoint.sh` passes (currently fails);
  `file` no longer reports "CRLF line terminators"; the NGINX_API_TOKEN compute block
  still yields the correct value for AUTH_ENABLED on/off.
- **done:** Script parses cleanly with no CR bytes remaining.

### Task 2 — Add .gitattributes to prevent CRLF regression
- **files:** `.gitattributes` (new)
- **action:** Add rules enforcing LF for shell scripts (`*.sh`, `*.envsh`) and the
  standalone entrypoint explicitly, plus `* text=auto` as the baseline so future
  shell scripts can't reintroduce CRLF on checkin.
- **verify:** `git ls-files --eol docker/standalone/entrypoint.sh` reports `w/lf i/lf`;
  `git check-attr text eol -- docker/standalone/entrypoint.sh` shows `eol: lf`.
- **done:** Line endings are enforced by .gitattributes.

## must_haves
- truths:
  - `bash -n docker/standalone/entrypoint.sh` exits 0 (PE-01 parse error resolved)
  - `docker/standalone/entrypoint.sh` contains no CR (0x0D) bytes
  - `.gitattributes` enforces `eol=lf` for `*.sh` / `*.envsh`
  - No change to script logic or behavior (NGINX_API_TOKEN compute unchanged)
- artifacts:
  - `docker/standalone/entrypoint.sh` (LF)
  - `.gitattributes` (new)

## Out of scope / follow-up
- Full standalone-image **boot** smoke test (`docker build -f Dockerfile.standalone`)
  — Docker daemon unavailable locally. Recommend a CI standalone-boot check as a
  separate task once a Docker runner is available.
