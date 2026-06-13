---
phase: quick-260613-q4z
plan: 01
subsystem: web-ui
tags: [settings, card, ui-consistency, refactor]
requires: [web/src/components/Card.jsx]
provides: ["Card.Header headingLevel prop", "unified titled-card Settings surface"]
affects:
  - web/src/components/Card.jsx
  - web/src/components/setup/SettingsTab.jsx
  - web/src/components/setup/AdminAdvancedSection.jsx
  - web/src/components/UsersPanel.jsx
  - web/src/components/SMTPConfigSection.jsx
  - web/src/components/ChangePasswordSection.jsx
  - web/src/components/ActiveSessionsPanel.jsx
tech-stack:
  added: []
  patterns: ["Card + Card.Header({ title, actions, headingLevel }) + Card.Body titled-card primitive"]
key-files:
  created: []
  modified:
    - web/src/components/Card.jsx
    - web/src/components/Card.test.jsx
    - web/src/components/setup/SettingsTab.jsx
    - web/src/components/setup/AdminAdvancedSection.jsx
    - web/src/components/UsersPanel.jsx
    - web/src/components/SMTPConfigSection.jsx
    - web/src/components/ChangePasswordSection.jsx
    - web/src/components/ActiveSessionsPanel.jsx
decisions:
  - "Card.Header gains an optional headingLevel prop; omitted renders the existing <span> byte-identically, headingLevel={2} renders an <h2> carrying the same three classes."
  - "Added space-y-4 wrapper divs inside Card.Body in Device Management, SMTP, and Active Sessions to preserve inter-element vertical gaps formerly provided by the root-level space-y-4."
metrics:
  duration: "~7 min"
  completed: 2026-06-13
---

# Phase quick-260613-q4z Plan 01: Unify Settings Section Headers to Titled Cards Summary

Unified all Settings sections to the canonical titled-card style (`<Card>` + `<Card.Header>` + `<Card.Body>`) and added an optional `headingLevel` prop to `Card.Header` so sections that previously rendered an `<h2>` keep their heading semantics. Pure visual/structural reorganization — no handler, mutation, auto-save, debounce, confirm-flow, or state behavior changed.

## What Was Built

- **Card.Header `headingLevel` prop (Task 1, TDD):** `Card.Header` now accepts a third prop `headingLevel`. `const Heading = headingLevel ? \`h${headingLevel}\` : 'span';` — when omitted it renders the existing `<span class="text-hc-section font-semibold text-hc-fg-strong">` (byte-identical to before); `headingLevel={2}` renders an `<h2>` with the same three classes inside the unchanged wrapper. Added a new `Test 3b` covering the `headingLevel={2}` → `<h2>` path; existing span-default and children-count tests untouched.
- **SettingsTab — Device Management (Task 2):** one titled `Device Management` card whose body holds the HomeKit auto-scan sub-panel (unchanged) and the Scheduled Repair content folded into its own `bg-hc-panel border border-hc-panel-border rounded-lg px-4 py-3` sub-panel (Card shell removed). All repair handlers (`saveRepairMutation.mutate`, `localHourToUtc`), conditional rendering (`repairEnabledInput`), and last-run text preserved. Sub-panels wrapped in a `space-y-4` div.
- **SettingsTab — Data management (Task 2):** the single over-nesting `Data Management` card split into THREE sibling titled cards inside a `space-y-4` wrapper: `Data Management` (retention cutoff + archive-before-delete + stale threshold + error banner), `Alerts & Quiet Hours` (webhook alerts + quiet hours + excluded accessories), and `Timeline` (episode interval + scene window + episode min events). Three `<h3 uppercase>` labels removed.
- **AdminAdvancedSection (Task 2):** `<h3>Advanced</h3>` + bare log-level panel replaced with an `Advanced` titled card containing the log-level control + error banner. `handleLogLevelChange`, the select, and the Danger Zone `<section>` left exactly as-is.
- **UsersPanel (Task 3):** `Users` titled card (`headingLevel={2}`) with the Invite-user button moved into `Card.Header actions`; inner `rounded-xl overflow-hidden` table wrapper stripped (table header + rows kept). `Pending invites` converted to its own default-span titled card with its inner panel wrapper stripped.
- **SMTPConfigSection (Task 3):** `Email (SMTP)` titled card (`headingLevel={2}`); the form's manual `bg-hc-panel border ... rounded-xl p-4` wrapper stripped (kept `space-y-3`); not-configured notice + form wrapped in `space-y-4`. `isLoading` spinner early-return left bare.
- **ChangePasswordSection (Task 3):** both the success early-return and the main render wrapped in a `Change password` titled card (`headingLevel={2}`); form's own `space-y-4` preserved.
- **ActiveSessionsPanel (Task 3):** `Active Sessions` titled card (`headingLevel={2}`) with the Log-out-other-devices button moved into `Card.Header actions`; loading/error/empty states + sessions `<ul>` wrapped in `space-y-4` inside the body.

## Tasks Completed

| Task | Name | Commit | Files |
| ---- | ---- | ------ | ----- |
| 1 | Add optional headingLevel prop to Card.Header (TDD) | 03a1464 | Card.jsx, Card.test.jsx |
| 2 | Convert SettingsTab + AdminAdvancedSection to titled cards | 83e3312 | SettingsTab.jsx, AdminAdvancedSection.jsx |
| 3 | Convert UsersPanel, SMTPConfigSection, ChangePasswordSection, ActiveSessionsPanel | a84a2af | UsersPanel.jsx, SMTPConfigSection.jsx, ChangePasswordSection.jsx, ActiveSessionsPanel.jsx |
| 4 | Human-verify (light + dark) | — | **PENDING — orchestrator handles visual verification; not executed here** |

## Verification

- `cd web && npm test` (full suite): **302 passed / 42 files**, zero failures.
- Targeted: Card 9/9, SettingsTab + AdminAdvancedSection 19/19, the four Task-3 files 39/39 — all green.
- `cd web && npm run build`: clean. The lone `[INEFFECTIVE_DYNAMIC_IMPORT]` warning is pre-existing (AdminAdvancedSection's `handleWipeAll` dynamically imports `../../lib/api.js`) and unrelated to this change.

## Deviations from Plan

### Minor structural additions (spacing preservation)

**1. [Rule 2 — preserve behavior] Added `space-y-4` wrapper divs inside `Card.Body`**
- **Found during:** Tasks 2 and 3.
- **Issue:** Several sections previously sat as direct children of a root-level `space-y-4` container which provided the vertical gap between sibling blocks. After folding them into `Card.Body` (which has no `space-y`), adjacent blocks would touch.
- **Fix:** Wrapped the multi-block bodies in a `<div className="space-y-4">` in Device Management (auto-scan + repair sub-panels), SMTPConfigSection (notice + form), and ActiveSessionsPanel (states + `<ul>`).
- **Files modified:** SettingsTab.jsx, SMTPConfigSection.jsx, ActiveSessionsPanel.jsx.
- **Commits:** 83e3312, a84a2af.

No other deviations — handlers, mutations, auto-save/debounce, password masking, and confirm flows are preserved verbatim.

## Notes for Human-Verify (Task 4, orchestrator)

The most visible structural changes for the light/dark walk:
- UsersPanel table-header bar (`bg-hc-panel-mid`) and the SMTP form now sit inset inside a padded `Card.Body` rather than spanning a full-width `rounded-xl overflow-hidden` panel (inner wrappers stripped per plan).
- Data management tab now shows three separate titled cards instead of one.
- Verify both modes: card header/body borders, `--hc-*` text colors, and that stripping the manual `bg-hc-panel` wrappers left no wrong-mode backgrounds or invisible text.

## Self-Check: PASSED

- Card.jsx, Card.test.jsx — modified, present.
- SettingsTab.jsx, AdminAdvancedSection.jsx — modified, present.
- UsersPanel.jsx, SMTPConfigSection.jsx, ChangePasswordSection.jsx, ActiveSessionsPanel.jsx — modified, present.
- Commits 03a1464, 83e3312, a84a2af — all present in `git log`.
- Full web test suite green (302/302); production build clean.
