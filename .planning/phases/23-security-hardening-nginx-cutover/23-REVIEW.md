---
phase: 23-security-hardening-nginx-cutover
reviewed: 2026-06-13T10:40:00Z
depth: standard
files_reviewed: 17
files_reviewed_list:
  - docker/standalone/entrypoint.sh
  - listener/migrations/0006_session_metadata.sql
  - listener/src/auth-router.js
  - listener/src/db.js
  - listener/src/index.js
  - listener/test/auth-gate-empty-token.test.js
  - listener/test/csrf.test.js
  - listener/test/db-session.test.js
  - listener/test/sessions-metadata.test.js
  - listener/test/token-sweep.test.js
  - scripts/test-nginx-template.sh
  - web/docker-entrypoint.d/15-compute-api-token.sh
  - web/nginx.conf.template
  - web/src/components/ActiveSessionsPanel.jsx
  - web/src/components/ActiveSessionsPanel.test.jsx
  - web/src/hooks/useAuth.js
  - web/src/pages/SettingsPage.jsx
findings:
  critical: 1
  warning: 3
  info: 3
  total: 7
status: fixed
fixed: 2026-06-13T11:00:00Z
fix_scope: critical+warning
resolution:
  CR-01: fixed (6bd14df) — hook renamed *.sh -> *.envsh so the stock entrypoint sources it; set -eu dropped; Dockerfile COPY/chmod updated
  WR-01: fixed (6ce6d62) — standalone entrypoint set -e -> set -eu after auditing every expansion is :-guarded / pre-assigned. NOTE: surfaced a separate pre-existing concern PE-01 (see below) while verifying.
  WR-02: fixed (c2b4ee6) — added scripts/test-nginx-entrypoint-chain.sh; boundary-faithful (FAILS if hook renamed back to *.sh, PASSES on .envsh)
  WR-03: fixed (3e903f2) — bulk revoke uses Promise.allSettled + error toast + unconditional invalidate; regression test added
  IN-01: deferred — Info, outside default --fix scope (schema-level UA length cap; app-side truncation is the primary control)
  IN-02: deferred — Info, outside default --fix scope (ip_address TEXT vs INET; display-only today)
  IN-03: deferred — intentionally NOT folded in; the standalone copy's if/elif depends on CRLF line endings a shared case-based snippet would re-break
verification:
  listener: 609/609 pass
  web: 291/291 pass (290 -> +1 WR-03 regression test)
  test-nginx-template.sh: PASS
  test-nginx-entrypoint-chain.sh: PASS (new; fails on CR-01 regression)
  docker_smoke: not run (Docker daemon unavailable locally)
---

# Phase 23: Code Review Report

**Reviewed:** 2026-06-13T10:40:00Z
**Depth:** standard
**Files Reviewed:** 17
**Status:** issues_found

## Summary

Phase 23 delivers the v1.4 security keystone: self-scoped session view/revoke (SEC-05),
folded invite/reset token sweeps (SEC-06), and the nginx X-API-Token cutover (SEC-07). The
core authorization logic is sound and adversarially defensible — IDOR is closed in SQL,
session secrets are never selected/serialized, sweeps are individually transactional and
isolated, and the auth gate is verified to fail-closed (401) on empty-token + no-session.
Test status at review time: listener **609/609 pass**, web **290/290 pass**,
`test-nginx-template.sh` **PASS**.

However, the single most important deliverable of this phase — the nginx cutover — has a
**container-runtime defect that every test in the phase is structurally blind to**: the
computed `NGINX_API_TOKEN` never reaches nginx's envsubst in the standard (3-container) web
image, because the stock nginx entrypoint *executes* `*.sh` hooks as child processes rather
than *sourcing* them. This is exactly the "test re-implements the unit → composition defect
invisible to the suite" failure mode the project's own retro notes flag. The impact is worse
than fail-closed: because the stock envsubst only substitutes whitelisted (defined) env vars,
an undefined `NGINX_API_TOKEN` is left as the **literal** `${NGINX_API_TOKEN}` in the rendered
config, which nginx parses as an unknown runtime variable and **refuses to start** — so the
**default** `AUTH_ENABLED=true` 3-container deployment fails to boot, and the documented v1.3
revert path is broken as well. Verified by rendering the template with the variable unset
(literal `X-API-Token "${NGINX_API_TOKEN}"` remains in all three proxy blocks).

The remaining findings are robustness/quality issues: shell `set -e`-only handling in the
standalone entrypoint, triplicated compute logic that can drift, and a render test that
asserts its own re-implementation rather than the real entrypoint chain.

## Critical Issues

### CR-01: `NGINX_API_TOKEN` does not propagate to nginx envsubst in the standard web image — default deployment fails to start (and revert path is broken)

**File:** `web/docker-entrypoint.d/15-compute-api-token.sh:24` (`export NGINX_API_TOKEN`); `web/Dockerfile:28-29`; `web/nginx.conf.template:73,88,99`

**Issue:**
The standard web image is built `FROM nginx:1.30-alpine` (`web/Dockerfile:18`) and relies on
the stock nginx entrypoint to run `/docker-entrypoint.d/*` hooks. The stock
`/docker-entrypoint.sh` (stable, well-documented behavior) handles those hooks as:

- `*.envsh` → **sourced** (`. "$f"`) — exported vars persist into the entrypoint's environment
- `*.sh` → **executed** (`"$f"`) as a sibling child process — exported vars are scoped to that
  child and are **lost** when it exits

`15-compute-api-token.sh` is a `*.sh` file (confirmed: it is the only file in
`web/docker-entrypoint.d/`, mode `-rwxr-xr-x`). Its `export NGINX_API_TOKEN` therefore does
**not** propagate to the subsequent, separately-executed `20-envsubst-on-templates.sh`. Crucially,
`NGINX_API_TOKEN` is **never** declared as a Dockerfile `ENV` (verified: it appears only in a
comment at `web/Dockerfile:27` and in no compose file), unlike `LISTENER_HOST`/`LISTENER_PORT`/
`API_TOKEN`/`DOLLAR`/`AUTH_ENABLED` which are real `ENV` vars (`web/Dockerfile:32-37`) and thus
reach envsubst via the container environment. So `NGINX_API_TOKEN` is the one and only var in
the template whose delivery depends on cross-script export propagation — and that propagation
does not happen.

The consequence is **not** a benign empty render. The stock `20-envsubst-on-templates.sh`
substitutes **only variables present in the environment** (it builds a `defined_envs` whitelist
from `ENVIRON` — the same mechanism that necessitates the `DOLLAR=$` trick in this template).
With `NGINX_API_TOKEN` undefined at envsubst time it is **not** in the whitelist, so envsubst
leaves the **literal** token `${NGINX_API_TOKEN}` in the rendered `default.conf`. I verified this
directly:

```sh
unset NGINX_API_TOKEN
DOLLAR='$' LISTENER_HOST=x LISTENER_PORT=1 API_TOKEN= \
  envsubst '${DOLLAR} ${LISTENER_HOST} ${LISTENER_PORT} ${API_TOKEN}' \
  < web/nginx.conf.template | grep X-API-Token
# →  proxy_set_header X-API-Token "${NGINX_API_TOKEN}";   (×3, literal, unsubstituted)
```

In nginx config syntax, `"${NGINX_API_TOKEN}"` is a reference to an nginx runtime variable named
`NGINX_API_TOKEN`, which is not declared anywhere → nginx aborts with
`[emerg] unknown "NGINX_API_TOKEN" variable` and the web container **fails to start**.
Consequences by mode:

- **AUTH_ENABLED=true (the DEFAULT 3-container deployment):** literal `${NGINX_API_TOKEN}` →
  nginx config parse error → web container does not boot. This is a hard outage of the default
  configuration, not a fail-closed degradation.
- **AUTH_ENABLED=false (documented v1.3 full-revert path, D-07/D-09):** same parse failure; the
  real `API_TOKEN` is never injected. Revert path is broken too.

This was not caught earlier because (a) the beta deployment predates this template, and (b) the
**standalone** image computes `NGINX_API_TOKEN` and runs `envsubst` in a **single** process
(`docker/standalone/entrypoint.sh:49-60`), so it is genuinely unaffected — masking the problem
for anyone who only exercised standalone. The phase's render test (`scripts/test-nginx-template.sh`)
exports the variable in the same shell as `envsubst` (`:37-52`), so it can observe neither the
lost-export nor the literal-vs-empty outcome (see WR-02).

**Fix:** Make the computed value survive into the envsubst process. Rename the hook so the stock
entrypoint **sources** it:

```sh
# Rename: web/docker-entrypoint.d/15-compute-api-token.sh
#     ->  web/docker-entrypoint.d/15-compute-api-token.envsh
# (stock nginx entrypoint sources *.envsh, so `export NGINX_API_TOKEN` persists
#  into 20-envsubst-on-templates.sh)
```

and update `web/Dockerfile` COPY/chmod targets accordingly:

```dockerfile
COPY docker-entrypoint.d/15-compute-api-token.envsh /docker-entrypoint.d/15-compute-api-token.envsh
RUN chmod +x /docker-entrypoint.d/15-compute-api-token.envsh
```

**Caveat on the `.envsh` form:** because it is now *sourced* into the entrypoint's own shell
(not a clean child), its `set -eu` leaks into that shell and changes how subsequent hooks
(including `20-envsubst`) are handled — a stray non-zero return could abort startup. **Remove
`set -eu` (or scope it locally) in the `.envsh` version.** Keep the `${API_TOKEN:-}` defaulting
so an unset token does not error.

Then add a real container-level test (or a `docker run` smoke check) that asserts the
**rendered** `/etc/nginx/conf.d/default.conf` inside the built image contains the token 3× when
`AUTH_ENABLED=false` and a non-literal (empty) value when `AUTH_ENABLED=true` — exercising the
actual entrypoint.d chain, not a re-implementation. (See also IN-03 on de-duplicating the
triplicated compute logic.)

## Warnings

### WR-01: Standalone entrypoint uses `set -e` (not `set -eu`); unset `API_TOKEN` under the revert branch relies on `:-` defaulting only

**File:** `docker/standalone/entrypoint.sh:2,52-53`

**Issue:**
The standalone entrypoint runs `set -e` without `-u`, while the sibling
`15-compute-api-token.sh` runs `set -eu` (`web/docker-entrypoint.d/15-compute-api-token.sh:13`).
The inconsistency means the standalone script silently tolerates unset variables. In the
revert branch it assigns `NGINX_API_TOKEN="${API_TOKEN:-}"` (line 53), which is safe because
of the `:-` guard — but any future reference to an unset var elsewhere in this 127-line script
would expand to empty and continue rather than failing loudly. For a security-sensitive
entrypoint that wires auth tokens and Postgres credentials, fail-fast on unset vars is the
safer default.

**Fix:**
```sh
set -eu   # was: set -e
```
Then audit the script for any genuinely-optional vars and guard them with `${VAR:-default}`
explicitly (most already are: `POSTGRES_USER`, `API_TOKEN`, `_WRITE_TOKEN`, `WEB_PORT`, etc.).

### WR-02: `test-nginx-template.sh` asserts a re-implementation, not the real cutover chain — gives false confidence (masks CR-01)

**File:** `scripts/test-nginx-template.sh:37-52`

**Issue:**
The render test computes `NGINX_API_TOKEN` inside its own `render()` function and exports it in
the same shell that invokes `envsubst`. It therefore validates only the template's
substitution sites — not that the production entrypoint actually delivers the variable to
envsubst, nor what nginx does when the variable is undefined. It passes (and did pass at review)
even though CR-01 makes the real container fail to start. This is the project's documented
"composition-test-gap" anti-pattern: a test that re-implements the unit cannot catch a defect in
how the real units compose.

**Fix:** Keep the template-substitution assertion, but add a container-level assertion that runs
the **actual** entrypoint.d hooks against the built image (or a faithful harness that invokes the
hooks as the stock entrypoint does — execute `.sh`, source `.envsh` — leaving `NGINX_API_TOKEN`
unexported across the boundary) and then runs `nginx -t` / greps the rendered
`/etc/nginx/conf.d/default.conf`. With CR-01 unfixed, such a test should FAIL (config parse
error) for both `AUTH_ENABLED` values.

### WR-03: Bulk "Log out other devices" swallows per-session revoke failures with no user feedback

**File:** `web/src/components/ActiveSessionsPanel.jsx:67-74`

**Issue:**
`handleBulkRevoke` runs `Promise.all(others.map((s) => revoke.mutateAsync(s.id)))` inside a
`try { ... } finally { setBulkPending(false); }` with **no `catch`**. `Promise.all` rejects on
the first failed DELETE (e.g., a CSRF 403 after token rotation, or a transient 500), leaving the
remaining sessions un-revoked and surfacing nothing to the user — the spinner just stops and the
list silently re-renders (some rows still present). For a security action whose entire purpose
is "log out other devices," a partial silent failure is a meaningful trust gap: the user
believes other devices were logged out when some were not.

**Fix:** Use `Promise.allSettled`, surface a toast/error on any rejection, and always
invalidate the list so the UI reflects reality:
```jsx
async function handleBulkRevoke() {
  setBulkPending(true);
  try {
    const results = await Promise.allSettled(others.map((s) => revoke.mutateAsync(s.id)));
    const failed = results.filter((r) => r.status === 'rejected').length;
    if (failed > 0) {
      // surface via the app's toast system, e.g. addToast(`Could not revoke ${failed} session(s).`)
    }
  } finally {
    setBulkPending(false);
  }
}
```
(`mutateAsync` rejections are also currently unhandled in `handleRevoke`'s single-row path, but
there the row simply stays and `onSettled` clears the spinner — lower impact than the bulk case.)

## Info

### IN-01: `migration 0006` adds unbounded `TEXT` columns; DB-layer cap exists but the schema does not enforce it

**File:** `listener/migrations/0006_session_metadata.sql:7-8`

**Issue:**
`user_agent` and `ip_address` are `TEXT` with no length constraint. The authenticated-DoS /
DB-bloat vector (T-23-UA-DOS) is mitigated at the application layer — `createSession` truncates
`user_agent` to 512 chars (`listener/src/db.js:344`) — and there is a unit test for it
(`db-session.test.js:451-462`). That is the correct primary control. The note is only that the
schema itself does not encode the invariant, so any future insert path that bypasses
`createSession` (e.g., a direct query, a data import) could store an arbitrarily large UA. Not a
defect today; a defense-in-depth opportunity.

**Fix (optional):** `ALTER TABLE sessions ADD COLUMN IF NOT EXISTS user_agent VARCHAR(512);`
(or a `CHECK (length(user_agent) <= 512)`), keeping the app-side truncation as the user-facing
control.

### IN-02: `ip_address` stored as `TEXT` rather than `INET`; trailing-port / mapped-prefix handling is ad hoc

**File:** `listener/migrations/0006_session_metadata.sql:8`; `listener/src/auth-router.js:31`

**Issue:**
`ip_address` is `TEXT`. `extractSessionMeta` strips a leading `::ffff:` mapped-IPv4 prefix and
coerces empty to null (`auth-router.js:31`), which is reasonable, but a Postgres `INET` column
would normalize/validate addresses for free and make any future "sessions from this subnet"
queries sane. Display-only today, so `TEXT` is acceptable; flagging as a typing improvement.

**Fix (optional):** Use `INET` for `ip_address`; keep `user_agent` as text.

### IN-03: SEC-07 compute logic is triplicated and can drift

**File:** `web/docker-entrypoint.d/15-compute-api-token.sh:15-23`; `docker/standalone/entrypoint.sh:49-56`; `scripts/test-nginx-template.sh:38-43`

**Issue:**
The `AUTH_ENABLED → NGINX_API_TOKEN` mapping is implemented three times with subtly different
shells (`case` vs `if/elif`) and options (`set -eu` vs `set -e`). The standalone copy already
documents a CRLF-related divergence in its own comment (`docker/standalone/entrypoint.sh:50-51`).
Triplication invites drift: a future change to the accepted "off" values (`0/false/no/off`) or
the default must be made in three places. This overlaps CR-01 (the standard-image copy is the one
whose output is currently lost) and WR-02 (the test is a fourth near-copy).

**Fix:** Factor the mapping into a single sourced shell snippet (e.g.
`docker/compute-nginx-api-token.sh` that sets `NGINX_API_TOKEN`) and `.` it from both entrypoints
and the test, so all paths share one implementation. Pair with the CR-01 `.envsh` fix so the
shared snippet is sourced consistently.

---

## Pre-existing concern surfaced during --fix (out of scope — NOT fixed)

### PE-01: `docker/standalone/entrypoint.sh` has CRLF line endings; the `\`-continuation + `||` block looks like a fatal bash parse error (standalone image may not boot)

**File:** `docker/standalone/entrypoint.sh:89-91` (the `psql ... | grep -q 1 \` / `|| createdb` block); also continuation lines 76, 90.

**Status:** PRE-EXISTING (not introduced by Phase 23 — the CR is present on these lines back through HEAD~12, before SEC-07). NOT introduced or fixed by the WR-01 change. **Runtime impact UNVERIFIED** — Docker daemon unavailable locally, so this was not booted.

**Evidence / reasoning:**
- The whole file is CRLF (`file` reports "CRLF line terminators"; ~131 CR). The continuation lines end with `\<CR><LF>` (bytes `5c 0d 0a`).
- bash treats `\<LF>` as a line continuation but `\<CR>` as an escaped CR — CR is not special to bash and this is not version-dependent (bash 3.2 → 5.x behave the same). So the continuation does NOT join the lines; the trailing `|| gosu ... createdb` then begins a command with `||`.
- Reproduced locally on bash 3.2: both `bash -n` and execution fail with `syntax error near unexpected token '||'`. The container's `#!/bin/bash` (Debian bash 5.x) uses the same lexer rule, so it should fail identically.
- Likely unnoticed because prod/beta run the 3-container compose, not the standalone image (the "simpler but less flexible" variant). The author already worked around a *related* CRLF issue (`if/elif` instead of `case`, per the in-file comment at lines ~54-55), but that workaround does not cover `\`-continuation breakage.

**Why not fixed here:** outside this review's findings and outside the default `--fix` scope; the file is CRLF-delicate (the `if/elif` history shows a previous LF-conversion-class change is risky). Converting line endings or restructuring the `||` block deserves its own change + a standalone-image boot smoke test.

**Suggested follow-up (separate task):** boot the standalone image (`docker build -f Dockerfile.standalone . && docker run ...`) to confirm/deny the parse failure; if confirmed, normalize the file to LF (and add `* text=auto` / an `entrypoint.sh eol=lf` `.gitattributes` rule) or rewrite the `psql || createdb` block onto a single line, then add a standalone boot check to CI.

---

_Reviewed: 2026-06-13T10:40:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
_Fixes applied + PE-01 surfaced: 2026-06-13 (Claude, gsd-code-review --fix)_
