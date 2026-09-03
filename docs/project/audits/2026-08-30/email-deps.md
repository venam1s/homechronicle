# HomeChronicle Audit — Email Subsystem + Dependency/Supply Chain

- Date: 2026-08-30
- Scope: HEAD `a39bcb0` (working-tree changes ignored). Read-only; no files, lockfiles, or node_modules were modified (`npm ls`, `npm view`, `npm audit fix --dry-run` only).
- Prior audit consulted: `.planning/SECURITY-AUDIT-2026-06-14.md` — accepted items (M-8 CSP, L-8, L-10, L-11, L-12 micro-items) are not re-reported.
- Tags: **[VERIFIED]** = confirmed against source at HEAD (and node_modules where relevant); **[suspected]** = plausible, not fully confirmed.
- Severity reflects REAL exposure in a self-hosted, invite-only household deployment.

## Summary

| Severity | Count |
|---|---|
| HIGH | 0 |
| MEDIUM | 1 |
| LOW | 5 |
| Informational | 6 |

No attacker-reachable injection, spoofing, or secret-leak path was found in the email subsystem. All five `npm audit` HIGHs are either unreachable in this codebase or dev/build-only; the only one requiring a major bump (nodemailer) is not exploitable here today.

---

## MEDIUM

### M-1 — SMTP transport uses opportunistic STARTTLS; no `requireTLS` [VERIFIED]

`listener/src/emails.js:161-172` — `nodemailer.createTransport({ host, port, secure, auth: {...}, ...timeouts })`. With the default config (`port 587`, `secure=false`, `emails.js:157-158`) nodemailer upgrades to TLS only if the server advertises STARTTLS. If the relay does not advertise it — or an on-path attacker strips the `STARTTLS` capability from the EHLO response — nodemailer proceeds in plaintext and sends `AUTH PLAIN/LOGIN` with the SMTP password in the clear. `requireTLS`, `ignoreTLS`, and `tls.rejectUnauthorized` are not set anywhere in the repo (grep across `listener`, `web/src`, `.env.example`, `docker`), so certificate verification IS on (good), but the plaintext fallback is not closed.

- Exposure: SMTP credentials (often a Gmail app password / provider API key), traversing the home LAN → ISP → provider path. Requires an on-path attacker; not remotely triggerable via the API.
- Fix: pass `requireTLS: !secure` (or an env `SMTP_REQUIRE_TLS` defaulting to `true`) in `createTransport`; surface it in `.env.example`. `verify()` at startup will then fail loudly instead of silently downgrading.

---

## LOW

### L-1 — Invite / claim-admin email addresses are never format-validated [VERIFIED]

`listener/src/users-router.js:113` (`POST /invite`) and `listener/src/auth-router.js:273` (`POST /claim-admin`) only `String(...).trim().toLowerCase()` and reject empty; the only email regex in the listener is `VALID_EMAIL_RE` in `alerts-router.js:9`. Any string (including internal whitespace, `\r\n`, 10 KB of text) becomes `invites.email` / `users.email` (`UNIQUE`, `TEXT`, no CHECK — migrations 0003/0004). Header injection is NOT possible: nodemailer strips CR/LF from every address header (`node_modules/nodemailer/lib/mime-node/index.js:1117`), and `InviteCreateModal.jsx:149` uses `type="email"` client-side. Impact is admin-only data hygiene (an unusable account/invite, a bounced test send). Recommend reusing the alerts-router validator (length ≤254 + regex) at both sites.

### L-2 — Password-reset tokens are not invalidated on successful reset or new request [VERIFIED]

`auth-router.js:407-411` inserts a new `password_reset_tokens` row per `POST /forgot-password`; `db.js:667-676` does not delete/expire earlier rows, and `redeemResetToken` (`db.js:686-692`) marks only the redeemed token. After a successful reset, any other unexpired (≤1 h) tokens for the same user still work. Bounded by the 1 h TTL, the 10/15 min per-IP `authLimiter` (`auth-router.js:37-48`), and 256-bit tokens. Recommend `UPDATE password_reset_tokens SET used_at = NOW() WHERE user_id = $1 AND used_at IS NULL` on redeem (and optionally on issue).

### L-3 — `PUT /api/setup/smtp` returns `{ ok: true }` even when the new transport fails `verify()` [VERIFIED]

`smtp-router.js:122-129` calls `initEmail(smtpConfig)` (which sets `transporter = null` on verify failure, `emails.js:178-181`) and then responds `ok: true` unconditionally. A typo in host/port/password silently disables invites, resets, and email alerts until the admin happens to hit "Send test" (which does return 503). Correctness, not security. Recommend returning `{ ok: true, emailEnabled: isEmailEnabled() }` and letting the UI warn.

### L-4 — URL slots in the email layout are not attribute-escaped; `APP_BASE_URL` is not validated as a URL [VERIFIED]

`emails.js:65` (`href="${ctaUrl}"`), `:201`, `:226` interpolate `inviteUrl`/`resetUrl` raw into an attribute and text. Today this is safe: the URL is `${APP_BASE_URL}/accept-invite?token=${hex}` (`users-router.js:153,215`, `auth-router.js:412`) where `APP_BASE_URL` is env-only (`smtp-config.js:123-125`) and the token is hex. `APP_BASE_URL` is only checked for emptiness (`index.js:147-150`); a value containing `"` or a non-http(s) scheme would break/alter the link. Defense-in-depth: `escapeHtml()` the URL slots, and validate `APP_BASE_URL` with `new URL()` + `http(s):` at startup.

### L-5 — `PUT /api/setup/smtp` does not range-check `port` or validate `host` [VERIFIED]

`smtp-router.js:107-108` accepts any finite number for `port` (0, negative, 99999) and any string for `host`. Admin-only and rate-limited (20/min); the listener will attempt an outbound SMTP connection to whatever the admin enters (by design — admins are trusted). Recommend `parseIntInRange(port, 587, 1, 65535)` and a non-empty hostname check for cleaner failure modes.

---

## Informational

- **I-1 nodemailer defense-in-depth [VERIFIED]:** no code path passes `raw`, `attachments`, `path`, `href`, `disableFileAccess`, or `disableUrlAccess` to nodemailer (grep of `listener/src`; the three `sendMail` calls at `emails.js:193,218,246` pass only `from/to/subject/text/html` strings). The GHSA-p6gq-j5cr-w38f advisory is therefore unreachable today. Still, set `disableFileAccess: true, disableUrlAccess: true` on the transport so a future change that spreads user input into a message can't turn into file read/SSRF.
- **I-2 Test-send reuses the invite template [VERIFIED]:** `index.js:655` — `sendTestEmail: (to) => sendInvite(to, `${APP_BASE_URL}/`, …)`. The admin receives "You have been invited to HomeChronicle" with a link to the app root. Cosmetic/confusing; a dedicated `sendTestEmail` template would be clearer.
- **I-3 `POST /forgot-password` can be used to send reset mail to a registered user repeatedly [VERIFIED]:** bounded by `authLimiter` (10 req / 15 min per IP by default). Acceptable; note only.
- **I-4 Admins may point alert emails at any external address [VERIFIED, by design D-08]:** `alerts-router.js:305` only locks non-admins. No recipient verification/allow-list for admins. Accepted design; note for awareness.
- **I-5 `fast-xml-parser` override is dead [VERIFIED, carried from prior audit]:** `npm ls fast-xml-parser` → `(empty)`. Still present in `listener/package.json` overrides. Harmless; drop when convenient.
- **I-6 Local `node_modules` drift [VERIFIED]:** `@stoprocent/node-addon-api` is `extraneous` in the developer's `listener/node_modules` (not in the lockfile). `npm ci` (used by all Dockerfiles/CI) removes it; no image impact.

---

## Dependency table

Versions from `npm ls` at HEAD lockfiles; fix targets from `npm view` / `npm audit fix --dry-run` (no changes written).

| Package (installed) | Pulled in by | Advisory | Reachable in this app? | Recommended action | Breaking? |
|---|---|---|---|---|---|
| `nodemailer@8.0.11` (direct, listener) | — | GHSA-p6gq-j5cr-w38f: message-level `raw` bypasses `disableFileAccess/disableUrlAccess` | **No** — no `raw`/`attachments`/`path`/`href` anywhere; only string fields sent (`emails.js:193-256`) | Upgrade to `nodemailer@9.0.6`; add `disableFileAccess/disableUrlAccess: true` (I-1) | Major per semver; API surface used (`createTransport`, `verify`, `sendMail` basic fields) unchanged, `engines.node >=6`. Low risk; run `emails.test.js` + a real test-send |
| `ip-address@10.2.0` | `express-rate-limit@8.5.2` | GHSA-mwp4-54f8-5fhr / GHSA-4xrf-jv44-h6hh: SSRF/trust-boundary bypass in address classification | **No** — the listener's SSRF guard (`security.js:19-105, 139-235, 321+`) uses `net.isIP` + its own CIDR math, not `ip-address`; `ip-address` is only used by express-rate-limit's built-in IPv6 keying helper, and the custom `rateLimitKeyGenerator` (`security.js:115-125`) does not call it | `npm audit fix` → `ip-address@10.7.0` (semver-compatible; `express-rate-limit@8.7.0` still declares `^10.2.0`) | No |
| `brace-expansion@5.0.6` | `node-pg-migrate@8.0.4 → glob → minimatch` | ReDoS / OOM via crafted brace patterns | **No** — `runner()` is invoked once at startup (`db.js:6,76`) on a fixed migrations dir; no user-supplied glob patterns | `npm audit fix` → `5.0.9` | No |
| `body-parser@2.2.2` | `express@5.2.1` | Invalid `limit` silently disables size enforcement | Only if an operator sets a malformed `API_JSON_LIMIT` (`index.js:85`, default `'256kb'`) | `npm audit fix` → `2.3.0` | No |
| `form-data@4.0.5` | `supertest@7.2.2` (devDependency) | CRLF injection in multipart names | **No** — dev/test only; excluded from image by `npm ci --omit=dev` (`listener/Dockerfile:16`, `Dockerfile.standalone:19`) | `npm audit fix` → `4.0.6` | No |
| `react-router@7.17.0` / `react-router-dom@7.17.0` (direct, web) | — | Open redirect via backslash in `<Link>`/`useNavigate`; RSC error-handler XSS | **No** — every `to`/`navigate()` target is a string literal (`AuthGate.jsx:70`, `LoginPage.jsx:36`, `ResetPasswordPage.jsx:153`, `SetupAdminPage.jsx:28,32`, `Sidebar.jsx:123`, `main.jsx:37-47`, `AcceptInvitePage.jsx:136`); no RSC | Bump `react-router-dom` to `^7.18.3` | Minor, no |
| `postcss@8.5.15` (web devDependency; also via vite/tailwind) | — | sourceMappingURL path traversal | **No** — build-time only on repo-controlled CSS; prod image is nginx + `dist/` (`web/Dockerfile`) | `npm audit fix` | No |
| `nanoid@3.3.12` | `postcss` | Infinite loop on bad size | **No** — build-time only | `npm audit fix` | No |
| `undici@7.24.5` | `jsdom@29.0.1` (devDependency) | 12 advisories (TLS bypass, header injection, cache poisoning…) | **No** — vitest/jsdom only | `npm audit fix` | No |

`npm audit fix --dry-run` (listener): changes `ip-address`, `brace-expansion`, `body-parser`, `form-data`, `type-is`, `hasown`; adds `content-type`; no `--force` needed for anything except nodemailer. Web: `npm audit fix` resolves all five with no force.

### Outdated majors (risk / benefit)

| Package | Installed → latest | Security driver? | Risk | Recommendation |
|---|---|---|---|---|
| `nodemailer` | 8.0.11 → 9.0.6 | Yes (advisory above, not reachable today) | Low — basic transport API stable | Do it with the audit-fix batch |
| `@matter/main` + `@project-chip/matter.js` | 0.16.10 → 0.17.9 | No | High — matter.js minor versions carry controller-API churn, and `@project-chip/matter.js` is a compat shim that 0.17 may drop; touches `matter-controller.js`/`matter-runtime.js` polling | Separate spike against real devices; not part of a security pass |
| `node-pg-migrate` | 8.0.4 → 9.x | No (`brace-expansion` is fixed by `npm audit fix` without a major) | Moderate — programmatic `runner()` options / ESM changes in 9.x; migrations run on every boot of every install | Defer; review 9.x changelog first, test the fake-baseline path in `migrateDb()` |
| `lucide-react` | 0.408 → 1.37 | No | Moderate churn — 1.0 renamed/removed icons; failures surface at build time as missing exports | Optional; grep all imported icon names before bumping |

### Overrides, patches, lockfiles, Dockerfiles [all VERIFIED]

- `listener/package.json` overrides: `fast-xml-parser` — dead (I-5); `picomatch@2.3.2` — active (patch-package → micromatch); `path-to-regexp@8.4.2` — active on `express → router@2.2.0` (router declares `^8.0.0`, so the pin is now belt-and-braces); `tmp@0.2.7` — active (patch-package). `web/package.json` overrides `react-is`, `picomatch@4.0.4` — active.
- `listener/patches/dnssd+0.4.1.patch` (FQDN compression-pointer cycle guard): `dnssd@0.4.1` is still what `hap-controller@0.10.2` resolves, and the patched code (`MAX_FQDN_ITERATIONS`) is present in `node_modules/dnssd/lib/BufferWrapper.js` — patch still needed and still applies. `patch-package` remains in `dependencies` so `postinstall` runs under `npm ci --omit=dev`; `listener/Dockerfile:15` copies `patches/` before `npm ci`.
- Lockfiles: `npm ls` exits 0 in both `listener/` and `web/` (no missing/invalid). Only the local extraneous `@stoprocent/node-addon-api` (I-6).
- Dockerfiles/CI: `listener/Dockerfile:16` `npm ci --omit=dev`; `web/Dockerfile:6` `npm ci` (builder stage only; runtime is nginx); `Dockerfile.standalone:19,27` `npm ci`; `.gitlab-ci.yml:38-39` and `.github/workflows/ci.yml:32,38` `npm ci`. All lockfile-faithful.
- npm now warns about 5 native install scripts not covered by `allowScripts` (`argon2`, `usb`, `@serialport/bindings-cpp`, `@stoprocent/noble`, `@stoprocent/bluetooth-hci-socket`). Expected for this stack; informational.

### Risky-pattern scan [VERIFIED clean]

- No `child_process`, `exec*`, `spawn`, `eval`, or `new Function` in `listener/src` or `web/src`.
- `JSON.parse` only on trusted local files (`store.js:38`, `smtp-config.js:41` — secret file; `pairing.js:37`) and operator CLI args (`add-pairing.js:54,70`); HTTP bodies go through `express.json({ limit: API_JSON_LIMIT })` (`index.js:475`, 256 KB default).
- No `fs` path derived from request input; SMTP config/secret paths are env/NODE_ENV-derived constants (`smtp-config.js:20-24`).

---

## VERIFIED-CLEAN (email subsystem)

- **HTML injection:** `renderEmailLayout` escapes `heading` for both `<title>` and the heading cell (`emails.js:59,85,110`); alert body goes through `escapeHtml()` (`emails.js:253`, `\n → <br>` after escaping); `ctaLabel`/`footerNote` are hard-coded constants at all three call sites; `escapeHtml` covers `& < > " '`. No user/device/rule string reaches an unescaped HTML slot.
- **Header injection (CRLF):** nodemailer's `MimeNode._encodeHeaderValue` replaces `\r?\n|\r` with a space for `From/To/Cc/Bcc/Reply-To/Subject` and all other headers (`node_modules/nodemailer/lib/mime-node/index.js:1117,1158,1164,1167`). Additionally, alert `subject` is capped at 200 chars (`alerts.js:183-184`) and `target_email` rejects any whitespace (`alerts-router.js:9,21-27`, length ≤254 checked before regex).
- **T-26-EMAIL-SPOOF (member recipient lock):** `POST /rules` forces `targetEmail = req.hcSession.email` for non-admins (`alerts-router.js:305-306`); `PATCH /rules/:id` locks when `channel === 'email'` **or** `'targetEmail' in body` — the PATCH-without-channel vector is covered (`alerts-router.js:371-372`); `DELETE`/`PATCH` are IDOR-safe (`WHERE id AND user_id`, `:397`); service-token callers without a session get 401 (`:290,:348`). Session `email` is populated by the gate from `users.email` (`db.js:364-376`, `auth-router.js:151`, `index.js:563`).
- **Tokens:** `generateToken()` = 32 bytes `crypto.randomBytes` hex (`security.js:317`); stored as SHA-256 (`security.js:308`; `users-router.js:137-138`, `auth-router.js:408-409`); invite TTL 72 h, reset TTL 1 h (`auth-router.js:392`); redemption is an atomic single-use `UPDATE … WHERE used_at IS NULL AND expires_at > NOW() RETURNING` (`db.js:645-652` invites, `686-692` resets); accept-invite runs in a transaction (prior M-2); reset revokes all sessions and validates password strength before consuming the token (`auth-router.js:441-459`); `forgot-password` is enumeration-safe with constant delay and skips disabled users (`auth-router.js:394-425`).
- **Test-send abuse:** `POST /api/setup/smtp/test` is admin-only (403 otherwise), behind a 20/min limiter, and the recipient is hard-wired to `req.hcSession.email` — no body field is read (`smtp-router.js:137-148`). Cannot spam arbitrary addresses.
- **SMTP password handling:** secret lives only in a 0600 file (or `SMTP_PASS` env) (`smtp-config.js:56-67`); `GET /smtp` builds the response field-by-field and strips `password`/`smtpPass` defensively (`smtp-router.js:70-86`); `PUT /smtp` writes the store object from explicit fields only and never persists the password to the store (`:106-120`); blank/absent password preserves the secret; the web form never seeds the password from GET and omits the key when blank (`web/src/components/SMTPConfigSection.jsx:13-36,64-66`). No log line prints SMTP config or password (only `err.message`); the audit-log middleware logs method/URL/status/duration only.
- **TLS verification:** no `rejectUnauthorized: false` / `ignoreTLS` anywhere in the repo; nodemailer's default certificate verification applies (see M-1 for the STARTTLS-downgrade gap).
- **`from` re-thread (HIGH-1 follow-up):** `smtpConfig` is a single mutable object read lazily at call time by the invite/reset/test wrappers (`index.js:513,655,662`) and mirrored into the alerts sender via `setAlertEmailFrom` (`index.js:247,657`); `PUT /smtp` calls `initEmail` with env-over-UI merged config, then `onSmtpConfigChange` (`smtp-router.js:123-127`). Live update holds.
- **Link base URL:** `APP_BASE_URL` comes exclusively from the environment (`smtp-config.js:123-125`); no `Host`/`X-Forwarded-Host`/`req.hostname` is used to build invite or reset links anywhere (grep of `listener/src`, `web/src`, `docker`, nginx template). Invite/reset links cannot be redirected to an attacker host via request headers.
- **nodemailer advisory:** no `raw`/`attachments`/`path`/`href` in any `sendMail` call (I-1).
- **Alert email content:** subject/body are built from event fields and rule name only (`alerts.js:174-186`, `buildAlertBody`), sent as plain `text` plus escaped `html`; delivery outcomes are recorded per rule with try/catch (`alerts.js:187-195`).
- **Tests present at HEAD:** `listener/test/emails.test.js`, `smtp-router.test.js`, `alerts-router.test.js`, `alerts-router.integration.test.js`, `alerts.processor.test.js` (not executed in this read-only pass).

## Suggested order of work

1. `cd listener && npm audit fix` and `cd web && npm audit fix` (non-breaking, resolves 8 of 9 advisories) + bump `react-router-dom` to `^7.18.3`.
2. `nodemailer@9.0.6` + `requireTLS: !secure` + `disableFileAccess/disableUrlAccess: true` (M-1, I-1) in one change; run `emails.test.js` and a real test-send.
3. L-1 (email validator at invite/claim-admin), L-2 (invalidate sibling reset tokens), L-3 (`emailEnabled` in PUT response), L-4/L-5 (URL escaping + `APP_BASE_URL`/port validation) as a small hardening quick.
4. Drop the dead `fast-xml-parser` override (I-5). Leave `@matter/main`, `node-pg-migrate`, `lucide-react` majors for dedicated work.
