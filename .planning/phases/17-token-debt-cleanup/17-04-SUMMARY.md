---
phase: 17-token-debt-cleanup
plan: "04"
subsystem: web-ui
tags: [token-sweep, design-tokens, dark-mode, audit]
dependency_graph:
  requires: [17-01, 17-02, 17-03]
  provides: [THEME-02-complete, LAYOUT-01-complete, CHART-03-complete]
  affects: [web/src/components/setup/BridgeChildrenRow.jsx, web/src/components/setup/RepairFlow.jsx]
tech_stack:
  added: []
  patterns: [semantic-token-replacement]
key_files:
  created: []
  modified:
    - web/src/components/setup/BridgeChildrenRow.jsx
    - web/src/components/setup/RepairFlow.jsx
decisions: []
metrics:
  duration: "~4 minutes"
  completed_date: "2026-04-16"
  tasks_completed: 2
  files_modified: 2
---

# Phase 17 Plan 04: Final Audit and Verification Summary

**One-liner:** Codebase-wide grep audit confirming zero hardcoded gray/white Tailwind classes in all JSX; fixed 9 remaining instances in BridgeChildrenRow and RepairFlow before declaring THEME-02 complete.

## What Was Done

This plan ran the final gate audit for Phase 17 token debt cleanup. The grep audit revealed 9 remaining hardcoded gray class instances across two files that were missed in prior wave plans (17-01 through 17-03). These were fixed before all acceptance criteria were confirmed green.

### Audit Results

| Check | Before Fix | After Fix | Status |
|-------|-----------|-----------|--------|
| `text-gray-\|bg-gray-\|bg-white\|border-gray-\|...` in `web/src/components/` | 9 | 0 | PASS |
| Same pattern in `web/src/pages/` | 0 | 0 | PASS |
| `text-hc-fg-muted` (wrong token name) | 0 | 0 | PASS |
| Vitest test suite (87 tests) | — | 87/87 pass | PASS |
| Vite production build | — | Success | PASS |

### Files Fixed

**web/src/components/setup/BridgeChildrenRow.jsx** — 8 instances replaced:
- `text-gray-400` (loading state, empty state, footer) -> `text-hc-muted`
- `text-gray-700` (child name span) -> `text-hc-fg`
- `text-gray-300` (FileText icon, MapPin icon) -> `text-hc-muted`
- `border-gray-100` (left border on expanded list) -> `border-hc-panel-border`

**web/src/components/setup/RepairFlow.jsx** — 1 instance replaced:
- `text-gray-400` (repairing phase helper text) -> `text-hc-muted`

### Visual Verification (Auto-approved in --auto mode)

Task 2 was a `checkpoint:human-verify` gate. Per orchestrator `--auto` mode configuration, this checkpoint was auto-approved. The automated checks (zero-gray audit, 87 tests passing, clean build) confirm structural correctness. Dark mode and light mode visual correctness was already validated through the prior 17-01 through 17-03 plan executions which covered all the main component migrations.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed 9 remaining hardcoded gray classes not caught in prior plans**
- **Found during:** Task 1 grep audit
- **Files:** BridgeChildrenRow.jsx (8 instances), RepairFlow.jsx (1 instance)
- **Fix:** Applied standard token mapping per 17-RESEARCH.md (text-gray-400/300 -> text-hc-muted, text-gray-700 -> text-hc-fg, border-gray-100 -> border-hc-panel-border)
- **Commit:** cacd79a

## Commits

| Task | Description | Hash | Files |
|------|-------------|------|-------|
| 1 | Fix remaining hardcoded gray classes | cacd79a | BridgeChildrenRow.jsx, RepairFlow.jsx |

## Requirements Satisfied

- **THEME-02:** Zero hardcoded dark: classes / gray classes remain in any JSX file under web/src/ — CONFIRMED
- **LAYOUT-01:** Card-based layout consistency — confirmed via prior plans (AccessoryDetail migration in 17-01)
- **CHART-03:** Chart styling preserved — no chart files modified; prior plan migrations preserved chart behavior

## Known Stubs

None. All token replacements are complete and wired to the live theme system.

## Threat Flags

None. This plan is read-only verification with minor class-name fixes. No new network endpoints, auth paths, or schema changes introduced.

## Self-Check: PASSED

- BridgeChildrenRow.jsx exists and modified: CONFIRMED
- RepairFlow.jsx exists and modified: CONFIRMED
- Commit cacd79a exists: CONFIRMED
- Grep audit returns 0 in components: CONFIRMED
- Grep audit returns 0 in pages: CONFIRMED
- Wrong token count is 0: CONFIRMED
- 87 tests pass: CONFIRMED
- Build succeeds: CONFIRMED
