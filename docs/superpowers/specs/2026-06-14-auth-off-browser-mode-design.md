# Auth-off browser mode (AUTH_ENABLED=false → full no-login UI)

**Date:** 2026-06-14
**Status:** Implemented (quick 260614-q0j; listener 670/670, web 354/354)

## Problem

`AUTH_ENABLED` is server-side only (`listener/src/index.js:129`) and is **not exposed to the browser**. The web client is hardcoded auth-on: `main.jsx` always wraps `/*` in `<AuthGate>`, which calls `GET /api/auth/me`; with no session that returns 401 → AuthGate redirects to `/login`. So in an `AUTH_ENABLED=false` deployment the operator is bounced to `/login`/`/setup` and cannot use the app. The documented intent of `AUTH_ENABLED=false` is a "full v1.3 revert" (no login). Additionally, admin-only Settings (Advanced = log level + Danger Zone) are gated `isAdmin = user?.role === 'admin'`, which is false when there is no user — hiding them from the legitimate sole operator.

The server already aligns with no-login = full access: the `requireAdminSession` guard (added 2026-06-14) passes through when there is no session (`if (req.hcSession && req.hcSession.role !== 'admin') → 403`). This change makes the **UI** agree with that.

## Design

### 1. Server — auth-config signal (chosen: dedicated public endpoint)
- New **public** route `GET /api/auth/config` → `{ authEnabled: boolean }`, reflecting the existing `AUTH_ENABLED` constant.
- Mounted before the auth gate; added to `PUBLIC_AUTH_PATHS` (`index.js`) so it is reachable without a session. No auth, no secrets.
- Rejected alternatives: folding into `/me` (re-entangles the fragile shared `['auth','me']` query that previously caused a cache-shape bug); build-time `VITE_AUTH_ENABLED` (web image is a generic prebuilt static bundle → two sources of truth, brittle).

### 2. Client — auth shell
- New `useAuthConfig()` hook → query key `['auth','config']`, `staleTime: Infinity`. **Fail-closed:** on error/loading-unknown, treat `authEnabled` as `true` (never drop the login wall on a blip).
- `AuthGate`: if `authEnabled === false` → render children directly (no `/me`, no redirect). If `true` → current behavior (require session, else redirect to `/login`).
- `main.jsx` routing: when `authEnabled === false`, the `/login` and `/setup` routes redirect to `/` (stale bookmark must not strand the operator).
- `Sidebar`: hide the Logout button / account row when `authEnabled === false` (no session to end).

### 3. Settings restructure (single home for Advanced)
- **Advanced** (log level + Danger Zone / device-data delete) renders inside **Configuration**, gated `isAdmin || !authEnabled`. Auth-off operator sees it; auth-on admin sees it (now under Configuration, not the Admin tab); auth-on member does not.
- **Admin tab** (Users + SMTP) shows only when `authEnabled && isAdmin`. Hidden in auth-off.
- **Account tab** (password + active sessions) shows only when `authEnabled`. Hidden in auth-off.
- Net auth-off: Settings is just **Configuration**, which contains Advanced.

### 4. Consistency sweep
The only client feature-access admin gate is `SettingsPage.jsx`. `UsersPanel.jsx` `isAdmin` checks are internal to that panel (only renders inside the auth-on Admin tab → no change). `Sidebar.jsx` role usage is display + logout (handled above). No device-delete-button gate exists outside AdminAdvancedSection. So the change is bounded to: the new server endpoint, `useAuthConfig`, `AuthGate`, `main.jsx`, `Sidebar`, `SettingsPage`.

## Testing
- Listener: `GET /api/auth/config` returns `{authEnabled:true}` by default and `{authEnabled:false}` when `AUTH_ENABLED=false`.
- Web: AuthGate (auth-off → renders children, no redirect; auth-on + no session → redirect to `/login`); SettingsPage (auth-off → Configuration-only, Advanced visible, no Admin/Account tabs; auth-on member → no Advanced; auth-on admin → Advanced present under Configuration); routing redirects for `/login`,`/setup` in auth-off.

## Out of scope
No change to the server authorization model (already correct). No new auth features. `AUTH_ENABLED` remains the single runtime source of truth.
