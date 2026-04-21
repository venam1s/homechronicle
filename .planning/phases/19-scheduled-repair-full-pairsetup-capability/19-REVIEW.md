---
phase: 19-scheduled-repair-full-pairsetup-capability
reviewed: 2026-04-21T00:00:00Z
depth: standard
files_reviewed: 5
files_reviewed_list:
  - listener/src/repair-helpers.js
  - listener/src/repair-scheduler.js
  - listener/src/index.js
  - listener/test/repair-helpers.test.js
  - listener/test/repair-scheduler.test.js
findings:
  critical: 0
  warning: 0
  info: 4
  total: 4
status: clean
---

# Phase 19: Code Review Report

**Reviewed:** 2026-04-21
**Depth:** standard
**Files Reviewed:** 5 (3 source + 2 test)
**Status:** clean

## Summary

Phase 19 extends the scheduled repair cycle with a full `pairSetup()` capability for devices in the `needsRepair` state that have a stored PIN. The implementation is clean, narrowly scoped, and well-tested (320/320 pass).

**Key security checks — all clear:**

- **No PIN leakage.** Grep of `repair-helpers.js` and `repair-scheduler.js` confirms the PIN is never interpolated into any log string. The only log lines that mention the PIN at all are the no-PIN *absence* warning (`'no stored PIN, skipping ...'`) at `repair-scheduler.js:110` and the JSDoc param doc comment — neither emits the value.
- **Dependency injection is clean.** `repair-helpers.js` has no `hap-controller` import; `HttpClient`, `loadPairings`, and `savePairings` are all injected, giving tests full control and keeping the helper side-effect-free beyond its declared collaborators.
- **Error propagation is correct.** `performPairSetupAndPersist` wraps `pairSetup()` in try/finally that unconditionally calls `client.close?.()` (swallowing close errors, matching `subscriber.js:609-611`); pairSetup and savePairings failures both propagate out unmodified. The scheduler catches the rejection, increments `failed`, logs a warn with the device name, and deliberately skips `resetSubscriberStats`/`stopSubscriber`/`startSubscriber` — so `needsRepair` stays true and the subscriber is not disturbed on failure (REPAIR-06 success case).
- **Invariants preserved.** `git diff 5d84345..HEAD -- listener/src/setup-router.js listener/src/subscriber.js` is empty — the manual Repair All contract and the subscriber auto-repair path are byte-identical to pre-phase-19 behavior.
- **STRIDE mitigations landed.** T-19-01 through T-19-05 from the PLAN all verified in code:
  - T-19-01 (Information Disclosure): No PIN in any log line.
  - T-19-02 (Tampering): Save path uses existing `savePairings` (with longTermData preservation guard at `setup-helpers.js:120-127`).
  - T-19-03 (DoS): `running` guard at `repair-scheduler.js:86-89` unchanged; per-device failures caught, loop continues.
  - T-19-04 (Spoofing): Uses hap-controller's `pairSetup()` primitive identically to the manual path.
  - T-19-05 (Elevation): Helper has no I/O of its own; all access via injected deps.

**Style compliance with CLAUDE.md:** ES modules, 2-space indent, single quotes, semicolons, `[tag]` log prefix, JSDoc on exported function. No Co-Authored-By trailers in commits (`8ad609b`, `2e915f2`, `64cf6b2`, `107c008`, `da713f4`).

No Critical, Warning, or behavior-impacting issues found. The four Info items below are minor observations — none require changes.

## Info

### IN-01: Unused injected dep `savePairing` in `createRepairScheduler`

**File:** `listener/src/repair-scheduler.js:49` and `listener/src/index.js` (scheduler construction site)
**Issue:** The `savePairing` dependency is still destructured in the factory signature but is no longer used anywhere in `runRepairCycle()`. The pre-phase-19 `needsRepair` branch called it; the new branch routes through `performPairSetupAndPersist` instead. The `isStale` branch never used it. This is dead injection surface.
**Fix (optional):** Either remove `savePairing` from the destructured deps (and from its injection in `index.js`), or keep it with a JSDoc note explaining it's retained for backward-compat / test stability. PLAN task 2, action step 1, explicitly chose the latter to "avoid churn in index.js and tests," so leaving as-is is acceptable. If cleanup is desired in a follow-up phase:
```js
// In createRepairScheduler destructuring at listener/src/repair-scheduler.js:44
export function createRepairScheduler({
  getSettings,
  saveSettings,
  getRepairTargets,
  discoverDevice,
  // savePairing, ← remove
  stopSubscriber,
  // ...
});
```
And drop the `savePairing:` key from the `createRepairScheduler({ ... })` call in `index.js`.

### IN-02: Scheduler discards helper's return value and re-reads pairings

**File:** `listener/src/repair-scheduler.js:119-122`
**Issue:** `performPairSetupAndPersist` returns `{ longTermData, pairing }`, but the scheduler ignores it and re-reads via `loadPairings()` on the next line. This is an intentional choice (per PLAN: "re-load from `loadPairings()` — be consistent with the Phase 18 pattern that re-loads from `loadPairings()`") and matches the `isStale` branch. It does cost one extra store snapshot read per re-paired device.
**Fix (optional):** Reuse the returned pairing to avoid the second read:
```js
const { pairing: updatedPairing } = await performPairSetupAndPersist(
  target.deviceId, pairing.pin, discovered.address, discovered.port,
);
resetSubscriberStats(target.deviceId);
stopSubscriber(target.deviceId);
startSubscriber(target.deviceId, updatedPairing, loadRooms(), getPairingForLookup);
```
No functional difference for correctness; the current code is consistent with the Phase 18 precedent and should only be changed if a broader refactor aligns both branches.

### IN-03: Two distinct `loadPairings` readers wired into scheduler vs helper

**File:** `listener/src/index.js:286` vs `listener/src/index.js:292`
**Issue:** The scheduler's injected `loadPairings` is `() => pairingsStore.getSnapshot()` (raw snapshot), while the `performPairSetupAndPersist` closure passes the `loadPairings` from `createStoreHelpers` (which returns `normalizePairingsMap(pairingsStore.getSnapshot())`). For HomeKit pairings (the only relevant path for scheduled repair), the normalization is a no-op on keys — both readers yield the same mapping for `pairings[deviceId]`. However the asymmetry is surprising. Not a bug; the `savePairings` guard at `setup-helpers.js:120-127` ensures no data loss even if a mismatch leaked through.
**Fix (optional):** For consistency, pass the helper-suite `loadPairings` to the scheduler too:
```js
// listener/src/index.js:286
loadPairings,  // instead of () => pairingsStore.getSnapshot()
```
Deferrable until a pattern-consistency cleanup phase.

### IN-04: Falsy PIN check accepts empty string and non-string values uniformly

**File:** `listener/src/repair-scheduler.js:109`
**Issue:** `if (!pairing || !pairing.pin)` treats `''`, `null`, `undefined`, and `0` identically as "no PIN." The manual endpoint uses `overridePin?.trim() || pairing.pin` at `setup-router.js:236`, which would also reject empty strings. A stored PIN of `'   '` (all whitespace) would pass this gate and fail cryptically inside `pairSetup()`, whereas the manual path's `.trim()` normalizes it. In practice pairings are written only via setup/repair flows, so whitespace-only PINs should not occur.
**Fix (optional):** Mirror the manual path more closely:
```js
const storedPin = typeof pairing.pin === 'string' ? pairing.pin.trim() : '';
if (!storedPin) {
  log.warn(`[repair] ${target.pairingName}: no stored PIN, skipping — run manual Repair to restore`);
  skipped++;
  continue;
}
// ...pass storedPin downstream
await performPairSetupAndPersist(target.deviceId, storedPin, discovered.address, discovered.port);
```
Low impact; safe to defer.

---

_Reviewed: 2026-04-21_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
