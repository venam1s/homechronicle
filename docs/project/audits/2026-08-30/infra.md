# HomeChronicle — Infrastructure / Deployment-Surface Audit

- Date: 2026-08-30
- HEAD audited: `a39bcb0` (working-tree changes ignored)
- Mode: read-only. Checks run: `bash -n`/`sh -n` on every tracked script, CRLF scan, envsubst renders of `web/nginx.conf.template` (auth-on/bridge + auth-off/host) into scratch, and `scripts/test-nginx-template.sh` as committed at HEAD executed from a scratch copy (RESULT: PASS; `nginx -t` SKIPped — Docker daemon is down locally, so nothing requiring a running engine could be exercised).
- Prior audit: `.planning/SECURITY-AUDIT-2026-06-14.md` read first. Accepted items (`:latest` tags, standalone truncated-token log, PG16 `ALTER USER` cmdline, CSP `unsafe-inline`) are NOT re-reported. June infra fixes M-1 / M-7 / L-2 re-verified below.
- Tags: [VERIFIED] = confirmed by reading HEAD / rendering; [suspected] = strong reasoning, needs one live check.
- Severity is for a self-hosted home deployment behind Traefik + Authelia.

Counts: HIGH 2 (1 verified, 1 suspected) · MEDIUM 6 · LOW 11

---

## HIGH

### H-1 — Standalone image ships without `listener/migrations/` → listener cannot boot [VERIFIED]

`Dockerfile.standalone:71-75` copies only `listener/package.json` and `listener/src/` into the runtime stage. `listener/src/db.js:77-80` resolves the migrations directory as `path.join(dirname(db.js), '../migrations')` → `/app/listener/migrations`, which does not exist in the standalone image. `listener/src/index.js:235` does an unconditional top-level `await migrateDb()`, so node-pg-migrate throws on the missing directory, the process exits, and supervisord (`docker/standalone/supervisord.conf:18-27`, `autorestart=true`) restarts it forever. Net effect: a fresh standalone container never becomes healthy (`Dockerfile.standalone:99-100` healthcheck hits `/api/health` via nginx → 502).

History: migrations were introduced 2026-04-02 (`1f2390e`); `listener/Dockerfile:34` got `COPY migrations/` on 2026-04-06 (`e426924`); `Dockerfile.standalone` was last touched 2026-06-03 (`a6ce5bb`) and never received the equivalent line. The standalone image is built only on stable tags (`.gitlab-ci.yml:184-190`), so `havuq/homechronicle-standalone:0.2.0`, `0.3.0`, `0.3.1`, `0.3.2` are all affected. No test or CI job exercises the standalone image.

Fix: add `COPY --chown=node:node listener/migrations/ ./migrations/` after `Dockerfile.standalone:74`. See also M-2 (same Dockerfile, `patches/` omitted).

### H-2 — Default `LISTENER_HOST=host.docker.internal` is an `/etc/hosts` entry, but the new variable `proxy_pass` resolves via DNS only [suspected — verify with one command]

After `f8295c5`, every `/api` block uses `set $hc_listener ${LISTENER_HOST}` + `proxy_pass http://$hc_listener:…` with `resolver ${NGINX_RESOLVER}` (`web/nginx.conf.template:23,79-80,95-96,107-108`). nginx semantics: a hostname in a variable `proxy_pass` is resolved at request time **exclusively through the `resolver` directive** — nginx never consults `/etc/hosts` on that path (the old static `proxy_pass` used the libc resolver at config load, which does read `/etc/hosts`).

`docker-compose.yml:84-87` and `docker-compose.portainer.yml:62-65` (and every doc preset: `docs/guide/networking.md:45-56`, `docs/guide/portainer.md:28`, `.env.example:43`) default `LISTENER_HOST=host.docker.internal`, which exists only because of `extra_hosts: host.docker.internal:host-gateway` — i.e. an `/etc/hosts` line. On Linux Docker Engine the embedded DNS at `127.0.0.11` serves container names/aliases and forwards everything else to the host's upstream DNS; it does not answer from the container's `/etc/hosts`. Expected outcome on a stock Linux host-network deployment with the post-June web image: every `/api/*` request logs `host.docker.internal could not be resolved (3: Host not found)` and returns 502 — the exact symptom the fix was meant to cure, now permanent instead of after-recreate. (Docker Desktop on macOS resolves `host.docker.internal` inside its DNS proxy, so local dev would mask this.)

Why it was not caught: the render test only exercises `LISTENER_HOST=listener` (a compose alias, DNS-resolvable) and `127.0.0.1` (IP literal, resolver unused) — `scripts/test-nginx-template.sh:41,170,249-250`; the runtime probe in `.planning/quick/260617-f5d…/260617-f5d-VERIFICATION.md` was against beta's `hc-beta-listener` network alias; `nginx -t` never touches DNS. `docs/guide/troubleshooting.md:130` suggests `ping host.docker.internal`, which tests the libc/hosts path nginx no longer uses. Production's compose lives in Dockhand (not this repo), so its actual `LISTENER_HOST` is unknown from here.

Verify on the host (30 s): `docker compose exec web sh -c 'nslookup host.docker.internal 127.0.0.11; wget -qSO- http://127.0.0.1/api/health'`. If the first fails and the second 502s, this is confirmed.

Fix options (pick one): (a) in `web/docker-entrypoint.d/15-compute-api-token.envsh` (already sourced before envsubst), if `LISTENER_HOST` is present in `/etc/hosts` (`getent hosts "$LISTENER_HOST"`), export the resolved IP as `LISTENER_HOST` — extra_hosts/host-gateway entries are static for the container's life, so nothing is lost, and compose aliases keep per-request re-resolution; (b) change the compose/doc defaults to the docker bridge gateway IP (`172.17.0.1`) or the LAN IP; (c) document that `NGINX_RESOLVER` cannot help here. Also add a render/probe case for an `/etc/hosts`-only name to `scripts/test-nginx-template.sh`.

---

## MEDIUM

### M-1 — Tag pipelines build and publish images without running `test` [VERIFIED]

`.gitlab-ci.yml:20-22` — `test` runs only for `merge_request_event` and `$CI_COMMIT_BRANCH == "main"`; `$CI_COMMIT_TAG` pipelines have no test job. `.build-base` (`:95-98`) needs only `validate-release`, and `create-release` (`:198-200`) likewise. A tag pushed on a red (or never-tested, e.g. force-pushed) main ships images to Docker Hub with `:latest` and creates a GitLab release untested. Fix: add `- if: $CI_COMMIT_TAG =~ /^v/` to `test.rules` and `needs: [test, validate-release]` to `.build-base` and `create-release`.

### M-2 — Standalone build omits `listener/patches/` → dnssd hardening patch silently not applied [VERIFIED]

`Dockerfile.standalone:16-19` runs `npm ci --omit=dev` after copying only `package.json` + `package-lock.json`; `listener/package.json` `postinstall: patch-package` then finds no `patches/` directory and exits 0. `listener/Dockerfile:15` copies `patches/` before `npm ci`. The single patch (`listener/patches/dnssd+0.4.1.patch`, commit `890f9a0`) adds a compression-pointer cycle guard + 128-iteration budget to `dnssd` `readFQDN` — i.e. a malformed-mDNS-packet hang/DoS mitigation for the HAP discovery path. The standalone image (once H-1 is fixed) runs without it. Fix: `COPY listener/patches/ ./patches/` before line 19.

### M-3 — Host-cron sync path (`sync-prod-to-beta.sh`) restores the FULL prod dump, non-atomically, including auth tables [VERIFIED]

`scripts/sync-prod-to-beta.sh:113-115` pipes `pg_dump --clean --if-exists --no-owner` (no `--exclude-table`) into `psql -v ON_ERROR_STOP=1 -q` (no `--single-transaction`). This is the path run by `scripts/sync-beta-auto.sh:113` from the nightly cron and from `scripts/deploy-beta.sh:102`. Consequences: (1) beta's `users` / `sessions` / `invites` / `password_reset_tokens` are dropped and replaced by prod's on every nightly run (the in-stack `docker/beta-db-sync.sh:111-114` deliberately excludes exactly these — the two paths contradict each other); (2) with `ON_ERROR_STOP` but no single transaction, a mid-stream error leaves beta half-restored (mitigated by the pre-sync backup at `:103`, but nothing restores it automatically; beta listener is `docker start`ed regardless at `:155`). Fix: mirror `beta-db-sync.sh` — add the four `--exclude-table=public.…` flags, `--single-transaction`, and the pgmigrations re-stamp, or retire the host path now that the in-stack one-shot exists.

### M-4 — `TRUST_PROXY=1` default (and docs) is wrong for the Traefik → nginx → listener chain that prod/beta actually use [VERIFIED]

`docker-compose.yml:43` and `docker-compose.portainer.yml:36` default `TRUST_PROXY: 1`, and `docs/guide/environment-variables.md:75` / `docs/guide/security.md:46` tell users "Set to 1 behind nginx **or Traefik**". But nginx always appends its own hop (`web/nginx.conf.template:84,100,112` `$proxy_add_x_forwarded_for`), so behind Traefik + nginx the chain is two hops; with `trust proxy = 1` Express takes the right-most untrusted entry = **Traefik's** IP as `req.ip` → every household user collapses into one auth rate-limit bucket (the June M-1 failure mode returns: 10 failed logins lock everyone out for 15 min). `docker-compose.beta.yml:108-109` correctly uses `2`. Production's compose is in Dockhand — check its value. Fix: docs should say "1 per proxy hop: nginx alone = 1, Traefik + nginx = 2", and `.env.example:95-102` should show both.

Related, not currently harmful: `web/nginx.conf.template:85,101,113` overwrite `X-Forwarded-Proto` with `$scheme` (`http` between Traefik and nginx). The listener does not read it today (no `x-forwarded-proto`/`req.secure`/`req.protocol` usage in `listener/src`), so this is inert — but it is the first thing to check if `SESSION_COOKIE_SECURE=true` is retried (beta:103-107 note). Prefer `$http_x_forwarded_proto` with `$scheme` fallback via `map`.

### M-5 — In-stack db-sync exclusion list is stale: FK-bearing tables from migrations 0007/0008 are still dumped [VERIFIED by reading; failure mode suspected]

`docker/beta-db-sync.sh:112` excludes `users sessions invites password_reset_tokens` only. `listener/migrations/0007_user_preferences.sql:5` (`user_id … REFERENCES users(id)`) and `0008_alert_rules_owner.sql:8` (`alert_rules.user_id … REFERENCES users(id)`) are dumped from prod and restored against beta's own, different `users` rows. Once prod runs ≥0.3.x with real accounts: any prod `user_preferences` row / owned `alert_rules` row whose `user_id` does not exist in beta violates the FK → `ON_ERROR_STOP` + `--single-transaction` roll back the entire restore → with `SYNC_REQUIRED=false` (default, `docker-compose.beta.yml:68`) the deploy "succeeds" and beta silently keeps stale data. When ids happen to coincide, prod users' preferences and alert-rule ownership are attached to unrelated beta users. Fix: add `--exclude-table=public.user_preferences`, and either exclude `alert_rules` or post-process `UPDATE alert_rules SET user_id = NULL` inside the same transaction. (Side note: the comment at `:106-108` about a dangling `DROP SEQUENCE pgmigrations_id_seq` is surprising — pg_dump normally dumps/excludes a SERIAL-owned sequence together with its table — but the workaround is harmless.)

### M-6 — Beta listener mounts production's `listener_data` read-write [VERIFIED]

`docker-compose.beta.yml:115` — `/mnt/Primary/apps/homechronicle/listener_data:/prod` on the **listener** service with no `:ro`, while the same path is `:ro` on `db-sync` (`:75`). Nothing in `listener/src` references `/prod` or `PROD_DATA_DIR` (grep), so the mount is unused; it only widens the blast radius of any beta listener bug, `docker exec`, or future code to prod's `pairings.json` / `matter-storage` (HomeKit/Matter pairing keys — the one thing the beta design explicitly keeps separate, `scripts/sync-prod-to-beta.sh:134-139`). Fix: delete the line, or `:ro` at minimum.

---

## LOW

- **L-1** [VERIFIED] `docker-compose.beta.yml:33` — postgres healthcheck embeds `PGPASSWORD=${BETA_DB_PASSWORD}` in the command string → visible in `docker inspect` / `ps` on the host. Put `PGPASSWORD` in the service `environment` and use `pg_isready` instead.
- **L-2** [VERIFIED] `docker-compose.yml:5-6,31-32,80-81` — `env_file: .env` on **all three** services injects the whole `.env` (API_TOKEN, SMTP_PASS, POSTGRES_PASSWORD, PROD_DB_* if present) into the postgres and web containers, which need 3–5 of those variables. Remove `env_file` from postgres/web (their explicit `environment:` maps already interpolate from `.env`).
- **L-3** [VERIFIED] `Dockerfile.standalone:29` `COPY web/ .` with root build context and **no root `.dockerignore`** (not tracked at HEAD): `web/.dockerignore` does not apply to a root-context build, so a local `web/node_modules` (host-native binaries) or `web/.env` is copied over the fresh `npm ci`, and `.git/`, `.planning/`, `graphify-out/*.png` bloat the context. CI's clean checkout hides it. Add a root `.dockerignore`.
- **L-4** [VERIFIED] `scripts/deploy-beta.sh:6,20,30` hard-code `http://172.16.1.15:30328` — stale after the Aug site move (CI uses `https://dh.venamis.net`, `.gitlab-ci.yml:272`) and plain HTTP for a bearer token if `DOCKHAND_TOKEN` is set.
- **L-5** [VERIFIED] `docker/beta-db-sync.sh:14-16,99` — header and the "prod not reachable" error text still describe `network_mode: host` + loopback ports, but `docker-compose.beta.yml:49-76` runs it on `my-network` with in-network names. Misleading when the next outage hits.
- **L-6** [VERIFIED] `docker/standalone/entrypoint.sh:10-13` keeps `POSTGRES_PASSWORD=changeme` as a default (residual of June M-7, which fixed only the portainer compose). Mitigated: standalone PG is socket-only (`:86 listen_addresses = ''`, `pg_hba` local-only `:114-116`), so it is reachable only from inside the container.
- **L-7** [VERIFIED] `docker/standalone/supervisord.conf` — priorities (10/20/30) order process *start*, not readiness; listener (`startsecs=5`) starts before postgres accepts connections and `await migrateDb()` has no retry, so first boot always logs a crash + `autorestart` cycle until PG is up. Works, but noisy and slows `start_period`. Consider a `pg_isready` wait in the listener command.
- **L-8** [VERIFIED] `.gitlab-ci.yml:136` — Trivy is `|| true` (advisory). Consider `--exit-code 1 --severity CRITICAL` as the only blocking level.
- **L-9** [VERIFIED] `scripts/test-nginx-entrypoint-chain.sh:46-69` does not define `NGINX_RESOLVER` and asserts only the `${NGINX_API_TOKEN}` literal — it would not catch the next undefined-variable boot failure. Add the generic `grep '${'` guard used in `test-nginx-template.sh:100`.
- **L-10** [VERIFIED] `docker-compose.beta.yml:92-93` places the beta listener on `empire-network` with LAN IP `10.0.0.195`; the API binds `0.0.0.0` (`listener/src/index.js:734`), so `:3002` is reachable LAN-wide, bypassing Traefik/Authelia/nginx (same posture as prod's host-network mode). June L-2 (`127.0.0.1` port bind, `:95`) therefore only closed the host-published path. Acceptable because the listener enforces its own auth + rate limits; set `API_BIND_ADDRESS` if the macvlan is only for mDNS.
- **L-11** [VERIFIED] Prod credential used by db-sync is prod's full read-write DB user (`docker-compose.beta.yml:60-62`, `.env.example:153-156`); the script only ever runs `pg_dump`/`pg_isready` against it, so writes are impossible today, but a dedicated `SELECT`-only role on prod would make "prod is read-only" a property of the credential rather than of the script.

Informational (no action): HSTS is correctly absent from nginx (TLS terminates at Traefik's `secured-ng@file`, beta:161). `create-release` `--description "$(cat …)"` quoting is fine; the CHANGELOG sed at `:213` leaves version dots unescaped (regex any-char) — negligible. No buildx `--cache-to/--cache-from` and a per-job builder → every tag is a cold multi-arch build (3 h timeout on standalone) — perf only. The runner mounts the host Docker socket for all jobs (runner config, outside this repo) — MR pipelines from untrusted forks would be root-equivalent on the runner [suspected]; fine for a personal project with no external MRs.

---

## June-2026 fixes re-verified

| Item | Status | Evidence |
|---|---|---|
| M-1 TRUST_PROXY set in prod/portainer compose | HOLDS (but see M-4 for the value) | `docker-compose.yml:43`, `docker-compose.portainer.yml:36` |
| M-7 `changeme` default removed from portainer | HOLDS | `docker-compose.portainer.yml:7` `${POSTGRES_PASSWORD:?…}` |
| L-2 beta listener port bound to loopback | HOLDS (see L-10) | `docker-compose.beta.yml:95` `127.0.0.1:${API_PORT:-3002}:…` |

## VERIFIED-CLEAN

**nginx per-request re-resolution (f8295c5)**
- `resolver ${NGINX_RESOLVER} valid=10s ipv6=off` declared exactly once at server scope (`web/nginx.conf.template:23`); inherited by all three `/api` locations. Rendered (scratch) lines 23, 79-80, 95-96, 107-108 confirm `set $hc_listener` + `proxy_pass http://$hc_listener:3001;` in the 300 s pairing block, the auth block, and the generic block. There is no SSE/streaming block; no fourth `proxy_pass` exists (template guard `test-nginx-template.sh:235-242`).
- `proxy_pass` is URI-less in all three blocks → full original URI including query string is forwarded (`?token=` for invite/reset survives). Confirmed by nginx semantics and by the live probe recorded in `260617-f5d-VERIFICATION.md` (`/api/auth/invite-status?token=bogus123` reached the backend).
- `NGINX_RESOLVER` rendered on all three paths: `web/Dockerfile:44` `ENV NGINX_RESOLVER=127.0.0.11` (stock 20-envsubst substitutes defined vars only); `docker/standalone/entrypoint.sh:53` export with default, line 53 < `envsubst` at 69; `scripts/test-nginx-template.sh:56-57` allow-list + default. `sh test-nginx-template.sh` from a HEAD copy → 19 PASS, 1 SKIP (nginx -t, Docker down), RESULT: PASS.
- Host-network mode (`LISTENER_HOST=127.0.0.1`, standalone `entrypoint.sh:46`, web `Dockerfile:36` default) renders `set $hc_listener 127.0.0.1;` — an IP literal is never sent to the resolver, so an unreachable `127.0.0.11` is harmless there.
- Keepalive/perf: the template sets no `proxy_http_version` and no `upstream {}` block, so upstream connections were already HTTP/1.0 close-per-request; the variable `proxy_pass` loses nothing. Cost is one DNS lookup per worker per 10 s per name — negligible.

**Security headers**
- Server-scope `add_header … always` (`template:25-31`) → present on 404/502 error responses. `location = /`, `= /index.html`, `= /service-worker.js` re-declare the full set (required by nginx's replace-not-merge inheritance) plus `no-store` (`:33-65`); `/api/*` and `/` inherit. CSP has `script-src 'self'`, `object-src 'none'`, `frame-ancestors 'none'`, `base-uri 'self'`.
- Express (`listener/src/index.js:476-482`) sets nosniff / DENY / no-referrer / COOP / CORP — a consistent subset of nginx's; CSP and Permissions-Policy are document-level and correctly live only in nginx. `x-powered-by` disabled (`:451`). `server_tokens off` (`template:16`).

**API_TOKEN injection / smuggling**
- Auth ON renders `proxy_set_header X-API-Token "";` ×3 (scratch render) → nginx omits a header whose value is empty, which also **discards** any client-supplied `X-API-Token` (proxy_set_header replaces, never appends). Auth OFF renders the real token ×3 (`rendered-authoff-host.conf`). Sentinel test asserts 0/3 for both modes, and the entrypoint-chain test proves the `*.envsh` export survives into envsubst (`15-compute-api-token.envsh:26-35`).
- `Authorization: Bearer` from a browser does pass through nginx, but it is accepted by design as the service-token path alongside sessions (AUTH-08, `index.js:571-578`); a client must already hold the secret, so there is nothing to smuggle. Session cookie is checked first (`:553-568`).

**Compose / Docker hardening**
- Postgres published on `127.0.0.1` in all three compose files (`docker-compose.yml:15`, `portainer:13`, `beta:23`). Standalone PG socket-only + `scram-sha-256` + `local`-only `pg_hba` (`entrypoint.sh:84-88,113-116`); `ensure-password.sh` forces scram (`:34`).
- Healthchecks on postgres/listener/web(standalone); `restart: unless-stopped`; `deploy.resources.limits` on prod + beta services; D-Bus socket `:ro` everywhere (`compose:50`, `portainer:40`, `beta:116`); listener runs as `node` (`listener/Dockerfile:41`; `supervisord.conf:20`); `apk/apt upgrade` in runtime stages; `LISTENER_NETWORK_MODE=host` is documented and required for mDNS.
- `AUTH_ENABLED` is passed identically to listener and web in every compose (`compose:91`, `portainer:69`, `beta:102,168`) so the nginx token-suppression cannot drift from the listener gate.

**Standalone image (beyond H-1/M-2)**
- `.gitattributes:7-9` enforces `eol=lf` on `*.sh`, `*.envsh`, and the entrypoint; no CR bytes in any tracked script at HEAD; all 9 scripts pass `bash -n`/`sh -n`. Entrypoint uses `set -eu` with every expansion guarded. Auto-generated token stored `0600` owned by `node` (`entrypoint.sh:124-126`).

**CI / release**
- `DOCKHAND_TOKEN`: job gated on presence, masked, sent only as a header by `curl -fsS` (no echo, `.gitlab-ci.yml:266-272`); `allow_failure` + `needs: [test]`. Docker Hub login via `--password-stdin`; credentials live only in the ephemeral job container's `~/.docker`. Standalone builds restricted to stable tags. `.github/workflows/*` are dormant mirrors (GitHub account suspended) and were not audited.

**Beta db-sync (in-stack)**
- `pg_dump … | psql -v ON_ERROR_STOP=1 --single-transaction` (`beta-db-sync.sh:121-122`) → a failed restore rolls back atomically; beta is never left half-restored on this path. Prod DSN is used only for `pg_isready` and `pg_dump` (read operations). Pairings/matter-storage are never copied (`:139-151`). Missing creds → best-effort skip with loud log (`:75-82`).
