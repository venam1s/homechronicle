# Requirements: HomeChronicle — v0.4 UI Overhaul

**Defined:** 2026-08-30
**Core Value:** A reliable, maintainable codebase that self-hosted users can trust to run unattended for months without performance degradation or silent failures.

**Design inputs (authoritative):**
- Spec: `.planning/notes/ui-overhaul-design-spec.md`
- Mockups: `.planning/notes/ui-overhaul-mockups/` (38 artboards + screenshots)
- Canvas: https://claude.ai/code/artifact/475d3630-23bc-43d5-9181-15a789b76e47

> Milestone numbering note: v0.4 is the first milestone whose label matches the product release
> line. Prior milestones used an internal `v1.x` counter (see `MILESTONES.md`); their requirement
> IDs (AUTH/USER/PWD/EMAIL/ALERT/SEC/PREF/QH/MALERT) remain valid and are archived under
> `.planning/milestones/v1.4-REQUIREMENTS.md`.

## v0.4 Requirements

### Palette & Theme System

- [ ] **PAL-01**: User can choose from twelve palettes in Settings → Appearance, and the entire UI (surfaces, ink, accents, charts, wordmark) updates immediately without a reload
- [ ] **PAL-02**: User can choose Light, Dark, or System; System follows the operating system setting and switches live when the OS setting changes
- [ ] **PAL-03**: User's palette and theme choices persist to their account and apply on every device they sign into
- [ ] **PAL-04**: A signed-out user's palette and theme choices persist locally, preserving today's anonymous behaviour
- [ ] **PAL-05**: Each palette renders a purpose-built dark variant with its own surfaces, ink and accent steps — not a filtered or inverted light theme
- [ ] **PAL-06**: An existing install upgrades from its current accent setting to the nearest palette without the UI appearing to reset to defaults
- [ ] **PAL-07**: The palette picker previews each palette's light and dark halves so the user can choose before committing
- [ ] **PAL-08**: Every palette meets text and UI contrast requirements against its own surfaces in both modes

### Room & Category Colors

- [ ] **ROOM-01**: Each palette supplies a nine-slot categorical ramp, used for both room colors and chart categories, in light and dark
- [ ] **ROOM-02**: A room keeps the same color everywhere it appears and does not change when filters, date ranges, or activity ranking change
- [ ] **ROOM-03**: Room identity is always carried by a visible label beside the color, never by color alone
- [ ] **ROOM-04**: Every palette's ramp passes colour-blind separation and contrast validation in both modes before it ships
- [ ] **ROOM-05**: Chart category colors come from the active palette's ramp instead of the current fixed blue/amber/emerald set

### Navigation Shell

- [ ] **NAV-01**: On desktop, navigation is a masthead across the top carrying the wordmark, section links, and date/account
- [ ] **NAV-02**: On mobile and tablet, the existing floating navigation is retained
- [ ] **NAV-03**: The wordmark renders in the active palette, with the accent applied to the "chronicle" half
- [ ] **NAV-04**: Existing navigation behaviours survive the shell change — accessory deep-links, browser back, and cross-page timeline filters all work as before

### Dashboard

- [ ] **DASH-01**: All twenty-four registered panels continue to work after the restyle, keeping their panel ids
- [ ] **DASH-02**: Customize mode still supports dragging, resizing, removing, and re-adding panels from the hidden-panel tray
- [ ] **DASH-03**: A user's saved dashboard layout and hidden set survive the upgrade
- [ ] **DASH-04**: A new install gets a default arrangement that follows the Almanac reading order
- [ ] **DASH-05**: A House Summary panel states the current condition of the house in one sentence
- [ ] **DASH-06**: A room map panel sizes each room block by event count and opens that room's timeline when selected
- [ ] **DASH-07**: A rhythm panel shows the day as an arc with quiet hours and a now-marker
- [ ] **DASH-08**: The three new panels appear automatically for existing users after upgrade, and can be removed like any other panel
- [ ] **DASH-09**: In view mode panels read as ruled sections with no duplicated header; edit mode still shows the drag handle and remove control

### Timeline & Devices

- [ ] **VIEW-01**: Timeline entries read as a headline sentence, with device and characteristic detail beneath
- [ ] **VIEW-02**: A grouped episode renders as one entry showing its value progression, expandable to the individual events
- [ ] **VIEW-03**: Events occurring during quiet hours are visually separated from the rest of the day
- [ ] **VIEW-04**: Timeline room filters render as palette-colored chips
- [ ] **VIEW-05**: The Devices page groups accessories into ruled per-room sections showing status, event count, and heartbeat
- [ ] **VIEW-06**: Stale or unpaired devices are called out in the danger tone with a repair affordance

### Charts

- [ ] **CHART-01**: Charts take their colors from the active palette and update on palette or theme change without a reload
- [ ] **CHART-02**: Charts use thin marks, a recessive grid, and direct labels on notable values rather than labelling every point
- [ ] **CHART-03**: Charts remain legible on dark surfaces without glowing or muddy fills

## Future Requirements

Deferred — tracked but not in this roadmap.

### Appearance

- **APPR-01**: User can build a custom palette from a validated swatch set
- **APPR-02**: User can override an individual room's color within palette-safe choices
- **APPR-03**: Per-user font size / density preference

### Views

- **VIEW-07**: Mobile-specific redesign of the Almanac views beyond the retained floating nav
- **VIEW-08**: Email template restyle to match the palette system

## Out of Scope

| Feature | Reason |
|---------|--------|
| Backend / API / schema changes | v0.4 is a presentation-layer milestone; the listener, endpoints, and migrations are untouched |
| Free hue picker for accents | Cannot guarantee colour-blind separation or contrast; twelve validated palettes cover the need |
| Dashboard grid engine rework | react-grid-layout works; this milestone restyles it and adds panels, nothing more |
| Per-room custom color pickers | Undermines the validated ramps; deferred to APPR-02 |
| Mobile-native app | Web-first; responsive shell covers mobile |
| Warm "Almanac" palette as a 13th option | Twelve already span the spectrum; the source artboard is kept if it is wanted later |
| New analytics panels beyond the three named | Scope control — the restyle is the milestone, not new metrics |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| PAL-01 | Phase 27 | Pending |
| PAL-02 | Phase 27 | Pending |
| PAL-03 | Phase 27 | Pending |
| PAL-04 | Phase 27 | Pending |
| PAL-05 | Phase 27 | Pending |
| PAL-06 | Phase 27 | Pending |
| PAL-07 | Phase 27 | Pending |
| PAL-08 | Phase 27 | Pending |
| ROOM-01 | Phase 28 | Pending |
| ROOM-02 | Phase 28 | Pending |
| ROOM-03 | Phase 28 | Pending |
| ROOM-04 | Phase 28 | Pending |
| ROOM-05 | Phase 28 | Pending |
| NAV-01 | Phase 29 | Pending |
| NAV-02 | Phase 29 | Pending |
| NAV-03 | Phase 29 | Pending |
| NAV-04 | Phase 29 | Pending |
| DASH-01 | Phase 30 | Pending |
| DASH-02 | Phase 30 | Pending |
| DASH-03 | Phase 30 | Pending |
| DASH-04 | Phase 30 | Pending |
| DASH-05 | Phase 31 | Pending |
| DASH-06 | Phase 31 | Pending |
| DASH-07 | Phase 31 | Pending |
| DASH-08 | Phase 31 | Pending |
| DASH-09 | Phase 30 | Pending |
| VIEW-01 | Phase 32 | Pending |
| VIEW-02 | Phase 32 | Pending |
| VIEW-03 | Phase 32 | Pending |
| VIEW-04 | Phase 32 | Pending |
| VIEW-05 | Phase 32 | Pending |
| VIEW-06 | Phase 32 | Pending |
| CHART-01 | Phase 33 | Pending |
| CHART-02 | Phase 33 | Pending |
| CHART-03 | Phase 33 | Pending |

**Coverage:**
- v0.4 requirements: 35 total
- Mapped to phases: 35 (100%)
- Unmapped: 0 ✓

---
*Requirements defined: 2026-08-30*
*Last updated: 2026-08-30 after ROADMAP.md creation (Phases 27-33, 35/35 requirements mapped)*
