# HomeChronicle UI Overhaul — Design Spec (draft for GSD intake)

Decision record from the design exploration of 2026-08-30
(canvas: https://claude.ai/code/artifact/475d3630-23bc-43d5-9181-15a789b76e47).

## Decision

- **Structure**: "Almanac" — editorial reader-first layout. Masthead top nav (logo + text links,
  double-rule under masthead), opening sentence ("lede") about the house, hairline-ruled stat row
  (no KPI cards), room map sized by activity, day-rhythm arc, thirty-day chart, headline-style
  timeline entries grouped into episodes.
- **Type**: the app's existing system sans everywhere (same stack the logo wordmark inherits).
  Bold lowercase two-tone wordmark stays. NO serif, NO italics. Monospace
  (`ui-monospace, 'SF Mono', Menlo, Consolas, monospace`) only for data values: timestamps,
  counts, value changes (`74% → 60% RH`), version strings. Tabular numerals everywhere.
- **Color**: four palettes shipped as user-selectable options, each with a designed light AND dark
  variant. Theme control: **Light / Dark / System** (System = `prefers-color-scheme`).
- Palette + theme are per-user preferences (existing user-preferences blob), synced across devices;
  anonymous fallback to localStorage as today.

## Token architecture

- Replace `html[data-accent='...']` (8 accent tints) with `html[data-palette='porcelain'|'dusk'|'ink'|'gallery']`.
- Keep `html.theme-dark` class mechanism; add `system` option resolving via `matchMedia('(prefers-color-scheme: dark)')`
  with a live listener (extend `useTheme`).
- All existing `--hc-*` semantic tokens stay; each palette×mode defines the full set.
  New token family: `--hc-room-1 … --hc-room-6` + `--hc-room-fallback` (categorical room colors).
- Room color assignment — **CORRECTED after reading the code.** Today `web/src/lib/roomColors.js`
  hashes the room NAME into a hardcoded 12-entry palette (`light-dark()` pairs); rooms are NOT
  user-assigned colors. Separately `--hc-cat-0…8` (9 slots, `.hc-cat-N` classes setting both
  `fill !important` and `background-color`) colors chart categories. v0.4 replaces BOTH with
  palette-aware ramps. Assignment rule must satisfy "color follows the entity, never its rank":
  keep a deterministic name→slot mapping so a room's color never changes when filters or activity
  change. Hashing into 6 slots collides more often than into 12, so the ramp needs either more
  slots or a stable ordered assignment — see the open question below.
- Room identity is never color-alone: always name label or text beside the dot/block.

## Palettes — twelve options ranging the spectrum

Every palette ships a designed **light** and **dark** variant (dark re-derives every token —
tinted near-black surfaces, toned off-whites, re-stepped room colors — never a filter).
Users pick palette + theme (Light/Dark/System) in Settings → Appearance; per-user, synced.

| # | Palette | Light surface | Accent (light / dark) |
|---|---------|---------------|------------------------|
| 1 | Gallery | pure white `#ffffff` | cobalt `#1a56c4` / `#5b88d7` |
| 2 | Ember | warm white `#faf6f3` | scarlet `#bf3b2b` / `#e07a63` |
| 3 | Almanac | warm cream `#f6f0e3` | clay `#c05a36` / `#d97e5b` |
| 4 | Harvest | warm paper `#f8f3e6` | amber `#a1720b` / `#d1a23c` |
| 5 | Ink | neutral paper `#f7f7f4` | citron `#5f7016` / `#a4bf3d` |
| 6 | Fern | green white `#f2f6f0` | forest `#2e7d46` / `#55a86e` |
| 7 | Porcelain (default) | cool white `#f3f5f4` | teal `#078e7e` / `#149e8d` |
| 8 | Tide | sky white `#f1f5f8` | sea `#0e7fa8` / `#4aa8cc` |
| 9 | Atlas | light grey `#e9eaeb` | cobalt `#2f5fb3` / `#7295d8` |
| 10 | Iris | lavender white `#f4f3f8` | violet `#6d4fc4` / `#a08fe0` |
| 11 | Dusk | blue-grey `#eef0f6` | berry `#b03a68` / `#c76486` |
| 12 | Graphite | mid grey `#e4e4e4` | slate `#47525e` / `#9aa6b2` |

Full surface token sets (bg/panel/border/ink/muted/grid/track/bar-neutral, hover/mid/area per
accent) for every palette×mode are embedded in the design canvas artboards (source of truth for
implementation: read the `Palette*.dc.html` / `Palette*Dark.dc.html` boards).

### Room categorical colors — three shared ramps

- **Vivid** (Gallery): light `#1a56c4 #d92b1f #d98e04 #0e8a4f #b0329a #12a5b8`; dark (validated
  order) `#cc675a #009bae #b97a13 #5b88d7 #c25da8 #38a065`.
- **Mono** (Ink, Graphite): grayscale steps + accent; identity via labels (deliberate).
  Light `#3c3c37 #85857b #55554e #b3b3a6 #9b9b8e`; dark `#cfcfc2 #8f8f84 #b3b3a7 #5c5c54 #75756c`.
- **Field** (all others): accent as room-1 + five muted co-colors from the validated pool
  light `#078e7e #c05a36 #bf9426 #3d64a8 #5f9440 #96549c` / dark `#149e8d #ca6b4a #ac8200
  #5f89d0 #659a46 #af6cb5`, dropping the pool color nearest the palette's accent hue.
- Dusk keeps its bespoke validated sets (light `#b03a68 #3d64a8 #bf7c26 #12a5b8 #8455bd #55953f`,
  dark `#9874ca #bb7821 #009bae #c76486 #5f89d0 #5f9b4b`).
- Base pools pass the six-check categorical validator (CVD ΔE, chroma floor, lightness band,
  normal-vision floor) in both modes. **Each palette's final assembled six-color ramp must get its
  own validator pass during implementation** (adjacency order = room activity rank); room identity
  is never color-alone (labels everywhere); 7th+ room folds to the palette's muted fallback.

## Structural / component changes

1. **Navigation**: sidebar (240px, collapsible) → top masthead (logo left, text links center,
   date/user right; double rule beneath). Mobile keeps FloatingNav. `hc_sidebar_collapsed` pref
   becomes obsolete (keep key, ignore).
2. **Dashboard — the editable grid and ALL 24 widgets are KEPT.** The Almanac layout is the new
   *default arrangement and skin* of the existing react-grid-layout dashboard, not a replacement.
   Verified against `web/src/lib/dashboardPanels.js` (the panel registry),
   `hooks/useDashboardLayout.js`, `components/DashboardGrid.jsx`, `components/DashboardPanel.jsx`:
   - **Core panels (12) keep their ids**: `kpis` (Overview, bare), `quietHours` (bare), `trend`
     (Daily Activity), `hourly` (Events by Hour), `rooms` (Events by Room), `topDevices`
     (Most Active Devices), `weekdayHeatmap` (Weekly Pattern), `monthlyHeatmap` (Monthly Activity),
     `activityFeed` (Live Activity, bare), `roomBreakdown` (Rooms, bare), `anomalies`
     (Active Outliers), `staleDevices`.
   - **Optional panels (12) keep their ids**: `weekOverWeek`, `healthDonut`, `alertsSummary`,
     `topMovers`, `dayNight`, `quietCompliance`, `roomSparklines`, `sensorEnvironment`,
     `batteryLevels`, `recentEpisodes`, `retentionHealth`, `eventTypeBreakdown`.
   - **Mockup → panel mapping**: the hairline stat row IS `kpis` restyled (already `bare`, so it
     draws its own chrome — the four ledger cells replace the four KPI cards). "The last thirty
     days" is `trend`; "Events by hour" is `hourly`; "Events by room" is `rooms`; the quiet-hours
     line is `quietHours`.
   - **Three NEW registry entries**: `houseSummary` (the lede sentence — bare, full width, maxH 2),
     `roomMap` ("Where things happen"), `rhythmArc` ("Today's rhythm"). Registering them means
     `sanitizeLayouts()` gives existing users default geometry for them automatically on upgrade
     (its documented behavior: "add default geometry for registered panels missing from storage …
     so upgrades don't silently hide new panels"). DECIDE in discuss-phase: accept that (new panels
     appear for everyone) or seed them into `hc_dashboard_hidden` for existing users so only new
     installs get them by default.
   - **Interaction model is unchanged**: Customize toggles `editing`; `DashboardPanel` shows the
     drag handle + remove button *only* while editing (in view mode each panel component supplies
     its own title — which is exactly what makes the Almanac "hairline section" look possible
     without touching grid mechanics); hidden-panel tray for re-adding; `.hc-drag-handle` /
     `.hc-no-drag`; `se` resize handle disabled on mobile; `lg`/`sm` breakpoints; `PANEL_MAX_H`
     clamping; layouts + hidden set persisted per user (`hc_dashboard_layouts`,
     `hc_dashboard_hidden` via `usePreference`).
   - **What actually changes**: panel body styling (tokens, type, mark specs) and the default
     `lg`/`sm` geometry to match the Almanac reading order. `DashboardPanel` wrapper gains the
     palette surface treatment (`rounded-xl bg-hc-panel shadow-sm` → hairline-ruled `--hc-panel`
     card); `bare` panels stay transparent as today.

3. **Timeline**: filter chips with room dots; day header + one-line day summary; entries as
   headline sentences (device · characteristic beneath), change column in mono, room column
   dot+name; episode rows get tinted band + mini value bars + expand; quiet-hours divider.
4. **Devices**: room sections as ruled tables (name+meta / status / events / heartbeat), stale in
   danger tone with repair link.
5. **Settings → Appearance**: Theme segmented (Light/Dark/System) + Palette picker: 12 cards
   (light/dark swatch halves, accent + room dots, Selected state). Per-user via preferences blob (PREF pattern),
   anonymous via localStorage.
6. **Charts**: single-hue + accent highlight; thin marks; recessive dashed grid; direct labels for
   peaks; no legends for single series; Recharts styling via `--hc-chart-*` tokens (already
   theme-reactive — extend per palette).

## Migration

- `data-accent` (8 tints) → nearest of the 12: ocean→Tide, graphite→Graphite, sunrise→Harvest,
  red→Ember, yellow→Harvest, purple→Iris, slate→Atlas, pink→Dusk. One-time migration in the
  useAccent successor; keep old key readable.
- Theme pref values today: light/dark (+system if present) — extend to system default for new users.
- Room colors currently user-assigned in room config: room config colors override the palette
  ramp? DECIDE during discuss-phase: proposal — palette supplies defaults; explicit user room
  colors win but are nudged to palette-safe swatches.

## Out of scope (this milestone)

- Dashboard drag-grid rework, mobile-specific redesign beyond nav, email template restyle.

## Open questions for discuss-phase

1. Default palette for existing installs (proposal: Porcelain).
5. Whether 12 palettes all ship in v1 of the overhaul or a first cut (e.g. 6) ships first — pure token work either way.
2. data-accent → data-palette migration mapping.
3. User-assigned room colors vs palette room ramp precedence.
4. Lede/headline copy generation rules (deterministic templates from existing stats/episodes).
6. **Room→color assignment mechanism** (replaces the retired "user room colors" question, which
   was based on a wrong assumption): hash-into-N (today's approach, collisions at 6 slots) vs a
   stable ordered assignment persisted per install vs widening each palette's room ramp to ~9-12
   validated slots. Whatever is chosen must keep a room's color stable across filters and range
   changes, and must be validated per palette in both modes.
7. `--hc-cat-*` chart-category ramp (9 slots) must also become palette-aware — reuse the room ramp
   or keep a distinct categorical ramp per palette.
