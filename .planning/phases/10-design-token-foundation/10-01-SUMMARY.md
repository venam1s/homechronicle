---
phase: 10-design-token-foundation
plan: "01"
subsystem: web/css
tags: [css, tailwind, design-tokens, dark-mode, shim]
dependency_graph:
  requires: []
  provides: [design-token-layer, @theme-registration, css-shim-extensions]
  affects: [web/src/index.css]
tech_stack:
  added: []
  patterns: ["@theme block for Tailwind v4 CSS custom property registration", "CSS shim layer with !important overrides for dark-mode gray/blue classes"]
key_files:
  created: []
  modified:
    - web/src/index.css
decisions:
  - "@theme block placed before @layer base per RESEARCH.md Pitfall 1 — build-time resolution requires this ordering"
  - "--hc-accent-rgb excluded from @theme — comma-separated RGB tuple is not a valid CSS color value"
  - "Interactive tokens require no dark overrides — --hc-accent-rgb is already dark-aware via skin combos"
  - "--hc-warning-text not redefined in :root or html.theme-dark — already exists in both blocks"
metrics:
  duration: "3m"
  completed: "2026-04-14"
  tasks_completed: 2
  files_changed: 1
---

# Phase 10 Plan 01: Design Token Foundation — CSS Token Layer and Shim Extension

One-liner: Added Tailwind v4 `@theme` block registering 28 `--color-hc-*` utilities, defined new status/interactive CSS tokens in `:root`/`html.theme-dark`, and extended the CSS shim with 13 dark-mode gray/blue overrides.

## What Was Built

### Task 1: @theme block and new token definitions

`web/src/index.css` was modified with three changes:

1. A `@theme` block inserted between `@custom-variant dark` and `@layer base`, registering 28 CSS custom properties as Tailwind color utilities (`--color-hc-*`). Covers surface (11), accent (3), status (9), and interactive (5) token groups.

2. New status token variables added to `:root`:
   - `--hc-success-bg/text/border` (light-mode green palette)
   - `--hc-warning-bg/border` (light-mode amber palette; `--hc-warning-text` already existed)
   - `--hc-danger-bg/text/border` (light-mode red palette)

3. New interactive token variables added to `:root`:
   - `--hc-interactive`, `--hc-interactive-hover`, `--hc-focus-ring` (accent-rgb based, auto dark-aware)
   - `--hc-disabled`, `--hc-disabled-text` (panel/muted references)

4. Dark overrides for status tokens added to `html.theme-dark` block (interactive tokens need none).

### Task 2: CSS shim layer extension

13 new `html.theme-dark .{class}` shim rules added to `@layer utilities`:
- `bg-gray-700/800/900` → panel-mid / panel / bg
- `border-gray-600,border-gray-700` → border-strong
- `text-gray-100/200/300` → fg-strong / fg / muted-light
- `hover:bg-gray-700` → panel-mid
- `hover:text-gray-300` → muted-light
- `hover:text-blue-300`, `hover:text-blue-400` → accent-soft
- `text-blue-400` → accent-soft

All new shim rules include `!important` for specificity.

## Verification Results

- `grep -c '@theme' web/src/index.css` → 1
- `grep -c '\-\-color-hc-' web/src/index.css` → 28
- `grep -c '!important' web/src/index.css` → 64 (increased by 13 from Task 2)
- `npx vite build` → builds without errors (warning on INEFFECTIVE_DYNAMIC_IMPORT is pre-existing, unrelated)

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| Task 1 | ca1c0f4 | feat(10-01): add @theme block and new token definitions to index.css |
| Restore | e2d28e5 | chore(10-01): restore planning docs accidentally dropped in prior commit |
| Task 2 | 345e0d0 | feat(10-01): extend CSS shim layer for remaining dark: class coverage |

## Deviations from Plan

### Worktree Setup Issue

**Found during:** Task execution setup
**Issue:** The `git reset --soft` during worktree branch alignment left the `26b4258` docs commit changes staged in the working index. When committing Task 1 (with `git add web/src/index.css`), git also committed all the staged deletions/reversals from the docs commit, removing the plan files and research docs from the worktree.
**Fix:** After detecting the issue, restored all affected files via `git checkout 26b4258 -- .planning/phases/10-design-token-foundation/ .planning/ROADMAP.md .planning/research/` and committed the restoration as `e2d28e5`.
**Files modified:** .planning/phases/ (4 plan files), .planning/ROADMAP.md, .planning/research/ (5 files)
**Commit:** e2d28e5

### Edit Tool Path Issue (Auto-fixed)

**Found during:** Task 2 execution
**Issue:** The Edit tool wrote to the main repo's `web/src/index.css` (the CWD path used for edits) rather than the worktree's copy at `.claude/worktrees/agent-abdfa06e/web/src/index.css`. Both files are the same logical file but at different filesystem paths. The worktree's copy was not updated.
**Fix:** Copied the edited file from the main repo path to the worktree path and committed. Build was verified using the main repo's `web/` directory which has `node_modules` installed.
**Commit:** 345e0d0

## Known Stubs

None. This plan adds token definitions only — no data flows, UI components, or rendered output.

## Threat Flags

None. CSS custom property additions are client-side only, no server-side trust boundary crossed. As documented in the plan's threat model, T-10-01 is accepted.

## Self-Check: PASSED

- web/src/index.css: FOUND in worktree and committed at 345e0d0
- 10-01-SUMMARY.md: FOUND in worktree
- Commit ca1c0f4: FOUND (Task 1 — @theme block and token definitions)
- Commit e2d28e5: FOUND (restore planning docs)
- Commit 345e0d0: FOUND (Task 2 — shim layer extension)
- @theme block in committed index.css: confirmed (1 occurrence)
- Phase 10 shim in committed index.css: confirmed (1 section header)
