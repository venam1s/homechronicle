---
status: resolved
trigger: "Settings > Advanced: deleting per-device history misbehaves. Symptoms: (1) while deleting device history entries, the list of devices appears to GROW instead of shrink; (2) sometimes clicking an accessory to delete its history does not show the delete option, and the accessory then re-appears in the list showing the confirm-deletion state. User follow-up: this is for production."
created: 2026-09-01
updated: 2026-09-01
---

## Symptoms

DATA_START
- expected: In Settings > Advanced (Danger Zone), clicking a device in the delete-history list offers a delete/confirm option; after confirming, that device's history is deleted and the device disappears from (or at least does not multiply in) the list.
- actual: While deleting, the list of devices appears to GROW. Sometimes clicking an accessory shows no delete option at all, then the same accessory re-appears in the list already showing the confirm-deletion state.
- errors: None reported by the user; browser console/network not yet inspected.
- timeline: Unknown when it started. Observed on PRODUCTION (self-hosted Docker deploy via Dockhand; prod runs the v0.3.x release line — verify which image/tag prod is actually running before assuming main's code is what's deployed).
- reproduction: Production web UI → Settings → Advanced → delete history for devices → click an accessory → (sometimes) no delete option; keep deleting → list grows; accessory re-appears with confirm state.
DATA_END

## Environment notes

- Bug reported against PRODUCTION, which runs a tagged v0.3.x image — the deployed code may differ from main (main has unpushed/unreleased work). Identify the component in current source, but sanity-check the same code exists in the deployed release line.
- Web UI polls via TanStack Query (10s default staleTime + refetchInterval). Accessories list on prod is also affected by background HAP warm-up (v0.3.4) — accessories may stream in over time, which could explain a "growing" list interacting badly with per-row confirm state.
- Initial hypotheses (unverified): confirm-state keyed by array index instead of accessory id; refetch reordering/appending rows so index-keyed confirm state points at the wrong row; deletion mutation not invalidating/settling before refetch.

## Current Focus

hypothesis: (REVISED after advisor review) Two independent, code-confirmed defects in web/src/components/setup/AdminAdvancedSection.jsx's "Delete accessory data" list jointly produce the reported symptoms: (1) GET /api/accessories never actually removes a deleted accessory from its response — after DELETE /api/data/accessory wipes its event_logs rows, the accessory_id reappears on the very next poll via the `neverSeen` branch (if still paired) or the `discovered` branch (if a bridge child, renamed with a " · serviceType" suffix), with event_count:0 — so the Danger Zone list never shrinks and deleted devices visibly "come back", explaining "list grows instead of shrinks" / "accessory re-appears in the list"; (2) deleteAccessoryMutation.mutate() is called with only an onSuccess handler (no onError), unlike the sibling deletePairingMutation/deleteMatterPairingMutation calls in the same file which both clear confirm state on error — so a failed delete (rate limit, session expiry, transient 500) leaves confirmDeleteAccessory permanently stuck on that id, and because confirm state is a single global value (not per-row), the next re-render of that reappeared row shows it still in the confirm-deletion state, explaining "clicking an accessory does not show the delete option... then reappears already confirming". A third, separately-confirmed defect (duplicate (accessory_id, service_type) rows from firmware-change events sharing an accessory_id with normal events — see Eliminated) is a real but secondary/cosmetic contributor, not the primary explanation for growth during deletion.
test: Confirmed via static code trace of accessories-router.js (resurrection paths) and AdminAdvancedSection.jsx (onSuccess/onError asymmetry vs sibling mutations). Could not run the DB query `SELECT accessory_id, COUNT(DISTINCT service_type)... HAVING COUNT(DISTINCT service_type) > 1` to size the third (cosmetic) defect — no local/prod Postgres reachable from this environment (Docker daemon not running locally). Proceeding without it per advisor guidance: mechanisms 1 and 2 are the primary fix regardless of that query's result.
expecting: N/A — root cause confirmed via code trace.
next_action: fix implemented and self-verified (3 new tests + full suite green, 740/740). Awaiting human confirmation against production/staging before archiving — see CHECKPOINT REACHED below for how to check.
reasoning_checkpoint:
  hypothesis: "AdminAdvancedSection.jsx's delete-history list fails to shrink after deletion because GET /api/accessories re-adds deleted accessory_ids via its neverSeen/discovered fallback branches (event_count:0), and deleteAccessoryMutation.mutate() has no onError handler so a failed delete leaves confirmDeleteAccessory stuck on that id, causing the reappeared row to render already in confirm state."
  confirming_evidence:
    - "accessories-router.js: seenIds is built only from dbRows (event_logs-backed rows); neverSeen/discovered are explicitly the complement (!seenIds.has(id)) — a deleted accessory that is still in pairings.json or in the HAP metadata cache is unconditionally re-included there with event_count:0 on the very next request."
    - "AdminAdvancedSection.jsx line 399-406: deleteAccessoryMutation.mutate(acc.accessory_id, { onSuccess: ... }) has no onError key, while the two sibling delete calls in the same file (lines 216-219, 258-267) both pass onError that clears their respective confirm state — a direct, provable asymmetry within one file."
  falsification_test: "If a manual delete against a dev/staging instance shows the deleted accessory_id fully absent from the next GET /api/accessories response (not present in dbRows, neverSeen, or discovered), mechanism 1 is false and the resurrection theory must be dropped. If deliberately failing the DELETE request (e.g. stop the listener mid-request) does not leave the row stuck in confirm state on next render, mechanism 2 is false."
  fix_rationale: "Both fixes target the actual code paths identified, not the symptom: (a) restores the missing error handler so failure state cannot strand the UI, matching the pattern already established for the two sibling mutations in the same file; (b) scopes the 'Delete accessory data' list to its own stated purpose (accessories with stored history to delete) so a 0-event resurrection no longer counts as a list entry, without touching the shared /api/accessories endpoint that other consumers (MyDevicesTab) rely on for showing all paired devices regardless of event history."
  blind_spots: "Could not verify against a live/production database or by manually driving the UI (no reachable Postgres or running app in this environment) — the fix is verified via code trace and the project's existing component test suite (AdminAdvancedSection.test.jsx), not via an actual browser reproduction of the original bug. The separately-confirmed duplicate-(accessory_id,service_type)-row defect's real-world prevalence in the current production dataset is unverified (SQL check not run); fix (c) is applied defensively based on code-level certainty that the condition CAN occur, not on confirmed DB evidence that it currently does."

## Evidence

- timestamp: 2026-09-01T00:00:00Z
  checked: web/src/components/setup/AdminAdvancedSection.jsx (Delete accessory data list, lines 366-432)
  found: visibleDangerAccessories.map(...) renders one row per array entry with key={acc.accessory_id}; confirmDeleteAccessory state is a bare accessory_id value (not row-identity-scoped)
  implication: if two array entries share the same accessory_id, both render with duplicate React keys and both react identically to confirmDeleteAccessory matching that id

- timestamp: 2026-09-01T00:00:05Z
  checked: listener/src/accessories-router.js GET /accessories (lines 105-136)
  found: "latest" CTE uses `SELECT DISTINCT ON (accessory_id, service_type) ... ORDER BY accessory_id, service_type, timestamp DESC, id DESC`; "counts" CTE groups by (accessory_id, service_type) too; final result is one row per (accessory_id, service_type) pair, not per accessory_id
  implication: an accessory_id with N distinct service_type values in event_logs produces N rows in the API response, all sharing the same accessory_id

- timestamp: 2026-09-01T00:00:10Z
  checked: listener/src/subscriber.js detectFirmwareChanges() (lines 79-100) and handleEvent() (lines 333-380)
  found: handleEvent() inserts normal characteristic-change events with `serviceType: meta.serviceType` (e.g. 'Lightbulb') keyed by effectiveId `${deviceId}:${aid}`. detectFirmwareChanges(), called after cacheAccessoryMetadata() refresh (line ~296-310), inserts a SEPARATE event with `serviceType: 'AccessoryInformation'` for the SAME effectiveId when firmware_revision changes.
  implication: a real accessory_id can and does accumulate 2 distinct service_type values ('AccessoryInformation' + its normal service) in event_logs whenever its firmware version has ever changed — directly triggering the duplicate-row condition in the /accessories query

- timestamp: 2026-09-01T00:00:15Z
  checked: listener/src/archive-router.js DELETE /data/accessory (lines 127-148)
  found: `DELETE FROM event_logs WHERE accessory_id = $1` — deletes ALL rows for that accessory_id regardless of service_type
  implication: the deletion unit (and thus the correct list-row unit for this UI) is accessory_id alone, not (accessory_id, service_type); the API/UI showing 2 rows for 1 deletable unit is itself the bug, independent of the React key issue

- timestamp: 2026-09-01T00:00:20Z
  checked: web/src/components/setup/MyDevicesTab.jsx (grep for accessory_id / dbAccessories usage)
  found: MyDevicesTab does NOT render one row per dbAccessories entry — it iterates `paired`/`matterPairings` and only uses dbAccessories as a lookup map keyed by bridge_id/accessory_id (line 189) for reliability/health data
  implication: MyDevicesTab is not affected by the duplicate-row API shape; AdminAdvancedSection.jsx (Danger Zone) is the only place in the UI that directly .map()s dbAccessories into rendered rows, which is why the bug is isolated to Settings > Advanced

- timestamp: 2026-09-01T00:00:25Z
  checked: web/src/components/setup/AdminAdvancedSection.test.jsx
  found: all existing tests use `dbAccessories: []` (empty array) — no test exercises multiple dbAccessories rows, let alone duplicate accessory_id rows
  implication: this scenario was never covered by tests, consistent with the bug shipping unnoticed

- timestamp: 2026-09-01T00:05:10Z
  checked: listener/src/accessories-router.js GET /accessories, "resurrection" path (lines 180-350): dbRows -> seenIds; neverSeen = Object.entries(currentPairings).filter(([id]) => !seenIds.has(id)); discovered = getAllDiscoveredAccessories().filter(d => !allIds.has(d.accessory_id))
  found: after DELETE /data/accessory removes ALL event_logs rows for accessory_id X, the next GET /api/accessories no longer has X in dbRows/seenIds. If X is a top-level paired device, X's id is a key in currentPairings (loadPairings()) so X now qualifies for `neverSeen` and reappears with event_count:0, last_seen:null, SAME accessory_id/name. If X is a bridge child (accessory_id = `${bridgeId}:${aid}`, not itself a key in currentPairings), X instead reappears via `discovered` (from getAllDiscoveredAccessories(), the cached HAP metadata populated independently of event_logs) with accessory_name RENAMED to `${d.accessory_name} · ${serviceType}` and event_count:0.
  implication: "deleting" an accessory's history does not remove it from the accessories list at all — it flips from a dbRows entry to a neverSeen/discovered entry (possibly under a different display name), so the Danger Zone list never shrinks after a deletion and a bridge child's entry visibly changes identity, matching "list grows instead of shrinks" / "accessory re-appears in the list"

- timestamp: 2026-09-01T00:05:20Z
  checked: web/src/components/setup/AdminAdvancedSection.jsx lines 216-219 (deletePairingMutation.mutate) vs lines 399-406 (deleteAccessoryMutation.mutate)
  found: deletePairingMutation.mutate passes both `onSuccess` and `onError: () => setConfirmDeletePairing(null)`; deleteMatterPairingMutation.mutate (lines 260-266) passes both onSuccess and onError (clears confirm + sets matterDeleteError). deleteAccessoryMutation.mutate passes ONLY `onSuccess` — no onError at all.
  implication: if the DELETE /api/data/accessory request fails (archiveWriteLimiter rate limit from deleting several devices quickly, requireAdminSession session expiry, transient 500), confirmDeleteAccessory is never cleared. isDeleting (deleteAccessoryMutation.isPending && isConfirming) goes back to false once the mutation settles as an error, so the row silently reverts from "Deleting…" to a plain "Yes, delete"/confirm state that never resolves for that id — matching "clicking an accessory does not show the delete option [because a DIFFERENT id is already stuck as confirming]" / "the accessory re-appears in the list showing the confirm-deletion state" once that id's row re-renders after the resurrection (previous evidence entry)

## Eliminated

- hypothesis: Per-row confirm-deletion state keyed by list index causing index-shift after refetch
  evidence: AdminAdvancedSection.jsx keys rows by acc.accessory_id (a stable value, not index) and confirmDeleteAccessory/confirmDeletePairing state stores the id value itself, not an index — so simple reordering with unique keys would not cause misattribution. The actual defect is that accessory_id is not unique in the array (duplicate keys), not that keys are index-based.
  timestamp: 2026-09-01T00:00:12Z

- hypothesis: Duplicate React keys (from (accessory_id, service_type) duplication) cause React to misattribute per-row confirm-deletion state to the wrong DOM node across refetches
  evidence: advisor review — confirmDeleteAccessory is a single parent-level value compared against acc.accessory_id; rows are stateless divs with no per-row state for React to misattribute. Duplicate keys would produce a console warning / possibly a dropped node, not stale confirm state jumping rows. This mechanism does not hold as stated; the duplicate-(accessory_id,service_type)-row condition (still confirmed real via subscriber.js code trace) is at most a static cosmetic over-count on first render, not a mechanism that makes the list grow specifically DURING deletion.
  timestamp: 2026-09-01T00:05:00Z

## Resolution

root_cause: |
  Two independent defects in web/src/components/setup/AdminAdvancedSection.jsx's "Delete accessory data" list:
  (1) GET /api/accessories (listener/src/accessories-router.js) never actually removes a deleted accessory from
  its response. After DELETE /api/data/accessory wipes an accessory_id's event_logs rows, seenIds no longer
  contains it, so the next GET /api/accessories re-adds it via the neverSeen branch (if still in pairings.json)
  or the discovered branch (if a bridge child cached via HAP metadata) with event_count:0 — the accessory
  never leaves the list, it just resets. (2) deleteAccessoryMutation.mutate() in AdminAdvancedSection.jsx was
  called with only an onSuccess handler, unlike the sibling deletePairingMutation/deleteMatterPairingMutation
  calls in the same file which both clear confirm state on error — so a failed delete left confirmDeleteAccessory
  (a single global value, not per-row) permanently stuck on that id, and the next re-render of the resurrected
  row (from defect 1) showed it already in confirm state. A third, separately-confirmed but secondary defect:
  GET /api/accessories groups event_logs by DISTINCT ON (accessory_id, service_type) rather than accessory_id
  alone, so an accessory_id with 2+ distinct service_type values (e.g. a firmware-revision-change event tagged
  'AccessoryInformation' inserted by detectFirmwareChanges() in subscriber.js, alongside its normal service
  events) produces duplicate rows sharing one accessory_id, rendered with duplicate React keys in this list.
fix: |
  In web/src/components/setup/AdminAdvancedSection.jsx: (a) added onError to deleteAccessoryMutation.mutate()
  that clears confirmDeleteAccessory and shows an error toast, mirroring the existing deletePairingMutation/
  deleteMatterPairingMutation error handling in the same file; (b) derived a new `deletableAccessories` list
  (useMemo) that collapses dbAccessories rows by accessory_id (summing event_count, keeping the most-recently-
  seen row's display fields) and filters to event_count > 0, so a deleted accessory drops out of this list
  instead of resurrecting in it as a 0-event row, and multi-service-type accessories no longer render as
  duplicate rows; replaced all render-path uses of raw dbAccessories in this component with deletableAccessories.
verification: |
  Self-verified: added 3 new component tests to AdminAdvancedSection.test.jsx covering (1) duplicate
  accessory_id/service_type rows collapsing to one row, (2) event_count:0 accessories excluded from the list,
  (3) a failed delete clearing confirm state and surfacing an error toast instead of getting stuck. Full web
  test suite (65 files, 740 tests) passes with no regressions. NOT verified against a live/production
  environment or by manually reproducing the original bug in a browser — no reachable Postgres/Docker in this
  environment (see reasoning_checkpoint blind_spots). Awaiting human verification against production/staging.
  DEPLOYED 2026-09-01: committed as d037f2f on main, pushed to GitLab; pipeline #292 fully green (test,
  boot-smoke, semgrep-sast, deploy-beta); Dockhand git stack 10 rebuilt hc-beta — verified new bundle served
  at 10.0.0.50:3100 (fix's toast string present in assets/index-CmoZg6YC.js), containers recreated (~20s
  uptime), /api/health 200 ok. 2026-09-01: user UAT on hc-beta CONFIRMED FIXED ("it seems to be fixed now");
  prod gets the fix with the next GA per the soak-before-GA cadence.
files_changed:
  - web/src/components/setup/AdminAdvancedSection.jsx
  - web/src/components/setup/AdminAdvancedSection.test.jsx
