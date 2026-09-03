---
audit: long-running-process reliability (listener runtime)
date: 2026-08-30
head: a39bcb0 (audited HEAD only; working-tree changes ignored)
baseline: .planning/SECURITY-AUDIT-2026-06-14.md (delta scoped with `git diff 89154e9..HEAD --stat -- listener`)
mode: read-only, report-only
tests_at_audit: listener 730/730 green (`cd listener && npm test`, 61s)
---

# HomeChronicle Listener — Runtime Reliability Audit

Product promise under test: "runs unattended for months". Every finding cites file:line at HEAD.
**[VERIFIED]** = concrete failure path traced in source. **[suspected]** = mechanism is real but I could not trace a guaranteed trigger.
Severity = likelihood x impact for an unattended self-hosted Docker deployment.

Not re-reported (Accepted in the June audit): CSP unsafe-inline, PIN/CSRF in sessionStorage, DNS-rebind residual, migration 0005 idempotency, store.js temp-name predictability, `ALTER USER` cmdline, standalone token log, `:latest` tags, `fec0::/10`.

Summary: **2 HIGH, 3 MEDIUM, 6 LOW**. The two HIGHs are both "a single unlucky network moment permanently silences a device (or the whole process) until someone restarts the container", which is exactly the failure class the product promise forbids.

---

## HIGH

### H-1 — hap-controller has no request timeout and never rejects an in-flight request on socket close: one unanswered HAP request permanently strands that device [VERIFIED]

Library path (`listener/node_modules/hap-controller@0.10.2`):
- `lib/transport/ip/http-connection.js:87` calls `socket.setKeepAlive(true)` but **never calls `socket.setTimeout()`** — the `'timeout'` listener at `:98` can never fire.
- `:88-92` — the `'close'` handler sets `this.socket = null`, emits `'disconnect'`, and **does not reject any pending request promise**.
- `:257-311` (`_requestEncrypted`) — the returned Promise is resolved **only** from the HTTP parser's `onMessageComplete` (`:239-245`). `'error'` is only wired to reject the `_open()` promise (`:103-105`). So a request whose peer never answers, or whose socket closes mid-response, **hangs forever** — even after the OS eventually tears the socket down.

App impact (all paths await these calls without any timeout or `Promise.race`):
1. `listener/src/subscriber.js:247` `client.getAccessories()` — if it never settles, the session is left with `client` set, `stats.subscribed=false`, **no `reconnectTimeout`**, and nothing will ever call `connectAccessory` again for that device. The device is dead until restart.
2. `subscriber.js:468` / `:413` `subscribeCharacteristics()` — same outcome (the `.catch`/`scheduleReconnect` at `:474-481` never runs).
3. `subscriber.js:635` `repairClient.pairSetup(pin)` inside `attemptAutoRepair` — `session.repairing` was set `true` at `:608` and is only cleared in the `finally` at `:673`, which never runs. While `repairing` is true, `connectAccessory` (`:221-224`) and the reconnect timer callback (`:564-567`) both bail out. Device dead until restart.
4. `listener/src/repair-helpers.js:33` `client.pairSetup(pin)` via the nightly scheduler — `running` stays `true` forever (`repair-scheduler.js:90`, reset only in the `finally` at `:169`) and `scheduleNext` at `:68` is never reached, so **scheduled repair is dead for the life of the process** (every later trigger logs "already in progress, skipping").

Why it happens in practice: Wi-Fi accessories that reboot / drop power between TCP accept and HTTP response, half-open NAT state after a router reboot, accessories that accept the socket but stall under load. Linux TCP keepalive defaults to 2h idle before the first probe, and even when the socket finally closes the promise still never settles (point 2 above).

Self-healing today: only the repair scheduler's `isStale` path (`repair-scheduler.js:137-157`, stop+start creates a fresh session) — and the scheduler defaults to `enabled: false` (`index.js:180`). The Docker HEALTHCHECK does not restart containers under plain compose.

Fix direction (app side, no upstream change needed): wrap every HAP round-trip in a bounded race that closes the client on expiry, exactly as `setup-router.js:248-251` already does for discovery: `await withTimeout(client.getAccessories(), 30_000, () => client.close())`. Apply to `getAccessories`, `subscribeCharacteristics`, `getCharacteristics`, and `pairSetup` in subscriber.js, repair-helpers.js, setup-router.js and accessories-router.js. Alternatively patch-package `HttpConnection._open` to `socket.setTimeout(30_000)` and reject pending requests on `'close'`.

### H-2 — hap-controller encrypted-frame parser spins forever on a single undecryptable frame → 100% CPU, whole listener frozen (sibling of the dnssd readFQDN cycle bug) [VERIFIED]

`listener/node_modules/hap-controller/lib/transport/ip/http-connection.js:270-293` (`_requestEncrypted` → `bodyParser`):

```js
while (message.length >= 18) {
  const frameLength = message.readUInt16LE(0);
  if (message.length < frameLength + 18) return;
  ...
  try {
    const decryptedData = ...crypto_aead_chacha20poly1305_ietf_decrypt(...);
    message = message.slice(18 + frameLength, message.length);   // :285 — only advanced on success
    ++this.a2cCounter;
    parser.execute(decryptedData);
  }
  catch (e) {
    // pass                                                        // :289-291 — message NOT advanced
  }
}
```

If `decrypt` throws (libsodium throws on MAC failure), `message` is unchanged, the `while` condition is still true, `frameLength` is identical, and the loop re-runs the same failing decrypt **synchronously, forever**. Because this runs inside a socket `'data'` handler on the single event loop, the entire process stops: no API, no other devices, no DB writes, no timers. This is precisely the bug class fixed in `listener/patches/dnssd+0.4.1.patch` (unbounded loop on malformed wire input; that incident pegged CPU in production).

This parser is also installed on the **long-lived subscription socket** (`:298-302` re-arms `bodyParser` with `readEvents=true`), which is the connection most likely to see a2c-counter desync or a stray frame over months of uptime (accessory firmware reboot mid-stream, duplicate/retransmitted frames, a device that answers a stale session).

Self-healing today: none. The compose HEALTHCHECK will mark the container unhealthy but `restart: unless-stopped` does not act on health status; only a manual `docker restart` recovers.

Fix direction: patch-package `hap-controller` (the repo already ships the pattern) — in the `catch`, either `message = message.slice(18 + frameLength)` and continue, or better: destroy the socket and reject (a MAC failure means the session is unrecoverable anyway). Add a regression test mirroring `listener/test/dnssd-fqdn-cycle.test.js`.

---

## MEDIUM

### M-1 — Matter polling is permanently disabled after 10 consecutive errors; nothing ever re-enables it [VERIFIED]

`listener/src/matter-runtime.js:92-95` sets `session.pollingEnabled = false` after `MAX_CONSECUTIVE_ERRORS` (10). Every entry point then bails: `runPollCycle` `:212`, `startSubscription` `:229`, `scheduleSubscriptionRestart` `:194`. The only place `pollingEnabled` becomes `true` again is a brand-new session in `startNode` `:251`, and `syncPairings` `:296-303` deliberately keeps existing sessions (`existing.pairing = pairing`). No router endpoint re-enables it (grep `pollingEnabled` — 7 hits, all in matter-runtime.js).

Default mode is polling every 5s (`MATTER_SUBSCRIBE_ENABLED` defaults to `'false'` at `:6`, `POLL_INTERVAL_MS=5000` at `:5`). A device that is unreachable for roughly ten poll rounds — a reboot, a Wi-Fi blip, a sleepy/battery end device — is silently dropped **until the listener restarts or the pairing is deleted and re-added**. The June audit's M-5 fix (per-row insert isolation, `:145-152`, verified present) removed one trigger but left the permanent-disable behaviour itself.

Fix direction: replace the hard stop with backoff — keep polling but stretch the interval (e.g. `min(POLL_INTERVAL_MS * 2**(errors-10), 10min)`) or auto-re-enable after a cool-down; at minimum expose a re-enable in the store-refresh `syncPairings` pass.

### M-2 — Repair scheduler chain dies on the first rejected cycle (and on any disk-write failure) [VERIFIED]

`listener/src/repair-scheduler.js:64-69`:
```js
scheduledTimeout = setTimeout(async () => {
  scheduledTimeout = null;
  await runRepairCycle();          // unguarded
  const { hour } = getSettings();
  scheduleNext(hour);              // never reached if the await rejects
}, delayMs);
```
`runRepairCycle` rethrows anything from `saveSettings` (`:161-171`, the inner `finally` only resets `running`), and `saveSettings` is `repairStore.write(s)` (`index.js:345`) which rethrows on write failure (`store.js:69-71`: ENOSPC, EACCES, read-only bind mount, iCloud/NAS hiccup). One such failure at 03:00 → the rejection is logged by the global `unhandledRejection` handler (`index.js:54`) and **the nightly repair never runs again** for the life of the process; nothing in the UI reveals this (`lastRunAt` also failed to persist). Combined with H-1 point 4 (hang) this is the scheduler's second silent-death path.

Also `:92` `getRepairTargets()` and `:93` run before the `try`, so a throw there leaves `running=true` forever (pure in-memory today, so [suspected] only).

Fix direction: `try { await runRepairCycle(); } catch (err) { log.error(...) } finally { if (getSettings().enabled) scheduleNext(getSettings().hour); }`.

### M-3 — No SIGTERM/SIGINT handling: every `docker stop`/redeploy is an abrupt kill [VERIFIED absence]

`grep -rn "SIGTERM\|SIGINT" listener/src` → nothing; the only process handlers are `unhandledRejection`/`uncaughtException` at `index.js:54-61`. Node's default SIGTERM action terminates immediately, so each deploy/restart (this repo's beta sync recreates the stack nightly) does:
- `JsonObjectStore._doWrite` (`store.js:82-87`) interrupted between `writeFile(tempPath)` and `rename` leaves `pairings.json.tmp-<pid>-<ts>` files that accumulate in `/app/data` forever (nothing sweeps them).
- HAP subscription sockets are never closed; accessories keep the dead controller session until their own keepalive expires. The codebase already has a "max peers reached" terminal path (`subscriber.js:98-101`, `:509-513`) — rapid restart cycles against accessories with small session tables can trip it, and that path is **terminal** (no retry, `needsRepair=true`).
- The matter.js `CommissioningController` is never `close()`d; `pool.end()` never called (PG copes, but in-flight `insertEvent`s are dropped).

Fix direction: `process.once('SIGTERM'|'SIGINT')` → stop repair scheduler, `stopSubscriber` for every session, `matterRuntime.stopNode` all + controller close, `await pool.end()`, `process.exit(0)` with a 5–8s hard deadline (Docker's grace is 10s).

---

## LOW

### L-1 — `JsonObjectStore.refresh()` can regress the cache to pre-write content; a `modify()` in the following 30s persists stale data [suspected]
`store.js:31-54` is not serialized against `write()` (`_writeLock` at `:62-74` only orders writes). Sequence: `refresh()` passes the mtime check at `:36` and starts `readFile` (`:37`); a concurrent `_doWrite` renames the new file and sets `lastMtimeMs`/`cache` (`:87-102`); `readFile` (opened on the old inode) returns old JSON → `:40` `this.cache = old`, `:44` `lastMtimeMs = old`. The next 30s refresh self-corrects, but any `modify()`/`savePairingForRepair` (`discovery-helpers.js:186-190` is read-modify-write on `loadPairings()`) inside that window writes the stale snapshot back, losing e.g. fresh `longTermData` from an auto-repair. Window is milliseconds every 30s, so rare — but it is a silent pairing-loss path. Fix: run `refresh()` under the same `_writeLock`, or re-`stat` after `readFile` and discard if mtime moved.

### L-2 — `scheduleReconnect` never clears an already-pending timer [suspected, hardening]
`subscriber.js:562` overwrites `session.reconnectTimeout` without `clearTimeout`, and `attemptAutoRepair`'s `finally` (`:678`) does the same. I could not trace a guaranteed double-schedule at HEAD (hap-controller suppresses `event-disconnect` when nothing is subscribed, `http-client.js:484-487`), but any future path that calls `scheduleReconnect` twice produces two concurrent connect chains that close each other's healthy client (`:228-235`). One-line guard: `if (session.reconnectTimeout) clearTimeout(session.reconnectTimeout);`.

### L-3 — Disabling scheduled repair while a cycle is running does not stop it; re-enabling can double-schedule [VERIFIED, narrow window]
`index.js:627-630` calls `repairScheduler.stop()` then `start()`. During a running cycle `scheduledTimeout` is already `null` (`repair-scheduler.js:65`), so `stop()` is a no-op and the in-flight callback re-arms itself at `:68` regardless of `enabled`; `start()` arms a second timer. Result: a disabled scheduler that keeps running, or two timers firing at the same hour every night (the second is skipped by the `running` guard and re-arms again). Window = duration of a cycle (seconds to minutes, nightly). Same fix as M-2 (`if (getSettings().enabled)` before re-arm) plus a generation counter.

### L-4 — Alert delivery volume is O(events x matching rules) and failed targets are retried on every event [VERIFIED mechanism]
`alerts.js:219-231` computes suppression from `status='sent'` only, and `:243-252` writes a `'suppressed'` row **per event per rule**. A dead webhook host is therefore hit on every matching event with a 5s timeout (`:131`), each writing a `'failed'` row; a chatty sensor under an `all`-scoped rule writes one row per event forever. Growth is bounded only by the 90-day `ALERT_RETENTION_DAYS` sweep (`index.js:123`, `db.js:262-282`), and the suppression query stays indexed (`idx_alert_deliveries_rule_sent`, baseline `:105`), so this is DB bloat + outbound spam rather than a stall. Consider: suppress on last *attempt* (sent or failed) during quiet period, and don't persist `'suppressed'` rows (or coalesce them).

### L-5 — During a LAN outage every HomeKit device spawns its own 10s mDNS browser on every backoff round [suspected]
`subscriber.js:528-530` / `:438-440` call `session.discoverDevice` per device on any connection error; `discovery-helpers.js:136-184` creates a fresh `IPDiscovery` + dnssd `Browser` per call. With N devices offline, that is N concurrent mDNS browsers every `reconnectMaxMs` (60s) for the duration of the outage — a self-inflicted mDNS storm on exactly the network that is already unhappy, and N x 10s of extra latency before each reconnect. A shared, debounced scan (one browser, results fanned out) would fix it.

### L-6 — pg Pool is untuned; retention archive move is one transaction of unbounded size [suspected]
`db.js:13-15` uses defaults (`max:10`, no `connectionTimeoutMillis`, no `statement_timeout`). `runRetentionSweep` (`db.js:144-186`) moves *every* row older than the cutoff in a single `INSERT ... DELETE` transaction; after a retention reduction (365→30d) on a year-old RPi database this can hold locks and WAL for minutes while the 10-client pool queues `insertEvent`s behind it. Batching by `LIMIT`/id range with per-batch commits is the usual fix. (Correctness of the CTE itself is fine — see clean list.)

---

## VERIFIED-CLEAN (traced and confirmed intact at HEAD)

- **June M-4 (query-cache stampede / negative caching)** still present: sentinel at `query-cache.js:41-43`, in-flight dedup `:67-69`/`:73-88`; keys are bounded (`stats:*:{days}` with `parseIntInRange` caps at `stats-router.js:52,70,109,137,576`; fixed keys elsewhere) so the Map cannot grow unboundedly.
- **June M-5 (batch-loop isolation)** still present: per-rule try/catch `alerts.js:235-273`; per-row insert isolation `matter-runtime.js:145-152`.
- **subscriber-repair-loop fix (May, `4653afa` regression)** intact: `succeeded` flag `subscriber.js:615`, set at `:664`, gating the 60s retry at `:676`; regression tests still in suite (730/730 green).
- **dnssd readFQDN cycle guard** intact: `listener/patches/dnssd+0.4.1.patch` (128-iteration budget + visited set), applied by `postinstall: patch-package` (`package.json:15`), `patch-package` kept in prod deps, regression test `test/dnssd-fqdn-cycle.test.js` present.
- **Per-request `HttpClient` instances in routers do not leak sockets**: hap-controller `usePersistentConnections` resolves to `false` by default (`http-client.js:63`), so `closeMaybePersistentConnection` (`:99-103`) closes after every request; the missing `client.close()` in `accessories-router.js:71-72,264-265` and `setup-router.js:168-169` is harmless.
- **Subscriber cleanup**: `stopSubscriber` (`subscriber.js:186-217`) clears reconnect timer, detaches both handlers before `close()` (so hap-controller's `event-disconnect` on close cannot re-enter), prunes `valueCache`, `delayedOffTimers`, metadata, stats, session. `connectAccessory` closes any previous client before creating a new one (`:228-235`). Per-device maps are all pruned on stop — no per-device growth.
- **Matter runtime cleanup**: `stopNode` (`matter-runtime.js:158-181`) clears both timers, stops the subscription, prunes `valueCache`; `valueCache` additionally capped at 10k with active-session-aware pruning (`:27-47`). `subscribe()` returns a `stop()` that detaches both matter.js listeners (`matter-controller.js:397-404`).
- **All `setInterval`/`void` call sites are error-isolated** except the repair scheduler (M-2): store refresh `index.js:257-288` (every branch `.catch`/try), discovery `discovery-helpers.js:129-134`, retention `index.js:376-437` (five independent try/catch blocks), matter poll/subscribe (`matter-runtime.js:211-244`), alerts via `processAlertsSafe` (`subscriber.js:108-118`), firmware inserts `:273-278`.
- **pg client checkout**: every `pool.connect()` in `db.js` (`:144,198,223,246,267`) has `BEGIN`/`COMMIT`/`ROLLBACK` and `client.release()` in `finally`. Route handlers use `pool.query` (auto-release). `pool.on('error')` registered (`:17-19`).
- **Retention CTE correctness**: `ON CONFLICT (source_id) DO NOTHING` + `DELETE ... USING moved` (`db.js:149-167`) can only strand rows if `source_id` collides; `event_logs_archive.source_id` is UNIQUE (baseline `:77-78`) and `DELETE /api/data/all` uses plain `DELETE` (`archive-router.js:155`), never `TRUNCATE ... RESTART IDENTITY`, so ids are monotonic and no collision path exists. Cutoff is `NOW() - N days` in PG time (no JS timezone arithmetic).
- **Migration 0008** (`migrations/0008_alert_rules_owner.sql`): `ADD COLUMN IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`, backfill `WHERE user_id IS NULL` — idempotent and additive; runs inside node-pg-migrate `singleTransaction` (`db.js:124-131`); no `CONCURRENTLY` anywhere in `migrations/`; `users` exists since 0003. FK `ON DELETE CASCADE` chains safely: `alert_deliveries.rule_id → alert_rules ON DELETE CASCADE` (baseline `:66`), so deleting a user cannot raise an FK violation. Runner's fake-baseline branch (`db.js:108-121`) only fires when `event_logs` exists and `pgmigrations` lacks `0001_baseline`.
- **Auth/session tables bounded**: `runSessionRetentionSweep`, `runInviteTokenSweep`, `runPasswordResetTokenSweep` (`db.js:197-260`) are all wired into the daily sweep (`index.js:408-436`).
- **emails.js**: non-pooled nodemailer transport (no `pool:true`), so no connection to leak on `initEmail` re-init (`emails.js:148-182`); `verify()` bounded by `connectionTimeout/greetingTimeout` 10s (`:169-171`); all sends throw cleanly when unconfigured and are caught by callers (`alerts.js:174-196`).
- **logger.js**: pure level gate over `console`; no buffering, no growth.
- **Process handlers**: `unhandledRejection` logs-and-continues, `uncaughtException` exits for Docker restart (`index.js:52-61`) — appropriate for a subscription daemon.
- **Reconnect backoff** is bounded (`subscriber.js:555-580`: doubling, capped at `reconnectMaxMs`, reset on success at `:469`; env-parsed with NaN guards `:31-34`); auto-repair circuit breaker bounded at 3 (`:594-597`, `:668-671`); Matter subscribe backoff capped at 5 min (`matter-runtime.js:191-209`).
- **Clock/timezone**: all DB cutoffs use PG `NOW()`; `msUntilHour` (`repair-scheduler.js:17-23`) uses container-local time with a next-day rollover guard — behaves correctly across DST (worst case one run shifted by an hour).

## Informational (not reliability defects)
- Matter events never reach the alert processor: `matter-runtime` receives the raw `insertEvent` (`index.js:249-252`) and never calls `processAlertsForEvent`; HomeKit events do (`subscriber.js:389-390`). Functional gap, not a runtime bug.
- `/api/health` reports `subscribersOk` when *any* device is live (`health-router.js:41`), so a single stranded device (H-1) or disabled Matter node (M-1) is invisible to the healthcheck by design.
- Post-audit delta (`89154e9..HEAD`, 27 files) is dominated by Phase 26 alert ownership, email templates, invite-status and tests; none of the delta introduced new timers, pools, or caches. The runtime findings above all predate the June audit.
