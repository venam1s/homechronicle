# Security

## API Token

In production (`NODE_ENV=production`), the listener requires `API_TOKEN` to be set. Without it, the listener will refuse to start.

Generate a token:

```bash
openssl rand -hex 32
```

> **Standalone Docker** auto-generates a token on first run if none is provided. Check `docker logs homechronicle` for the generated token.

### Which routes require the token?

| Route type | Default | Configurable |
|------------|---------|-------------|
| **Write** (`POST`, `PATCH`, `DELETE`) | Always requires token | — |
| **Read** (`GET`, `HEAD`) | Open | Set `API_TOKEN_READS_ENABLED=true` to require auth |

### Sending the token

Include the token as a header:

```
X-API-Token: <your-token>
```

or:

```
Authorization: Bearer <your-token>
```

The web container automatically injects the token when proxying requests to the listener.

## Session Authentication

When `AUTH_ENABLED=true` (the default), browser access is protected by DB-backed sessions stored in an HttpOnly cookie (`hc_session`). The `API_TOKEN` header still works as a service or automation credential — the two mechanisms coexist.

| Topic | Detail |
|-------|--------|
| **Password hashing** | argon2id with configurable memory and iteration cost |
| **CSRF protection** | Mutating requests from browser sessions require a valid CSRF token |
| **Auth rate limiting** | Login, bootstrap, and password-change endpoints are each rate-limited per real client IP. `TRUST_PROXY` is a hop count: `1` for the bundled nginx alone, `2` when a TLS terminator (Traefik, Caddy, Cloudflare Tunnel) sits in front of it — nginx always appends its own hop, so the terminator makes it two. Get the count wrong and every household user shares one bucket, so 10 failed attempts lock everyone out. |
| **Session cookie** | HttpOnly; set `SESSION_COOKIE_SECURE=true` on HTTPS deployments |
| **Session metadata** | User agent and IP address are captured at login |
| **Active Sessions** | Each user can view and revoke their own sessions from Settings > Account |
| **Remember me** | Extends session to `SESSION_MAX_AGE_REMEMBER` (default 30 days) |

Set `AUTH_ENABLED=false` to fully disable the session system and revert to the `API_TOKEN`-only gate (v1.3 behavior).

See [Accounts & Users](accounts.md) for user management, roles, and invite setup. See [Environment Variables](environment-variables.md) for all `AUTH_*`, `SESSION_*`, `TRUST_PROXY`, and `ARGON2_*` variables.

## CORS

By default, only localhost origins are allowed. To allow other origins:

```
CORS_ALLOWED_ORIGINS=https://home.example.com,https://other.example.com
```

Set `CORS_ALLOW_LOCALHOST=false` to disable the localhost fallback when a custom origin list is provided.

## Webhook Security

Webhook targets are validated when an alert rule is saved:

| Target | Default | Override |
|--------|---------|----------|
| Public IPs | Allowed | — |
| Private IPs (RFC 1918) | Allowed | `ALERTS_ALLOW_PRIVATE_TARGETS=false` to block |
| Loopback / link-local | Always blocked | — |

Set `ALERTS_ALLOW_PRIVATE_TARGETS=true` if your webhook endpoints are on your LAN (e.g., Home Assistant, Node-RED).

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

Toggle archiving from **Manage** > **Settings** > **Archive before delete**, or via the API:

```bash
curl -X PATCH http://localhost:3001/api/setup/retention \
  -H "Content-Type: application/json" \
  -H "X-API-Token: <token>" \
  -d '{"archiveBeforeDelete": false}'
```

When disabled, expired events are permanently deleted.

## Quiet Hours

Quiet hours flag unexpected device activity during a defined window (e.g., 11 PM – 6 AM). Events during quiet hours are highlighted on the dashboard and timeline.

Enable from **Manage** > **Settings**, or via the API:

```bash
curl -X PATCH http://localhost:3001/api/setup/retention \
  -H "Content-Type: application/json" \
  -H "X-API-Token: <token>" \
  -d '{"quietHoursEnabled": true, "quietHoursStart": 23, "quietHoursEnd": 6}'
```

- `quietHoursStart` and `quietHoursEnd` are hours in UTC (0–23)
- The dashboard shows a **Quiet Hours** panel when enabled, listing any activity during the window
