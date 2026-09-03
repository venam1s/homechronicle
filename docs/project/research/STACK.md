# Stack Research — Multi-User Auth & Email (v1.4)

**Domain:** Session-based multi-user auth (invite-only), email SMTP, frontend auth gate
**Researched:** 2026-06-09
**Confidence:** HIGH for session/hashing/email (npm-verified versions, official docs); MEDIUM for CSRF mitigation (same-origin argument depends on deployment topology; verified pattern, not tested against this specific nginx config)

---

## Existing Stack (Untouched — Do Not Re-research)

| Technology | Version | Role |
|------------|---------|------|
| Node.js | 22 | Listener runtime |
| Express | 5.2.x | REST API |
| PostgreSQL | 16 | Database |
| node-pg-migrate | 8.0.x | Schema migrations |
| pg | 8.20.x | Connection pooling |
| express-rate-limit | 8.3.x | Rate limiting |
| React | 19.2.x | Web UI |
| Vite | 8.x | Dev server + bundler |
| Tailwind CSS | 4.2.x | Utility CSS |
| TanStack Query | 5.51.x | Data fetching |

---

## New Capabilities Required

Four distinct areas need new packages: password hashing, session management, email, and frontend routing. The existing token auth model (`API_TOKEN` + nginx `proxy_set_header`) is replaced by server-side sessions.

---

## Domain 1: Password Hashing

### Recommendation: argon2 ^0.44.0 (argon2id variant)

**Install (listener/):** `npm install argon2`

#### Why argon2id over bcrypt

argon2id is the current OWASP and NIST first-choice for new applications. It is memory-hard (resistant to GPU/ASIC attacks), handles passwords of arbitrary length (bcrypt silently truncates at 72 bytes — a real footgun for users with long passphrases), and has been the PHC competition winner since 2015.

The native-build concern that makes argon2 awkward in serverless deployments is not a concern here. The listener Dockerfile `build` stage already installs `python3 make g++` for hap-controller's native addons. argon2 ^0.44.0 ships **prebuilt binaries for Alpine ARM64, Alpine x86-64, Ubuntu ARM64, and Ubuntu x86-64** — the exact combinations used in HomeChronicle's amd64/arm64 multi-arch Docker builds. No source compilation needed at image build time if a matching prebuilt exists; the existing toolchain is a fallback.

OWASP recommended minimum parameters: `memoryCost: 19456` (19 MiB), `timeCost: 2`, `parallelism: 1`. Use `argon2.argon2id` as the variant.

**Verified:** argon2 0.44.0 on npm (2026-06-09). Prebuilt binaries for Alpine ARM64 from v0.28.2, ARMv7 from v0.43.0, Alpine x86-64 from v0.28.1.

#### Why not bcrypt / bcryptjs

- `bcrypt`: native addon but 72-byte password truncation is a silent footgun. Lower resistance to GPU attacks due to lack of memory hardness. No meaningful advantage for this use case.
- `bcryptjs`: pure JavaScript, no native build. Acceptable if native builds were prohibited. But builds are already enabled, so there is no reason to accept bcryptjs's slower performance and weaker security profile.
- `crypto.scrypt` (Node.js built-in): zero new dependency, OWASP-acceptable. Reasonable fallback if argon2 causes Docker build problems on an obscure target architecture. argon2's prebuilt coverage makes this fallback unlikely to be needed, but it exists.

#### Why not JWT

JWT's primary advantage is stateless horizontal scaling — irrelevant for a single-instance self-hosted Docker deployment. JWTs cannot be instantly revoked without a server-side denylist (which adds the same complexity as sessions). The invite-only model requires admin to be able to disable a user account and have that take effect immediately. Server-side sessions stored in PostgreSQL deliver instant revocation with zero additional infrastructure.

---

## Domain 2: Session Management

### Recommendation: express-session ^1.19.0 + connect-pg-simple ^10.0.0

**Install (listener/):** `npm install express-session connect-pg-simple`

#### Why server-side sessions stored in PostgreSQL

Single-instance self-hosted deployments do not need Redis. PostgreSQL is already running. `connect-pg-simple` reuses the existing `pg.Pool` from `listener/src/db.js` — no second database connection or credential to manage. Sessions are durable across container restarts (unlike in-memory). The existing node-pg-migrate system manages the schema.

#### express-session 1.19.0

express-session 1.19.0 (published 2026-01-22) is the current release. It has no peerDependencies and no engines restriction — it does not declare a specific Express version requirement. The package is listed on the Express 5.x official docs site (expressjs.com/en/resources/middleware/session/) as the recommended session middleware, confirming Express 5 compatibility. Express 5 is a drop-in successor to Express 4 for middleware — `app.use()` and the `(req, res, next)` signature are identical.

Key configuration for this deployment:
- `secret`: at minimum 32 bytes from `process.env.SESSION_SECRET`
- `resave: false` — do not write unchanged sessions back to the store
- `saveUninitialized: false` — do not create sessions for unauthenticated requests (important: prevents session table bloat)
- `cookie.httpOnly: true`, `cookie.sameSite: 'lax'`, `cookie.secure: true` in production (nginx terminates TLS, so set `app.set('trust proxy', 1)`)
- `cookie.maxAge`: 30 days (30 * 24 * 60 * 60 * 1000) — appropriate for a home server app

#### connect-pg-simple 10.0.0

connect-pg-simple 10.0.0 requires Node.js `^18.18.0 || ^20.9.0 || >=22.0.0` (all satisfied by Node 22). It requires only `pg ^8.12.0` (project has `pg ^8.20.0`). It is CJS but imports cleanly via `import session from 'express-session'; const pgSession = pgSimple(session);` — same interop pattern already used for `cors`, `express-rate-limit`, and other CJS packages throughout the project.

**IMPORTANT — table creation discipline:** `connect-pg-simple` has a `createTableIfMissing` option that bypasses node-pg-migrate. Do NOT use it. Instead, add a node-pg-migrate migration that creates the `session` table using the SQL from `node_modules/connect-pg-simple/table.sql`. This keeps schema changes in the migration history alongside `users`, `invites`, `alert_rules`, etc.

The table.sql creates: `session` table with `sid` (varchar primary key), `sess` (json), `expire` (timestamp). Add a matching migration file in `listener/migrations/`.

#### Why not JWT + stateless

As argued above: single instance makes Redis redundant; instant revocation requires server-side state; PostgreSQL is already present. The session cookie + server-side store is the simpler, more secure choice for this topology.

#### Why not cookie-session (signed cookie, no store)

`cookie-session` stores all session data in the cookie itself, signed but not encrypted. Session data would include user ID and role, serialized into a cookie that travels on every request. No revocation possible without rotating the signing secret (which logs out all users). Ruled out.

---

## Domain 3: Email

### Recommendation: nodemailer ^8.0.10

**Install (listener/):** `npm install nodemailer`

nodemailer 8.0.10 is the current release (2026-06-09 per npm). It has **zero runtime dependencies** — the `deps: none` npm registry field confirms this. It is CJS, imports as a default import. Supports all standard SMTP providers (Gmail SMTP, AWS SES SMTP, Mailgun SMTP, self-hosted Postfix/Sendmail, Mailtrap for dev).

No templating framework is needed. Invite emails and password reset emails are single-purpose transactional messages. Write them as inline HTML strings or tagged template literals. Adding Handlebars or MJML adds complexity that doesn't pay off for two or three email templates in a self-hosted app.

**Confidence:** HIGH — zero-dependency status verified against npm registry; version 8.0.10 confirmed.

#### Invite and password-reset tokens — no package needed

Invite links and password-reset links require single-use tokens. Generate them with Node.js built-in `crypto.randomBytes(32).toString('hex')`. Store the SHA-256 hash of the token (not the raw token) in a `invites` or `password_reset_tokens` table with an `expires_at` column, via a node-pg-migrate migration. On redemption, hash the presented token and compare against the stored hash. No npm package needed; `crypto` is available in Node 22.

#### No alternative considered

nodemailer is the de facto standard for Node.js SMTP. There is no meaningful alternative to evaluate.

#### Required new environment variables

```
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_SECURE=false          # true for port 465 (TLS), false for STARTTLS on 587
SMTP_USER=user@example.com
SMTP_PASS=secret
SMTP_FROM="HomeChronicle <noreply@example.com>"
```

Document alongside existing variables in `.env.example`.

---

## Domain 4: Frontend Routing + Auth Gate

### Recommendation: react-router-dom ^7.17.0

**Install (web/):** `npm install react-router-dom`

react-router-dom 7.17.0 is the current release. Its peerDependencies are `react: '>=18'` and `react-dom: '>=18'`, both satisfied by React 19.2.x. It requires `node: '>=20.0.0'` (satisfied). It is a thin wrapper over `react-router` 7.17.0 that re-exports everything plus browser-specific APIs (`BrowserRouter`, `Link`, etc.).

#### SPA mode — use react-router-dom as a library, not a framework

react-router v7 supports two modes: framework mode (requires `@react-router/dev`, a build plugin, and SSR/SPA config files) and library mode (use `createBrowserRouter` + `RouterProvider` directly). For HomeChronicle's existing Vite + React setup, **library mode is the correct choice** — no `react-router.config.ts`, no `@react-router/dev`, no changes to `vite.config.js`.

Library mode migration path from the current tab-state navigation:
1. Wrap `main.jsx` with `RouterProvider` using `createBrowserRouter`
2. Replace tab state with routes: `/` (dashboard), `/devices`, `/timeline`, `/alerts`, `/settings`, `/login`
3. Add a `ProtectedRoute` layout component that reads auth state from a React context and redirects to `/login` if unauthenticated
4. Add an `AuthProvider` context that fetches `GET /api/auth/me` on mount (TanStack Query) and exposes `{ user, isLoading }` — no new state library needed
5. Nginx's existing `location / { try_files $uri $uri/ /index.html; }` block (verified in `web/nginx.conf.template` line 50-52) already handles deep-link fallback for client-side routes; no nginx changes needed for routing

**Confidence:** HIGH — peerDependencies verified on npm registry; library vs framework mode distinction confirmed from official reactrouter.com/how-to/spa docs; nginx SPA fallback confirmed in `web/nginx.conf.template`.

#### Why react-router over alternatives

- **No react-router (tab state):** The current approach works for single-user tab navigation but provides no URL-based auth redirect, no `/login` route, and no `<ProtectedRoute>` boundary. Adding auth without routing produces awkward state management.
- **TanStack Router:** Strong alternative with TypeScript-first design. Not recommended here because: (a) project is JavaScript, not TypeScript, (b) react-router v7 with library mode is equally capable for this use case, (c) migrating to TanStack Router is a larger change than routing itself warrants.

---

## Domain 5: CSRF Protection

### Recommendation: SameSite=Lax + server-enforced custom header — no library needed

#### The same-origin argument

HomeChronicle's production topology has nginx serving the built SPA from the same origin as the API (`/api/*` proxied internally). The session cookie is set with `SameSite=Lax` and `httpOnly=true`. Under these conditions:

- **SameSite=Lax** blocks cross-site POST requests from third-party sites (the primary CSRF vector). GET requests from cross-site navigations are allowed (required for normal link-following behavior), but GET requests must not mutate state — HomeChronicle's API already follows this convention (all mutations are POST/PUT/DELETE).
- **httpOnly** prevents JavaScript on a malicious page from reading the cookie.
- **Custom request header (server-enforced):** All mutating fetch calls from the SPA must include a custom header (e.g., `X-Requested-With: XMLHttpRequest`). **The server must reject any mutating request that lacks this header** — the header is only useful if it is validated server-side, not just sent client-side. CORS preflight blocks cross-origin requests with custom headers, so an attacker's HTML form or script on a foreign origin cannot satisfy this check.

This combination is the OWASP-recognized defense for SPA+API deployments with same-origin topology. No library is needed.

#### If a library is required (non-default nginx topology)

If the deployment exposes the API on a separate origin (e.g., `api.homechronicle.local:3001` reached directly from the browser), use `csrf-csrf ^4.0.3` (double-submit cookie pattern). Do NOT use `csurf` — it was deprecated in 2023 and has known vulnerabilities. `csrf-csrf` 4.0.3 has no peerDependencies and depends only on `http-errors ^2.0.0`. If used, also install `cookie-parser ^1.4.7` (verified on npm), which `csrf-csrf` requires as companion middleware.

**Confidence:** MEDIUM — same-origin SameSite argument is well-documented in OWASP guidance; whether HomeChronicle users will always run in same-origin topology is a deployment assumption that needs to be validated in requirements.

---

## Consolidated Install

```bash
# listener/ — new production dependencies
npm install argon2 express-session connect-pg-simple nodemailer

# web/ — new production dependency
npm install react-router-dom
```

**No new devDependencies required.** The existing `supertest` in listener devDeps covers session route integration tests. The existing `vitest` + `@testing-library/react` covers the auth gate component tests.

---

## Migration Notes (Existing Auth Model → Sessions)

The existing auth model injects `API_TOKEN` into all requests via nginx `proxy_set_header X-API-Token $api_token`. This must be unwound carefully:

1. The new session cookie replaces the shared API token as the authentication mechanism for browser clients.
2. The nginx `proxy_set_header X-API-Token` block should be removed once the session middleware is in place, or left as a fallback for existing API clients that still use the token (decide in requirements).
3. The `secureTokenEquals()` function in `security.js` can remain for machine-to-machine API calls (e.g., Dockhand, CI, external scripts) that still present `X-API-Token`. Session auth and token auth can coexist on different route groups during transition.
4. The `API_TOKEN_READS_ENABLED` env var logic in `index.js` needs re-evaluation: once users have sessions, read endpoints should be session-gated, not token-gated.

---

## What NOT to Add

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| Redis / connect-redis | No horizontal scaling needed; adds operational complexity for a home server | connect-pg-simple (reuses existing PostgreSQL) |
| JWT (jsonwebtoken) | No instant revocation; requires server-side denylist for logout; advantage (stateless scale) is irrelevant here | express-session |
| bcrypt / bcryptjs | bcrypt: 72-byte truncation footgun; bcryptjs: slower, weaker than argon2id with no benefit for this deployment | argon2 (argon2id variant) |
| csurf | Deprecated 2023, known vulnerabilities | csrf-csrf if a library is needed; SameSite=Lax + server-enforced custom header if same-origin |
| passport / passport-local | Adds middleware abstraction on top of express-session without reducing code for a single-strategy auth system; overkill for invite-only multi-user | Direct session read/write in auth middleware |
| Helmet (full) | HomeChronicle's security headers are already set in nginx.conf.template (CSP, X-Frame-Options, CORP, COOP, Permissions-Policy) and in Express middleware (X-Content-Type-Options, X-Frame-Options, Referrer-Policy). Adding Helmet risks duplicating headers. | Continue setting security headers directly |
| next-auth / Auth.js | Next.js-specific provider model; massive overkill for invite-only auth | express-session + argon2 directly |
| @react-router/dev | Framework mode build plugin; only needed for SSR or file-based routing conventions | react-router-dom in library mode (createBrowserRouter) |
| Handlebars / MJML | Email templating complexity for 2-3 transactional emails | Inline HTML template literals in email helper |
| uuid / nanoid (for invite tokens) | Node.js built-in `crypto.randomBytes(32).toString('hex')` produces a secure random token; no package needed | `node:crypto` randomBytes |

---

## Version Compatibility

| Package | Version | Node 22 | Express 5 | ES Modules | Notes |
|---------|---------|---------|-----------|------------|-------|
| argon2 | ^0.44.0 | YES | n/a | CJS, default import | Prebuilt binaries for Alpine ARM64 + x86-64; existing Dockerfile build tools are sufficient fallback |
| express-session | ^1.19.0 | YES | YES | CJS, default import | Listed on Express 5.x docs; no peerDep restriction; published Jan 2026 |
| connect-pg-simple | ^10.0.0 | YES (>=22 in engines) | YES | CJS, default import pattern | Must NOT use createTableIfMissing; add node-pg-migrate migration from table.sql |
| nodemailer | ^8.0.10 | YES | n/a | CJS, default import | Zero runtime dependencies |
| react-router-dom | ^7.17.0 | YES | n/a | ESM | peerDeps: react >=18, react-dom >=18 — satisfied by React 19 |
| csrf-csrf | ^4.0.3 | YES | YES | CJS | Only if library needed; requires cookie-parser ^1.4.7 as companion |
| cookie-parser | ^1.4.7 | YES | YES | CJS | Only if csrf-csrf is used |

---

## Sources

- argon2 npm registry (0.44.0, prebuilt binary matrix): https://www.npmjs.com/package/argon2
- argon2 GitHub README (prebuilt binary platforms): https://github.com/ranisalt/node-argon2
- OWASP Password Storage Cheat Sheet (argon2id parameters): https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html
- express-session npm (1.19.0, 2026-01-22 release): https://www.npmjs.com/package/express-session
- express-session on Express 5.x official docs: https://expressjs.com/en/resources/middleware/session/
- connect-pg-simple npm (10.0.0, engines >=22): https://www.npmjs.com/package/connect-pg-simple
- connect-pg-simple README (createTableIfMissing option, table.sql): https://github.com/voxpelli/node-connect-pg-simple
- nodemailer npm (8.0.10, zero deps): https://www.npmjs.com/package/nodemailer
- react-router-dom npm (7.17.0, peerDeps react >=18): https://www.npmjs.com/package/react-router-dom
- React Router SPA mode (library mode vs framework mode): https://reactrouter.com/how-to/spa
- OWASP CSRF Prevention (SameSite=Lax + custom header): https://cheatsheetseries.owasp.org/cheatsheets/Cross_Site_Request_Forgery_Prevention_Cheat_Sheet.html
- csrf-csrf npm (4.0.3, double-submit pattern): https://www.npmjs.com/package/csrf-csrf
- HomeChronicle web/nginx.conf.template (try_files SPA fallback verified at line 50-52)

---
*Stack research for: HomeChronicle v1.4 Multi-User Auth & Email*
*Researched: 2026-06-09*
