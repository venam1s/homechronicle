# HomeChronicle API / Input-Validation Security Audit — 2026-08-30

- Scope: listener/src (HEAD, uncommitted changes ignored), specialty = input validation, SQL construction, SSRF, path/JSON-store handling, DoS via unbounded input, data-mutating endpoints.
- Method: read-only source review + one in-process exercise of `validateWebhookTargetUrl` / `resolveAndValidateWebhookTarget` with bypass-candidate inputs (no files changed, no network).
- Baseline: `.planning/SECURITY-AUDIT-2026-06-14.md`. Accepted / won't-fix items (M-8 CSP, L-8 sessionStorage, L-10 DNS-rebind residual, L-11 migration 0005, L-12 micro-items incl. `fec0::/10`, temp-name, `:latest`) are NOT re-reported.
- Post-audit delta (`git diff 89154e9..HEAD --stat -- listener/src listener/migrations`): 13 files, +450/-81 — alerts-router (per-user ownership), alerts.js (M-5 try/catch), auth-router (invite-status, disabled-login, accept-invite tx), db.js (getInviteByTokenHash), emails.js (HTML layout + escapeHtml), query-cache (M-4), retention-router (200 cap), security.js (min 12), subscriber/index (household alert gate removed, MALERT-07), migration 0008 (alert_rules.user_id).

Tags: **[VERIFIED]** = confirmed in source with a concrete triggering input; **[suspected]** = reasoned from source, not executed.

Counts: HIGH 1 · MEDIUM 2 · LOW 10 (3 informational)

---

## HIGH

### H-1 — Rate-limit key is attacker-controlled via `X-Forwarded-For` whenever `TRUST_PROXY` is set (prod default `1`, beta `2`) [VERIFIED]

`rateLimitKeyGenerator` (`listener/src/security.js:115-125`) does:

```js
if (req?.app?.get('trust proxy')) {
  const forwardedFor = req?.headers?.['x-forwarded-for'];
  if (typeof forwardedFor === 'string' && forwardedFor.trim()) {
    return forwardedFor.split(',')[0].trim();   // LEFTMOST entry
  }
}
```

The leftmost XFF entry is the one the *client* supplies. nginx appends rather than replaces: `proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for` (`web/nginx.conf.template:84,100,112`), so a request carrying `X-Forwarded-For: 203.0.113.9` reaches the listener as `203.0.113.9, <real-ip>` and is keyed as `203.0.113.9`. `docker-compose.yml:43` sets `TRUST_PROXY: ${TRUST_PROXY:-1}` (added for June M-1) and `docker-compose.beta.yml:109` sets `2`, so the branch is live in both documented deployments.

Trigger: `for i in $(seq 1 1000); do curl -s -X POST http://host:3000/api/auth/login -H "X-Forwarded-For: 10.$RANDOM.$RANDOM.$RANDOM" -H 'content-type: application/json' -d '{"email":"admin@x","password":"guess'$i'"}'; done` — every request lands in a fresh bucket; the login limiter (`auth-router.js:107-115`, `AUTH_RATE_LIMIT_MAX` per window) never fires. Every other limiter in the codebase uses the same generator (events, alerts, stats, setup, matter, archive, retention, alerts-settings), so all read/write limits are bypassable too.

Note this is the opposite of the intent expressed in the comment ("Only trust X-Forwarded-For when Express trust proxy is configured"): the *trust-proxy* setting is what makes Express's own `req.ip` safe (it walks from the right and skips `n` trusted hops), and the custom generator throws that away.

Residual mitigations: argon2id (`security.js:260-267`, ~19 MiB / t=2) makes each attempt cost ~tens of ms server-side; passwords ≥12 chars with a blocklist (`security.js:238-249`); no username enumeration (dummy-hash compare). Still, this is the only brute-force control and it is fully defeated by one header. Beta additionally sits behind Authelia; a bare prod deployment does not.

**Fix:** make the generator `return req.ip ?? req.socket?.remoteAddress ?? 'unknown'` unconditionally (Express already resolves `req.ip` correctly under `app.set('trust proxy', n)`), or drop the custom `keyGenerator` and let express-rate-limit's default `ipKeyGenerator(req.ip)` run. Either way, never read `x-forwarded-for` directly.

---

## MEDIUM

### M-1 — Disabling a user (or demoting an admin) does not stop their alert rules; admins cannot see or delete another user's rules [VERIFIED]

- `processAlertsForEvent` (`alerts.js:201-207`) selects `FROM alert_rules WHERE enabled = TRUE` with no join on `users.disabled_at` and no owner filter, so every enabled rule fires for every matching event regardless of the owner's account state.
- The disable path (`users-router.js`, `disableUser` + `revokeSessionsForUser`) never touches `alert_rules` (grep: no `alert_rules` reference in `users-router.js`). Only hard delete cascades (migration `0008_alert_rules_owner.sql:8`, `ON DELETE CASCADE`).
- All rule reads/writes are scoped to the *caller's own* `user_id`: `GET /rules` (`alerts-router.js:263-273`), `PATCH` (`:404`), `DELETE` (`:436`), `GET /deliveries` (`:459,468`). There is no admin-wide listing or override, so once a member is disabled their webhook keeps receiving the household event stream (accessory names, rooms, values, `buildPayload` `alerts.js:58-86`) and nobody with API access can stop it short of re-enabling the account, logging in as them, or editing the DB.
- Demotion variant: the member email lock (`alerts-router.js:305-307, 371-373`) is enforced only at write time; a demoted admin keeps any previously created email rules with an arbitrary `target_email`.
- Legacy variant (migration 0008 comment "A1"): on auth-off installs rules are backfilled with `user_id = NULL`; they keep firing (`alerts.js:205` has no owner predicate) but are invisible to every caller (`GET /rules` returns `[]` at `:264` when there is no session; `POST/PATCH/DELETE` return 401 at `:290, :348, :426`).

Trigger: member creates a webhook rule (scope `all`) → admin disables the member → toggle any light → `alert_deliveries` shows `status='sent'` for the disabled user's rule.

**Fix:** join `users u ON u.id = r.user_id AND u.disabled_at IS NULL` (or `r.user_id IS NULL` for legacy) in the rule SELECT; on disable/delete also `UPDATE alert_rules SET enabled=false WHERE user_id=$1`; add an admin-only `GET /rules?all=1` / `DELETE /rules/:id` override so orphaned and legacy-NULL rules are manageable; re-apply the member email lock on demotion.

### M-2 — Any member can drive unbounded outbound requests + `alert_deliveries` growth (no per-user rule cap, sequential 5 s timeouts, failures never suppressed, private LAN targets allowed by default) [VERIFIED]

- No cap on the number of rules per user or household (`alerts-router.js:288-343`); the write limiter is 60/min (`:59-64`), so ~200 rules take ~4 min.
- Per event, rules are processed sequentially with `await sendWebhook` (`alerts.js:235-273`), each bounded only by `ALERTS_WEBHOOK_TIMEOUT_MS` (default 5000, `alerts.js:5-9,131`). A rule pointing at an unroutable-but-allowed address (e.g. `http://10.255.255.1/`, private allowed by default `alerts.js:10-12`) costs the full timeout every time.
- Quiet-period suppression only considers `status = 'sent'` (`alerts.js:222-226`), so a rule whose target never answers is never suppressed — it retries on every matching event.
- The HAP handler awaits alert processing inline per change (`subscriber.js:388-390`), but `handleEvent` is an async listener whose promise is discarded, so concurrent events each spawn their own N×5 s chain → unbounded in-flight `fetch`es plus N `alert_deliveries` rows per event (`createDelivery` `alerts.js:101-117`; retention 90 days).
- Delivery `error` text stores up to 300 bytes of the remote response body (`alerts.js:153`), and the webhook payload carries the member's free-text `name/scopeValue/matchValue` (`alerts.js:62-72`; uncapped, see L-4) — an authenticated member can therefore also use the listener as a fixed-shape POST relay into LAN services (Home Assistant, Dockhand, etc.).

Trigger: member creates 200 rules `{scopeType:'all', operator:'contains', matchValue:'', targetUrl:'http://10.255.255.1/'}` (note `matchValue` must be non-empty — use a single common character such as `"e"`); a chatty sensor emitting 1 event/s then generates 200 outbound POSTs/s attempts, each holding a socket for 5 s, and 200 delivery rows/s.

**Fix:** cap rules per user (e.g. 25) and per household; fan out with a bounded concurrency pool and a global in-flight ceiling; apply quiet-period suppression to `failed` deliveries too (or exponential backoff per rule); consider `ALERTS_ALLOW_PRIVATE_TARGETS=false` as the default for member-created rules with admin opt-in; cap `name/scopeValue/matchValue` lengths.

---

## LOW

### L-1 — Alert-rule CRUD is dead in `AUTH_ENABLED=false` / service-token mode [VERIFIED]
`POST/PATCH/DELETE /api/alerts/rules` return 401 whenever `req.hcSession` is absent (`alerts-router.js:290, 348, 426`) and `GET` returns `[]` (`:264`). With `AUTH_ENABLED=false` no session is ever set (`index.js` gate), so the whole Alerts feature is unusable in legacy mode while legacy rules keep firing (see M-1). Functional regression from Phase 26 rather than a vulnerability, but it removes the only audit surface for rules that are still sending data.

### L-2 — Fire-time IP pinning breaks HTTPS webhooks to DNS-named hosts, nudging users to plaintext `http://` [suspected]
`sendWebhook` rewrites `fetchUrl.hostname` to the resolved IP and sets a `host` header (`alerts.js:138-146`). For `https://hooks.example.com/…` Node's TLS layer sends no SNI (IP literals are not valid SNI) and validates the certificate against the IP, which will not match a hostname-only SAN → `ERR_TLS_CERT_ALTNAME_INVALID`, recorded as a failed delivery. Tests only exercise IP-literal HTTPS (`test/alerts.processor.test.js:16`) and mock `fetch`. Users whose HTTPS hooks "never work" will switch to `http://`, sending webhook secrets in clear. Fix: keep the pin but dispatch through an undici `Agent` with `connect: { servername: originalHostname }`, or pin via a custom `lookup` on the dispatcher instead of rewriting the URL.

### L-3 — JSON stores accept unbounded keys/values from any member [VERIFIED]
`PATCH /api/setup/room|display-name|note` (`setup-router.js:371-426`) have no admin guard (by H-1 decision), no length cap on `accessoryId`, `roomName`, `displayName`, `note`, and no key-count cap; the only bound is the 256 KB JSON body (`index.js` `API_JSON_LIMIT`). Values land in `rooms.json`/`display-names.json`/`notes.json`, are re-read every 30 s (`index.js` store refresh) and `rooms` is spread into every `/api/events` and `/api/accessories` response (`events-router.js:84-90`). A member can grow these files by 256 KB per request at 60 req/min. Also, a non-string `roomName`/`displayName`/`note` (`{"roomName": 1}`) throws on `.trim()` → 500. Fix: `typeof === 'string'`, cap lengths (e.g. 64 / 64 / 2048) and reject unknown accessory IDs (must exist in pairings or event_logs).

### L-4 — Alert rule text fields are uncapped [VERIFIED]
`validateCreate`/`validatePatch` (`alerts-router.js:66-122, 124-202`) accept `name`, `scopeValue`, `characteristic`, `matchValue` of any length ≤ body limit; they are stored (TEXT), echoed to the owner and embedded in every webhook payload / email subject (`alerts.js:62-72, 91, 183-184`). Cap at e.g. 120 / 200 / 64 / 200 chars.

### L-5 — `POST /api/matter/events` lets any authenticated member forge event rows [VERIFIED] (residual from June H-1)
The endpoint is intentionally not admin-gated. It accepts arbitrary `accessoryId`, `accessoryName`, `roomName`, `serviceType`, `characteristic`, `newValue` and does not require `nodeId` to match a known pairing (`matter-router.js:292-332`, `pairing` is optional at `:314`). Forged rows pollute timeline/stats/anomaly baselines and can trigger other users' alert rules (though this path does not call `processAlertsForEvent`). Recorded as a conscious residual; if the endpoint has no remaining external caller now that `matter-runtime.js` inserts in-process, consider removing it or requiring `pairings[nodeId]`.

### L-6 — Invite email has no format or length validation [VERIFIED]
`POST /api/users/invite` (`users-router.js:116-120`) only checks non-empty; the June "length-before-regex" fix (`alerts-router.js:25-26`) was not applied here. Admin-only, so impact is limited to a malformed `invites.email` row and a nodemailer error. Reuse `validateTargetEmail`.

### L-7 — Unvalidated `from`/`to`/`hour` → Postgres cast error → 500 [VERIFIED]
`events-router.js:44-45, 106, 115-116, 138-139` pass raw query strings into `timestamp >= $N` / `EXTRACT(...) = $2`; `?from=notadate` or `?hour=x` (→ `NaN`) yields a DB error and a 500 instead of a 400. Parameterized, so no injection; hygiene only.

### L-8 — 500k-row archive export available to any member at 120 req/min [VERIFIED]
`GET /api/archive/export` (`archive-router.js:56-114`, `ARCHIVE_MAX_EXPORT_ROWS` default 500 000 at `:75`) is behind the *read* limiter (120/min per IP, `:35-43`) and is not admin-gated. Repeated calls run OFFSET-paginated scans of `event_logs_archive` concurrently. Consider admin-gating or a dedicated 2–5/min limiter.

### L-9 (informational) — SSRF guard residuals
`::7f00:1` (deprecated IPv4-compatible form) and `64:ff9b::7f00:1` (NAT64 well-known prefix) pass `classifyIpv6` (`security.js:55-81`); neither reaches loopback on a standard Linux host. `http://localhost./` (trailing dot) passes create-time (`:156`) but is caught by the fire-time resolver. `fec0::/10` is an accepted won't-fix.

### L-10 (informational) — `PATCH /api/setup/alerts` `enabled` is now a dead knob
MALERT-07 removed the household alert gate (`subscriber.js` diff), but `alerts-settings-router.js:30-35` still accepts and persists `enabled`; nothing reads it. An operator who toggles it off will believe alerts are disabled while every rule keeps firing. Remove the field or make the processor honour it.

---

## `ip-address` advisory (npm audit, ≤10.3.0 leading-zero / CIDR-suffix SSRF bypass)

- Installed: `ip-address@10.2.0` via `express-rate-limit@8.5.2` (`listener/package-lock.json:1174-1180, 1588-1594`). No `import` of `ip-address`/`ipaddr` anywhere in `listener/src`.
- The SSRF guard is self-contained: WHATWG `URL` normalization + `net.isIP` + hand-rolled `ipv4ToInt`/`ipv4InCidr`/`classifyIpv4`/`classifyIpv6` (`security.js:19-92, 139-170, 321-369`). It does **not** depend on `ip-address`.
- `express-rate-limit` only calls `ip-address` inside its default `ipKeyGenerator` for IPv6 /56 bucketing (`node_modules/express-rate-limit/dist/index.cjs:32-38`). Every limiter in this codebase supplies `keyGenerator: rateLimitKeyGenerator` and `validate: false`, so that code path is never executed. **Advisory not reachable** — but H-1 above makes the custom generator itself the weak point.

Exercised inputs (in-process, `allowPrivateTargets` true/false):

| Input | Result |
|---|---|
| `http://0177.0.0.1/`, `http://127.1/`, `http://0x7f000001/`, `http://2130706433/`, `http://017700000001/` | BLOCK (URL parser normalizes → `127.0.0.1`) |
| `http://[::1]/`, `http://[::ffff:127.0.0.1]/`, `http://[::ffff:7f00:1]/`, `http://[0:0:0:0:0:ffff:7f00:1]/` | BLOCK |
| `http://0.0.0.0/`, `http://[::]/`, `http://169.254.169.254/`, `http://[fe80::1]/` | BLOCK |
| `http://127.0.0.1/24/` (CIDR-as-path) | BLOCK |
| `http://10.0.0.5/`, `http://[fd00::1]/` | OK when private allowed (default), BLOCK when denied |
| DNS name → `127.0.0.1` / `::ffff:127.0.0.1` / `::ffff:7f00:1` | BLOCK at fire time (`resolveAndValidateWebhookTarget`) |
| DNS name → `[public, 10.0.0.1]` with private denied | BLOCK (all answers checked) |
| `http://[::7f00:1]/`, `http://[64:ff9b::7f00:1]/`, `http://[fec0::1]/`, `http://localhost./` | pass (see L-9) |

---

## June-fix verification (all still hold)

| June item | Status | Evidence |
|---|---|---|
| L-1 `target_url` redacted | holds | `alerts-router.js:277, 334, 412, 485` |
| bounded page/limit params | holds | `events-router.js:34-35`, `alerts-router.js:450-451`, `accessories-router.js` detail (`page ≤1e6`, `limit ≤500`) |
| capped bulk insert | holds | `matter-router.js:284-286` (max 1000) |
| M-2 accept-invite transaction | holds | `auth-router.js:360-374` BEGIN/ROLLBACK/COMMIT, session issued after COMMIT |
| L-9 password min 12 | holds | `security.js:242` |
| L-12 email length-before-regex | holds (alerts only) | `alerts-router.js:25-26`; not applied to `users-router.js` (L-6) |
| L-12 `quietHoursExcludedAccessories` ≤200 | holds | `retention-router.js:38, 158` |
| M-3 disabled login → 401 | holds | `auth-router.js:251-253` |
| M-4 cache in-flight dedup + negative cache | holds | `query-cache.js:41-43, 67-88` |
| M-5 per-iteration try/catch | holds | `alerts.js:236-272`, `matter-runtime.js` ingestRows |

---

## VERIFIED-CLEAN

- **SQL:** every query in `db.js` (`insertEvent :56-66`, sweeps `:149-175, 201, 226, 250, 271`, user/session/invite/reset CRUD `:293-696`) is parameterized; intervals use `$1::int * INTERVAL '1 day'`. Dynamic fragments are constant-only: events-router WHERE builder uses `$N` placeholders (`events-router.js:41-47, 109-116, 130-139`); alerts PATCH SET list is built from a fixed column map keyed by validated field names (`alerts-router.js:377-393`); quiet-hours `hourCondition` is a constant-string branch with `$1/$2` and the exclusion list is a single array parameter (`stats-router.js:369-377`); archive export column list is a literal array (`archive-router.js:57-61, 95`). No `ORDER BY`/`LIMIT` from user input anywhere.
- **Preferences blob:** session-scoped (`me-router.js:22, 41`), plain-object check (`:46`), 256 KB cap before any DB access (`:51-54`), `$2::jsonb` parameter (`:59-67`); the quiet-hours consumer re-normalizes the blob (`stats-router.js:353-357` → `normalizeRetentionSettings`) so malformed values cannot reach SQL. Deeply-nested blobs fail in `JSON.stringify`/jsonb parse and surface as 500s, not crashes.
- **JsonObjectStore:** temp-file + `rename` atomic write, `0600`, serialized via promise lock, mtime-guarded refresh (`store.js:31-54, 60-104`).
- **Admin enforcement (June H-1):** `requireAdminSession` (`security.js:108-113`) on `/data/accessory`, `/data/all` (`archive-router.js:127, 150`), `/setup/retention` (`retention-router.js:94`), `/setup/alerts` (`alerts-settings-router.js:25`), matter scan/commission/pair/delete (`matter-router.js:68, 109, 157, 233`), HomeKit scan/pair/delete/repair/add-pairing/log-level (`setup-router.js:62, 79, 226(ish), 260, 319, 438`).
- **Alert-rule ownership:** owner always from session, never body (`alerts-router.js:330`); PATCH/DELETE/deliveries constrained by `user_id` (`:404, 436, 459, 468`); member email lock on both create and patch incl. the `targetEmail`-only patch vector (`:305-307, 371-373`); email channel refused when SMTP is off (`:298, 362`); CHECK-constraint violations mapped to 400 (`:229-238`).
- **Webhook delivery:** `redirect: 'manual'` (`alerts.js:149`), AbortController timeout (`:130-131, 170`), response body truncated to 300 bytes (`:153`), all DNS answers classified (`security.js:351-362`).
- **Email HTML:** alert subject/body pass through `escapeHtml` before templating (`emails.js:32-40, 251-256`); invite/reset URLs are server-generated.
- **Bulk Matter ingest:** transactional with ROLLBACK and `client.release()` in `finally` (`matter-router.js:334-348`); per-row validation of nodeId/characteristic/newValue (`:294-311`).
- **Auth gate / CSRF:** session-first, then timing-safe token compare (`index.js` gate; `security.js:127-137`); CSRF enforced for every session-bearing mutation and skipped only for sessionless API_TOKEN callers (`csrf.js:40`); public paths enumerated explicitly.
- **Body size:** global `express.json({ limit: '256kb' })` (`index.js` `API_JSON_LIMIT`).
- **Archive CSV:** formula-injection prefix + quoting (`archive-router.js:63-69`).
