---
phase: 22-email-alert-channel
plan: 05
subsystem: ui
tags: [react, lucide-react, alerts, vitest, testing-library]

# Dependency graph
requires:
  - phase: 22-email-alert-channel
    provides: Alerts.jsx Active Rules list, startEdit(rule) handler, channel picker UI
provides:
  - Explicit, discoverable Edit button (Pencil icon + label) per Active Rules row
  - Regression test asserting the Edit affordance enters edit mode with the form prefilled
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Grouped row actions: Edit + Delete in a single ml-auto flex wrapper, neutral actions use --hc-* muted tokens, destructive Delete keeps text-red-600"

key-files:
  created: []
  modified:
    - web/src/components/Alerts.jsx
    - web/src/components/Alerts.test.jsx

key-decisions:
  - "Kept the rule-name button as a secondary edit trigger (added cursor-pointer cue) so existing tests that click getByRole('button', { name: 'Test Rule' }) keep passing"
  - "Edit button styled with neutral --hc-* tokens (text-hc-muted hover:text-hc-fg-strong), no dark: variants, theme-correct in light and dark"

patterns-established:
  - "Row action grouping: move ml-auto from the trailing button onto a flex wrapper so Edit/Delete sit as a right-aligned pair"

requirements-completed: [ALERT-04]

# Metrics
duration: 6min
completed: 2026-06-12
---

# Phase 22 Plan 05: Edit Affordance Discoverability Summary

**Added an explicit Pencil "Edit" button to each Active Rules row in Alerts.jsx, making the previously undiscoverable edit capability obvious by mirroring the Delete button, plus two regression tests.**

## Performance

- **Duration:** ~6 min
- **Started:** 2026-06-12T23:03Z
- **Completed:** 2026-06-12T23:05Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Each Active Rules row now renders an explicit Edit control (Pencil icon + "Edit" label) grouped with Delete at the right edge, calling the existing `startEdit(rule)`.
- Edit uses neutral `--hc-*` tokens (no `dark:` variants); Delete retains its destructive `text-red-600`.
- The rule-name secondary trigger gained a `cursor-pointer` cue without being removed (preserves existing edit-flow tests).
- Two new regression tests assert the Edit affordance exists per row and enters edit mode with a prefilled form.

## Task Commits

1. **Task 1: Add explicit Edit control to each rule row** - `7a7f358` (feat)
2. **Task 2: Add regression test for the explicit Edit affordance** - `99e6242` (test)

_Note: The implementation (Task 1) preceded its regression test (Task 2). Because this gap-closure adds a brand-new affordance, the `/^edit$/i` test is meaningful only against the Task 1 change — it could not pass before the Edit button existed._

## Files Created/Modified
- `web/src/components/Alerts.jsx` - Added Pencil import (alphabetically sorted); grouped Edit + Delete in an `ml-auto flex items-center gap-1` wrapper (Edit first, then Delete); added `cursor-pointer` to the rule-name button.
- `web/src/components/Alerts.test.jsx` - New `describe('Alerts edit affordance discoverability', ...)` block with two tests: explicit Edit button presence, and edit-mode entry with prefilled form.

## Decisions Made
None beyond the plan — followed plan as specified.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## Verification

- `cd web && npx vitest run src/components/Alerts.test.jsx` → 10/10 pass (8 existing + 2 new).
- `cd web && npm test` (full web suite) → **286/286 pass across 40 test files**. No regressions.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Closes 22-UAT.md test 5 gap (ALERT-04 editability is now discoverable).
- Optional human smoke: confirm the Pencil "Edit" control appears next to "Delete" in both light and dark themes and loads the rule into the form on click.

## Self-Check: PASSED
- `web/src/components/Alerts.jsx` — FOUND (Pencil import + Edit button present)
- `web/src/components/Alerts.test.jsx` — FOUND (discoverability describe block present)
- Commit `7a7f358` — FOUND
- Commit `99e6242` — FOUND

---
*Phase: 22-email-alert-channel*
*Completed: 2026-06-12*
