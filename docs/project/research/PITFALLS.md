# Pitfalls Research

**Domain:** Adding invite-only session auth + email to a self-hosted Express 5 + PostgreSQL + React/Nginx app
**Project:** HomeChronicle v1.4 Multi-User Auth & Email
**Researched:** 2026-06-09
**Confidence:** HIGH (codebase-grounded; pitfalls reference actual code in `listener/src/index.js`, `listener/src/security.js`, `web/nginx.conf.template`)

---

## Critical Pitfalls

Mistakes that require rewrites, lock users out, or introduce exploitable security holes.

---

### Pitfall 1: The Self-Hosted HTTP / Secure Cookie Deadlock

**What goes wrong:**
Setting `cookie: { secure: true }` on the session cookie causes it to be silently dropped by browsers when the app is accessed over plain HTTP. Many HomeChronicle users run it on a home LAN without TLS (e.g., `http://192.168.1.50:3000`). With `secure: true`, login appears to succeed but the session cookie is never stored — every subsequent request is treated as unauthenticated. The user can never log in.

Conversely, omitting `secure: true` means session cookies are transmitted in plaintext over HTTP, visible to anyone on the same network segment.

**Why it happens:**
Developers writing the auth phase test on localhost (where `secure: false` is correct) or on a dev environment with TLS. They set `secure: IS_PRODUCTION` thinking "production should be secure." But HomeChronicle's production is a home LAN without TLS — the condition is true, the cookie is dropped, everyone is locked out.

The current nginx.conf already runs HTTP-only on port 80 with no TLS configuration. There is no `X-Forwarded-Proto: https` header being set.

**How to avoid:**
- Add a `SESSION_COOKIE_SECURE` env var that defaults to `false` and document clearly: "set to `true` only if you have HTTPS termination upstream."
- Never derive `secure` from `NODE_ENV=production`. Derive it from `SESSION_COOKIE_SECURE`.
- For `sameSite`: use `'lax'` as the default. `'strict'` breaks invite link flows (first-party navigation from email clients counts as cross-site). `'none'` requires `secure: true` and breaks HTTP deployments.
- Log a startup warning when `SESSION_COOKIE_SECURE=false` in production so users who have TLS know to enable it.
- In nginx.conf, if the user opts into HTTPS via a reverse proxy upstream, they need `proxy_set_header X-Forwarded-Proto https;` and Express must have `app.set('trust proxy', 1)` for `secure: 'auto'` (express-session option) to work.

**Warning signs:**
- Login POST returns 200 but subsequent GET /api/me returns 401.
- Browser DevTools → Application → Cookies shows no session cookie after login on HTTP.
- `Set-Cookie` header present in response but browser ignores it (check for "Cookie ignored" in DevTools console on Chrome).

**Phase to address:** Auth Foundation — must be solved before login is wired up, not retrofitted.

---

### Pitfall 2: Session Fixation on Login

**What goes wrong:**
After a user authenticates, the existing pre-login session ID is reused. An attacker who plants a known session ID (via a URL parameter or cookie manipulation) can wait for the victim to log in and then use the pre-planted ID to access the authenticated session.

**Why it happens:**
`express-session` does not regenerate the session ID on authentication by default. Developers wire up `req.session.userId = user.id` after password verification and think they're done. The session ID that existed before login (e.g., for tracking the invite token) persists after login.

**How to avoid:**
Call `req.session.regenerate()` immediately after verifying credentials, before writing any user data to the session:

```js
// login route
req.session.regenerate((err) => {
  if (err) return next(err);
  req.session.userId = user.id;
  req.session.role = user.role;
  res.json({ ok: true });
});
```

Also call `req.session.destroy()` on logout to invalidate the server-side session record, not just clear the cookie client-side.

**Warning signs:**
- Login route does `req.session.userId = user.id` without a preceding `regenerate()` call.
- Logout route sends `res.clearCookie('session')` but does not call `req.session.destroy()`.

**Phase to address:** Auth Foundation — include in the login route implementation and auth integration test suite.

---

### Pitfall 3: CSRF Exposure on Existing Mutating Endpoints

**What goes wrong:**
The current app uses an opaque `API_TOKEN` header (`x-api-token`) for auth. Headers are not sent by cross-origin forms or `<img>` tags, so the existing system is CSRF-immune by design. Switching to cookies breaks this: once a session cookie exists, any cross-origin POST can ride it.

The existing mutating endpoints — pairing, room rename, alert rule creation, retention settings, log-level patch — all become CSRF-vulnerable the moment session cookies are introduced. This is not a future concern; it is an immediate consequence of adding cookies.

**Why it happens:**
`SameSite=Lax` blocks cross-site POSTs from form submits but does NOT block cross-origin `fetch()` in some browser versions, and does not block state-changing GET requests at all. Developers assume `SameSite=Lax` is sufficient and skip explicit CSRF tokens.

**How to avoid:**
- Use the `csrf-sync` package (synchronizer token pattern) since the app has server-side sessions. Do not use the stateless `csrf-csrf` (double-submit pattern) — it is weaker when sessions exist.
- Mount the CSRF middleware after the session middleware, before all mutating route handlers.
- The CSRF token endpoint must be a GET and must be called by the React app on page load; store the token in memory (not localStorage — not needed here, token comes from the session).
- Exempt the `/api/auth/login` and `/api/auth/invite/accept` routes from CSRF (user doesn't have a CSRF token yet before login). All other mutating routes must require it.
- Update the CSP in `nginx.conf.template` — current `connect-src 'self'` is correct and already limits fetch targets.

**Warning signs:**
- Session cookie is set but no CSRF token is returned to the frontend on login.
- POST to `/api/setup/rooms` succeeds from a cross-origin `fetch()` with credentials.
- The words "SameSite=Lax is enough" appear in code comments without an accompanying CSRF token implementation.

**Phase to address:** Auth Foundation — CSRF middleware must be added in the same phase as cookie auth, not deferred to Security Hardening.

---

### Pitfall 4: Weak Password Hashing Parameters for RPi/NAS Hardware

**What goes wrong:**
Using bcrypt with cost factor 10 (the library default) or Argon2id with default memory parameters produces hashes that are trivially brute-forced on modern hardware while also being too slow on a Raspberry Pi 4 under load (the target platform). Getting this wrong in either direction creates problems: too weak = user accounts compromised; too slow = login takes 3-5 seconds, HAP subscriber event processing starves.

**Why it happens:**
`bcrypt.hash(password)` with no explicit cost factor uses cost 10, which is ~100ms on a fast server but may be 500-800ms on an RPi 4. Teams running on cloud instances set cost factors calibrated for that hardware, then ship to RPi where the same parameters are 5-10x slower.

**How to avoid:**
- Use Argon2id (the `argon2` npm package) over bcrypt. Argon2id is the current OWASP/NIST recommendation.
- Start with OWASP minimum: `memoryCost: 19456` (19 MiB), `timeCost: 2`, `parallelism: 1`. This is specifically calibrated to be safe on constrained hardware.
- Add a `BCRYPT_ROUNDS` / `ARGON2_MEMORY_COST` env var with documented defaults so operators can tune for their hardware.
- Benchmark the chosen params on RPi 4 before shipping. Target 200-500ms. If over 1s at OWASP minimum, use bcrypt cost 11 as fallback (not cost 10).
- The `argon2` npm package requires native compilation — add `python3`, `make`, and `g++` to the Dockerfile build stage. The listener Dockerfile already installs these for HAP-controller native addons; verify they remain after Dockerfile changes.

**Warning signs:**
- `bcrypt.hash(password)` call with no explicit cost factor argument.
- `argon2.hash(password)` with no options object (uses library defaults which may not match OWASP minimums).
- Login endpoint response time > 1s in production logs on first login.
- `npm ci` fails in the Dockerfile build stage with "no python3" or "no make" after Dockerfile changes.

**Phase to address:** Auth Foundation — set parameters correctly from the start; changing hash parameters later requires re-hashing all passwords.

---

### Pitfall 5: Invite and Password-Reset Tokens Not Single-Use or Not Time-Bounded

**What goes wrong:**
A generated invite token remains valid after it has been accepted (allowing replay), or remains valid indefinitely (allowing use after the intended window). An attacker who obtains the token URL — via log files, browser history, or referrer header leakage — can use it at any time.

For password reset specifically: if the token is not invalidated after first use, an attacker who sees the URL in a shared log (Docker `docker compose logs`, nginx access log) can reset the password again after the legitimate user has already reset it.

**Why it happens:**
Token generation is easy; token lifecycle management is the hard part. Developers store the token hash and an `expires_at` timestamp but forget to mark it `used = true` after acceptance, or forget to check that flag on submission.

**How to avoid:**
- Store a SHA-256 hash of the token (not the token itself) in the `users` or a separate `invite_tokens` table.
- Token record must have: `token_hash`, `email`, `expires_at`, `used_at` (nullable), `created_at`.
- On redemption: verify hash, check `expires_at > NOW()`, check `used_at IS NULL` — all three in a single atomic `UPDATE ... WHERE token_hash = $1 AND expires_at > NOW() AND used_at IS NULL RETURNING id`. If zero rows updated, reject.
- Invite tokens: expire in 48-72 hours (user must respond promptly). Password reset tokens: expire in 1 hour.
- Never PUT the raw token in the database. Only store the hash.

**Warning signs:**
- `invite_tokens` table has no `used_at` column.
- Redemption route checks `expires_at` but not `used_at`.
- Token stored as plaintext in the database (not hashed).
- Invite link still works after clicking "Accept Invite" successfully.

**Phase to address:** Email Invites phase — token lifecycle is core to the invite flow, not optional hardening.

---

### Pitfall 6: Invite/Reset Token Leaking via Referrer Header or Server Logs

**What goes wrong:**
Invite and password-reset URLs contain the token as a query parameter (e.g., `/invite?token=abc123`). If the invite email contains tracking pixels or the user's email client fetches remote resources, the `Referer` header on those requests can leak the token to the tracking domain. Similarly, nginx access logs in the default `combined` format log the full URL including query strings — the token appears in plaintext in `docker compose logs web`.

**Why it happens:**
Putting tokens in URL query parameters is the simplest implementation. The `Referrer-Policy: no-referrer` header is already set on the nginx config — but this only controls browser-initiated requests FROM the HomeChronicle page, not external requests TO HomeChronicle (the invite link click comes from the email client where HomeChronicle's referrer policy doesn't apply).

**How to avoid:**
- The `Referrer-Policy: no-referrer` already in `nginx.conf.template` prevents HomeChronicle from leaking tokens to third-party resources loaded on the invite-accept page. Keep it.
- More important: configure nginx access log format to exclude query strings for the invite/reset paths. Use `$uri` instead of `$request` in log format, or use `log_not_found off` + a conditional log format for those paths.
- Alternatively, use a fragment (`/invite#token=abc123`) — fragments are never sent to the server or included in `Referer` headers. The React app can read `window.location.hash`. Downside: requires the SPA router to handle hash-based params separately from hash routing.
- Tokens are single-use with short TTLs (see Pitfall 5), which limits the window of exposure from log leakage.

**Warning signs:**
- nginx access log shows `/api/auth/invite/accept?token=...` in full.
- Token appears in `docker compose logs web`.
- Invite accept page loads external resources (fonts, analytics) that would receive the token via `Referer`.

**Phase to address:** Email Invites phase — design the token URL scheme before implementing invite email sending.

---

### Pitfall 7: Email Enumeration on Forgot-Password

**What goes wrong:**
The forgot-password endpoint returns "Email not found" when the address is not registered. An attacker can enumerate which email addresses have accounts by submitting a list of addresses and observing which responses differ.

**Why it happens:**
The obvious implementation returns different responses for found vs. not-found email addresses, and developers do not think of it as a security issue.

**How to avoid:**
- Always return the same response body and HTTP status (200 with a generic message like "If an account exists for this email, a reset link has been sent") regardless of whether the email is found.
- Add the same artificial delay on the "not found" path as the "found" path (which includes a database query and email send). Use a constant-time response window or `await setTimeout(randomBetween(200, 400))` to prevent timing-based enumeration.
- This applies to both the forgot-password endpoint and the invite resend endpoint.

**Warning signs:**
- Forgot-password route returns 404 for unknown emails and 200 for known emails.
- Response time differs noticeably between found and not-found cases (database lookup vs. none).
- Different response body text for found vs. not-found cases.

**Phase to address:** Email Invites phase (reset flow) — enumerate the correct behavior in the route spec before implementation.

---

### Pitfall 8: SMTP Send Blocking the Express Event Loop

**What goes wrong:**
`nodemailer.sendMail()` is async (returns a promise), but if called inside a route handler without proper await/error handling, it can block the event loop on SMTP connection establishment — particularly on first send when TCP connection to the SMTP server is being established. On a single-threaded Node.js process that also manages HAP subscriptions and Matter polling, a stalled SMTP connection delays all other requests.

More critically: if `sendMail()` throws or rejects and the error is not caught, the global `unhandledRejection` handler in `index.js` logs it but does not crash — meaning invite emails silently fail with no feedback to the user or admin.

**Why it happens:**
SMTP connections can stall for 30-60 seconds when the remote server is unreachable or firewalled (common in Docker on restrictive networks). Nodemailer's default `connectionTimeout` is 2 minutes, which is far too long for a request/response cycle.

**How to avoid:**
- Set aggressive Nodemailer timeouts: `connectionTimeout: 10000` (10s), `socketTimeout: 15000` (15s), `greetingTimeout: 10000` (10s).
- Always `await sendMail()` inside try/catch in the route handler. Do not use fire-and-forget.
- Return a 202 Accepted response to the user immediately after enqueuing the send, then send in the background — but this requires tracking delivery status. For a simple self-hosted app, awaiting the send synchronously with a short timeout is acceptable; just ensure the timeout is short enough.
- Log SMTP failures with enough detail for the operator to diagnose: include the SMTP hostname, port, and error code in the log message.
- Validate SMTP configuration at startup (attempt a `verify()` call on the transporter) and log a warning if it fails, so operators know email won't work before an invite is attempted.

**Warning signs:**
- Login or invite routes have response times > 5s in logs.
- `sendMail` call is not inside a try/catch.
- No timeout options set on the Nodemailer transporter.
- SMTP verification not run at startup.

**Phase to address:** Email Invites phase — wire email infrastructure with timeouts and error handling before invites go live.

---

### Pitfall 9: Alert Email Loop and Flood

**What goes wrong:**
When email is added as an alert delivery channel, a device that toggles state rapidly (e.g., a motion sensor firing every 30 seconds) can generate dozens or hundreds of emails per hour. The existing quiet-period suppression (`alert_rules.quiet_minutes`) prevents repeated webhook deliveries — but if email is wired as a separate delivery path that bypasses or ignores quiet-period logic, email floods occur.

**Why it happens:**
The email alert channel is added as a new delivery mechanism in a different phase from the quiet-period logic. Developers copy the webhook delivery path but miss the quiet-period check, or implement quiet-period per-channel with separate state that resets independently.

**How to avoid:**
- Email delivery must go through the same `alerts.js` processing path as webhooks, using the same `alert_deliveries` table for quiet-period tracking.
- The quiet-period check must be keyed on `(rule_id, channel)` or simply on `rule_id` regardless of channel — if a rule fired within the quiet period via any channel, no delivery of any channel fires again until the window expires.
- Add a per-rule `max_deliveries_per_hour` column (optional but strongly recommended for email) to prevent runaway sends even if quiet-period logic has a bug.
- Test the alert email path with a rapid-fire event sequence before shipping.

**Warning signs:**
- Email delivery path has its own `last_delivered_at` tracking separate from `alert_deliveries` table.
- Alert rule with `quiet_minutes: 0` and email delivery fires on every matching event.
- No rate cap on email sends per rule per time window.

**Phase to address:** Email Alert Channel phase — quiet-period integration is a prerequisite, not an enhancement.

---

### Pitfall 10: First-Admin Bootstrap Race Condition

**What goes wrong:**
The first-admin creation logic checks "if no users exist, create admin" — but this check and the insert are not atomic. In a scenario where two people simultaneously hit the registration/setup endpoint (unlikely but possible with Docker restart races or automated setup scripts), two admins can be created, or neither is created if both read 0 users before either inserts.

More practically: during a migration run, the `users` table is created empty. If the listener starts and accepts requests before the operator has bootstrapped an admin, there is a window where the app is fully unauthenticated (no admin exists, auth middleware may let requests through or reject all requests).

**Why it happens:**
Bootstrap logic is typically written as:
```js
const count = await db.query('SELECT COUNT(*) FROM users');
if (count.rows[0].count === '0') { /* create admin */ }
```
This is a TOCTOU (time-of-check time-of-use) race.

**How to avoid:**
- Use an advisory lock or `INSERT ... WHERE NOT EXISTS` pattern:
  ```sql
  INSERT INTO users (email, role, ...) 
  SELECT $1, 'admin', ...
  WHERE NOT EXISTS (SELECT 1 FROM users WHERE role = 'admin')
  ```
  This is atomic at the database level.
- The bootstrap endpoint (e.g., `POST /api/auth/bootstrap`) must only be available when zero admin users exist. Check this on each request, not just once at startup.
- Log a clear startup message: "No admin user found — visit /setup to create the first admin account" so operators know the expected state.
- Do not auto-create admin credentials at startup (e.g., random password printed to logs). Require explicit operator action.

**Warning signs:**
- Bootstrap check is `SELECT COUNT(*)` + separate `INSERT` without a transaction or advisory lock.
- Bootstrap endpoint remains available (returns 200) after an admin user already exists.
- No startup log message indicating bootstrap state.

**Phase to address:** Auth Foundation — bootstrap logic is the first thing the migration creates; race condition must be addressed before the migration is written.

---

### Pitfall 11: Breaking Existing Single-Token Deployments on Upgrade (Backward Compat)

**What goes wrong:**
The current nginx.conf injects `X-API-Token: ${API_TOKEN}` on every proxied request. The current listener middleware accepts this header for all mutating endpoints. When session-based auth replaces the token model, existing users upgrading from v1.3 will:

1. Have no users table (migration creates it empty).
2. Have no session — their browser has no cookie.
3. Face an auth middleware that requires a valid session.
4. Be locked out of the app on first boot after upgrade.

If the new auth middleware removes the `API_TOKEN` check before guiding users through bootstrap, the app is simultaneously unauthenticated (no users) AND authentication is required — a complete lockout.

**Why it happens:**
The new auth system and the old token system are developed in isolation. The developer removes the old token middleware when adding the session middleware, assuming they're mutually exclusive. But the migration path for existing users is not tested.

**How to avoid:**
- During the auth migration phase, run both systems in parallel: the session middleware authenticates session-cookie requests; the existing `secureTokenEquals` middleware authenticates `x-api-token` header requests. Neither blocks the other.
- Add a `LEGACY_TOKEN_AUTH_ENABLED` env var (default: `true`) that keeps the header-based token check active alongside session auth. Document that this can be disabled once all clients have migrated to sessions.
- The bootstrap endpoint (`POST /api/auth/bootstrap`) must explicitly bypass ALL auth middleware — it is the escape hatch when no users exist.
- Test the upgrade path explicitly: start from a clean v1.3 state (no `users` table, existing `API_TOKEN` in env), apply migrations, and verify the operator can bootstrap without being locked out.
- Remove the nginx `proxy_set_header X-API-Token` directive only in a later phase (Security Hardening), after session auth is stable and operators have had time to migrate.

**Warning signs:**
- Auth middleware removed the `API_TOKEN` check before the `users` table has any rows.
- Bootstrap endpoint requires authentication to access.
- No upgrade path documented in `CHANGELOG.md` or migration notes.
- The phrase "the old token auth is no longer supported" appears before a stable session auth release.

**Phase to address:** Auth Foundation — backward compat design must precede implementation; tested in the upgrade integration test.

---

### Pitfall 12: Auth Route Brute Force — No Rate Limiting on Login

**What goes wrong:**
The existing `express-rate-limit` middleware is applied to write endpoints (POST/PATCH/DELETE) at 60 requests/minute. The login endpoint is a POST, but the generic write rate limit is far too permissive for credential checking. 60 login attempts per minute is enough to brute-force a 6-character password in minutes.

**Why it happens:**
Developers add the login route under the general write rate limiter and consider it covered. The distinction between "write operation that mutates app state" and "credential verification endpoint" is not made.

**How to avoid:**
- Create a dedicated, strict rate limiter for auth endpoints: `max: 10` per IP per 15 minutes for `/api/auth/login`, `/api/auth/forgot-password`, and `/api/auth/invite/accept`.
- Use the existing `rateLimitKeyGenerator` in `security.js` (already handles X-Forwarded-For correctly with trust proxy check).
- On account lockout: after N failed attempts (e.g., 5), add an exponential delay to login responses for that account regardless of source IP (prevents distributed brute force). Store `failed_attempts` and `locked_until` on the `users` row.
- Log failed login attempts with the email attempted (but not the password) for operator visibility.
- Do NOT use CAPTCHA — self-hosted home users should not be required to solve CAPTCHAs to log into their own device.

**Warning signs:**
- Login route uses the same `writeRateLimiter` as the room rename endpoint.
- No `failed_attempts` column on the `users` table.
- 100 rapid POSTs to `/api/auth/login` with different passwords all return 401 without any rate-limit 429 response.

**Phase to address:** Auth Foundation — rate limiting on auth routes must be in place before login is deployed; not a Security Hardening concern.

---

### Pitfall 13: SMTP Credentials Exposed via Config Endpoint

**What goes wrong:**
The existing Settings tab fetches `/api/setup/settings` (or similar) and displays configuration. If the email SMTP config (host, port, username, password) is stored in the `retention.json` / settings store and returned verbatim by a GET endpoint, SMTP credentials are exposed to any authenticated user — or, if the read-auth flag is not enabled, to unauthenticated users.

**Why it happens:**
The existing pattern for configuration is: store settings, return them via GET for the UI to display. This is fine for non-sensitive settings. SMTP password is different.

**How to avoid:**
- Never return the SMTP password in API responses. Return a boolean `smtpConfigured: true/false` and a masked `smtpUser: "u***@example.com"` at most.
- Store SMTP credentials in environment variables (`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`), not in JSON files. Env vars are not exposed by the settings API. The existing pattern uses env vars for `API_TOKEN` — follow the same pattern.
- If SMTP config must be user-configurable via the UI (not env vars), store the password encrypted at rest and never return it in GET responses.

**Warning signs:**
- SMTP settings stored in `alerts-settings.json` or any other `JsonObjectStore` file.
- GET `/api/setup/settings` response includes an `smtpPassword` field.
- Environment variable docs don't include `SMTP_PASS` (means it's being stored elsewhere).

**Phase to address:** Email Invites phase — design the SMTP config model before implementing the mailer.

---

## Technical Debt Patterns

Shortcuts that seem reasonable during a fast auth implementation but create long-term problems.

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| `secure: process.env.NODE_ENV === 'production'` for cookie | Looks right | Locks out all self-hosted HTTP users silently; never recoverable without env change | Never — use `SESSION_COOKIE_SECURE` env var instead |
| SameSite=Lax as sole CSRF defense | No CSRF library needed | CSRF still possible via cross-origin fetch in some browser versions; all mutating endpoints vulnerable | Never as sole defense — pair with synchronizer token |
| bcrypt cost 10 (library default) | No configuration needed | Too weak on fast hardware; potentially too slow on RPi without measurement | Only in development; always tune for target hardware in production |
| Raw token stored in DB for invites | Simpler implementation | Token theft from DB gives usable invite links; single-use not enforced if check is forgotten | Never — always store SHA-256 hash |
| `sendMail()` fire-and-forget (no await) | Route responds immediately | Silent email failures; SMTP errors swallowed; user never knows invite didn't send | Never — always await with try/catch |
| Remove `X-API-Token` check on v1.4 release | Cleaner code | Locks out all existing users who upgrade before bootstrapping admin | Never in the same release; keep legacy auth for one full release cycle |
| Store SMTP password in JSON config file | Easy UI configuration | Credentials in version-controlled or Docker-volume-exposed file; returned by settings API | Never — use env vars |

---

## Integration Gotchas

Issues specific to wiring session auth into this codebase's existing systems.

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| nginx token injection + session auth | Removing `proxy_set_header X-API-Token` before session auth is stable | Keep both auth paths in parallel; remove nginx token injection only in Security Hardening phase |
| `express-session` + Express 5 | Using `express-session` v1 which has known issues with Express 5's async error propagation | Verify `express-session` release notes for Express 5 compatibility; use `connect-pg-simple` for PostgreSQL session store |
| Session store + PostgreSQL pool | Creating a second `pg.Pool` for the session store | Pass the existing `pool` from `db.js` to `connect-pg-simple`; do not create a redundant connection pool |
| CORS + `credentials: true` | Not adding `credentials: true` to cors config when switching to cookie auth | React fetch calls must use `credentials: 'include'`; CORS must allow this with a specific origin (not wildcard) |
| `API_TOKEN_READS_ENABLED` + session auth | Read endpoints suddenly require login when they previously didn't | Decide policy: read-only access is allowed without login (event logs are not personal data in HomeChronicle) OR require login for all reads. Document the decision. |
| alert_deliveries + email channel | Email delivery state tracked separately from `alert_deliveries` table | Route email delivery through the same `processAlert()` path; store delivery record with `channel: 'email'` in `alert_deliveries` |
| react-router + existing SPA routing | Adding react-router but not handling the nginx `try_files $uri $uri/ /index.html` fallback for deep links | `try_files` config is already correct in nginx.conf; ensure all react-router routes are client-side only, no SSR |

---

## Performance Traps

Patterns that work on dev machines but fail on RPi or NAS.

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Argon2 with high memory cost on RPi 4 | Login takes 3-5s; HAP event processing starves during login | Benchmark Argon2 params on target hardware; use OWASP minimum (19 MiB) as starting point | Immediately on RPi 4 with <2 GB RAM available to Node |
| Session table without index on `sid` column | Session lookup slow under moderate concurrent users | `connect-pg-simple` creates the index automatically if you let it manage schema; verify index exists | Not visible at 1-3 concurrent users; noticeable at 10+ |
| SMTP send inside request/response cycle with 30s timeout | Login and invite routes block for up to 30s on SMTP failure | Set `connectionTimeout: 10000` on nodemailer transporter | Every time SMTP server is unreachable |
| bcrypt `genSalt` + `hash` separate calls | Slightly slower than `bcrypt.hash(password, rounds)` | Use `bcrypt.hash(password, ROUNDS)` directly | Not a crash; just avoidable overhead |

---

## Security Mistakes

Domain-specific issues beyond the generic OWASP list.

| Mistake | Risk | Prevention |
|---------|------|------------|
| Timing attack on invite token comparison | Attacker enumerates valid tokens via response time | Use `crypto.timingSafeEqual` (already in `security.js` as `secureTokenEquals`) for token comparison; compare hash vs. hash |
| Session cookie without `httpOnly` | JavaScript can read and exfiltrate the session ID via XSS | Always `httpOnly: true` — no exceptions |
| Invite token in nginx access log | Tokens exposed to anyone with log access | Configure nginx log format to exclude query strings for `/api/auth/*` paths |
| Password reset doesn't invalidate active sessions | User who changed password to regain account after compromise still has attacker's session active | On password reset, call `req.session.destroy()` and invalidate all other sessions for that user ID in the session store |
| SMTP open relay via user-controlled `to` field | Attacker uses the invite endpoint to send spam | Invite endpoint must accept email addresses only from admin-controlled invite requests; validate recipient is in `invite_tokens.email` — never let user-supplied input control the SMTP `To` field |
| Email header injection | Attacker injects SMTP headers via name fields | Use nodemailer's structured address objects (`{ name: 'User', address: 'user@example.com' }`) — never string concatenation for SMTP headers |

---

## "Looks Done But Isn't" Checklist

Things that appear complete in a browser but are missing critical pieces.

- [ ] **Login:** Verify `req.session.regenerate()` is called before writing `userId` to session — not just `req.session.userId = id` after password check
- [ ] **Logout:** Verify `req.session.destroy()` is called server-side, not just `res.clearCookie()`
- [ ] **Invite token:** Verify token record has `used_at` set after first acceptance AND subsequent attempts return 400, not 200
- [ ] **Forgot password:** Verify response body is identical for known and unknown email addresses — test with an email that doesn't exist
- [ ] **Session cookie on HTTP:** Verify login works on `http://` (not just `https://`) — test with `SESSION_COOKIE_SECURE=false` and confirm cookie is set
- [ ] **CSRF:** Verify a cross-origin POST to `/api/setup/rooms` without the CSRF token returns 403, not 200
- [ ] **Rate limit:** Verify 11 rapid POSTs to `/api/auth/login` returns 429 on the 11th request
- [ ] **Legacy token auth:** Verify the existing `API_TOKEN` header still authenticates after v1.4 migration — existing clients must not be broken
- [ ] **Bootstrap endpoint:** Verify `POST /api/auth/bootstrap` returns 409 after an admin user already exists
- [ ] **SMTP credentials:** Verify `GET /api/setup/settings` does NOT include `smtpPassword` in the response body
- [ ] **Alert email quiet period:** Verify a rapid-fire device event with `quiet_minutes: 5` sends at most one email per 5 minutes
- [ ] **Password hash:** Verify `users.password_hash` column contains Argon2id/bcrypt hash format, not plaintext

---

## Recovery Strategies

When pitfalls occur despite prevention, how to recover.

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| All users locked out (secure cookie on HTTP) | LOW | Add `SESSION_COOKIE_SECURE=false` to `.env`, restart container |
| CSRF tokens not wired — existing endpoints vulnerable | MEDIUM | Add `csrf-sync` middleware in a hotfix; frontend must fetch CSRF token before mutations; requires coordinated deploy |
| Invite tokens reusable (single-use not enforced) | MEDIUM | Add `used_at` column migration; update redemption query; invalidate all existing tokens (force re-invite) |
| SMTP password in settings API response | MEDIUM | Remove from API response in a patch; rotate SMTP credentials; migrate to env var storage |
| Legacy token auth removed too early — users locked out | HIGH | Re-add `secureTokenEquals` middleware in hotfix; re-add `proxy_set_header X-API-Token` to nginx.conf; all existing clients unblocked |
| Argon2 params too slow on RPi — login hangs | LOW | Reduce `memoryCost` and `timeCost` in env; existing password hashes remain valid (params are stored in the hash string) |
| Alert email flood before quiet-period integrated | MEDIUM | Disable email alert channel in settings; integrate quiet-period logic; re-enable |
| Bootstrap race — two admins created | LOW | Manually delete the duplicate admin via `psql`; add `UNIQUE` constraint on `(role = 'admin')` or advisory lock |

---

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Self-hosted HTTP / secure cookie deadlock (P1) | Auth Foundation | Login works on `http://192.168.x.x` with `SESSION_COOKIE_SECURE=false`; cookie present in DevTools |
| Session fixation (P2) | Auth Foundation | Auth integration test: session ID before login != session ID after login |
| CSRF on existing endpoints (P3) | Auth Foundation | Cross-origin POST without CSRF token returns 403 |
| Weak hashing params for RPi (P4) | Auth Foundation | Login completes in 200-500ms on RPi 4; Argon2id params documented in env example |
| Invite tokens not single-use (P5) | Email Invites | Accepting invite twice returns 400 on second attempt |
| Token leakage via referrer/logs (P6) | Email Invites | nginx log format for `/api/auth/*` excludes query string |
| Email enumeration on forgot-password (P7) | Email Invites | Response body identical for known/unknown email; timing difference < 50ms |
| SMTP blocking event loop (P8) | Email Invites | Invite route responds in < 15s even when SMTP server is unreachable |
| Alert email loop/flood (P9) | Email Alert Channel | Rapid-fire event with quiet_minutes=5 generates exactly 1 email per window |
| First-admin bootstrap race (P10) | Auth Foundation | Concurrent bootstrap requests create exactly 1 admin user |
| Breaking existing token deployments (P11) | Auth Foundation | v1.3 → v1.4 upgrade integration test: existing `API_TOKEN` header still authenticates |
| No rate limit on login (P12) | Auth Foundation | 11 rapid login POSTs return 429 on the 11th |
| SMTP credentials exposed via API (P13) | Email Invites | `GET /api/setup/settings` response contains no `smtpPassword` field |

---

## Sources

- Codebase: `listener/src/security.js` — `secureTokenEquals`, `rateLimitKeyGenerator`, SSRF validation
- Codebase: `listener/src/index.js` — current token middleware (lines 393-407), CORS config, `IS_PRODUCTION` logic
- Codebase: `web/nginx.conf.template` — `proxy_set_header X-API-Token`, CSP, `Referrer-Policy: no-referrer`
- [OWASP Cross-Site Request Forgery Prevention Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html)
- [csrf-sync — synchronizer token pattern for Express with sessions](https://github.com/Psifi-Solutions/csrf-csrf)
- [express-session docs — regenerate, destroy](https://expressjs.com/en/resources/middleware/session/)
- [Session fixation prevention in Node.js](https://levelup.gitconnected.com/what-is-session-fixation-and-how-to-prevent-it-in-node-js-03580b6acd67)
- [argon2 npm package](https://www.npmjs.com/package/argon2)
- [Password hashing 2026: Argon2 vs bcrypt — OWASP recommended parameters](https://guptadeepak.com/the-complete-guide-to-password-hashing-argon2-vs-bcrypt-vs-scrypt-vs-pbkdf2-2026/)
- [Token leakage via referrer — HackerOne report](https://hackerone.com/reports/252544)
- [Password reset token leak via referrer — Medium](https://shahjerry33.medium.com/password-reset-token-leak-via-referrer-2e622500c2c1)
- [Cookie security — SameSite, Secure, HttpOnly interaction](https://trustfoundry.net/2024/03/07/securing-session-cookies/)
- [SameSite does not fully solve CSRF](https://airman604.medium.com/do-samesite-cookies-solve-csrf-6dcd02dc9383)
- [Nodemailer SMTP blocking and timeout issues](https://github.com/nodemailer/nodemailer/issues/858)

---
*Pitfalls research for: HomeChronicle v1.4 Multi-User Auth & Email*
*Researched: 2026-06-09*
