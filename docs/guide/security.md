# Security

## API Token

`API_TOKEN` is a shared secret for scripts, automations and service-to-service calls. How much it protects depends on whether login is enabled.

The listener refuses to start when login is disabled (`AUTH_ENABLED=false`) **and** `API_TOKEN` is empty, unless `NODE_ENV` is set to something other than `production` (an unset `NODE_ENV` counts as production). Without a session system or a token, nothing would protect the API.

Generate a token:

```bash
openssl rand -hex 32
```

> **Standalone Docker** auto-generates a token on first run if none is provided. Check `docker logs homechronicle` for the generated token.

### Which routes require the token?

| Mode | Write (`POST`, `PATCH`, `PUT`, `DELETE`) | Read (`GET`, `HEAD`) |
|------|------------------------------------------|----------------------|
| **Login enabled** (`AUTH_ENABLED=true`, default) | Session cookie or token | Session cookie or token |
| **Login disabled**, `API_TOKEN` set | Token | Open, unless `API_TOKEN_READS_ENABLED=true` |
| **Login disabled**, `API_TOKEN` empty (development only — see above) | Open | Open |

With login enabled, only a few routes are public: the sign-in, first-admin, invite and password-reset routes under `/api/auth`, plus `/api/health` and `/api/updates/latest`. `API_TOKEN_READS_ENABLED` has no effect when login is enabled. See the [API Reference](api-reference.md) for details.

### Sending the token

Include the token as a header:

```
X-API-Token: <your-token>
```

or:

```
Authorization: Bearer <your-token>
```

With login disabled, the web container adds the token to every request it proxies to the listener, so the browser never needs it. With login enabled, it does not — the browser's session cookie is the only credential. The web container's `AUTH_ENABLED` must match the listener's.

## Session Authentication

When `AUTH_ENABLED=true` (the default), browser access is protected by DB-backed sessions stored in an HttpOnly cookie (`hc_session`). The `API_TOKEN` header still works as a service or automation credential — the two mechanisms coexist.

| Topic | Detail |
|-------|--------|
| **Password hashing** | argon2id with configurable memory and iteration cost |
| **CSRF protection** | Mutating requests from browser sessions require a valid CSRF token |
| **Auth rate limiting** | Login, bootstrap, and password-change endpoints are each rate-limited per real client IP. `TRUST_PROXY` is a hop count: `1` for the bundled nginx alone, `2` when a TLS terminator (Traefik, Caddy, Cloudflare Tunnel) sits in front of it — nginx always appends its own hop, so the terminator makes it two. Get the count wrong and every household user shares one bucket, so 10 failed attempts lock everyone out. |
| **Session cookie** | HttpOnly; set `SESSION_COOKIE_SECURE=true` on HTTPS deployments |
| **Session metadata** | User agent and IP address are captured at login |
| **Active Sessions** | Each user can view and revoke their own sessions from Settings › Account |
| **Remember me** | Extends session to `SESSION_MAX_AGE_REMEMBER` (default 30 days) |

Set `AUTH_ENABLED=false` to fully disable the session system and revert to the `API_TOKEN`-only gate (v1.3 behavior).

See [Accounts & Users](accounts.md) for user management, roles, and invite setup. See [Environment Variables](environment-variables.md) for all `AUTH_*`, `SESSION_*`, `TRUST_PROXY`, and `ARGON2_*` variables.

## CORS

Cross-origin requests are refused by default. Localhost origins are allowed only when `CORS_ALLOW_LOCALHOST` is on, which is the default only when `NODE_ENV` is set to something other than `production` (for local development). To allow other origins:

```
CORS_ALLOWED_ORIGINS=https://home.example.com,https://other.example.com
```

You don't need CORS for normal use: the browser talks to the web container, which proxies `/api` to the listener on the same origin.

## Webhook Security

Webhook targets are validated when an alert rule is saved, and again after resolving the hostname each time an alert is sent:

| Target | Default | Override |
|--------|---------|----------|
| Public IPs | Allowed | — |
| Private IPs (RFC 1918) | Allowed | `ALERTS_ALLOW_PRIVATE_TARGETS=false` to block |
| `localhost`, loopback, link-local, multicast, reserved | Always blocked | — |

Keep the default (`ALERTS_ALLOW_PRIVATE_TARGETS=true`) if your webhook endpoints are on your LAN (for example Home Assistant or Node-RED). Redirects are never followed. See [Alerts](alerts.md#target-restrictions).

## Container Security

The Docker Compose setup includes several hardening measures:

- **Non-root listener**: runs as the built-in `node` user (uid 1000)
- **Resource limits**: CPU and memory caps on all containers
- **Localhost-bound PostgreSQL**: port `5432` is only accessible from `127.0.0.1`
- **Nginx security headers**: CSP, X-Frame-Options DENY, X-Content-Type-Options nosniff
- **Segmented proxy timeouts**: 30s for normal API, 300s for pairing endpoints only
- **Audit logging**: all mutating API requests are logged

## Event Retention & Archiving

Events older than `RETENTION_DAYS` (default 365) are swept daily. Before deletion, expired events are copied to the `event_logs_archive` table.

Toggle archiving in **Settings › Configuration › Data management** (**Archive before delete**), or via the API:

```bash
curl -X PATCH http://localhost:3001/api/setup/retention \
  -H "Content-Type: application/json" \
  -H "X-API-Token: <token>" \
  -d '{"archiveBeforeDelete": false}'
```

When disabled, expired events are permanently deleted.

## Quiet Hours

Quiet hours flag unexpected device activity during a defined window (e.g., 11 PM – 6 AM). Events during quiet hours are highlighted on the dashboard and timeline.

Enable it in **Settings › Configuration › Data management** (**Quiet hours**). When you're signed in, quiet hours are saved per user; the API call below sets the shared household setting used when login is disabled:

```bash
curl -X PATCH http://localhost:3001/api/setup/retention \
  -H "Content-Type: application/json" \
  -H "X-API-Token: <token>" \
  -d '{"quietHoursEnabled": true, "quietHoursStart": 23, "quietHoursEnd": 6}'
```

- `quietHoursStart` and `quietHoursEnd` are hours in UTC (0–23)
- The dashboard shows a **Quiet Hours** panel when enabled, listing any activity during the window
