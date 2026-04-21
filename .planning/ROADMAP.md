# Roadmap: HomeChronicle

## Milestones

- ✅ **v1.0 Code Health** — Phases 1-7 (shipped 2026-04-06)
- ✅ **v1.1 Scheduled Repair** — Phases 8-9 (shipped 2026-04-08)
- ✅ **v1.2 UI Redesign** — Phases 10-17 (shipped 2026-04-16)
- ✅ **v1.3 Repair Reliability Fixes** — Phases 18-19 (shipped 2026-04-21)

## Phases

<details>
<summary>✅ v1.0 Code Health (Phases 1-7) — SHIPPED 2026-04-06</summary>

- [x] Phase 1: Error Handler Foundation (2/2 plans) — completed
- [x] Phase 2: Migration System (2/2 plans) — completed
- [x] Phase 3: Count Optimization (1/1 plan) — completed
- [x] Phase 4: Router Extraction — Simple Groups (3/3 plans) — completed
- [x] Phase 5: Router Extraction — Accessories (2/2 plans) — completed
- [x] Phase 6: Router Extraction — Setup (2/2 plans) — completed
- [x] Phase 7: Tech Debt Cleanup (2/2 plans) — completed

See `milestones/v1.0-ROADMAP.md` for full details.

</details>

<details>
<summary>✅ v1.1 Scheduled Repair (Phases 8-9) — SHIPPED 2026-04-08</summary>

- [x] Phase 8: Scheduled Repair Backend (2/2 plans) — completed
- [x] Phase 9: Scheduled Repair UI (1/1 plan) — completed

See `milestones/v1.1-ROADMAP.md` for full details.

</details>

<details>
<summary>✅ v1.2 UI Redesign (Phases 10-17) — SHIPPED 2026-04-16</summary>

- [x] Phase 10: Design Token Foundation (4/4 plans) — completed 2026-04-14
- [x] Phase 11: Sidebar Navigation Shell (3/3 plans) — completed 2026-04-14
- [x] Phase 12: Page Extraction & Card Layout (3/3 plans) — completed 2026-04-15
- [x] Phase 13: Responsive Sidebar (3/3 plans) — completed 2026-04-15
- [x] Phase 14: Dashboard Widgets (3/3 plans) — completed 2026-04-15
- [x] Phase 15: Chart Styling (3/3 plans) — completed 2026-04-15
- [x] Phase 16: Verification Sweep & Requirements Update (2/2 plans) — completed 2026-04-16
- [x] Phase 17: Token Debt Cleanup (4/4 plans) — completed 2026-04-16

See `milestones/v1.2-ROADMAP.md` for full details.

</details>

## v1.3 Repair Reliability Fixes (In Progress)

### Phase 18: Scheduled Repair — Subscriber Restart Fix

**Goal:** Stop the silent event-logging flatline. Make `needsRepair` success restart the HAP subscriber, and stop `resetSubscriberStats` from masking failures.

**Requirements:** REPAIR-01, REPAIR-02, REPAIR-03

**Plans:** 1 plan
- [x] 18-01-PLAN.md — Fix implementation and add tests (completed 2026-04-20)

**Scope:**
- `listener/src/repair-scheduler.js` — move `resetSubscriberStats` into the success block; add `stopSubscriber` + `startSubscriber` sequence to `needsRepair` branch (mirror `isStale` branch at lines 121–139)
- `listener/src/repair-scheduler.test.js` — add three unit tests (needsRepair success, needsRepair failure, isStale success regression guard)

**Out of scope:** Full `pairSetup()` for rejected `longTermData` (deferred to Phase 19). UI surfacing of repair outcomes.

**Success criteria:**
- Scheduled repair resumes event logging for devices with IP-change staleness without user intervention
- Failed repairs leave `needsRepair === true` so the dashboard reflects real state
- All existing repair-scheduler tests still pass

**Reference:** `.planning/debug/scheduled-repair-no-logging.md` (root cause + fix plan)

---

### Phase 19: Scheduled Repair — Full pairSetup() Capability

**Goal:** Close the gap between scheduled repair and manual "Repair All" by giving the scheduler the ability to perform a full cryptographic re-pair when `longTermData` is rejected.

**Requirements:** REPAIR-04, REPAIR-05, REPAIR-06

**Depends on:** Phase 18 (subscriber-restart primitive must be in place)

**Plans:** 1 plan
- [x] 19-01-PLAN.md — Extract pair-and-persist helper; wire pairSetup path into scheduler with no-PIN skip + tests (completed 2026-04-21)

**Scope:**
- `listener/src/repair-scheduler.js` — call `pairSetup()` via `hap-controller` in `needsRepair` branch using PIN from vault; fall back to warning skip when no PIN is stored
- PIN-vault read path (reuse whatever `setup-router.js` manual repair uses — no new vault APIs)
- `listener/src/repair-scheduler.test.js` — three new unit tests covering pairSetup success / no-PIN skip / pairSetup failure

**Out of scope:** UI for viewing skipped-due-to-no-PIN devices (exists in health/accessories data already). Matter device repair (Matter uses polling, not persistent subscriptions).

**Success criteria:**
- Devices with auth-failure `needsRepair=true` and a stored PIN get fully re-paired by the scheduler and start logging events again, without the user clicking "Repair All"
- Devices without a stored PIN are skipped cleanly (no failure spam)
- Manual "Repair All" endpoint behavior is unchanged (shares primitives, doesn't get double-invoked)

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1-7 | v1.0 | 14/14 | Complete | 2026-04-06 |
| 8-9 | v1.1 | 3/3 | Complete | 2026-04-08 |
| 10-17 | v1.2 | 25/25 | Complete | 2026-04-16 |
| 18 | v1.3 | 1/1 | Complete | 2026-04-20 |
| 19 | v1.3 | 1/1 | Complete | 2026-04-21 |
