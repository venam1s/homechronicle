---
slug: prod-login-rejects-valid-creds
status: resolved
trigger: |
  the login is incorrect
created: 2026-08-14T15:59:41Z
updated: 2026-08-30T00:00:00Z
---

# Debug Session: prod-login-rejects-valid-creds

## Symptoms

- **expected_behavior**: Entering correct production credentials should authenticate
  successfully and grant access to the app.
- **actual_behavior**: Login is rejected as if credentials were wrong, even though the
  user is confident the credentials are correct.
- **error_messages**:
  - "Incorrect username or password" — **CORRECTION (see Evidence): this annotation was
    an UNVERIFIED INFERENCE, not a confirmed user quote.** The verbatim trigger was only
    "the login is incorrect." Live reproduction (below) shows this message is NOT proof
    of a real 401 — production is running a pre-fix build (v0.3.1) whose LoginPage.jsx
    shows this exact copy for ANY login failure, including a 502 backend outage (this is
    the precise bug that commit `7ab5600` fixed on 2026-06-17, two days after v0.3.1 was
    built). The original evidence-gathering step that wrote this annotation did not
    account for production potentially running an older build than `main`.
- **timeline**: Started around 2026-08-12/2026-08-13, coinciding with the flat-net
  homelab site move. Two related incidents from that window are already fixed and are
  NOT tracked in this git repo (see project memory `project_dockhand_prod_empire_ip_outage.md`):
  1. Production found fully down (0 containers) — fixed 2026-08-12 (stale empire-network
     `ipv4_address` pin, `172.16.1.192` → `10.0.0.192`; full stack redeployed, all 3
     containers — web, listener, postgres — recreated fresh).
  2. Authelia `lan` CIDR stale after the site move, breaking LAN sign-in homelab-wide —
     fixed 2026-08-13.
  User reports access is from OUTSIDE the LAN / over the internet.
- **reproduction**: Attempt to log in to production HomeChronicle (`hc.venamis.net`)
  with known-valid credentials; login is rejected with the "Incorrect username/password"
  toast. **Directly reproduced in this session (see Evidence) — but the actual backend
  behavior is a 502 Bad Gateway on the login request, not a 401.**

## Hypothesis Ledger

### Current Focus

- **hypothesis (CONFIRMED, evidence-based; no in-repo code fix available — see below)**:
  Production is serving a web image built from `v0.3.1` (tagged 2026-06-15), which
  predates commits `f8295c5` and `7ab5600` (both merged 2026-06-17). Its nginx config
  uses the OLD static-hostname `proxy_pass` with no `resolver` directive, so nginx
  resolves the listener's Docker DNS name ONCE at container/worker startup and caches
  that IP for the container's lifetime. The 2026-08-12 site-move-outage fix redeployed
  the full `homechronicle` stack (all 3 containers recreated), which gave the listener
  container a NEW internal IP. The long-lived (old, unpatched) web/nginx container never
  re-resolved and has been dialing the dead old IP ever since — causing 502 on every
  `/api/*` route, including `POST /api/auth/login`. Because production's LoginPage.jsx
  is ALSO pre-`7ab5600`, it shows the same generic "Incorrect email or password" toast
  for this 502 as it would for a genuine 401 — which is why this reads as a credentials
  bug rather than an outage.
- **reasoning_checkpoint**:
  - hypothesis: "Production's web image predates the 2026-06-17 nginx-resolver fix
    (f8295c5) and the login-error-copy fix (7ab5600); the 2026-08-12 full-stack redeploy
    gave the listener a new IP that the old, unpatched nginx never re-resolved, so all
    `/api/*` calls 502 and the old frontend mislabels the 502 as 'incorrect credentials'."
  - confirming_evidence:
    - "Live probe (this session, repeated 3x + 1 timed run): `GET /` → 200 (serves
      static HTML fine); `GET /api/health`, `GET /api/auth/user-count`,
      `GET /api/auth/config`, `POST /api/auth/login` → 502 Bad Gateway, 100%
      reproducible, ~40ms response time (fast failure at nginx's proxy stage, not a
      credential-check code path)."
    - "Deployed bundle self-reports `buildVersion: v0.3.1`; `index.html` `Last-Modified:
      Tue, 16 Jun 2026 00:11:16 GMT`. `v0.3.1` was tagged 2026-06-15 20:01 -0400. Both
      predate `f8295c5`/`7ab5600` (2026-06-17 17:20 -0400) by ~2 days."
    - "`web/nginx.conf.template` and `web/src/components/LoginPage.jsx` in the CURRENT
      repo already contain both fixes (variable `proxy_pass` + server-scope `resolver`;
      `err.status === 401` branching) — ruling out an unfixed regression in the
      codebase itself."
    - "Project memory (`services/homechronicle.md`, `project_nginx_stale_upstream_502.md`)
      documents the 2026-08-12 incident recreating ALL 3 production containers, and
      independently documents this exact stale-upstream-IP failure mode from a prior
      (beta) incident that `f8295c5` was written to fix."
  - falsification_test: "If production is redeployed with a current (post-06-17) web
    image and `/api/*` still 502s identically, this hypothesis is wrong and the listener
    container itself is down/unhealthy (e.g., DB connection failure post-move) rather
    than a stale nginx cache. A cheaper interim test: `docker restart web` on production
    — if that alone clears the 502 (temporary self-fix even on the old image, since
    nginx re-resolves at startup), it strongly confirms the stale-cache mechanism; if the
    502 persists after a restart, the listener itself is not up/listening."
  - fix_rationale: "No in-repo code change applies — both underlying bugs (nginx
    stale-upstream caching, undifferentiated login error copy) were already fixed on
    2026-06-17 in commits `f8295c5` and `7ab5600`, present on `main` today. The only
    remaining action is operational: redeploy production to a current image (or at
    minimum `docker restart web` as an immediate stopgap) so the fixes take effect."
  - blind_spots: "Cannot directly inspect the production listener container's
    status/logs — SSH (`ssh sion 'docker ps ...'`) and any Dockhand-API token access
    were blocked by this session's sandbox policy (out-of-repo production
    infrastructure). Cannot 100% rule out an independent listener crash (e.g., Postgres
    connectivity failure surfaced by the same site move) as a contributing cause
    alongside — or instead of — the stale-cache mechanism. Have not confirmed whether
    Dockhand pulls `:latest` automatically or requires an explicit re-pull/redeploy
    action, i.e., why production is still on `v0.3.1` two months after newer commits
    landed. Have not directly confirmed which login screen the user actually saw
    (Authelia's own two-factor login vs. HomeChronicle's in-app login) — see note below."
  - note_on_two_layer_auth: "`hc.venamis.net` is normally gated by Authelia
    (`secured@file` Traefik middleware, `two_factor` policy) IN FRONT of HomeChronicle's
    own login. This session's probe got a direct 200/502 from HomeChronicle's own nginx
    (no Authelia redirect), which is expected because this session's requests match the
    LAN-bypass CIDR fixed on 2026-08-13 — it does not tell us whether the ORIGINAL
    external user's request passed through Authelia. Doesn't change the diagnosis: with
    every `/api/*` route 502ing, HomeChronicle cannot authenticate anyone right now
    regardless of which login screen was reached, but worth asking the user to confirm
    which login prompt rejected them so this isn't re-investigated later."
- **next_action**: CHECKPOINT (human-action) — see structured return. User needs to
  check the production `homechronicle` stack directly (Dockhand or `ssh sion`) since
  this session cannot reach it: `docker ps --filter name=homechronicle-` (confirm
  listener container is `Up`/healthy) and `docker logs homechronicle-listener-1 --tail
  100` (check for crash/DB-connect errors around 2026-08-12). If the listener is
  healthy, `docker restart homechronicle-web-1` should clear the 502 immediately
  (confirms stale-cache theory). Durable fix: redeploy production with a current web
  image (post-`f8295c5`/`7ab5600`, i.e., newer than `v0.3.1`).

### Eliminated

- hypothesis: "Real credential-verification bug in `listener/src/auth-router.js`
  `POST /login` (e.g., `findUserByEmail` returning null, `verifyPassword` failing,
  stale/wrong DB) causing a genuine 401 for valid credentials."
  evidence: "Live reproduction shows `POST /api/auth/login` currently returns 502 Bad
  Gateway, not 401 — the request never reaches the login handler at all (nginx cannot
  reach the listener upstream). `/api/auth/login` is mounted before Express's
  session/token gate in `listener/src/index.js`, so IF the listener were reachable, a
  credential-check code path would be the only way to produce a 401 there — but the
  transport layer (nginx → listener) is failing first, upstream of any application
  logic. The debug session's original assumption that the observed error copy proved a
  real 401 did not account for production potentially running a pre-`7ab5600` frontend
  build, which shows identical copy for any failure."
  timestamp: 2026-08-14T16:15:00Z
- hypothesis: "Stale DATABASE_URL / DB connectivity broken by the site move's IP
  renumbering (172.16.x → 10.0.0.x), similar to the beta empire-IP bugs."
  evidence: "`docker-compose.yml` (this repo) defaults `DATABASE_URL` to
  `postgresql://...@127.0.0.1:${POSTGRES_PORT}/...` — loopback, host-network mode —
  unaffected by LAN IP renumbering. Production's postgres data is a host bind mount
  (`/mnt/Primary/apps/homechronicle/db`, per homelab knowledge) untouched by the
  site-move network fix, which only changed the `empire-network` macvlan attachment
  used for LAN device discovery, not inter-container DB connectivity. No direct evidence
  of DB unreachability; superseded by the 502-at-nginx finding, which is upstream of any
  DB access — could still be a secondary/contributing issue but is not needed to explain
  current symptoms."
  timestamp: 2026-08-14T16:15:00Z

## Evidence

- timestamp: 2026-08-14T16:05:00Z
  checked: Live HTTPS probes against `https://hc.venamis.net` from this session
  found: |
    `GET /` → 200 (serves static `index.html` fine, no Authelia redirect from this
    session's source). `GET /api/health`, `GET /api/auth/user-count`,
    `GET /api/auth/config` → 502 (nginx default error page), repeated 3x, 100%
    consistent. `POST /api/auth/login` (bogus credentials) → 502, not 401.
  implication: |
    nginx (web container) itself is up and serving static assets, but cannot reach the
    listener backend for ANY `/api/*` route — this is a transport-layer failure, not an
    application-layer credential check. This directly contradicts the pre-filled
    Symptoms.errors assumption that the user's report proved a real 401.
- timestamp: 2026-08-14T16:08:00Z
  checked: Timed single request — `curl -m 70 -w "%{http_code} %{time_total}"
  https://hc.venamis.net/api/health`
  found: "HTTP 502 in ~0.04s (fast failure, not a ~60s `proxy_connect_timeout` hang)."
  implication: |
    Fast failure is consistent with nginx's cached/resolved upstream IP now belonging to
    nothing (or a different, non-listening process) on the local Docker bridge — an
    immediate RST/refused rather than a network black hole. Does not by itself
    distinguish "stale DNS cache" from "listener down," but rules out a slow-timeout
    network-partition style failure.
- timestamp: 2026-08-14T16:10:00Z
  checked: Deployed frontend bundle — fetched `/assets/index-CKWmm9Jv.js`, grepped for
  `buildVersion`; checked `Last-Modified`/`etag` on `GET /`
  found: |
    `buildVersion: v0.3.1`. `Last-Modified: Tue, 16 Jun 2026 00:11:16 GMT`.
    `git log` shows tag `v0.3.1` at 2026-06-15 20:01:24 -0400.
  implication: |
    Production is running a web image built ~2026-06-15/16 — two days BEFORE commits
    `f8295c5` (nginx per-request listener re-resolution) and `7ab5600` (401-vs-outage
    login error copy), both merged 2026-06-17 17:20 -0400. Production has not been
    redeployed with a newer image since. This is the missing link explaining both (a)
    why the stale-upstream-502 bug — already fixed on `main` — is live in production,
    and (b) why the frontend shows the misleading "incorrect credentials" copy for what
    is actually a 502.
- timestamp: 2026-08-14T16:12:00Z
  checked: `listener/src/index.js` auth-gate mounting order (lines ~505-590) and
  `listener/src/auth-router.js` `POST /login` handler
  found: |
    `app.use('/api/auth', createAuthPublicRouter(...))` is mounted BEFORE the
    session/token gate; `POST /login` is fully handled inside that router (verified
    `findUserByEmail` + `verifyPassword` + dummy-hash timing-equalization logic all look
    correct) and would only return 401 via `!user || !passwordOk` or
    `user.disabled_at`. A 502 cannot originate from this code — it's an nginx-level
    response, confirming the request never reached this handler in the current
    (broken) production state.
  implication: |
    No code-level bug found in the current login handler. Root cause is not in
    application logic.
- timestamp: 2026-08-14T16:14:00Z
  checked: "`~/ai-projects/homelab/knowledge/services/homechronicle.md` and
  `project_nginx_stale_upstream_502.md` (project memory)"
  found: |
    2026-08-12 incident record: prod stack was fully down (`containers: []`) due to a
    stale `empire-network` `ipv4_address` pin (`172.16.1.192`, out-of-subnet after the
    site move); fix redeployed the FULL stack, recreating all 3 containers including the
    listener (new internal IPs). Separately, project memory documents the exact
    "nginx caches listener IP at startup, container recreation causes persistent 502
    until `docker restart web`" failure mode from a June 2026 BETA incident, fixed by
    `f8295c5`/`7ab5600`.
  implication: |
    The 2026-08-12 redeploy is the precise trigger condition for the already-documented
    stale-upstream-IP bug — and production's web image (v0.3.1, pre-fix) was never
    patched against it.
- timestamp: 2026-08-14T16:16:00Z
  checked: Attempted `ssh sion 'docker ps ...'` / `docker logs` to directly confirm
  listener container health on production
  found: Blocked by this session's sandbox permission policy (remote production
    infrastructure access denied).
  implication: |
    Cannot directly confirm listener container health/logs from this session. This is
    the key remaining unknown and requires human action (see Current Focus /
    checkpoint).

## Resolution

root_cause: |
  Production is running a web image built from tag `v0.3.1` (2026-06-15/16), which
  predates commits `f8295c5` and `7ab5600` (merged 2026-06-17). Its nginx statically
  resolves the listener's Docker DNS name once at startup (no `resolver` directive, no
  variable `proxy_pass`). The 2026-08-12 site-move-outage recovery redeployed the full
  production stack (fixing a stale `empire-network` IP pin), recreating the listener
  container with a new internal IP. The long-lived, unpatched web/nginx container never
  re-resolved that name, so every `/api/*` request (including login) has 502'd since.
  Production's frontend is also pre-`7ab5600`, so it shows the same "Incorrect email or
  password" toast for this 502 as it would for a genuine bad-credentials 401 — which is
  why the report surfaced as a login/credentials bug rather than an outage. No bug
  exists in the current repository; both underlying issues were already fixed on
  2026-06-17 and are present on `main` today.
fix: |
  No in-repo code change. Operational fix required on production (outside this repo,
  compose lives only in Dockhand's internal store): (1) immediate stopgap —
  `docker restart` the production web container to force nginx to re-resolve the
  listener's current IP; (2) durable fix — redeploy production with a current web image
  built from `main` (post-`f8295c5`/`7ab5600`) so the stale-upstream-cache class of bug
  cannot recur, and so future error copy correctly distinguishes outages from bad
  credentials. Also recommended: check `docker logs homechronicle-listener-1` to rule
  out an independent listener crash contributing to/causing the 502 (see blind_spots).
verification: |
  User confirmed on 2026-08-30 that production login works again ("prod is fixed").
  Session closed on that confirmation; the operational fix was applied on the
  production host / Dockhand (outside this repo), not via a code change here.
files_changed: []
