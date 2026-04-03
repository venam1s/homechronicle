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

## CORS

By default, only localhost origins are allowed. To allow other origins:

```
CORS_ALLOWED_ORIGINS=https://home.example.com,https://other.example.com
```

Set `CORS_ALLOW_LOCALHOST=false` to disable the localhost fallback when a custom origin list is provided.

## Webhook Security

When alerts are enabled (`ALERTS_ENABLED=true`), webhook targets are validated:

| Target | Default | Override |
|--------|---------|----------|
| Public IPs | Allowed | — |
| Private IPs (RFC 1918) | Blocked | `ALERTS_ALLOW_PRIVATE_TARGETS=true` |
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
