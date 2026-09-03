# Security Audit Report -- Scan 2

**Date:** 2026-04-11
**Scope:** Full source review of listener/src/, web/src/lib/, Docker configs, nginx config
**Auditor:** Automated deep scan (post-bugfix pass)
**Previous scan fixes confirmed:** Matter router rate limiter, store.js mtime race, subscriber connection leak

---

## Executive Summary

The codebase demonstrates strong security fundamentals: parameterized SQL queries throughout, timing-safe token comparison with HMAC length normalization, comprehensive SSRF protection with DNS rebinding mitigation, proper security headers in both Express and Nginx, and good separation of sensitive data from API responses. The previous audit's three findings have been confirmed fixed.

This scan identified **6 new findings** (0 critical, 2 high, 3 medium, 1 low).

---

## Findings

### SEC-2-01: Missing Rate Limiter on PATCH /api/setup/retention [HIGH]

**File:** `listener/src/retention-router.js`
**Lines:** 82-234

The `createRetentionRouter` does not import or apply any rate limiter. The `PATCH /retention` endpoint accepts arbitrary settings updates (retention days, quiet hours, toast config, episode windows) with no rate limiting. An authenticated attacker could flood this endpoint to cause excessive disk writes to `retention.json` via `JsonObjectStore.write()`.

**Evidence:** No import of `express-rate-limit` and no limiter middleware in the router. Compare with `repair-router.js` and `alerts-settings-router.js` which both have `writeLimiter` at 10/min.

**Recommendation:** Add a write rate limiter (e.g., 10-20 req/min) to the `PATCH /retention` route, consistent with `repair-router.js` and `alerts-settings-router.js`.

---

### SEC-2-02: Missing Rate Limiter on GET /api/health [MEDIUM]

**File:** `listener/src/health-router.js`
**Lines:** 4-52

The health endpoint has no rate limiter. While it performs a lightweight `SELECT 1` DB query, it also iterates all subscriber sessions and calls `getSubscriberHealth()`. Under sustained abuse this could contribute to resource pressure. Health endpoints are commonly rate-limited to prevent monitoring abuse.

**Evidence:** No import of `express-rate-limit` in `health-router.js`. Every other router in the codebase has at least a read limiter.

**Recommendation:** Add a read rate limiter (e.g., 60-120 req/min). This is lower severity because the endpoint is lightweight, but it breaks the otherwise-consistent pattern.

---

### SEC-2-03: Unvalidated `credentials` Field Stored from Request Body [HIGH]

**File:** `listener/src/matter-router.js`
**Line:** 214

The Matter pair endpoint stores `req.body?.credentials` directly into `pairings.json` without any validation or size constraint:

```js
credentials: req.body?.credentials ?? existing?.credentials ?? null,
```

An attacker with write access could store an arbitrarily large or deeply nested JSON object in this field, leading to:
- Disk exhaustion via inflated pairings.json
- Potential DoS when the store is read/parsed on every refresh cycle (every 30s)
- Memory pressure from large cached objects

The `express.json({ limit: '256kb' })` middleware provides some protection, but a single 256KB credentials blob per pairing could accumulate significantly.

**Recommendation:** Either validate and constrain the `credentials` field (type check, max size, allowlisted keys), or remove it if not actively used. The field appears to be a placeholder for future Matter credential storage -- if unused, remove it.

---

### SEC-2-04: Standalone Entrypoint References Non-existent Init SQL [MEDIUM]

**File:** `docker/standalone/entrypoint.sh`
**Line:** 77

```bash
gosu postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -f /docker-entrypoint-initdb.d/init.sql
```

This references `/docker-entrypoint-initdb.d/init.sql` which is never created by `Dockerfile.standalone`. On first run of the standalone image, PostgreSQL initialization will fail at this step. The listener's `migrateDb()` handles schema creation via node-pg-migrate, so this SQL execution is either redundant or missing its COPY instruction.

**Impact:** Standalone image first-run failure. Not exploitable, but causes a broken deployment.

**Recommendation:** Either add a `COPY` for the init SQL file in `Dockerfile.standalone`, or remove this line and rely entirely on `migrateDb()` for schema initialization (which already handles fresh installs).

---

### SEC-2-05: Scan Error Response Leaks Internal Error Details [MEDIUM]

**File:** `listener/src/matter-router.js`
**Lines:** 99-106

When a Matter scan fails, the warning field includes `err.message`:

```js
warning: `Matter scan failed: ${err.message}. Is the matter.js controller initialized?`,
```

This returns a 200 status with internal error details in the response body. Depending on the error source (e.g., file system errors, network errors from Matter libraries), this could leak internal paths, hostnames, or stack information.

Similarly in `listener/src/setup-router.js` line 72:
```js
warning: `mDNS scan failed: ${err.message}. Check DISCOVER_IFACE setting.`,
```

**Recommendation:** Return a generic warning message. Log the detailed error server-side only (which is already done on the line above each warning).

---

### SEC-2-06: CORS Localhost Default in Production [LOW]

**File:** `listener/src/index.js`
**Lines:** 81, 96-98

`CORS_ALLOW_LOCALHOST` defaults to `true` even in production. While there is a startup warning when the default is used in production, the default should arguably be `false` in production to follow the principle of least privilege. On a NAS with other services, a malicious local web app could make cross-origin requests to the HomeChronicle API if the user's browser is on the same machine.

The existing warning at line 96-98 is good defense-in-depth, and the API token requirement on write endpoints limits the blast radius. This is informational.

**Recommendation:** Consider changing the default to `false` when `NODE_ENV=production` and `CORS_ALLOWED_ORIGINS` is empty.

---

## Controls Verified (No Issues Found)

### SQL Injection Protection
All SQL queries across all router files use parameterized queries (`$1`, `$2`, etc.). No string interpolation of user input into SQL was found. Verified in:
- `db.js` -- `insertEvent()`, `runRetentionSweep()`, `runAlertDeliveriesRetentionSweep()`
- `events-router.js` -- dynamic WHERE construction uses parameter array
- `alerts-router.js` -- CRUD operations all parameterized
- `stats-router.js` -- all aggregation queries parameterized
- `accessories-router.js` -- all queries parameterized
- `archive-router.js` -- delete and export queries parameterized
- `matter-router.js` -- delete with LIKE uses parameterized `$1`, `$2`

### Authentication
- Token comparison uses HMAC-based timing-safe comparison (`secureTokenEquals` in `security.js`)
- HMAC normalization prevents length oracle attacks
- API token required in production (enforced at startup, exits if missing)
- Write endpoints always require token; read endpoints optionally exempt
- Nginx injects API_TOKEN into proxied requests via header

### SSRF Protection
- `validateWebhookTargetUrl()` blocks loopback, link-local, unspecified, multicast, reserved IPv4/IPv6
- `resolveAndValidateWebhookTarget()` validates resolved DNS addresses (prevents DNS rebinding)
- `sendWebhook()` pins resolved IP to prevent TOCTOU between validation and fetch
- `redirect: 'manual'` prevents redirect-based SSRF bypass
- Host header set to original hostname for TLS/SNI correctness
- Private range blocking configurable via `ALERTS_ALLOW_PRIVATE_TARGETS`

### XSS Protection
- No `dangerouslySetInnerHTML` usage found in any React component
- No `innerHTML`/`outerHTML` usage found
- React's default JSX escaping provides protection
- CSP header blocks inline scripts (`script-src 'self'`)
- `style-src 'unsafe-inline'` is present but necessary for Tailwind

### Security Headers
- Nginx: CSP, X-Frame-Options DENY, CORP, COOP, Permissions-Policy, Referrer-Policy, X-Content-Type-Options
- Express: X-Content-Type-Options, X-Frame-Options, Referrer-Policy, COOP, CORP
- `server_tokens off` in nginx
- `x-powered-by` disabled in Express

### Rate Limiting Coverage
All write endpoints have rate limiters except `PATCH /retention` (SEC-2-01):
- Setup routes: 60/min write limiter
- Alerts CRUD: 60/min write, 180/min read
- Matter routes: 30/min write limiter
- Archive routes: 60/min write, 120/min read
- Repair routes: 10/min write limiter
- Alerts settings: 10/min write limiter
- Events read: 300/min
- Stats read: 120/min
- Accessories read: 120/min

### Sensitive Data Handling
- GET `/api/setup/pairings` strips `longTermData` and `pin` from response
- GET `/api/setup/matter/pairings` strips `credentials` from response
- Add-pairing response strips full pairing objects: `({ pairing, ...rest }) => rest`
- `pairings.json` has mode 0o600 via store.js atomic write
- API token file in standalone mode has mode 600

### Docker Security
- Listener runs as `node` user (non-root) via `USER node`
- Web runs as nginx default user
- Multi-stage builds exclude build tools from runtime image
- PostgreSQL port bound to localhost only: `127.0.0.1:5432:5432`
- Resource limits configured (CPU, memory)
- Standalone uses Unix socket for PostgreSQL (no TCP port conflict)
- Standalone auto-generates API token if not provided, persists to file with 600 permissions

### Process Error Handling
- `unhandledRejection` handler logs but does not exit (preserves HAP subscriptions)
- `uncaughtException` handler exits for clean Docker restart
- Global Express error handler catches unhandled route errors
- Error responses return generic `{ error: 'Internal server error' }` (no stack traces)
- Subscriber reconnects use exponential backoff with max delay

### Input Validation
- `parseIntInRange()` used consistently for numeric query params with min/max bounds
- `validateAccessoryId()` enforces max length (256 chars)
- Alert rule validation checks enum values against Sets
- Retention settings validation checks all fields with type and range constraints
- CSV export has formula injection protection (prefixing `=+\-@\t\r` characters)

### File System Security
- `JsonObjectStore.write()` uses atomic rename pattern (write temp file, then rename)
- File permissions set to 0o600 on store files
- Write serialization via `_writeLock` prevents concurrent write races
- No user-controlled file paths -- all store paths from env vars or hardcoded defaults

### Prototype Pollution
- No `Object.assign` with user input found
- No spread of `req.body`/`req.query`/`req.params` into objects
- Express `req.body` is parsed by `express.json()` which does not produce prototype-polluted objects

---

## Summary Table

| ID | Severity | Category | Finding |
|----|----------|----------|---------|
| SEC-2-01 | HIGH | Rate Limiting | Missing rate limiter on PATCH /api/setup/retention |
| SEC-2-02 | MEDIUM | Rate Limiting | Missing rate limiter on GET /api/health |
| SEC-2-03 | HIGH | Input Validation | Unvalidated `credentials` field stored from request body |
| SEC-2-04 | MEDIUM | Infrastructure | Standalone entrypoint references non-existent init SQL |
| SEC-2-05 | MEDIUM | Information Leak | Scan error responses expose internal error messages |
| SEC-2-06 | LOW | CORS | CORS localhost default enabled in production |

---

## Recommended Priority

1. **SEC-2-01** -- Add rate limiter to retention router (copy pattern from repair-router.js)
2. **SEC-2-03** -- Validate or remove the `credentials` field in matter-router.js
3. **SEC-2-05** -- Replace `err.message` in scan warning responses with generic messages
4. **SEC-2-04** -- Fix or remove the init.sql reference in standalone entrypoint
5. **SEC-2-02** -- Add rate limiter to health router
6. **SEC-2-06** -- Consider defaulting CORS_ALLOW_LOCALHOST to false in production
