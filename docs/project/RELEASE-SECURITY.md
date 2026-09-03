# RELEASE-SECURITY.md — UI-redesign branch security audit

**Audit date:** 2026-04-27
**Branch:** `ui-redesign`
**Diff base:** `f2083ab..HEAD` (end of v1.2 → current tip)
**Scope:** `listener/src` + `web/src` (20 files changed; +292 / -166 lines)
**Threat model:** self-hosted single-user tool on a trusted home LAN; API token gates writes; reads optionally gated.

---

## Findings summary

| Severity | Count |
|----------|-------|
| CRITICAL | 0 |
| HIGH     | 0 |
| MEDIUM   | 0 |
| LOW      | 1 |
| INFO     | 4 |

No release-blocking issues found. One LOW finding (defense-in-depth) and a handful of informational notes.

---

## CRITICAL / HIGH / MEDIUM

None.

---

## LOW

### LOW-1 — `subscriberConnected` rescue widens the "online" window indefinitely
**File:** `listener/src/device-health.js:73-76`
**Threat surface item:** #3 (device-health rescue clause)

**Threat.** The new short-circuit
```js
if (subscriberConnected && (status === 'stale' || status === 'offline' || status === 'unknown')) {
  status = 'online';
  staleReason = null;
}
```
reports a device as `online` whenever the listener's HAP TCP socket is alive, regardless of how long ago an event was last seen. The previous rescue relied on `lastHealthyAt`/`lastConnectedAt` timestamps capped by `onlineThresholdSeconds`, providing a built-in upper bound.

**Exploitability (self-hosted home LAN).**
- `session.client` is set only after a successful HAP `pairSetup`/`pairVerify` against the stored `longTermData`. A LAN attacker attempting to spoof a HAP socket would still need the long-term keys, which are not on the wire.
- The realistic abuse path is "stale TCP keepalive masking a wedged device": the kernel may keep `session.client` truthy for hours after the device has stopped responding to encrypted reads. This is a **reliability** concern (false-online reporting in the UI) more than a security one.
- No authorization decision is made on the `online` status — it is purely an observability signal in the web UI. Confirmed by grep: `subscriberConnected` is read only by `device-health.js`; no router uses it as a gate.

**Recommended mitigation (post-release follow-up, not a blocker).**
Cap the rescue with a sanity ceiling so a stuck-but-truthy `session.client` cannot indefinitely mask a dead subscription:
```js
if (subscriberConnected && subscriberHeartbeatTs) {
  const ageSec = safeSecondsBetween(nowMs, subscriberHeartbeatTs);
  if (ageSec != null && ageSec <= 24 * 60 * 60) {  // 24h hard ceiling
    status = 'online'; staleReason = null;
  }
}
```
This preserves the rescue for genuinely quiet devices (motion sensors, temp sensors) while preventing a permanently-wedged session from looking healthy forever.

**Verdict.** Ship as-is; address in next reliability sweep.

---

## INFO

### INFO-1 — PIN is never logged or returned via API in the new repair path
**Files:** `listener/src/repair-helpers.js`, `listener/src/repair-scheduler.js`, `listener/src/index.js:289-292`
**Threat surface item:** #1

Verified by grep across the changed files:
- `repair-scheduler.js` log statements only emit `pairingName` and `err.message` (lines 110, 115, 128, 131, 135). PIN is never interpolated into a log line.
- `repair-helpers.js` has no log statements at all; it relies on the caller to shape errors.
- `performPairSetupAndPersist` receives `pin` as a parameter, passes it to `client.pairSetup(pin)`, and writes it back into the persisted pairing object. There is **no module-level cache, no closure capturing `pin` beyond the function scope, and no rejection-error wrapping that includes `pin` in the message**. Once the function returns, `pin` is unreferenced and eligible for GC.
- The closure constructed in `index.js:289-292` (`(deviceId, pin, address, port) => performPairSetupAndPersist(...)`) is invoked once per repair attempt; arguments leave scope when the promise settles.
- API responses: `mapReliabilityStats` (`setup-helpers.js:62-86`) does not include `pin` or `longTermData`. Verified the existing setup-router.js sanitizes pairings the same way it did pre-diff (no regression).

**No PIN leakage on this path.**

### INFO-2 — `connected` and `last_healthy_at` ride existing auth path
**Files:** `listener/src/setup-helpers.js:75-76`, `listener/src/accessories-router.js`, `listener/src/index.js:393-410`
**Threat surface item:** #2

The new fields appear in three response shapes (accessories list, bridge children, single accessory). All three flow through `createAccessoriesRouter`, which is mounted at `app.use('/api', createAccessoriesRouter(...))` (line 492) — *after* the auth middleware at line 393. With `API_TOKEN_READS_ENABLED=true`, an unauthenticated GET is rejected before reaching the router; with reads open (default), the new fields share the same posture as pre-existing `last_connected_at`/`last_subscribed_at` — i.e., explicitly an accepted information disclosure for this self-hosted profile.

`last_healthy_at` and `connected` are never read by the auth middleware. Confirmed by grep: `secureTokenEquals` and the auth `app.use(...)` block in `index.js` reference only the request token, never reliability stats. **Not used as an auth signal anywhere.**

### INFO-3 — Warn-skip path does not leak PIN status to unauthorized callers
**File:** `listener/src/repair-scheduler.js:108-112`
**Threat surface item:** #1

The warn message is emitted to the **server log** (`log.warn`), not to any HTTP response. Scheduler runs are triggered internally on a timer (no external HTTP entry point exists for `runRepairCycle`). The manual repair endpoint (`/api/setup/repair`, gated by API token writes) was not modified in this diff. The set of devices with/without stored PINs is therefore not reachable by an unauthenticated remote caller via the new code.

### INFO-4 — Web navigation handlers do not introduce XSS surface
**Files:** `web/src/App.jsx:57,76-78`, `web/src/components/EventRow.jsx:39-50`, `web/src/components/ActivityFeed.jsx:99-103`, `web/src/components/SceneGroup.jsx`, `web/src/components/EpisodeGroup.jsx`, `web/src/components/Sidebar.jsx`
**Threat surface item:** #4

- `handleSelectAccessory(id)` calls `window.history.pushState({hcView, accessoryId: id}, '', currentPathname)` — the `id` is stored in the **state object**, not interpolated into the URL string. The URL passed to `pushState` is `${window.location.pathname}${window.location.search}${window.location.hash}` — current location verbatim. No injection surface.
- `handleToastNav(name)` writes the accessory name into a React state object that becomes the `accessory` filter param of a fetch call (`useEvents` query). Not interpolated into HTML, `href`, `style`, or `dangerouslySetInnerHTML`. React's default escaping handles the display side.
- `EventRow`'s `onClick`/`onKeyDown` invoke `onSelectAccessory(event.accessory_id)` — same callback as above.
- `Sidebar`'s alerts feature flag (`alertsEnabled = Boolean(alertsConfig?.enabled)`) is purely a UI-visibility filter. The listener-side `/api/alerts` routes remain mounted and auth-gated server-side (no change in `listener/src/index.js`); the visibility flag is **not** a security boundary, just a UX nicety. Confirmed by reading `index.js:455` — `app.use('/api/alerts', createAlertsRouter(...))` is unconditional in this diff.

No new XSS surface. No client-side filtering used as an authorization gate.

### INFO-5 — No new dependencies added
**Files:** `listener/package.json`, `listener/package-lock.json`, `web/package.json`, `web/package-lock.json`
**Threat surface item:** #5

`git diff --stat f2083ab..HEAD -- listener/package.json listener/package-lock.json web/package.json web/package-lock.json` returns empty. **No supply-chain delta.**

---

## Regression spot-checks vs. 2026-04-11 SECURITY-AUDIT.md

| Previously-fixed issue | Status |
|------------------------|--------|
| SSRF protection in webhook URLs (`security.js`) | **Unchanged** — `security.js` not in diff |
| Timing-safe API token comparison (`secureTokenEquals`) | **Unchanged** — `index.js:404` untouched (only line numbers shifted) |
| Rate limiter `trustProxy` handling | **Unchanged** — no rate-limiter changes in diff |
| CSP headers in `nginx.conf.template` | **Unchanged** — file not in diff |
| Audit logging of mutating routes | **Unchanged** — middleware at `index.js:373` untouched |
| `longTermData` preservation guard (`setup-helpers.js:126`) | **Preserved** — guard still present, repair path uses `loadPairings()` snapshot then writes a merged object |

No regressions detected.

---

## Release security verdict

**SHIP.**

The unreleased changes do not introduce any new authentication, authorization, or data-exposure boundaries. The HAP `pairSetup` repair path correctly handles the stored PIN as a write-only secret — never logged, never returned in API responses, never cached beyond the function call. The new subscriber-state fields (`connected`, `last_healthy_at`) ride the same auth posture as existing reliability stats. Web navigation changes use React state and `history.pushState` state objects; no event-derived data crosses into URL/HTML/style sinks. No new dependencies were added.

The single LOW finding (LOW-1, indefinite `subscriberConnected` rescue window) is a reliability-quality concern with negligible security impact in the self-hosted single-user threat model and should be tracked as a post-release follow-up rather than a release blocker.

**Recommendation:** ship-with-followup — open a tracking issue for LOW-1 (24h ceiling on `subscriberConnected` rescue) for inclusion in the next reliability-focused phase.
