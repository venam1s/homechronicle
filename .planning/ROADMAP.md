# Roadmap: HomeChronicle — v1.1 Scheduled Repair

## Overview

Two sequential phases deliver the scheduled repair feature. The backend phase establishes the daily repair timer, persistence, and logging — everything that runs whether the user is watching or not. The frontend phase wires the toggle and explanatory text into the existing Settings UI, turning the backend capability on and off from the browser.

v1.0 (Code Health) ended at Phase 7. v1.1 continues from Phase 8.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 8: Scheduled Repair Backend** - Persist repair toggle, run daily repair cycle for needs_repair devices, log outcomes
- [ ] **Phase 9: Scheduled Repair UI** - Toggle in Manage > Settings with explanatory text, wired to the backend setting

## Phase Details

### Phase 8: Scheduled Repair Backend
**Goal**: The listener automatically repairs stale HomeKit pairings on a daily schedule when the feature is enabled
**Depends on**: Phase 7 (v1.0 complete)
**Requirements**: SREP-02, SREP-03, SREP-05
**Success Criteria** (what must be TRUE):
  1. When the setting is enabled, the listener runs a repair pass once every 24 hours without manual intervention
  2. The repair pass only attempts to re-pair devices whose `needs_repair` flag is set — healthy devices are untouched
  3. Each repair run logs which devices were repaired, which were skipped, and which failed, visible in `docker compose logs`
  4. The enabled/disabled state survives a container restart — restarting the listener with the feature on resumes scheduled repair automatically
**Plans:** 1/2 plans executed
Plans:
- [x] 08-01-PLAN.md — Repair scheduler module + getRepairTargets export + unit tests
- [ ] 08-02-PLAN.md — Repair router API + index.js wiring + integration tests
**UI hint**: no

### Phase 9: Scheduled Repair UI
**Goal**: Users can enable or disable scheduled repair from the Settings panel and understand what it does
**Depends on**: Phase 8
**Requirements**: SREP-01, SREP-04
**Success Criteria** (what must be TRUE):
  1. A toggle labeled for scheduled repair is visible in Manage > Settings and reflects the current enabled/disabled state on page load
  2. Toggling the switch immediately persists the change — a page refresh shows the same state the user set
  3. Explanatory text adjacent to the toggle describes what scheduled repair does and when a user would want to enable it
**Plans**: TBD
**UI hint**: yes

## Progress

**Execution Order:**
Phases execute in numeric order: 8 → 9

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 8. Scheduled Repair Backend | 1/2 | In Progress|  |
| 9. Scheduled Repair UI | 0/? | Not started | - |
