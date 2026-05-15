---
gsd_state_version: 1.0
milestone: v1.3
milestone_name: Repair Reliability Fixes
status: completed
stopped_at: "Completed quick task 260427-wm1: release blocker fixes (H-01/H-02/H-03/M-01)"
last_updated: "2026-04-28T07:41:00Z"
last_activity: 2026-04-28 -- Release blocker fixes complete; ready for v0.1.9
progress:
  total_phases: 2
  completed_phases: 2
  total_plans: 2
  completed_plans: 2
  percent: 100
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-04-28)

**Core value:** A reliable, maintainable codebase that self-hosted users can trust to run unattended for months without performance degradation or silent failures.
**Current focus:** v1.3 closed — planning next milestone

## Current Position

Milestone: v1.3 Repair Reliability Fixes — ARCHIVED 2026-04-28 (shipped 2026-04-21)
Active phase: none
Status: Awaiting next milestone (use /gsd-new-milestone)
Last activity: 2026-05-15 -- Completed quick task 260515-nfw: silence matter.js DEBUG log firehose

```
Progress: [██████████] 100% (2/2 phases)
```

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.

- Mirror setup-router.js manual repair order in scheduler: resetSubscriberStats → stopSubscriber → startSubscriber, applied to both needsRepair and isStale success branches
- Inject performPairSetupAndPersist as a pre-wired 4-arg closure into scheduler rather than threading HttpClient + savePairings — minimizes dep surface and matches existing discoverDevice injection pattern
- no-PIN skip runs before discoverDevice to avoid unnecessary mDNS churn for unrecoverable devices

### Pending Todos

None — milestone complete.

### Blockers/Concerns

None.

### Quick Tasks Completed

| # | Description | Date | Commit | Directory |
|---|-------------|------|--------|-----------|
| 260427-ttq | Fix everything-stale bug: add lastHealthyAt heartbeat to subscriber stats; thread into deriveDeviceHealth + getRepairTargets | 2026-04-28 | 02a21cb | [260427-ttq-fix-everything-stale-bug-add-lasthealthy](./quick/260427-ttq-fix-everything-stale-bug-add-lasthealthy/) |
| 260427-vch | Close quiet-device gap: thread subscriberConnected boolean into deriveDeviceHealth rescue (live HAP sub = heartbeat) | 2026-04-28 | 725a905 | [260427-vch-close-quiet-device-gap-thread-subscriber](./quick/260427-vch-close-quiet-device-gap-thread-subscriber/) |
| 260427-wm1 | Fix release blockers from RELEASE-REVIEW: KpiCards window coherence (H-01/H-03), EventRow a11y (H-02), subscriber liveness gate (M-01) | 2026-04-28 | 3ffc42e | [260427-wm1-fix-release-blockers-from-release-review](./quick/260427-wm1-fix-release-blockers-from-release-review/) |
| 260515-nfw | Silence matter.js DEBUG log firehose at startup (MATTER_LOG_LEVEL/MATTER_LOG_FORMAT env vars; defaults INFO/PLAIN) | 2026-05-15 | c60ea26 | [260515-nfw-silence-matter-js-debug-log-firehose](./quick/260515-nfw-silence-matter-js-debug-log-firehose/) |

## Session Continuity

Last session: 2026-04-28T01:28:28Z
Stopped at: Completed quick task 260427-ttq: lastHealthyAt heartbeat fix
Resume file: None
---
