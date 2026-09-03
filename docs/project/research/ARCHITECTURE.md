# Architecture Research

**Domain:** Multi-user session auth + email integration — HomeChronicle v1.4
**Researched:** 2026-06-09
**Confidence:** HIGH (based on direct codebase inspection + advisor review)

## Standard Architecture

### System Overview — After v1.4

```
Browser (session cookie, HttpOnly)
    │
    ▼
Nginx (web container)
  - Removes proxy_set_header X-API-Token injection (Phase 4 only)
  - Passes session cookie through to listener unchanged
  - CSP: allow /api/auth/* as connect-src (no change needed — already 'self')
    │
    ▼
Express (listener)
  cors → json → security-headers → audit → [public auth routes] → [gate middleware] → [existing routers]

Auth Gate Middleware (index.js, line ~393 replacement):
  1. OPTIONS → pass
  2. Valid API_TOKEN header → pass (service/escape-hatch, backward-compat)
  3. Valid session cookie → pass (new user path)
  4. Public auth routes bypass gate entirely (mounted before gate)
  5. All else → 401
    │
    ▼
PostgreSQL 16
  event_logs, event_logs_archive (unchanged)
  alert_rules (+ channel/target_email columns in 0005)
  alert_deliveries (unchanged)
  users (0003)
  sessions (0003)
  invites (0004)
  password_reset_tokens (0004)
```

### Component Responsibilities — New vs Modified

| Component | File | Status | Responsibility |
|-----------|------|--------|----------------|
| `createAuthRouter` | `listener/src/auth-router.js` | NEW | Login, logout, me, change-password, user list, invite-create (protected routes mounted after gate) |
| Auth public routes | mounted from `auth-router.js` | NEW | POST /api/auth/login, /api/auth/accept-invite, /api/auth/reset-request, /api/auth/reset-confirm — mounted BEFORE gate |
| Auth gate middleware | `listener/src/index.js` | MODIFIED | Replaces single token-only block with token-OR-session-OR-public-bypass logic |
| `emails.js` | `listener/src/emails.js` | NEW | Nodemailer SMTP transport; `sendInvite()`, `sendPasswordReset()`, `sendAlertEmail()` |
| `listener/src/db.js` | db.js | MODIFIED | Add `createUser()`, `findUserByEmail()`, `createSession()`, `validateSession()`, `revokeSession()`, `createInvite()`, `consumeInvite()`, `createResetToken()`, `consumeResetToken()` |
| `listener/src/security.js` | security.js | MODIFIED | Add `hashPassword(password)`, `verifyPassword(password, hash)` using `crypto.scrypt` |
| `listener/src/alerts.js` | alerts.js | MODIFIED | Channel switch: if `channel === 'email'` → `sendAlertEmail()`; else existing webhook path |
| `LoginPage` | `web/src/pages/LoginPage.jsx` | NEW | Username + password form; on success redirect to app shell |
| `AcceptInvitePage` | `web/src/pages/AcceptInvitePage.jsx` | NEW | Token-from-URL + set-password form |
| `ResetPasswordPage` | `web/src/pages/ResetPasswordPage.jsx` | NEW | Email request form + token-from-URL confirmation form |
| `main.jsx` | `web/src/main.jsx` | MODIFIED | Wrap with react-router; routes: /login, /accept-invite, /reset-password, /* (App shell) |
| `web/src/lib/api.js` | api.js | MODIFIED | Add `credentials: 'include'` to all fetch calls; remove VITE_API_TOKEN dev token injection (sessions work in dev too) |
| `web/nginx.conf.template` | nginx.conf.template | MODIFIED (Phase 4) | Remove `proxy_set_header X-API-Token` lines; pass cookie through; no other proxy changes needed |
| `alert_rules` table | 0005 migration | MODIFIED | Add `channel TEXT NOT NULL DEFAULT 'webhook'`, `target_email TEXT` columns; add CHECK constraint |

---

## Q1: Auth Gate — Token-OR-Session, Not Replacement

### Decision

**Keep `API_TOKEN` as an escape-hatch service token; add sessions as the primary user auth path.** Do not remove the token middleware — replace the single block with an OR gate.

### Why Not Replace Entirely

The nginx `proxy_set_header X-API-Token` injection is the browser's auth today — the browser sends nothing; nginx blindly authenticates every proxied request. There are no internal HTTP-to-HTTP callers (subscriber, matter-runtime call `insertEvent()` as a function, not over the network). After adding sessions:

- The injection persists through Phases 1–3 (backward compat, zero risk)
- Phase 4 removes the injection only after sessions are proven stable
- Keeping the token means operators can still use API_TOKEN for scripts, Home Assistant integrations, or CLI tooling

### Gate Middleware Structure (index.js, replaces lines 393–407)

```js
// Public auth route prefixes — bypass ALL auth checks
const PUBLIC_AUTH_PATHS = [
  '/api/auth/login',
  '/api/auth/accept-invite',
  '/api/auth/reset-request',
  '/api/auth/reset-confirm',
];

app.use(async (req, res, next) => {
  if (req.method === 'OPTIONS') return next();

  // Bypass: public auth endpoints (mounted separately before this, but guard here too)
  if (PUBLIC_AUTH_PATHS.some(p => req.path.startsWith(p))) return next();

  // Path 1: API_TOKEN header (service token / backward-compat)
  if (API_TOKEN) {
    const providedToken = String(
      req.get('x-api-token') ?? extractBearerToken(req.get('authorization'))
    ).trim();
    if (secureTokenEquals(API_TOKEN, providedToken)) return next();
  }

  // Path 2: Session cookie
  const sessionToken = req.cookies?.hc_session;
  if (sessionToken) {
    const session = await validateSession(pool, sessionToken); // hashed lookup
    if (session) {
      req.user = session; // { userId, email, role }
      return next();
    }
  }

  // No valid auth
  res.setHeader('WWW-Authenticate', 'Bearer realm="homechronicle-api"');
  return res.status(401).json({ error: 'Unauthorized' });
});
```

**Requires:** `cookie-parser` middleware (or manual `req.headers.cookie` parse) added before the gate. One new package.

### Public Routes — Mount Order in index.js

```
cors → json → security-headers → audit → cookie-parser
    → app.use('/api/auth', createAuthPublicRouter(...))   ← BEFORE gate
    → gate middleware
    → app.use('/api/auth', createAuthProtectedRouter(...)) ← AFTER gate
    → app.use('/api/setup', createSetupRouter(...))        ← unchanged
    → [all other existing routers]                         ← unchanged
```

The public router handles only login, accept-invite, reset-request, reset-confirm. The protected router handles logout, me, change-password, users list, invite-create. Splitting into two mount points with the same prefix (`/api/auth`) is valid in Express — routes match first-registered first.

Alternatively, use a single `createAuthRouter()` factory that internally marks public routes with a flag and checks the gate inline — valid pattern, but the two-mount approach is cleaner because it makes the security boundary visible in index.js.

---

## Q2: Database Migrations — 0003 Through 0005

### Migration File Conventions (from codebase inspection)

- Format: `NNNN_snake_case_description.sql`
- Runner: `node-pg-migrate` (db.js uses `runner()` from `node-pg-migrate`)
- Structure: `-- Up Migration` block then `-- Down Migration` block
- Current latest: `0002_alert_deliveries_sent_at_index.sql`

### 0003_users_sessions.sql

```sql
-- Up Migration

CREATE TABLE IF NOT EXISTS users (
  id              BIGSERIAL   PRIMARY KEY,
  email           TEXT        NOT NULL UNIQUE,
  password_hash   TEXT        NOT NULL,
  role            TEXT        NOT NULL DEFAULT 'user',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_user_role CHECK (role IN ('admin', 'user'))
);

CREATE TABLE IF NOT EXISTS sessions (
  id              BIGSERIAL   PRIMARY KEY,
  user_id         BIGINT      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash      TEXT        NOT NULL UNIQUE,  -- SHA-256 of the raw cookie value
  expires_at      TIMESTAMPTZ NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users (email);
CREATE INDEX IF NOT EXISTS idx_sessions_token_hash ON sessions (token_hash);
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions (user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions (expires_at);

-- Down Migration
DROP TABLE IF EXISTS sessions;
DROP TABLE IF EXISTS users;
```

### 0004_invites_reset_tokens.sql

```sql
-- Up Migration

CREATE TABLE IF NOT EXISTS invites (
  id              BIGSERIAL   PRIMARY KEY,
  email           TEXT        NOT NULL,
  token_hash      TEXT        NOT NULL UNIQUE,
  invited_by      BIGINT      REFERENCES users(id) ON DELETE SET NULL,
  accepted_at     TIMESTAMPTZ,
  expires_at      TIMESTAMPTZ NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id              BIGSERIAL   PRIMARY KEY,
  user_id         BIGINT      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash      TEXT        NOT NULL UNIQUE,
  expires_at      TIMESTAMPTZ NOT NULL,
  used_at         TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_invites_token_hash ON invites (token_hash);
CREATE INDEX IF NOT EXISTS idx_invites_email ON invites (email);
CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_token_hash ON password_reset_tokens (token_hash);

-- Down Migration
DROP TABLE IF EXISTS password_reset_tokens;
DROP TABLE IF EXISTS invites;
```

### 0005_alert_rules_email_channel.sql

```sql
-- Up Migration

ALTER TABLE alert_rules
  ADD COLUMN IF NOT EXISTS channel      TEXT NOT NULL DEFAULT 'webhook',
  ADD COLUMN IF NOT EXISTS target_email TEXT;

ALTER TABLE alert_rules
  DROP CONSTRAINT IF EXISTS chk_alert_channel;

ALTER TABLE alert_rules
  ADD CONSTRAINT chk_alert_channel
    CHECK (channel IN ('webhook', 'email'));

-- target_url is already NOT NULL — relax if email channel makes it optional
-- Option A (simpler): keep target_url NOT NULL, require empty string for email rules
-- Option B (correct): make target_url nullable
ALTER TABLE alert_rules
  ALTER COLUMN target_url DROP NOT NULL;

-- Down Migration
ALTER TABLE alert_rules
  DROP CONSTRAINT IF EXISTS chk_alert_channel,
  DROP COLUMN IF EXISTS target_email,
  DROP COLUMN IF EXISTS channel;

ALTER TABLE alert_rules
  ALTER COLUMN target_url SET NOT NULL;
```

**Note on target_url nullability:** The existing `createAlertsRouter()` validates `target_url` on create. When `channel = 'email'`, `target_url` becomes meaningless. Option B (nullable) is architecturally correct; Option A avoids touching the alerts router validation in Phase 3. Document the choice explicitly in the phase that ships 0005.

### Token Storage Convention

All `token_hash` columns store SHA-256 of the raw token, not the token itself. The raw token is a `crypto.randomBytes(32).toString('hex')` value (64 hex chars). This mirrors `security.js`'s HMAC ethos: secrets never at rest in plaintext.

```js
// security.js — additions
import { scrypt, randomBytes, timingSafeEqual, createHash } from 'crypto';
import { promisify } from 'util';

const scryptAsync = promisify(scrypt);

export async function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const hash = await scryptAsync(password, salt, 64);
  return `${salt}:${hash.toString('hex')}`;
}

export async function verifyPassword(password, stored) {
  const [salt, storedHash] = stored.split(':');
  const hash = await scryptAsync(password, salt, 64);
  return timingSafeEqual(Buffer.from(storedHash, 'hex'), hash);
}

export function hashToken(rawToken) {
  return createHash('sha256').update(rawToken).digest('hex');
}

export function generateToken() {
  return randomBytes(32).toString('hex');
}
```

`crypto.scrypt` is zero new dependencies — Node.js built-in. No native addon compilation. This is the correct choice for a self-hosted project already struggling with native addon build complexity (see Dockerfile `python3/make/g++` stage).

---

## Q3: Auth Router — createAuthRouter() Factory Pattern

### File: `listener/src/auth-router.js`

Follows the exact `createXxxRouter({ pool, ...deps })` factory pattern already established:

```js
// auth-router.js
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { log } from './logger.js';
import { hashPassword, verifyPassword, hashToken, generateToken, secureTokenEquals } from './security.js';
import { createUser, findUserByEmail, getUserCount, createSession, revokeSession,
         validateSession, createInvite, consumeInvite, createResetToken, consumeResetToken,
         listUsers } from './db.js';
import { sendInvite, sendPasswordReset } from './emails.js';

const LOGIN_RATE_LIMIT = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
});

export function createAuthPublicRouter({ pool, emailEnabled }) {
  const router = Router();

  // POST /api/auth/login
  router.post('/login', LOGIN_RATE_LIMIT, async (req, res) => { ... });

  // POST /api/auth/accept-invite  (token in body)
  router.post('/accept-invite', async (req, res) => { ... });

  // POST /api/auth/reset-request
  router.post('/reset-request', LOGIN_RATE_LIMIT, async (req, res) => { ... });

  // POST /api/auth/reset-confirm
  router.post('/reset-confirm', async (req, res) => { ... });

  return router;
}

export function createAuthProtectedRouter({ pool }) {
  const router = Router();

  // GET /api/auth/me
  router.get('/me', async (req, res) => { ... }); // req.user from gate

  // POST /api/auth/logout
  router.post('/logout', async (req, res) => { ... });

  // PATCH /api/auth/password
  router.patch('/password', async (req, res) => { ... });

  // GET /api/auth/users  (admin only)
  router.get('/users', async (req, res) => { ... });

  // POST /api/auth/invite  (admin only)
  router.post('/invite', async (req, res) => { ... });

  return router;
}
```

### First-Admin Bootstrap

When `users` table is empty, the public router must allow claim of the first admin account without an invite token. This cannot require email (email is configured later or may not be configured). The pattern:

```
POST /api/auth/claim-admin
  - Body: { email, password }
  - Guard: SELECT COUNT(*) FROM users must be 0 (atomic with INSERT via transaction)
  - Creates user with role='admin', no invite required
  - Returns session cookie
  - Returns 409 if any user already exists
```

This route is mounted in the public router and auto-disables once the first user exists. The frontend shows a "Setup your account" screen instead of the login form when `/api/auth/me` returns 401 AND `/api/auth/users/count` returns 0.

### Session Cookie

```js
// Set in POST /api/auth/login and /api/auth/accept-invite
res.cookie('hc_session', rawToken, {
  httpOnly: true,
  sameSite: 'lax',
  secure: process.env.SESSION_COOKIE_SECURE !== 'false' && IS_PRODUCTION,
  maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
  path: '/',
});
```

**Critical:** `Secure` must be opt-out for self-hosted users on `http://nas.local`. Default to `Secure` in production, but expose `SESSION_COOKIE_SECURE=false` env var. Without this, every RPi/NAS user who runs HTTP (no TLS) breaks. This is the highest-risk pitfall for self-hosted.

---

## Q4: Nginx Changes — Cookie Passthrough and Token Injection Removal

### Phase 1–3: No Nginx Changes Needed

Session cookies pass through nginx automatically — `proxy_pass` does not strip cookies. The existing `proxy_set_header` directives do not interfere with `Cookie:` headers. **Do not touch nginx.conf.template in Phases 1–3.**

The API_TOKEN injection harmlessly coexists with session auth because the gate does token-OR-session — both pass. Keep the injection until Phase 4.

### Phase 4 (Hardening): Remove Token Injection

In `nginx.conf.template`, remove these two lines from both location blocks:

```nginx
# REMOVE from both location blocks:
proxy_set_header X-API-Token "${API_TOKEN}";
```

After removal, browser requests use session cookies only. API_TOKEN still works for direct API access (scripts, Home Assistant) via `x-api-token` header — it just stops being injected by nginx.

**Env var change:** `API_TOKEN` can be left in `.env` for script callers but is no longer read by nginx. Document this in `.env.example`.

### CSP — No Changes Required

Current CSP: `connect-src 'self'` — all `/api/*` calls are same-origin (the browser hits nginx which proxies to listener). Session cookies are same-site. No third-party connections introduced. CSP stays exactly as-is.

### CORS Changes Required for Dev

In development, the Vite dev server runs on `localhost:5173` and proxies to `localhost:3001`. Session cookies in a cross-origin dev setup require:

1. `app.use(cors({ ..., credentials: true }))` in `listener/src/index.js` when `CORS_ALLOW_LOCALHOST=true`
2. `credentials: 'include'` on all `fetch()` calls in `api.js`
3. `sameSite: 'none'` + `secure: true` OR use the Vite proxy (`/api` → `http://localhost:3001`) so cookies are same-origin

**Recommended:** Use the Vite proxy path (`api.js` already has `API_BASE = '/api'` in dev when going through proxy). The dev proxy was already configured in `vite.config.js` for this. With the proxy, the browser thinks it's talking to `localhost:5173` for all requests — cookies are same-origin and work without `credentials: true` complications.

**If direct API access in dev is needed:** `cors({ credentials: true })` + `credentials: 'include'` + `sameSite: 'lax'` (works on localhost without https).

### CSRF Consideration

`SameSite=Lax` blocks CSRF on cross-site form submissions and `<a>` navigations. It does NOT protect against same-site script injection, but that's XSS, not CSRF. The current setup (no third-party forms, all API calls from same-origin SPA) is safe with Lax alone. Add a `X-CSRF-Token` or double-submit cookie pattern only in Phase 4 if security audit requires it. Not in Phase 1.

---

## Q5: Frontend — React Router Without Breaking Existing Navigation

### The Principle

**React Router is needed only for landing pages with tokens in the URL.** The existing tab-state navigation inside the authenticated shell is not replaced. `App.jsx`'s `useState` + `window.history.pushState` navigation is preserved entirely.

### Router Structure

```
main.jsx
  BrowserRouter
    Routes
      /login          → <LoginPage />
      /accept-invite  → <AcceptInvitePage />    (reads ?token= from URL)
      /reset-password → <ResetPasswordPage />   (reads ?token= from URL)
      /*              → <AuthGate>              (checks session)
                            ├─ loading → skeleton
                            ├─ not authed → redirect to /login
                            └─ authed → <App />   (UNCHANGED — all tab navigation inside)
```

`App.jsx` receives zero structural changes in Phase 1 of auth work. It renders only when the user is authenticated.

### AuthGate Component

```jsx
// web/src/components/AuthGate.jsx — NEW
import { useQuery } from '@tanstack/react-query';
import { fetchJson } from '../lib/api.js';
import { Navigate } from 'react-router-dom';

export default function AuthGate({ children }) {
  const { data: user, isLoading, error } = useQuery({
    queryKey: ['auth', 'me'],
    queryFn: () => fetchJson('/api/auth/me'),
    retry: false,
    staleTime: 60_000,
  });

  if (isLoading) return <div className="hc-auth-loading" />;
  if (error?.status === 401) return <Navigate to="/login" replace />;
  if (!user) return <Navigate to="/login" replace />;

  return children;
}
```

### api.js Modifications

Two changes only:

```js
// 1. Add credentials: 'include' to all fetch calls
export async function fetchJson(url, options = {}) {
  const response = await fetch(url, {
    credentials: 'include',      // ← ADD THIS
    ...options,
    headers: withApiAuthHeaders(options.headers ?? {}),
  });
  // ... rest unchanged
}

// 2. Remove VITE_API_TOKEN injection in dev (sessions handle dev auth now)
// BEFORE:
const API_TOKEN = import.meta.env.DEV
  ? (import.meta.env.VITE_API_TOKEN ?? '').trim()
  : '';
// AFTER (remove entirely, or keep for backward-compat with script callers):
// If kept, `withApiAuthHeaders` still adds it when present — no breaking change
```

### Session Storage Location

Session identity lives in the `hc_session` HttpOnly cookie. **No localStorage, no JS-readable value.** The browser sends it automatically on every `/api/*` request. The frontend learns user identity only from `GET /api/auth/me` response body — this is what AuthGate queries.

TanStack Query caches `['auth', 'me']` for 60 seconds. On 401, the AuthGate redirects to login. This is the entire frontend session management — no additional state library needed.

### Installation (react-router)

```bash
# from web/
npm install react-router-dom
```

This is the only new frontend dependency. Existing navigation inside `App.jsx` is untouched.

---

## Q6: Email Module — emails.js Placement and Integration

### File: `listener/src/emails.js`

```js
// emails.js
import nodemailer from 'nodemailer';
import { log } from './logger.js';

let transporter = null;

export function initEmail({ host, port, secure, user, pass, from }) {
  transporter = nodemailer.createTransport({
    host, port, secure,
    auth: user ? { user, pass } : undefined,
  });
  log.info('[email] SMTP transport configured');
}

export async function sendInvite({ to, inviteUrl, invitedBy }) { ... }
export async function sendPasswordReset({ to, resetUrl }) { ... }
export async function sendAlertEmail({ to, ruleName, accessoryName, characteristic, value }) { ... }
```

### SMTP Configuration (env vars, not JsonObjectStore)

```
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=homechronicle@example.com
SMTP_PASS=secret
SMTP_FROM="HomeChronicle <homechronicle@example.com>"
```

SMTP credentials are secrets — they go in `.env` like `API_TOKEN`, not in a JSON file on disk. `initEmail()` is called in `index.js` during startup (alongside `migrateDb()` etc.) and only when `SMTP_HOST` is set. If not configured, email sends log a warn and no-op rather than crashing.

### Integration with alerts.js

The existing `alerts.js` calls a webhook for every matching rule. After adding email channel:

```js
// alerts.js — modified delivery section
async function deliverAlert(rule, event, pool) {
  if (rule.channel === 'email') {
    if (!rule.target_email) {
      log.warn(`[alerts] rule ${rule.id} has channel=email but no target_email`);
      return;
    }
    try {
      await sendAlertEmail({
        to: rule.target_email,
        ruleName: rule.name,
        accessoryName: event.accessoryName,
        characteristic: event.characteristic,
        value: event.newValue,
      });
      await recordDelivery(pool, { ruleId: rule.id, eventId: event.id,
        status: 'sent', targetUrl: null });
    } catch (err) {
      log.error('[alerts] email delivery failed:', err.message);
      await recordDelivery(pool, { ruleId: rule.id, eventId: event.id,
        status: 'failed', targetUrl: null, error: err.message });
    }
    return;
  }
  // existing webhook path unchanged
  ...
}
```

`alert_deliveries.target_url` becomes nullable in 0005 for email-channel deliveries.

### Package Addition

```bash
# from listener/
npm install nodemailer cookie-parser
```

Two new packages: `nodemailer` for SMTP, `cookie-parser` to parse `Cookie:` header in Express.

---

## Data Flow — Auth Request Lifecycle

### Login Flow

```
POST /api/auth/login { email, password }
    → public auth router (no gate)
    → findUserByEmail() → verifyPassword() (scrypt)
    → generateToken() → hashToken() → createSession() in DB
    → Set-Cookie: hc_session=<rawToken>; HttpOnly; SameSite=Lax
    → 200 { user: { id, email, role } }
    ↓
Browser stores nothing (cookie is HttpOnly)
Next request: Cookie: hc_session=<rawToken>
    → gate middleware → validateSession() (hash lookup) → req.user = {...}
    → existing router handles request normally
```

### Invite Flow

```
Admin: POST /api/auth/invite { email }
    → protected router (requires session + role=admin)
    → generateToken() + createInvite() in DB (token_hash, expires_at=7d)
    → sendInvite({ to: email, inviteUrl: `https://host/accept-invite?token=<raw>` })

Invited user: GET /accept-invite?token=<raw>
    → React Router renders AcceptInvitePage
    → User fills email + password form
    → POST /api/auth/accept-invite { token, password }
    → consumeInvite() (hash lookup, marks accepted_at)
    → createUser() + createSession()
    → Set-Cookie: hc_session=<rawToken>
    → redirect to /
```

### Alert Email Flow

```
HAP/Matter event → insertEvent() → alerts.js processAlerts()
    → rule matches, channel='email'
    → sendAlertEmail() via emails.js → SMTP
    → record in alert_deliveries (status='sent'/'failed')
```

---

## Integration Points — New vs Modified

### New Files

| File | Purpose |
|------|---------|
| `listener/src/auth-router.js` | Public + protected auth route factories |
| `listener/src/emails.js` | Nodemailer SMTP transport + send functions |
| `listener/migrations/0003_users_sessions.sql` | users + sessions schema |
| `listener/migrations/0004_invites_reset_tokens.sql` | invites + password_reset_tokens schema |
| `listener/migrations/0005_alert_rules_email_channel.sql` | channel/target_email columns on alert_rules |
| `web/src/pages/LoginPage.jsx` | Login form |
| `web/src/pages/AcceptInvitePage.jsx` | Accept invite + set password |
| `web/src/pages/ResetPasswordPage.jsx` | Password reset request + confirm |
| `web/src/components/AuthGate.jsx` | Session check wrapper; redirects to /login |

### Modified Files

| File | Change | Phase |
|------|--------|-------|
| `listener/src/index.js` | Replace token-only gate with token-OR-session gate; add cookie-parser; mount auth routers; call initEmail() | Phase 1 |
| `listener/src/security.js` | Add hashPassword, verifyPassword, hashToken, generateToken | Phase 1 |
| `listener/src/db.js` | Add session/user/invite/reset CRUD functions | Phase 1–2 |
| `listener/src/alerts.js` | Add email channel delivery path | Phase 3 |
| `web/src/main.jsx` | Add BrowserRouter + Routes; wrap App in AuthGate | Phase 1 |
| `web/src/lib/api.js` | Add `credentials: 'include'`; remove VITE_API_TOKEN injection | Phase 1 |
| `web/nginx.conf.template` | Remove X-API-Token injection lines | Phase 4 only |

### Unchanged Files (verified by inspection)

All existing routers (`events-router.js`, `alerts-router.js`, `matter-router.js`, `retention-router.js`, `stats-router.js`, `accessories-router.js`, `health-router.js`, `setup-router.js`, `archive-router.js`, `repair-router.js`) — zero changes needed. All existing React components, hooks, pages, and chart components in `web/src/` — zero changes needed.

---

## Architectural Patterns

### Pattern 1: Token-OR-Session Gate (Additive, Not Replacement)

**What:** The existing token middleware is extended to also accept session cookies. Both paths resolve to the same `next()` call. Protected routers downstream see no difference.

**When to use:** Any time you add a new auth method to a system that already has working auth. Replacement is risky; extension is safe.

**Trade-off:** Two parallel auth paths to maintain. Acceptable here because API_TOKEN is a legitimate service-token use case (scripts, integrations) that survives as an escape hatch.

### Pattern 2: DB Sessions Over JWT

**What:** Sessions are rows in the `sessions` table with a `token_hash`. No JWT. No shared secret.

**When to use:** Self-hosted, single-instance. Sessions can be revoked instantly (DELETE FROM sessions). No token expiry window where a revoked token still works. For a home server where the user might lock themselves out, instant revocability is essential.

**Trade-off:** DB query on every request for session validation. At self-hosted scale (1–10 users), this is negligible. Add caching (in-memory TTL map) only if profiling shows it matters.

### Pattern 3: Hand-Rolled Auth With Built-in Crypto

**What:** `crypto.scrypt` for password hashing, `crypto.randomBytes` for token generation, `crypto.createHash('sha256')` for token storage, `crypto.timingSafeEqual` for comparison. Zero auth library dependencies.

**When to use:** Project already uses `crypto.createHmac` + `timingSafeEqual` in `security.js`. Team is comfortable with crypto primitives. Native addon compilation is painful (see Dockerfile build stage) — bcrypt and argon2 both require native compilation.

**Trade-off:** More code to write than `bcrypt.hash()`. `scrypt` is NIST-recommended and Node.js built-in. The implementation is well-bounded and unit-testable.

### Pattern 4: React Router at the Shell, Tab State Inside

**What:** React Router owns only the top-level route: `/login`, `/accept-invite`, `/reset-password`, `/*` → App. Inside `/*`, the existing `useState`-based tab navigation is completely untouched.

**When to use:** Adding URL-landing pages (invite/reset links must have readable URLs) without rewriting an existing navigation system that works.

**Trade-off:** Two navigation systems in the same codebase. This is intentional and documented. Do not "clean up" by migrating tab state to React Router — it would require updating every `setActivePage()` call and every `navigate()` callback, for zero user-visible benefit.

---

## Anti-Patterns

### Anti-Pattern 1: Replacing Token Auth Instead of Extending It

**What goes wrong:** Remove the `secureTokenEquals` middleware and replace with session-only validation. All existing scripts, Home Assistant integrations, and API clients break. During the transition period, the system is unprotected.

**Do this instead:** Token-OR-session gate. Token is deprecated but functional. Remove nginx injection only in Phase 4 after sessions are validated.

### Anti-Pattern 2: Storing Session Tokens Plaintext in DB

**What goes wrong:** An attacker who reads the `sessions` table gets live tokens they can use immediately. No defense in depth.

**Do this instead:** Store SHA-256 hash of the raw token. The raw token exists only in the cookie. Same principle as the existing HMAC approach in `security.js`.

### Anti-Pattern 3: Making Session Cookie Secure-Only Without an Escape Hatch

**What goes wrong:** `secure: true` unconditionally means session cookies are not sent over `http://`. Every self-hosted user running HTTP (no TLS termination) is locked out immediately after upgrading.

**Do this instead:** `secure: process.env.SESSION_COOKIE_SECURE !== 'false' && IS_PRODUCTION`. Default-secure in production, opt-out via env var. Document in `.env.example`.

### Anti-Pattern 4: Storing SMTP Credentials in JsonObjectStore

**What goes wrong:** `alerts-settings.json` is persisted on the listener's data volume, potentially world-readable inside the container. SMTP passwords and OAuth tokens should not live there.

**Do this instead:** SMTP config in `.env` / Docker env_file only. `initEmail()` reads from `process.env`. No UI for SMTP config — it's an operator-level setting.

### Anti-Pattern 5: Migrating Tab Navigation to React Router

**What goes wrong:** Every `setActivePage('timeline')` call, every `navigate(page)` callback, the `handleSelectAccessory` + `history.pushState` pattern, the popstate listener — all must be updated. 200+ lines of logic in App.jsx that works correctly today breaks during migration.

**Do this instead:** Add React Router at the shell level only. The catch-all `/*` route renders the existing `<App />` untouched. The app has URL-navigable auth pages and a tab-navigated interior. Both coexist cleanly.

### Anti-Pattern 6: Skipping First-Admin Bootstrap

**What goes wrong:** Invite-only model has no origin — if there are no users, no one can send an invite. The app is permanently locked.

**Do this instead:** `POST /api/auth/claim-admin` route in the public router. Atomically checked and consumed (transaction: count=0 → insert). Auto-disabled after first user exists. Show "Setup your account" screen in the frontend when user count is 0.

---

## Build Order — Suggested Phase Sequence

### Phase 1: Auth Foundation + Secure Cookies + React Router Shell

**What:** DB schema (0003), password crypto in security.js, session CRUD in db.js, auth-router.js (public + protected), gate middleware in index.js, first-admin bootstrap, LoginPage + AuthGate in frontend, React Router shell in main.jsx, api.js credentials:include.

**Dependencies:** Nothing — this is the foundation.

**End state:** Users can create an account, log in, and reach the existing app. API_TOKEN still works alongside sessions. Nginx unchanged.

### Phase 2: Invites + Password Reset + Email Infrastructure

**What:** emails.js (nodemailer), SMTP env vars, 0004 migration, invite CRUD in db.js, invite-create endpoint, AcceptInvitePage, sendInvite(), password reset flow end-to-end, ResetPasswordPage.

**Dependencies:** Phase 1 (users table, sessions, auth-router structure).

**End state:** Admin can invite users by email. Users can reset passwords. Email infrastructure exists and is tested.

### Phase 3: Email Alert Channel

**What:** 0005 migration (alert_rules channel/target_email), alerts.js channel dispatch, sendAlertEmail(), UI changes in AlertsPage to show channel selector + email field.

**Dependencies:** Phase 2 (emails.js must exist; sendAlertEmail uses same transport).

**End state:** Alert rules can deliver by email instead of (or in addition to) webhook.

### Phase 4: Security Hardening + Nginx Cutover

**What:** Remove `proxy_set_header X-API-Token` from nginx.conf.template; auth-route rate limiting (separate limiter for login/reset-request); session expiry sweep (DELETE expired sessions on startup + daily); CSRF header requirement for state-changing routes; optional: session revocation UI in Settings page.

**Dependencies:** Phases 1–3 must be stable in production.

**End state:** Token injection removed; browser uses only session cookies; auth is hardened; production-ready.

**Why hardening is last:** De-risks the migration. Running sessions alongside token injection for Phases 1–3 means a misconfigured session system doesn't lock users out — the API_TOKEN injection still authenticates browser requests. Phase 4 is the point of no return.

---

## Scaling Considerations

| Concern | At current scale (1–5 users) | If grows beyond |
|---------|------------------------------|-----------------|
| Session validation DB query | Negligible — index lookup on token_hash | Add in-memory TTL cache (Map with 60s expiry) in session middleware |
| Session table size | Trivial — one row per login | Add periodic sweep: DELETE FROM sessions WHERE expires_at < NOW() |
| Email delivery | Single SMTP send per event | At scale, move to a queue; for self-hosted this never matters |
| CSRF | SameSite=Lax sufficient | Add double-submit cookie if embedding in third-party contexts (unlikely for self-hosted) |

---

## Sources

- Direct inspection: `listener/src/index.js` — existing auth gate (lines 393–407), router mount order, cors config
- Direct inspection: `listener/src/security.js` — `secureTokenEquals` HMAC pattern, SSRF validation
- Direct inspection: `listener/migrations/0001_baseline.sql` and `0002_alert_deliveries_sent_at_index.sql` — migration format and runner
- Direct inspection: `listener/src/db.js` (lines 1–80) — `node-pg-migrate` runner, pool setup
- Direct inspection: `web/nginx.conf.template` — `proxy_set_header X-API-Token` injection in both location blocks
- Direct inspection: `web/src/App.jsx` — tab-state navigation, pushState pattern, no router present
- Direct inspection: `web/src/lib/api.js` — `fetchJson`, `withApiAuthHeaders`, VITE_API_TOKEN dev path
- Direct inspection: `.planning/PROJECT.md` — v1.4 milestone scope, self-hosted constraints, no TLS in scope
- Advisor review: Token-OR-session gate structure, first-admin bootstrap requirement, cookie Secure pitfall, dev CORS path, CSRF scope

---
*Architecture research for: HomeChronicle v1.4 Multi-User Auth & Email*
*Researched: 2026-06-09*
