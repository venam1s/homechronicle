# Project Research Summary

**Project:** HomeChronicle v1.4 Multi-User Auth & Email
**Domain:** Session-based multi-user auth (invite-only), email SMTP, frontend auth gate, email alert channel
**Researched:** 2026-06-09
**Confidence:** HIGH

---

## Executive Summary

HomeChronicle v1.4 adds invite-only multi-user authentication to a single-instance, self-hosted Docker app that today uses a shared `API_TOKEN` injected by nginx. The research consensus is: build server-side sessions backed by PostgreSQL (already running), use argon2id for password hashing (prebuilt binaries solve the native-build concern), add nodemailer for SMTP, and introduce react-router-dom v7 in library mode as a thin shell for auth-landing pages — leaving the existing `App.jsx` tab navigation completely untouched. All four research files agree on a 4-phase build order: auth foundation first, email infra + invites second, email alert channel third, security hardening (nginx token cutover) last.

The recommended approach is additive, not replacement. The existing `API_TOKEN` + nginx token-injection path stays fully operational through Phases 1-3 as a backward-compat escape hatch. Sessions are added alongside the token path via a token-OR-session gate. This means an operator upgrading from v1.3 to v1.4 cannot be locked out: nginx still injects the token; the gate still accepts it. The nginx token injection is removed only in Phase 4, after sessions are proven stable in production. Tokens stored as SHA-256 hashes, single-use, expiring throughout all flows.

The two sharpest risks are the self-hosted HTTP / secure cookie deadlock (every RPi/NAS user running plain HTTP gets silently locked out if SESSION_COOKIE_SECURE is not an opt-out env var) and CSRF exposure (the moment session cookies exist, all existing mutating endpoints become CSRF-vulnerable — this must be addressed in Phase 1, not deferred to hardening). Both are well-understood and straightforwardly preventable with the mitigations described below.

---

## Key Findings

### Recommended Stack

Four new capability areas need new packages. The existing stack (Express 5, PostgreSQL 16, React 19, Vite 8, Tailwind v4, TanStack Query 5, express-rate-limit, node-pg-migrate) is untouched.

**Core new technologies:**

- **argon2 ^0.44.0** (argon2id variant) — password hashing. OWASP/NIST first choice; prebuilt binaries for Alpine/Ubuntu ARM64 and x86-64 exist, covering the multi-arch Docker build targets. The listener Dockerfile already has python3/make/g++ as a fallback for native compilation. Note: the image is node:22-trixie-slim (Debian); the Ubuntu glibc prebuilt should load on Debian Trixie; source-compile is the confirmed fallback regardless. Scrypt (built-in crypto) is a viable fallback if argon2 build causes unexpected problems, but the hashing decision is separate from the session decision (see Conflict Resolution below).
- **custom session CRUD in db.js** (primary) — session management using crypto.randomBytes token generation, SHA-256 hash storage, and direct PostgreSQL queries through the existing pg.Pool. Zero new packages for session tracking. express-session + connect-pg-simple is the library alternative (see Conflict Resolution).
- **nodemailer ^8.0.10** — SMTP email. Zero runtime dependencies; zero native compilation. Handles invite emails, password reset, and alert emails. SMTP credentials in .env only (never JsonObjectStore).
- **react-router-dom ^7.17.0** — frontend routing, library mode only (createBrowserRouter + RouterProvider). Adds /login, /accept-invite, /reset-password routes. The /* catch-all renders the existing App.jsx unchanged.
- **cookie-parser** — one new listener dependency to parse Cookie: header in the auth gate. Required regardless of session approach chosen.
- **csrf-sync** — synchronizer-token CSRF protection; installed in Phase 1 (see Conflict Resolution).

**What is explicitly excluded:** Redis, JWT, bcrypt, csurf (deprecated 2023), passport, Helmet (headers already set), @react-router/dev framework mode, Handlebars/MJML, uuid/nanoid (crypto.randomBytes covers it), connect-pg-simple createTableIfMissing option.

### Expected Features

All features are scoped to a single household where all users see all device events with no per-user isolation.

**Must have (P1 — required to ship v1.4):**
- Session-based login / logout — replaces shared token for browser clients
- First-user-becomes-admin bootstrap (POST /api/auth/claim-admin, atomic via INSERT ... WHERE NOT EXISTS) — gates invite flow; guard must return 409 if any user exists
- Admin invite flow with full lifecycle (pending -> accepted -> expired -> revoked) — invite doubles as email verification; no separate verify step
- Accept-invite sets password — required companion to invite
- Change own password (current password required)
- Forgot/reset password by email — hard SMTP dependency; clear error when SMTP not configured
- Admin disable/revoke user — enabled boolean, checked on every request
- Admin vs member roles (two roles only; no granular RBAC)
- SMTP configuration via env vars (nodemailer)
- Email channel on alert_rules (schema migration: channel, target_email columns; target_url becomes conditional/nullable)
- Email dispatch in processAlertsForEvent() alongside existing sendWebhook()

**Should have (P2 — add within milestone if time allows):**
- Copyable invite link in admin UI (SMTP-optional; Gitea/Vaultwarden model)
- Admin resend invite (fresh token, extended expiry)
- SMTP test email button (POST /api/setup/smtp/test)
- Per-user display name (nullable display_name column)
- Alert email with full event context (HTML template)

**Defer (P3 / v1.5+):**
- Alert recipient list per rule (fan-out per member)
- Opt-in MFA/TOTP
- Admin audit log for invite/revoke/role-change actions

**Anti-features (explicitly excluded):** self-service signup, OAuth/SSO, mandatory MFA, per-user event isolation, granular RBAC, separate email verification step, CAPTCHA, email open/click tracking, webhook-to-email hybrid channel, SMTP credentials in UI.

### Architecture Approach

The architecture is additive and layered. The existing Express middleware chain gains three new layers (cookie-parser, CSRF middleware, token-OR-session gate) before all existing routers. Public auth routes mount before the gate. A new auth-router.js factory follows the existing createXxxRouter({ pool, ...deps }) pattern. All session and user CRUD lives in db.js as named functions. A new emails.js module holds the nodemailer transport and three send functions. On the frontend, main.jsx gains a BrowserRouter + RouterProvider wrapping AuthGate, which queries GET /api/auth/me via TanStack Query; App.jsx is rendered unchanged inside the authenticated shell.

**Major components:**

1. **Auth gate middleware** (index.js) — token-OR-session OR public-bypass; replaces the current single-token-only block; req.user is set on session path for downstream routers
2. **auth-router.js** — public router (pre-gate: login, claim-admin, accept-invite, reset flows) and protected router (post-gate: logout, me, change-password, user list, invite-create)
3. **emails.js** — nodemailer transport initialized at startup if SMTP_HOST is set; no-ops with a warn if SMTP is unconfigured; aggressive timeouts (connectionTimeout: 10000, socketTimeout: 15000)
4. **security.js additions** — hashPassword, verifyPassword (argon2id or scrypt), hashToken, generateToken
5. **db.js additions** — createUser, findUserByEmail, createSession, validateSession, revokeSession, createInvite, consumeInvite, createResetToken, consumeResetToken
6. **Migrations 0003-0005** — users + sessions tables (0003), invites + password_reset_tokens (0004), alert_rules channel columns (0005)
7. **Frontend auth shell** — LoginPage.jsx, AcceptInvitePage.jsx, ResetPasswordPage.jsx, AuthGate.jsx (new); main.jsx and api.js modified (add credentials: 'include')

**Data flow (login):** POST /api/auth/login -> public router -> findUserByEmail -> verifyPassword -> generateToken -> hashToken -> createSession in DB -> Set-Cookie: hc_session=<rawToken>; HttpOnly; SameSite=Lax -> gate on subsequent requests hashes presented cookie value, looks up session row, sets req.user.

### Critical Pitfalls

1. **Self-hosted HTTP / secure cookie deadlock** — SESSION_COOKIE_SECURE env var (opt-out, default false on non-TLS, always false in dev) is mandatory in Phase 1. Never derive secure from NODE_ENV. Log a startup warning when SESSION_COOKIE_SECURE=false so TLS users know to enable it. Recovery: add env var, restart — low cost, but only if the escape hatch was built in.

2. **CSRF exposure on existing mutating endpoints** — the moment a session cookie exists, all existing POST/PUT/DELETE routes (room rename, pairing, alert rules, retention, log-level) are CSRF-vulnerable. csrf-sync (synchronizer token pattern) must ship in Phase 1 alongside cookies, not Phase 4. Exempt pre-auth routes. Frontend fetches the CSRF token after login and includes it on all mutations.

3. **Breaking existing single-token deployments on upgrade** — keep API_TOKEN header check active in parallel with sessions through Phases 1-3. Existing nginx token injection continues to authenticate browser requests during the transition. Bootstrap endpoint must bypass all auth. Remove nginx injection only in Phase 4.

4. **Session fixation** — issue a fresh generateToken() (custom sessions) or call req.session.regenerate() (express-session) before writing user identity. Call destroy/DELETE on logout. On password reset, invalidate ALL sessions for that user ID.

5. **Password hashing params on RPi 4** — benchmark argon2id at OWASP minimum (19 MiB / t=2 / p=1) on the target hardware before shipping. Target 200-500 ms. Expose ARGON2_MEMORY_COST and ARGON2_TIME_COST env vars. The same footgun applies to crypto.scrypt — tuned params and env overrides are required regardless of which hasher is chosen.

6. **Invite/reset token lifecycle** — store SHA-256 hash of token (never raw), single-use (used_at nullable, checked on redemption), time-bounded (invites 72 h, resets 1 h). Redemption query must be atomic: UPDATE ... WHERE token_hash = $1 AND expires_at > NOW() AND used_at IS NULL RETURNING id. If zero rows, reject.

7. **Alert email flood** — email delivery must route through the same processAlertsForEvent() quiet-period suppression path as webhooks. The suppression is already channel-agnostic (keyed on rule_id + delivery status). Do not wire a separate delivery path that bypasses the suppression.

---

## RESOLVED CONFLICTS

These conflicts exist across the research files and require a clear primary recommendation.

---

### Conflict 1: Password Hashing + Session Store

**The apparent conflict:** STACK recommends argon2 + express-session + connect-pg-simple. ARCHITECTURE recommends crypto.scrypt + custom session CRUD in db.js (zero new native deps for both). These are actually two independent decisions bundled together.

**Resolution — treat them independently:**

#### (A) Password Hashing: argon2id PRIMARY, scrypt FALLBACK

**Primary: argon2 ^0.44.0 (argon2id variant)**

The Dockerfile already installs python3, make, and g++ for hap-controller/matter native addons, so native compilation is not novel. argon2 ^0.44.0 ships prebuilt binaries for Alpine/Ubuntu ARM64 and x86-64. The image is node:22-trixie-slim (Debian glibc), and the Ubuntu glibc prebuilt should load on Debian Trixie; source compile is the confirmed fallback regardless. argon2id is OWASP/NIST first choice, memory-hard, and avoids bcrypt's 72-byte truncation footgun. ARCHITECTURE's sole objection (native build pain) is neutralized by the prebuilt binary coverage.

Set parameters: memoryCost: 19456 (19 MiB), timeCost: 2, parallelism: 1 with env overrides (ARGON2_MEMORY_COST, ARGON2_TIME_COST) for RPi-4 tuning.

**Fallback: crypto.scrypt (Node.js built-in)**
Use if argon2 causes any unexpected build failure on the target image. Hash strings are self-describing; an operator can switch from scrypt to argon2 and existing scrypt hashes remain valid (re-hashed on next login). The fallback exists; argon2id should be the default because it is the stronger algorithm.

#### (B) Session Management: Custom DB sessions PRIMARY, express-session FALLBACK

**Primary: custom session CRUD in db.js using crypto.randomBytes + SHA-256 storage**

The decisive reason is the mandatory backward-compat gate structure. The architecture requires a single explicit gate that checks API_TOKEN header first, then session cookie. Custom session validation slots directly into the gate as a function call: validateSession(pool, hashToken(rawCookie)) -> session row or null. This is simpler, more transparent, and testable in isolation.

Bonus properties: anti-fixation by construction (fresh generateToken() per login means no pre-login session to fixate; no regenerate() call to forget), token-hash-at-rest by construction, and sidesteps the unresolved express-session x Express 5 async-error compat question PITFALLS flagged.

**Fallback: express-session ^1.19.0 + connect-pg-simple ^10.0.0**
Valid if the team prefers the library approach. If chosen: (1) verify Express 5 async-error compat explicitly, (2) call req.session.regenerate() on login — required to prevent session fixation, (3) create the session table via a node-pg-migrate migration from connect-pg-simple/table.sql (never use createTableIfMissing), (4) pass the existing pg.Pool — do not create a second pool.

**CSRF coupling note:** csrf-sync stores its CSRF token in the session store. With custom sessions, store the CSRF token on the session row or use csrf-sync's custom storage hooks. With express-session, it works out of the box on both paths.

---

### Conflict 2: CSRF Protection

**The apparent conflict:** STACK says no library needed for same-origin (SameSite=Lax + custom header). PITFALLS says csrf-sync is mandatory and must land in Phase 1.

**Resolution: csrf-sync (synchronizer token) in Phase 1. PITFALLS wins on timing; synchronizer token wins on mechanism.**

**Timing:** PITFALLS is correct. The moment a session cookie exists, all existing mutating endpoints become CSRF-reachable. SameSite=Lax blocks cross-site form submits but does not block all cross-origin fetch() calls in all browser versions. The cost of adding csrf-sync in Phase 1 is low; the cost of a coordinated hotfix after a CSRF finding is high.

**Mechanism:** STACK's same-origin SameSite=Lax + custom header approach is OWASP-recognized but STACK itself rates it MEDIUM confidence and explicitly flags the same-origin topology assumption as unvalidated. Self-hosted users may reach the API directly, set up split-origin configurations, or run behind third-party reverse proxies. The synchronizer token from csrf-sync works correctly under all topologies.

**Implementation:**
- Mount csrfSync middleware after cookie-parser, before the auth gate
- Expose GET /api/auth/csrf-token as a public endpoint; the React app fetches it after page load
- Frontend sends CSRF token on all mutations as X-CSRF-Token header
- Exempt from CSRF: POST /api/auth/login, claim-admin, accept-invite, reset-request, reset-confirm (user has no CSRF token before authentication)

---

## Settled (No Conflict)

The following points are fully agreed across all four research files. Treat these as constraints, not options:

| Decision | Detail |
|----------|--------|
| Invite lifecycle | pending -> accepted / expired / revoked; invite acceptance is implicit email verification |
| Backward compat during build | API_TOKEN + nginx injection stays active through Phases 1-3; token-OR-session gate; nginx cutover Phase 4 only |
| Public auth routes mount before gate | login, claim-admin, accept-invite, reset-* bypass the gate entirely |
| SESSION_COOKIE_SECURE opt-out | Default safe but opt-out (SESSION_COOKIE_SECURE=false) for plain-HTTP self-hosters; must ship in Phase 1 |
| Token storage | SHA-256 hash in DB; raw token in link/cookie only; single-use (used_at); expiring (expires_at) |
| react-router-dom v7 library mode | Shell only; existing App.jsx tab navigation untouched; nginx try_files already correct |
| Email alert channel is additive | channel + target_email columns on alert_rules; target_url becomes conditional/nullable; routes through existing alert_deliveries quiet-period suppression unchanged |
| Anti-features excluded | No self-service signup, no OAuth/SSO, no mandatory MFA, no per-user event isolation, no RBAC beyond admin/member |
| Phase build order | (1) Auth foundation + cookies + CSRF + react-router shell + first-admin bootstrap; (2) Email infra + invites + password reset; (3) Email alert channel; (4) Security hardening + nginx token cutover |

---

## Implications for Roadmap

### Phase 1: Auth Foundation

**Rationale:** Everything depends on this. No invite flow, no password reset, no alert email channel without users, sessions, and a working auth gate. This is also where the highest-risk pitfalls live.

**Delivers:** Users can create an account (first-admin bootstrap), log in, reach the existing app, and log out. API_TOKEN still works. Nginx unchanged.

**Features addressed:** Session-based login/logout, first-user bootstrap, admin/member roles, change own password, auth-route rate limiting.

**Pitfalls this phase must address:** P1 (SESSION_COOKIE_SECURE opt-out), P2 (session fixation via fresh token), P3 (CSRF via csrf-sync — MANDATORY here), P4 (hashing params tuned for RPi at OWASP min), P10 (bootstrap race via atomic INSERT ... WHERE NOT EXISTS), P11 (backward compat token-OR-session gate), P12 (dedicated login rate limiter: 10 req / 15 min).

**Stack used:** argon2 (or crypto.scrypt), custom session CRUD, cookie-parser, csrf-sync, react-router-dom (library mode), users + sessions migration (0003).

**Research flag:** Standard patterns. No additional research needed.

### Phase 2: Email Infrastructure + Invites + Password Reset

**Rationale:** Depends on Phase 1 (users table, session auth, auth-router structure). Password reset has a hard SMTP dependency. Invite flow has a soft SMTP dependency (copyable link shown even without SMTP). Delivering both together builds email infrastructure once and uses it for two flows.

**Delivers:** Admin can invite users by email. Invited users accept and set password. Users can reset forgotten passwords. SMTP infrastructure exists and is tested. Invite lifecycle management in admin UI.

**Features addressed:** Admin invite flow + lifecycle, accept-invite-sets-password, forgot/reset password, SMTP env var config, copyable invite link fallback, admin resend invite, SMTP test button.

**Pitfalls this phase must address:** P5 (single-use + time-bounded tokens, atomic redemption), P6 (token leakage via nginx logs — configure log format to exclude query strings for /api/auth/*), P7 (email enumeration — identical response body + artificial delay on not-found path), P8 (SMTP blocking — connectionTimeout: 10000, socketTimeout: 15000, startup verify() call), P13 (SMTP credentials never returned by settings API).

**Stack used:** nodemailer, invites + password_reset_tokens migration (0004).

**Research flag:** SMTP configuration and the graceful-degradation (copyable-link) model benefit from a quick validation check during phase planning.

### Phase 3: Email Alert Channel

**Rationale:** Depends on Phase 2 (emails.js must exist; sendAlertEmail uses the same nodemailer transport). Schema change to alert_rules is surgical and backward-compatible (existing webhook rules get channel='webhook' automatically). Quiet-period suppression carries over unchanged.

**Delivers:** Alert rules can deliver by email. Alert rules UI shows channel selector and email recipient field. Alert delivery log distinguishes webhook vs. email.

**Features addressed:** Email channel on alert_rules (0005 migration), email dispatch in processAlertsForEvent(), alert email with event context HTML template.

**Pitfalls this phase must address:** P9 (alert email flood — email delivery routes through the same quiet-period path; test rapid-fire event sequence).

**Key implementation note:** target_url becomes nullable in 0005. validateCreate() in alerts-router.js branches on channel before calling validateWebhookTargetUrl(). toApiRule() serializer strips target_email from non-admin views.

**Research flag:** No additional research needed. Pattern is well-understood extension of existing alerts.js.

### Phase 4: Security Hardening + Nginx Token Cutover

**Rationale:** Point of no return. Running sessions alongside token injection through Phases 1-3 means any session misconfiguration does not lock users out. Phase 4 is deferred until sessions are proven stable in production.

**Delivers:** nginx no longer injects X-API-Token; browser auth is session-only. Session expiry sweep. API_TOKEN remains valid for direct API callers (scripts, Home Assistant, CI) via x-api-token header.

**Changes:** Remove proxy_set_header X-API-Token from both location blocks in nginx.conf.template. Add session expiry sweep (DELETE expired sessions on startup + periodic). Document API_TOKEN remains valid for direct callers.

**Research flag:** No additional research needed. Changes are well-scoped.

### Phase Ordering Rationale

- Phase 1 before all others: sessions and the auth gate are prerequisites; CSRF and cookie security must ship before any cookie exists in production
- Phase 2 after Phase 1: invite flow depends on users table and session auth; email transport built once for two flows (invite + reset)
- Phase 3 after Phase 2: email alert channel reuses the nodemailer transport from Phase 2; building the transport twice would be wasteful and error-prone
- Phase 4 last: provides a safety net; token injection harmlessly coexists with session auth; cutting over before sessions are battle-tested is the highest-risk action in this milestone

### Research Flags

**Phases needing deeper research during planning:**
- **Phase 2:** SMTP configuration and the SMTP-optional graceful-degradation model — quick validation of nodemailer graceful-fail behavior before implementation begins

**Phases with standard, well-documented patterns (skip additional research):**
- **Phase 1:** auth gate, session CRUD, argon2id, CSRF middleware — all have verified npm versions and official docs
- **Phase 3:** additive schema change + conditional dispatch — fully specified in ARCHITECTURE.md
- **Phase 4:** nginx line removal + session sweep — fully specified in ARCHITECTURE.md

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | npm versions verified 2026-06-09; prebuilt binary matrix confirmed; Express 5 compat confirmed for express-session; react-router-dom peerDeps verified |
| Features | HIGH | Drawn from direct codebase inspection of alerts.js and alerts-router.js; validated against Gitea/Vaultwarden/Immich patterns |
| Architecture | HIGH | Based on direct code inspection of index.js, security.js, nginx.conf.template, App.jsx, api.js, migration files |
| Pitfalls | HIGH | Codebase-grounded; each pitfall references actual lines of code in the project |

**Overall confidence:** HIGH

### Gaps to Address During Planning

- **Same-origin topology assumption:** csrf-sync is the recommended default; no gap in the recommendation but the underlying assumption behind STACK's alternative is unvalidated.
- **argon2id on node:22-trixie-slim:** Verify as a docker build check early in Phase 1. The Ubuntu glibc prebuilt should load on Debian Trixie; source-compile fallback is confirmed available.
- **RPi-4 hashing benchmark:** OWASP minimum (19 MiB / t=2 / p=1) is the correct starting point but actual ms cost on RPi 4 under Node 22 is empirical. Must be measured on hardware in Phase 1 before login is shipped. Target: 200-500 ms. If over 1000 ms, reduce timeCost to 1 before adjusting memoryCost.
- **Express 5 x express-session async-error compat:** Relevant only if the fallback (express-session) path is chosen. The primary recommendation (custom sessions) sidesteps this entirely.
- **API_TOKEN_READS_ENABLED policy for sessions:** After adding sessions, the policy for read endpoints (require session or allow unauthenticated reads for event data) must be decided during requirements definition.

---

## Sources

### Primary (HIGH confidence)
- listener/src/index.js — existing auth gate, CORS config, IS_PRODUCTION logic (direct inspection)
- listener/src/security.js — secureTokenEquals, rateLimitKeyGenerator, SSRF validation (direct inspection)
- listener/src/alerts.js, listener/src/alerts-router.js — alert delivery path, validateCreate, quiet-period suppression (direct inspection)
- listener/migrations/0001_baseline.sql, 0002_alert_deliveries_sent_at_index.sql — migration format (direct inspection)
- web/nginx.conf.template — proxy_set_header X-API-Token injection, try_files SPA fallback, CSP (direct inspection)
- web/src/App.jsx, web/src/lib/api.js — tab-state navigation, fetchJson, VITE_API_TOKEN dev path (direct inspection)
- OWASP Password Storage Cheat Sheet — argon2id parameters: https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html
- OWASP CSRF Prevention: https://cheatsheetseries.owasp.org/cheatsheets/Cross_Site_Request_Forgery_Prevention_Cheat_Sheet.html
- argon2 npm (0.44.0, prebuilt binary matrix): https://www.npmjs.com/package/argon2
- express-session npm (1.19.0, Express 5 compat): https://www.npmjs.com/package/express-session
- connect-pg-simple npm (10.0.0, Node >=22 engines): https://www.npmjs.com/package/connect-pg-simple
- nodemailer npm (8.0.10, zero deps): https://www.npmjs.com/package/nodemailer
- react-router-dom npm (7.17.0, peerDeps react >=18): https://www.npmjs.com/package/react-router-dom
- React Router SPA library mode: https://reactrouter.com/how-to/spa
- csrf-sync npm (synchronizer token for Express with sessions): https://github.com/Psifi-Solutions/csrf-csrf

### Secondary (MEDIUM confidence)
- Gitea user management — first-user-becomes-admin, invite patterns, copyable link: https://docs.gitea.com/administration/user-management
- Vaultwarden user creation — admin-controlled: https://github.com/dani-garcia/vaultwarden/wiki/Creating-new-user
- Immich invite system: https://immich.app/docs/administration/user-management/
- Home Assistant auth model: https://www.home-assistant.io/docs/authentication/
- SameSite does not fully solve CSRF: https://airman604.medium.com/do-samesite-cookies-solve-csrf-6dcd02dc9383
- Token leakage via referrer — HackerOne report: https://hackerone.com/reports/252544
- Nodemailer SMTP blocking and timeout issues: https://github.com/nodemailer/nodemailer/issues/858

### Tertiary (LOW confidence — verify during implementation)
- OWASP Forgot Password Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html
- argon2id vs scrypt on RPi hardware — empirical benchmark needed; no verified source for Node 22 / RPi 4 numbers

---

*Research completed: 2026-06-09*
*Ready for roadmap: yes*
