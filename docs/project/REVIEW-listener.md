---
reviewed: 2026-04-11T12:00:00Z
depth: deep
files_reviewed: 20
files_reviewed_list:
  - listener/src/index.js
  - listener/src/subscriber.js
  - listener/src/db.js
  - listener/src/store.js
  - listener/src/events-router.js
  - listener/src/alerts-router.js
  - listener/src/alerts.js
  - listener/src/security.js
  - listener/src/matter-runtime.js
  - listener/src/matter-controller.js
  - listener/src/accessories-router.js
  - listener/src/setup-router.js
  - listener/src/retention-router.js
  - listener/src/stats-router.js
  - listener/src/health-router.js
  - listener/src/archive-router.js
  - listener/src/setup-helpers.js
  - listener/src/discovery-helpers.js
  - listener/src/utils.js
  - listener/src/logger.js
  - listener/src/query-cache.js
  - listener/src/accessory-metadata.js
findings:
  critical: 2
  warning: 8
  info: 5
  total: 15
status: issues_found
---

# Listener Code Review Report

**Reviewed:** 2026-04-11
**Depth:** deep (cross-file analysis)
**Files Reviewed:** 20+
**Status:** issues_found

## Summary

The listener codebase is well-structured after the recent refactor. Router extraction, factory patterns, and dependency injection are applied consistently. SQL queries use parameterized values throughout, and the security module has solid SSRF protection with DNS rebinding prevention. Error handling is generally thorough with try/catch in route handlers and proper error propagation.

Key concerns center around: (1) a race condition in store.js refresh during concurrent writes, (2) a potential resource leak in subscriber.js reconnect logic, and (3) several logic edge cases in event processing and query building.

## Critical Issues

### CR-01: Race condition in store.js — refresh() can overwrite in-flight write()

**File:** `listener/src/store.js:31-48`
**Issue:** The `refresh()` method reads the file and updates `this.cache` without any coordination with the `_writeLock`. If a `refresh()` runs concurrently with a `write()` (which happens every 30 seconds via the setInterval in index.js), the following sequence is possible:

1. `write(newData)` acquires the lock, starts `_doWrite(newData)`
2. `refresh()` reads the OLD file content (before rename completes)
3. `_doWrite` completes: renames temp file, sets `this.cache = newData`
4. `refresh()` completes: overwrites `this.cache` with stale data

The next `getSnapshot()` call returns stale data, and any subsequent `modify()` call will lose the write from step 1.

**Fix:** Have `refresh()` respect the write lock, or compare mtimeMs before overwriting the cache:
```javascript
async refresh() {
  try {
    const meta = await stat(this.filePath);
    // Skip if file hasn't changed since our last write/read
    if (meta.mtimeMs <= this.lastMtimeMs) return this.getSnapshot();
    const raw = await readFile(this.filePath, 'utf8');
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      this.cache = parsed;
    } else {
      this.cache = clone(this.defaultValue);
    }
    this.lastMtimeMs = meta.mtimeMs;
    return this.getSnapshot();
  } catch (err) {
    log.debug('[store] read error, using default:', err.message);
    // Don't reset cache on read error if we have valid data
    if (this.lastMtimeMs === 0) {
      this.cache = clone(this.defaultValue);
    }
    return this.getSnapshot();
  }
}
```

### CR-02: Subscriber reconnect can leak old client connections

**File:** `listener/src/subscriber.js:210-213`
**Issue:** In `connectAccessory()`, when the function is called (either directly or via reconnect), it creates a new `HttpClient` and assigns it to `session.client` at line 224. However, if the previous client's `getAccessories()` promise is still pending (e.g., slow network), the old client is never closed. The old client's event handlers remain registered and could fire after the new client is established, causing duplicate event processing.

The `stopSubscriber()` function correctly cleans up, but `connectAccessory()` does not call it -- it only replaces `session.client` without closing the old one. The `scheduleReconnect` path and `attemptAutoRepair` path both call `connectAccessoryImpl` directly.

**Fix:** Close the previous client before creating a new one in `connectAccessory()`:
```javascript
function connectAccessory(session, pairing) {
  if (session.stopped) return;
  if (session.repairing) { /* ... */ return; }

  // Close any existing client to prevent duplicate event handlers
  if (session.client) {
    if (session.eventHandler) session.client.off('event', session.eventHandler);
    if (session.disconnectHandler) session.client.off('event-disconnect', session.disconnectHandler);
    try { session.client.close?.(); } catch (e) { /* ignore */ }
    session.client = null;
    session.eventHandler = null;
    session.disconnectHandler = null;
  }

  const { deviceId, rooms, getPairing, stats } = session;
  // ... rest of function
}
```

## Warnings

### WR-01: parentBridgeId() returns the full ID for non-bridge accessories

**File:** `listener/src/utils.js:7-9`
**Issue:** The function splits on `:` and checks `parts.length > 6`. HomeKit device IDs are MAC-like strings (e.g., `AA:BB:CC:DD:EE:FF`) which split into exactly 6 parts. A bridge child ID like `AA:BB:CC:DD:EE:FF:2` splits into 7 parts. However, Matter device IDs (numeric strings like `1234567890`) contain no colons and split into 1 part, so `parentBridgeId("1234567890:1")` returns `"1234567890:1"` unchanged instead of `"1234567890"`. This means Matter bridge children won't have room lookups fall through to the parent node correctly.

**Fix:**
```javascript
export function parentBridgeId(id) {
  const str = String(id ?? '');
  // Matter IDs: "nodeId:endpointId" — split on last colon
  // HomeKit IDs: "AA:BB:CC:DD:EE:FF:aid" — rejoin first 6 parts
  const parts = str.split(':');
  if (parts.length > 6) return parts.slice(0, 6).join(':');
  if (parts.length === 2 && /^\d+$/.test(parts[0])) return parts[0];
  return str;
}
```

### WR-02: events-router /events/jump missing accessory filter in count query

**File:** `listener/src/events-router.js:129-143`
**Issue:** The count query that determines `page` position counts all events newer than the matched event, but does not filter by `accessory` name. The match query finds the most recent event for a specific accessory at a specific hour, but the count of "newer" rows includes ALL accessories. This means the calculated page number will be wrong when the accessory filter is also applied on the main /events endpoint.

**Fix:** Add accessory filter to the count query:
```javascript
const countConditions = [
  '(timestamp > $1 OR (timestamp = $1 AND id > $2))',
];
// Add accessory filter to match the /events endpoint filtering
countParams.push(`%${accessory}%`);
countConditions.push(`accessory_name ILIKE $${countParams.length}`);
```

### WR-03: query-cache stale-while-revalidate can serve indefinitely stale data

**File:** `listener/src/query-cache.js:29-39`
**Issue:** If the background refresh keeps failing (e.g., database is temporarily down), the `refreshing` flag is set back to `false` on error, but the stale data continues to be served on every subsequent call. There is no upper bound on staleness -- data can be served hours or days after it expired. For the anomaly detection and stats endpoints, this could mask genuine issues.

**Fix:** Add a maximum staleness threshold:
```javascript
const MAX_STALE_MS = 5 * 60_000; // 5 minutes max staleness

if (entry && !entry.refreshing) {
  const staleness = now - entry.expiresAt;
  if (staleness > MAX_STALE_MS) {
    // Too stale -- force synchronous refresh
    const value = await queryFn();
    store.set(key, { value, expiresAt: Date.now() + ttlMs, refreshing: false });
    return value;
  }
  // Normal stale-while-revalidate path
  entry.refreshing = true;
  // ...
}
```

### WR-04: accessories-router sequential await in request handler

**File:** `listener/src/accessories-router.js:254-264`
**Issue:** The on-demand metadata fetch loop iterates over all pairings with `category === 2` and issues sequential `await client.getAccessories()` calls inside the request handler. If there are multiple bridges, this blocks the GET /api/accessories response for the sum of all HAP query times (each potentially 5-10 seconds). This can easily exceed client timeouts and blocks the event loop for other requests.

**Fix:** Run metadata fetches in parallel with a concurrency limit, or move this to a background task:
```javascript
const bridgesToFetch = Object.entries(currentPairings)
  .filter(([id, p]) => p.category === 2 && !cachedBridgeIds.has(id) && isHomeKitPairing(p));

// Fire all fetches in parallel (they each have their own timeout)
await Promise.allSettled(bridgesToFetch.map(async ([id, p]) => {
  try {
    const client = new HttpClient(id, p.address, p.port, p.longTermData);
    const accessories = await client.getAccessories();
    cacheAccessoryMetadata({ deviceId: id, pairingName: p.name, accessories });
  } catch (err) {
    log.debug(`[api] on-demand metadata fetch failed for ${p.name ?? id}: ${err.message}`);
  }
}));
```

### WR-05: matter-controller poll() does not await node.connect()

**File:** `listener/src/matter-controller.js:273-275`
**Issue:** `node.connect()` is called without `await`. Looking at the matter.js API, `connect()` returns void but initiates an async connection process. The code immediately checks `node.initialized` and awaits `initializedFromRemote`, but if the connection hasn't started yet, this could hang indefinitely or miss the initialization event.

The same pattern appears in `subscribe()` at lines 335-336.

**Fix:**
```javascript
if (!node.isConnected) {
  await node.connect();
}
```
Or if `connect()` is intentionally fire-and-forget, rely solely on the `initializedFromRemote` event with a timeout to prevent indefinite hangs.

### WR-06: archive-router DELETE /data/accessory is not transactional

**File:** `listener/src/archive-router.js:126-148`
**Issue:** The delete operation runs the SQL DELETE, then sequentially deletes from rooms, display-names, and notes stores. If the SQL delete succeeds but a store write fails (e.g., disk full), the data is in an inconsistent state: events are deleted but the room/name/note entries remain as orphans. More critically, if the SQL delete fails but rooms/names/notes have already been updated (though the current ordering prevents this specific case), the inverse inconsistency occurs.

Additionally, `DELETE /data/all` at line 150 has the same issue: if `saveRooms({})` succeeds but `saveDisplayNames({})` fails, rooms are wiped but display names are preserved.

**Fix:** Wrap the JSON store updates in a try/catch that logs but doesn't fail the response, or perform them before the SQL delete so they can be rolled back:
```javascript
try {
  const result = await pool.query('DELETE FROM event_logs WHERE accessory_id = $1', [accessoryId]);
  // Best-effort cleanup of JSON stores
  try {
    const rooms = loadRooms();
    delete rooms[accessoryId];
    await saveRooms(rooms);
  } catch (err) { log.warn('[data] Failed to clean room for', accessoryId, err.message); }
  // ... same for display names, notes
}
```

### WR-07: subscriber.js attemptAutoRepair does not close the repair client

**File:** `listener/src/subscriber.js:592-593`
**Issue:** In `attemptAutoRepair()`, a new `HttpClient` is created at line 592 for pair-setup. After `pairSetup()` completes (or fails), this client is never explicitly closed. The `getLongTermData()` call extracts the keys, but the underlying TCP connection may remain open until garbage collected.

**Fix:**
```javascript
const client = new HttpClient(session.deviceId, discovered.address, discovered.port);
try {
  await client.pairSetup(pairing.pin);
  const longTermData = client.getLongTermData();
  // ... save and reconnect
} finally {
  try { client.close?.(); } catch (e) { /* ignore */ }
}
```

### WR-08: discovery-helpers.js runDiscoveryScan leaks IPDiscovery on rejection

**File:** `listener/src/discovery-helpers.js:60-63`
**Issue:** If `new IPDiscovery(discoverIface)` succeeds but `discovery.start()` throws (line 73-75), the `fail()` function at line 49 calls `discovery?.stop?.()`. However, if the error event fires and `fail()` is called, but then `discovery.start()` also throws synchronously (double-fault), the Promise rejects twice -- once via `fail()` and once via the `return fail(err)` at line 74. The second rejection is swallowed because `settled` is checked, but the `return reject(err)` at line 62 bypasses the `settled` guard entirely.

Actually, line 62 returns `reject(err)` directly without setting `settled = true`, so if `IPDiscovery` constructor fails, it correctly rejects. But if `discovery.start()` at line 73 throws synchronously AND the error event fires before the catch, both `fail(err)` at line 74 and the error handler at line 69 could race.

**Fix:** The `fail()` function has a `settled` guard, so the double-call is safe. However, the `return reject(err)` at line 62 should use `return fail(err)` for consistency:
```javascript
try {
  discovery = new IPDiscovery(discoverIface);
} catch (err) {
  return fail(err);  // instead of reject(err)
}
```

## Info

### IN-01: setInterval timers are never cleared on shutdown

**File:** `listener/src/index.js:187-219, 291-293, 336-339`
**Issue:** The store refresh interval (line 187), discovery scan interval (line 291), and retention sweep interval (line 336) are never assigned to variables and thus can never be cleared. On a clean shutdown or in tests, these timers keep the process alive. Since this is a Docker service that relies on SIGTERM for shutdown, the timers will be killed by the process exit handler anyway, but it prevents clean shutdown in development.

**Fix:** Store interval IDs and clear them in a shutdown handler.

### IN-02: Unused import in events-router.js

**File:** `listener/src/events-router.js:5`
**Issue:** `parentBridgeId` is imported but only used for room name resolution in the events list. This is correct usage, but worth noting that the events/jump endpoint does not apply room overrides, creating an inconsistency where events on the main list show the room from rooms.json but the jump target does not account for room overrides in its page calculation.

### IN-03: ALERTS_ENABLED default is false but parsed with negated regex

**File:** `listener/src/index.js:82`
**Issue:** `ALERTS_ENABLED` uses `!/^(0|false|no|off)$/i.test(...)` with a default of `'false'`. This means the default evaluates to `!(true) = false`, which is correct but confusing. The double-negation pattern makes it easy to introduce bugs when changing defaults. Other boolean env vars like `API_TOKEN_READS_ENABLED` use the positive pattern `^(1|true|yes|on)$` which is clearer.

### IN-04: Hardcoded 10-second discovery timeout in discovery helpers

**File:** `listener/src/discovery-helpers.js:78, 182`
**Issue:** Both `runDiscoveryScan` (line 78) and `discoverDeviceForRepair` (line 182) use hardcoded 10-second timeouts. These are not configurable via environment variables, unlike most other timeouts in the codebase.

### IN-05: CSV export missing BOM for Excel compatibility

**File:** `listener/src/archive-router.js:83-85`
**Issue:** The CSV export does not include a UTF-8 BOM (`\xEF\xBB\xBF`) at the start of the response. Some spreadsheet applications (particularly Microsoft Excel on Windows) may not correctly detect UTF-8 encoding without the BOM, potentially corrupting accented characters in accessory names.

**Fix:** Add `res.write('\xEF\xBB\xBF');` before the header row.

---

_Reviewed: 2026-04-11_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: deep_
