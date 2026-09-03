# Roadmap: HomeChronicle

## Milestones

- ✅ **v1.0 Code Health** — Phases 1-7 (shipped 2026-04-06)
- ✅ **v1.1 Scheduled Repair** — Phases 8-9 (shipped 2026-04-08)
- ✅ **v1.2 UI Redesign** — Phases 10-17 (shipped 2026-04-16)
- ✅ **v1.3 Repair Reliability Fixes** — Phases 18-19 (shipped 2026-04-21)
- ✅ **v1.4 Multi-User Auth & Email** — Phases 20-26 (shipped 2026-06-15)
- 🚧 **v0.4 UI Overhaul** — Phases 27-33 (in progress)

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

<details>
<summary>✅ v1.3 Repair Reliability Fixes (Phases 18-19) — SHIPPED 2026-04-21</summary>

- [x] Phase 18: Scheduled Repair — Subscriber Restart Fix (1/1 plan) — completed 2026-04-20
- [x] Phase 19: Scheduled Repair — Full pairSetup() Capability (1/1 plan) — completed 2026-04-21

See `milestones/v1.3-ROADMAP.md` for full details.

</details>

<details>
<summary>✅ v1.4 Multi-User Auth & Email (Phases 20-26) — SHIPPED 2026-06-15</summary>

- [x] Phase 20: Auth Foundation (13/13 plans) — completed 2026-06-11
- [x] Phase 21: Email Infrastructure + Invites + Password Reset (10/10 plans) — completed 2026-06-12
- [x] Phase 22: Email Alert Channel (5/5 plans) — completed 2026-06-13
- [x] Phase 23: Security Hardening + Nginx Cutover (5/5 plans) — completed 2026-06-13
- [x] Phase 24: Per-User UI Preferences (6/6 plans) — completed 2026-06-14
- [x] Phase 25: Per-User Quiet Hours (2/2 plans) — completed 2026-06-14
- [x] Phase 26: Member Self-Serve Alerts (4/4 plans) — completed 2026-06-15

See `milestones/v1.4-ROADMAP.md` for full phase details.

</details>

### 🚧 v0.4 UI Overhaul (Phases 27-33) — In Progress

**Milestone Goal:** Replace the generic dashboard aesthetic with a distinctive editorial "Almanac" interface, give users twelve palettes across the spectrum with light/dark/system control, and keep every existing dashboard widget and its customization intact.

**Design inputs (authoritative):** `.planning/notes/ui-overhaul-design-spec.md`, `.planning/notes/ui-overhaul-mockups/` (38 artboards + screenshots).

**Why 7 phases (exceeds `standard` granularity guidance of 4-6):** 35 requirements span 12 palettes × 2 modes each, a nav-shell replacement, 24 existing dashboard panels plus 3 new ones, and 4 restyled pages. Compressing further would either bury the milestone's two hardest gates — PAL-06 (accent→palette migration without an apparent reset) and ROOM-04 (per-palette colour-blind/contrast validation, order-sensitive) — inside combined success criteria, or split Dashboard's genuinely distinct existing-panel-restyle and new-panel work into a single overloaded phase. This repo's own v1.2 UI Redesign (the last comparable structural UI milestone) ran 8 phases for 23 requirements; 7 phases for 35 requirements here is consistent with that precedent, not scope drift.

**Test note:** Existing web tests that assert on `data-accent` values, `roomColors.js` hash output, and current sidebar DOM structure will legitimately need updating as part of Phases 27-29 — that is in-scope work for this milestone, not a regression to flag.

- [ ] **Phase 27: Palette & Theme Foundation** - Twelve palettes with Light/Dark/System theme control, synced per-user, migrated cleanly from the existing accent setting
- [ ] **Phase 28: Room & Category Colour Ramps** - Palette-aware, colour-blind-validated categorical ramps replace the hardcoded room-hash list and fixed chart-category colors
- [ ] **Phase 29: Almanac Navigation Shell** - Top masthead replaces the sidebar on desktop; mobile floating nav and all existing navigation behaviours retained
- [ ] **Phase 30: Dashboard Restyle — Grid & Existing Panels** - All 24 registered panels restyled with the editable grid, customize mode, and upgrade layout survival intact
- [ ] **Phase 31: Dashboard — New Analytics Panels** - House Summary, room map, and rhythm arc panels added to the existing panel system
- [ ] **Phase 32: Timeline & Devices Restyle** - Editorial headline-style timeline entries and ruled per-room device tables
- [ ] **Phase 33: Chart Restyle & Upgrade Verification** - Palette-driven chart styling across the app, plus end-to-end verification of the composed upgrade path

## Phase Details

### Phase 27: Palette & Theme Foundation
**Goal**: Users can personalize the app's entire color system with twelve palettes and a Light/Dark/System theme that syncs across their devices and upgrades cleanly from today's accent setting.
**Depends on**: Nothing (first phase of v0.4; builds on the existing per-user preferences system from v1.4)
**Requirements**: PAL-01, PAL-02, PAL-03, PAL-04, PAL-05, PAL-06, PAL-07, PAL-08
**Success Criteria** (what must be TRUE):
  1. User can select any of twelve palettes from a picker that previews each one's light and dark halves before committing, and the whole UI updates immediately without a reload (PAL-01, PAL-07)
  2. User can choose Light, Dark, or System theme; System follows the OS setting and switches live when it changes (PAL-02)
  3. A signed-in user's palette and theme choices follow their account to every device they sign into; a signed-out user's choices persist locally as they do today (PAL-03, PAL-04)
  4. Each palette's dark variant is a distinct, purpose-built design — its own surfaces, ink, and accent steps, not an inverted or filtered light theme — and meets text/UI contrast requirements against its own surfaces in both modes (PAL-05, PAL-08)
  5. An existing install upgrades automatically from its current accent setting to the nearest of the twelve palettes, without the UI appearing to reset to defaults (PAL-06)
**Plans**: TBD
**UI hint**: yes

### Phase 28: Room & Category Colour Ramps
**Goal**: Rooms and chart categories draw stable, validated, palette-aware colors instead of today's hardcoded 12-color name hash and fixed blue/amber/emerald set.
**Depends on**: Phase 27
**Requirements**: ROOM-01, ROOM-02, ROOM-03, ROOM-04, ROOM-05
**Success Criteria** (what must be TRUE):
  1. Each palette supplies a nine-slot categorical ramp usable for both room colors and chart categories, in light and dark (ROOM-01)
  2. A room keeps the same color everywhere it appears and does not change when filters, date ranges, or activity ranking change (ROOM-02)
  3. Room identity is always carried by a visible label beside the color, never by color alone (ROOM-03)
  4. Every palette's assembled nine-slot ramp passes colour-blind separation and contrast validation, in both light and dark, before that palette ships (ROOM-04)
  5. Chart category colors are sourced from the active palette's ramp instead of the current fixed blue/amber/emerald set (ROOM-05)
**Plans**: TBD
**UI hint**: yes

### Phase 29: Almanac Navigation Shell
**Goal**: Users navigate the app through a top masthead on desktop while every existing navigation behavior keeps working underneath it.
**Depends on**: Phase 27
**Requirements**: NAV-01, NAV-02, NAV-03, NAV-04
**Success Criteria** (what must be TRUE):
  1. On desktop, the user sees a top masthead — wordmark, section links, date/account — replacing the sidebar (NAV-01)
  2. On mobile and tablet, the user still navigates via the existing floating navigation (NAV-02)
  3. The wordmark renders in the active palette's colors, with the accent applied to the "chronicle" half (NAV-03)
  4. Accessory deep-links, browser back, and cross-page timeline filters all continue to work exactly as before the shell change (NAV-04)
**Plans**: TBD
**UI hint**: yes

### Phase 30: Dashboard Restyle — Grid & Existing Panels
**Goal**: The dashboard's editable grid and all 24 existing panels adopt the Almanac look while every customization and upgrade guarantee holds.
**Depends on**: Phase 27, Phase 28, Phase 29
**Requirements**: DASH-01, DASH-02, DASH-03, DASH-04, DASH-09
**Success Criteria** (what must be TRUE):
  1. All 24 registered panels continue to render and function correctly, keeping their panel ids, after the restyle (DASH-01)
  2. Customize mode still supports dragging, resizing, removing, and re-adding panels from the hidden-panel tray (DASH-02)
  3. An existing user's saved dashboard layout and hidden-panel set survive the upgrade unchanged (DASH-03)
  4. A new install receives a default arrangement that follows the Almanac reading order (DASH-04)
  5. In view mode, panels read as ruled sections with no duplicated header; edit mode still shows the drag handle and remove control (DASH-09)
**Plans**: TBD
**UI hint**: yes

### Phase 31: Dashboard — New Analytics Panels
**Goal**: Users get three new at-a-glance panels — house condition, room activity, and daily rhythm — integrated into the existing panel system.
**Depends on**: Phase 30
**Requirements**: DASH-05, DASH-06, DASH-07, DASH-08
**Success Criteria** (what must be TRUE):
  1. A House Summary panel states the current condition of the house in one sentence (DASH-05)
  2. A room map panel sizes each room block by event count and opens that room's timeline when a block is selected (DASH-06)
  3. A rhythm panel renders the day as an arc showing quiet hours and a now-marker (DASH-07)
  4. All three new panels appear automatically for existing users after upgrade and can be removed like any other panel (DASH-08)
**Plans**: TBD
**UI hint**: yes

### Phase 32: Timeline & Devices Restyle
**Goal**: Timeline and Devices read as Almanac editorial content while every filtering, grouping, and repair behavior keeps working.
**Depends on**: Phase 27, Phase 28, Phase 29
**Requirements**: VIEW-01, VIEW-02, VIEW-03, VIEW-04, VIEW-05, VIEW-06
**Success Criteria** (what must be TRUE):
  1. Timeline entries read as a headline sentence, with device and characteristic detail beneath (VIEW-01)
  2. A grouped episode renders as one entry showing its value progression, expandable into the individual events (VIEW-02)
  3. Events occurring during quiet hours are visually separated from the rest of the day, and room filter chips render in palette colors (VIEW-03, VIEW-04)
  4. The Devices page groups accessories into ruled per-room sections showing status, event count, and heartbeat (VIEW-05)
  5. Stale or unpaired devices are called out in the danger tone with a repair affordance (VIEW-06)
**Plans**: TBD
**UI hint**: yes

### Phase 33: Chart Restyle & Upgrade Verification
**Goal**: Every chart across the app reflects the active palette's dedicated chart tokens and reads cleanly in both light and dark, and the composed v0.4 upgrade path is verified end-to-end on an existing install rather than only per-requirement in isolation.
**Depends on**: Phase 28, Phase 30, Phase 31, Phase 32
**Requirements**: CHART-01, CHART-02, CHART-03
**Success Criteria** (what must be TRUE):
  1. Every chart's stroke, fill, and mark styling is driven by the active palette's `--hc-chart-*` tokens and updates immediately on palette or theme change, without a reload (CHART-01)
  2. Charts use thin marks, a recessive grid, and direct labels on notable values rather than labelling every point (CHART-02)
  3. Charts remain legible on dark surfaces without glowing or muddy fills (CHART-03)
  4. An existing pre-v0.4 install upgrades cleanly in one composed pass: its palette is mapped from its prior accent setting, its saved dashboard layout and hidden-panel set are intact, and the three new dashboard panels are present and can be removed like any other panel — verifying PAL-06, DASH-03, and DASH-08 together as the single upgrade a real user experiences, not three isolated checks
**Plans**: TBD
**UI hint**: yes

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1-7 | v1.0 | 14/14 | Complete | 2026-04-06 |
| 8-9 | v1.1 | 3/3 | Complete | 2026-04-08 |
| 10-17 | v1.2 | 25/25 | Complete | 2026-04-16 |
| 18 | v1.3 | 1/1 | Complete | 2026-04-20 |
| 19 | v1.3 | 1/1 | Complete | 2026-04-21 |
| 20 | v1.4 | 13/13 | Complete   | 2026-06-11 |
| 21 | v1.4 | 10/10 | Complete    | 2026-06-12 |
| 22 | v1.4 | 5/5 | Complete    | 2026-06-13 |
| 23 | v1.4 | 5/5 | Complete    | 2026-06-13 |
| 24 | v1.4 | 6/6 | Complete    | 2026-06-14 |
| 25 | v1.4 | 2/2 | Complete    | 2026-06-14 |
| 26 | v1.4 | 4/4 | Complete    | 2026-06-15 |
| 27 | v0.4 | 0/TBD | Not started | - |
| 28 | v0.4 | 0/TBD | Not started | - |
| 29 | v0.4 | 0/TBD | Not started | - |
| 30 | v0.4 | 0/TBD | Not started | - |
| 31 | v0.4 | 0/TBD | Not started | - |
| 32 | v0.4 | 0/TBD | Not started | - |
| 33 | v0.4 | 0/TBD | Not started | - |

## Candidates / Backlog

> Parked ideas not yet committed to a milestone. Promote via `/gsd:review-backlog` or `/gsd:new-milestone` when ready.

_No active candidates._
