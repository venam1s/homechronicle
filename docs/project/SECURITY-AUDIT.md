# HomeChronicle Security Audit Report

**Date:** 2026-04-11
**Auditor:** Automated Security Review (Claude)
**Scope:** Full codebase review of listener (Node.js/Express) and web (React/Vite/Nginx) services
**Framework:** OWASP Top 10 (2021), with focus on self-hosted deployment model

---

## Executive Summary

HomeChronicle demonstrates a **strong security posture** for a self-hosted application. The codebase implements timing-safe token comparison with HMAC normalization, comprehensive SSRF protection with DNS rebinding mitigation, parameterized SQL queries throughout, robust input validation, and a well-configured security header stack in both Express and Nginx. A few areas warrant attention, primarily around the default-permissive CORS policy and the lack of HTTPS enforcement, but these are reasonable trade-offs for a self-hosted home automation tool.

**Overall Rating:** GOOD -- suitable for self-hosted deployment on a trusted home network.

---

## 1. Authentication & Authorization

### 1.1 API Token Implementation -- PASS

**Files:** `listener/src/security.js:82-92`, `listener/src/index.js:385-399`

- Token comparison uses `crypto.timingSafeEqual` after HMAC-SHA256 normalization of both values, preventing both timing attacks and length-oracle attacks. This is exemplary.
- Empty/null tokens are rejected before comparison (`security.js:85-86`).
- Bearer token extraction is correctly implemented in `utils.js:20-28`.
- Both `x-api-token` header and `Authorization: Bearer` are supported.
- `WWW-Authenticate` header is returned on 401 responses.

### 1.2 Production Token Enforcement -- PASS

**File:** `listener/src/index.js:92-95`

- `API_TOKEN` is required when `NODE_ENV=production`; the process exits immediately if missing.
- A startup warning is emitted if `CORS_ALLOW_LOCALHOST` is left at its default `true` in production.

### 1.3 Read Endpoint Exemption -- PASS (INFORMATIONAL)

**File:** `listener/src/index.js:389-390`

- GET/HEAD requests skip token auth by default (`API_TOKEN_READS_ENABLED` defaults to `false`).
- This is documented and configurable. For a self-hosted app on a home LAN this is a reasonable default; sensitive data (pairing keys, PINs) is never exposed via GET endpoints -- only event data and device metadata.

### 1.4 Nginx Token Injection -- PASS

**File:** `web/nginx.conf.template:63,73`

- The Nginx proxy injects `X-API-Token` into upstream requests via `proxy_set_header`, so the browser never needs to know the API token in production.
- The token value is injected via environment variable substitution at container start (`${API_TOKEN}`).

### 1.5 No Authorization Model Beyond Token -- INFORMATIONAL

- There is no role-based access control (RBAC). All authenticated requests have full access.
- Acceptable for a single-user, self-hosted application. No action required.

---

## 2. Injection (OWASP A03:2021)

### 2.1 SQL Injection -- PASS

**Files:** `listener/src/db.js`, all `*-router.js` files

- **Every SQL query uses parameterized queries** (`$1`, `$2`, etc.). No string concatenation of user input into SQL was found.
- The `fields.join(', ')` in `alerts-router.js:268` constructs column names from a hardcoded `map` object (`alerts-router.js:248-258`), not from user input. Values are parameterized. Safe.
- The `columns.join(', ')` in `archive-router.js:94` uses a hardcoded constant array (`archive-router.js:57-61`). Safe.
- `ILIKE` pattern in `events-router.js:42` (`%${req.query.accessory}%`) is passed as a parameterized value, not interpolated into the SQL string. Safe.

### 2.2 Command Injection -- PASS

- No `child_process.exec()` or `child_process.spawn()` with user-controlled arguments found in the main codebase.
- Matter commissioning delegates to the Matter.js SDK, not to shell commands.

### 2.3 CSV Injection -- PASS

**File:** `listener/src/archive-router.js:67-68`

- The CSV export function prefixes formula-triggering characters (`=`, `+`, `-`, `@`, tab, CR) with a single quote. This prevents CSV injection attacks when users open exports in spreadsheet applications.

### 2.4 Log Injection -- LOW RISK

- User-controlled values (device names, accessory IDs) are logged via `log.info()`/`log.error()` without sanitization. In a self-hosted context with no centralized log aggregation, this is acceptable. If log aggregation is added, consider sanitizing newlines and control characters.

---

## 3. Server-Side Request Forgery (OWASP A10:2021)

### 3.1 Webhook SSRF Protection -- PASS

**File:** `listener/src/security.js:94-171`

Comprehensive multi-layer SSRF protection:

- **Protocol allowlist:** Only `http:` and `https:` permitted.
- **Hostname blocklist:** `localhost` and `*.localhost` blocked.
- **IPv4 classification:** Loopback (127.0.0.0/8), link-local (169.254.0.0/16), unspecified (0.0.0.0/8), multicast (224.0.0.0/4), reserved (240.0.0.0/4) all blocked. Private ranges (10/8, 172.16/12, 192.168/16, CGNAT 100.64/10) configurable via `ALERTS_ALLOW_PRIVATE_TARGETS`.
- **IPv6 classification:** Loopback (::1), unspecified (::), multicast (ff*), link-local (fe80-febf) blocked. ULA (fc/fd) configurable.
- **IPv4-mapped IPv6:** `::ffff:` prefixed addresses are correctly unwrapped and re-classified.
- **DNS resolution validation:** `resolveAndValidateWebhookTarget()` resolves hostnames and validates all resolved IPs against the same classification rules.
- **DNS rebinding mitigation:** `alerts.js:119-125` pins the resolved IP for the actual fetch, setting the Host header to the original hostname for TLS/SNI compatibility.
- **Redirect prevention:** `redirect: 'manual'` prevents following redirects to internal addresses.

### 3.2 Private Targets Default -- INFORMATIONAL

- `ALERTS_ALLOW_PRIVATE_TARGETS` defaults to `true`. This is appropriate for a home automation system where webhook targets (e.g., Home Assistant, Slack relay) are typically on the same LAN.

---

## 4. Security Headers

### 4.1 Nginx Security Headers -- PASS

**File:** `web/nginx.conf.template:7-13`

- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `Referrer-Policy: no-referrer`
- `Cross-Origin-Opener-Policy: same-origin`
- `Cross-Origin-Resource-Policy: same-origin`
- `Permissions-Policy: camera=(), microphone=(), geolocation=()`
- `Content-Security-Policy`: Well-configured -- `default-src 'self'`, `script-src 'self'` (no `unsafe-eval`), `style-src 'self' 'unsafe-inline'` (needed for Tailwind), `frame-ancestors 'none'`, `object-src 'none'`, `base-uri 'self'`.
- `server_tokens off` hides Nginx version.
- Headers are repeated in each `location` block because Nginx's `add_header` in a child block overrides parent-level headers. This is correct.

### 4.2 Express Security Headers -- PASS

**File:** `listener/src/index.js:365-372`

- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `Referrer-Policy: no-referrer`
- `Cross-Origin-Opener-Policy: same-origin`
- `Cross-Origin-Resource-Policy: same-origin`
- `x-powered-by` disabled via `app.disable('x-powered-by')`.

### 4.3 Cache Control -- PASS

- `index.html` and `service-worker.js` have `no-cache, no-store, must-revalidate`.
- Static assets (JS/CSS) use Vite's content-hashed filenames for long-term caching.

---

## 5. Input Validation

### 5.1 Query Parameter Validation -- PASS

**File:** `listener/src/utils.js:1-5`

- `parseIntInRange()` used consistently across all routers for pagination, date ranges, and configuration values. Enforces finite integer within min/max bounds with safe fallback.

### 5.2 Request Body Validation -- PASS

- Alert rules: `validateCreate()` and `validatePatch()` in `alerts-router.js` validate all fields including enum values (`scopeType`, `operator`) against hardcoded sets.
- Retention settings: Every field individually validated with type and range checks in `retention-router.js`.
- Repair settings: Type and range validation on `enabled` (boolean) and `hour` (0-23).
- Accessory IDs: `validateAccessoryId()` in `accessories-router.js:46-53` validates presence and max length (256 chars).

### 5.3 JSON Body Size Limit -- PASS

**File:** `listener/src/index.js:364`

- `express.json({ limit: API_JSON_LIMIT })` defaults to `256kb`, configurable via environment variable.

### 5.4 Destructive Operations -- PASS

**File:** `listener/src/archive-router.js:150-151`

- DELETE all data requires `{ "confirm": "DELETE ALL" }` in the request body as a safety check.

---

## 6. Rate Limiting

### 6.1 Configuration -- PASS

**Files:** All `*-router.js` files

- Separate rate limiters for read and write operations across all routers.
- All limits are configurable via environment variables.
- Default limits: writes 60/min, reads 120-300/min, stats 120/min, repair 10/min.
- `standardHeaders: true` enables `RateLimit-*` response headers.
- `legacyHeaders: false` disables `X-RateLimit-*` headers.

### 6.2 Key Generator -- PASS

**File:** `listener/src/security.js:70-80`

- `rateLimitKeyGenerator()` only trusts `X-Forwarded-For` when Express `trust proxy` is explicitly configured, preventing header spoofing to bypass rate limits.

### 6.3 Missing Rate Limiter -- LOW RISK

- `matter-router.js` endpoints (`/setup/matter/scan`, `/setup/matter/commission`, `/setup/matter/pair`, etc.) do not have rate limiters. These are write-heavy operations that could be abused if the listener port is exposed. However, they are protected by API token auth on POST/DELETE, and commissioning is inherently slow (60-120s per device).

---

## 7. CORS Configuration

### 7.1 CORS Policy -- INFORMATIONAL

**File:** `listener/src/index.js:348-363`

- When `CORS_ALLOWED_ORIGINS` is set, only listed origins are allowed (strict allowlist).
- When empty (default), falls back to `CORS_ALLOW_LOCALHOST` which permits any localhost origin.
- `CORS_ALLOW_LOCALHOST` defaults to `true` with a startup warning in production if not explicitly set.
- **Note:** In the typical production deployment, the browser talks to Nginx (same-origin), so CORS is not involved. CORS is primarily relevant for development or when accessing the listener directly.

---

## 8. Data Security

### 8.1 Pairing Key Storage -- PASS

**File:** `listener/src/store.js:72-99`

- `JsonObjectStore._doWrite()` uses atomic rename (write to temp file, then `rename()`) to prevent partial writes.
- File permissions set to `0o600` (owner read/write only) on both temp file creation (`writeFile` with `mode: 0o600`) and after rename (`chmod`).
- `pairings.json` is in `.gitignore`.
- Pairing data directory is volume-mounted, surviving container restarts.

### 8.2 PIN Storage -- INFORMATIONAL

**File:** `listener/src/setup-router.js:115`

- HomeKit PINs are stored in `pairings.json` alongside the long-term pairing data. This is needed for the auto-repair feature.
- PINs are stored in plaintext. Since they are 8-digit setup codes visible on device labels, and the file is `0o600` with filesystem-level protection, this is acceptable for a self-hosted deployment. Encryption at rest would add complexity without meaningful security benefit (the encryption key would need to be stored nearby).

### 8.3 GET /api/setup/pairings Exposure -- PASS

**File:** `listener/src/setup-router.js:186-198`

- The pairings list endpoint strips sensitive fields (`longTermData`, `pin`) and only returns `id`, `name`, `address`, `port`, `category`, `pairedAt`.

### 8.4 Environment Variables -- PASS

- `.env` and `.env.test`/`.env.beta` are in `.gitignore`.
- `.env.example` has `POSTGRES_PASSWORD=changeme` with a comment to change it.
- `API_TOKEN` is empty in `.env.example` with a comment to generate via `openssl rand -hex 32`.

---

## 9. Docker Security

### 9.1 Listener Dockerfile -- PASS

**File:** `listener/Dockerfile`

- Multi-stage build: build tools (python3, make, g++) only in build stage.
- Runtime runs as `USER node` (non-root).
- HEALTHCHECK configured.
- Data directory owned by `node:node`.

### 9.2 Web Dockerfile -- PASS

**File:** `web/Dockerfile`

- Multi-stage build: Node.js only in build stage, runtime is `nginx:alpine`.
- Nginx runs as its default user (not root for the worker processes).

### 9.3 Docker Compose -- PASS WITH NOTES

**File:** `docker-compose.yml`

- PostgreSQL port bound to `127.0.0.1` only (line 15), preventing external access. Good.
- Resource limits configured for all services (CPU/memory).
- Health checks configured for PostgreSQL and listener.
- **Note:** Listener uses `network_mode: host` which is required for mDNS/Matter but exposes the API port (3001) directly on the host. This is documented and necessary.
- **Note:** D-Bus socket mounted read-only (`:ro`). Good.

### 9.4 Standalone Dockerfile -- PASS WITH NOTES

**File:** `Dockerfile.standalone`

- Uses `gosu` for privilege dropping (standard practice).
- PostgreSQL communicates via Unix socket (no TCP port).
- **Note:** The runtime stage does not run as a non-root user at the Dockerfile level -- the entrypoint script likely handles privilege dropping via `gosu`. This is acceptable for a standalone all-in-one container.

---

## 10. Error Handling

### 10.1 Error Response Pattern -- PASS

**File:** `listener/src/index.js:509-516`

- Global Express error handler returns generic `{ error: 'Internal server error' }` without leaking stack traces.
- All individual route handlers use try/catch with the same pattern.
- Pairing error messages in `setup-router.js:138-153` return user-friendly messages mapped from HAP error codes, never raw error details.

### 10.2 Process-Level Handlers -- PASS

**File:** `listener/src/index.js:44-52`

- `unhandledRejection`: Logs but does not exit (preserves HAP subscriptions).
- `uncaughtException`: Logs and exits for clean Docker restart.

---

## 11. Denial of Service Considerations

### 11.1 CSV Export Pagination -- PASS

**File:** `listener/src/archive-router.js:75,87-102`

- Export streams in 5000-row batches with a configurable maximum (`ARCHIVE_MAX_EXPORT_ROWS`, default 500,000). Prevents unbounded memory consumption.

### 11.2 Query Result Limits -- PASS

- All paginated endpoints enforce maximum page sizes (typically 200 rows).
- Stats queries use `LIMIT` clauses (e.g., top-10 devices, 50 anomalies).
- Trend data capped at 2000 points.

### 11.3 Webhook Timeout -- PASS

**File:** `listener/src/alerts.js:3-7,114`

- Webhook requests have a configurable timeout (default 5 seconds) via `AbortController`.

---

## 12. Transport Security

### 12.1 HTTPS -- NOT CONFIGURED (EXPECTED)

- Neither Nginx nor Express configure TLS directly.
- This is standard for a self-hosted application that typically runs behind a reverse proxy (e.g., Traefik, Caddy, or a NAS's built-in proxy) that terminates TLS.
- The `.env.example` documents `X-Forwarded-Proto` is passed through Nginx.

### 12.2 Listener Bind Address -- PASS

**File:** `listener/src/index.js:518`

- `API_BIND_ADDRESS` defaults to `0.0.0.0` but is configurable. Documentation notes users can set `127.0.0.1` to restrict to localhost only.

---

## 13. Dependency Considerations

### 13.1 Known Patterns -- INFORMATIONAL

- Express 5.2.x (latest stable) is used.
- `hap-controller` and `@matter/main` are protocol libraries that handle cryptographic operations for device pairing. These are well-maintained community packages.
- `fast-xml-parser` is pinned to `^5.3.5` via an override, likely for a known vulnerability in earlier versions.

---

## Findings Summary

| # | Finding | Severity | Category | Status |
|---|---------|----------|----------|--------|
| 1 | Timing-safe token comparison with HMAC normalization | -- | Auth | IMPLEMENTED |
| 2 | All SQL queries use parameterized values | -- | Injection | IMPLEMENTED |
| 3 | SSRF protection with DNS rebinding mitigation | -- | SSRF | IMPLEMENTED |
| 4 | Comprehensive security headers (CSP, COOP, CORP, etc.) | -- | Headers | IMPLEMENTED |
| 5 | Rate limiting on all database-backed endpoints | -- | DoS | IMPLEMENTED |
| 6 | CSV injection protection in archive export | -- | Injection | IMPLEMENTED |
| 7 | Atomic file writes with 0o600 permissions for secrets | -- | Data Security | IMPLEMENTED |
| 8 | Matter router endpoints lack rate limiters | Low | DoS | OPEN |
| 9 | Log injection (user-controlled strings in log output) | Low | Injection | ACCEPTED |
| 10 | CORS defaults allow localhost origins in production | Info | Config | DOCUMENTED |
| 11 | No HTTPS at application layer | Info | Transport | EXPECTED |
| 12 | PINs stored in plaintext in pairings.json | Info | Data Security | ACCEPTED |
| 13 | Host network mode exposes listener port | Info | Network | REQUIRED |

---

## Recommendations

### Priority 1 (Low effort, tangible benefit)

1. **Add rate limiters to Matter router endpoints.** The `POST /setup/matter/scan`, `POST /setup/matter/commission`, `POST /setup/matter/pair`, and `DELETE /setup/matter/pairing/:nodeId` endpoints lack rate limiters. Apply the same `setupWriteLimiter` pattern used in `setup-router.js`.

### Priority 2 (Consider for future hardening)

2. **Document recommended reverse proxy TLS configuration.** Add a section to deployment docs showing how to configure Traefik/Caddy/Nginx-Proxy-Manager for HTTPS termination in front of HomeChronicle.

3. **Consider `API_BIND_ADDRESS=127.0.0.1` as a safer default** when `network_mode: host` is used, since the Nginx proxy handles external access. This would prevent direct access to the listener API from the LAN.

### No Action Required

- SQL injection: All queries parameterized. No issues found.
- XSS: CSP blocks inline scripts; React's default escaping handles output encoding.
- Authentication bypass: Token enforcement is correct with proper timing-safe comparison.
- SSRF: Multi-layer protection with DNS rebinding mitigation is thorough.
- File permissions: Atomic writes with restrictive permissions are properly implemented.

---

## Files Audited

### Listener (`listener/src/`)
- `security.js` -- Token comparison, SSRF protection, rate limit key generation
- `index.js` -- Express app setup, middleware chain, auth enforcement
- `db.js` -- Database queries, migrations, retention sweep
- `store.js` -- JSON file persistence with atomic writes
- `utils.js` -- Input parsing utilities
- `events-router.js` -- Event query endpoints
- `alerts-router.js` -- Alert rule CRUD
- `alerts.js` -- Alert processing, webhook delivery with DNS pinning
- `setup-router.js` -- Device pairing, room/name management
- `matter-router.js` -- Matter device management
- `retention-router.js` -- Settings management
- `archive-router.js` -- Data export and deletion
- `stats-router.js` -- Analytics queries
- `accessories-router.js` -- Device detail endpoints
- `health-router.js` -- Health check endpoint
- `repair-router.js` -- Repair scheduling settings
- `subscriber.js` -- HAP subscription management

### Web (`web/src/`)
- `lib/api.js` -- API client with auth header injection

### Infrastructure
- `listener/Dockerfile` -- Multi-stage build, non-root runtime
- `web/Dockerfile` -- Multi-stage build, nginx-alpine runtime
- `Dockerfile.standalone` -- All-in-one container
- `docker-compose.yml` -- Service orchestration
- `web/nginx.conf.template` -- Reverse proxy with security headers
- `.env.example` -- Environment variable documentation
- `.gitignore` -- Sensitive file exclusions
