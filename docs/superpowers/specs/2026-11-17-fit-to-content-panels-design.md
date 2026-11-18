# Fit-to-content dashboard panels

**Date:** 2026-11-17
**Status:** Approved 2026-11-17

## Intent

List-style dashboard panels (Quiet Hours first and foremost) should take up
only as much vertical room as their content needs. Empty, they collapse to a
single grid row showing their title and an "all clear" line. With content,
they grow to fit, up to a per-panel maximum height the user controls by
dragging the resize corner in Customize mode. Past that maximum they scroll
inside the box, as today.

### Why

Today every panel is a fixed number of 64px grid rows, saved per user. Quiet
Hours defaults to 2 rows (144px). With nothing flagged it renders one line and
leaves roughly half the box blank. With three or more flagged devices the list
overflows and scrolls inside a box that is mostly chrome. The same shape
repeats across the other list panels (Active Outliers, Stale Devices, Alerts
Summary, Top Movers, Battery Levels, Recent Episodes, Sensor Environment, Room
Trends). The user's words: "collapse or make smaller if nothing is there, grow
to a reasonable size if there are events."

## Goals

- A fit panel with nothing to show occupies exactly 1 grid row (64px).
- A fit panel with content grows row by row to fit, with no internal scrollbar
  until it reaches its ceiling.
- The user's existing resize gesture keeps working and now sets the ceiling.
- Default ceiling for every fit panel is 5 rows, including for users who
  already have a saved layout.
- Works on desktop (12-column) and mobile (single column) breakpoints.
- Both light and dark themes unaffected (no new colours; layout only).

## Non-goals

- Charts, KPI tiles, House Summary, Week over Week, Live Activity, Rooms,
  Device Categories, Retention Health, Device Health, Day vs Night, Quiet Hours
  Score. These are fixed-shape or always-full panels and keep today's
  behaviour.
- Animating the height change. RGL already transitions item position; a height
  jump when data arrives is acceptable.
- A per-panel on/off toggle for fitting. Fit is a registry property, not a user
  setting.
- Changing what the panels show or how many rows they cap at in data
  (`slice(0, 8)` etc. stay as they are).

## Anti-goals

- A panel that disappears entirely when empty. "No unexpected activity" is good
  news and should stay visible. Floor is 1 row.
- A feedback loop between the measured content height and the cell height.
  The measured element must have intrinsic height, never one derived from the
  grid cell it sits in.
- Persisting the fitted height as the user's ceiling. The stored `h` for a fit
  panel means "maximum rows" and must only change through a user resize.
- Shifting the page every few seconds. Row count only updates when the integer
  row value changes, not on every pixel of content change.

## Constraints

- `react-grid-layout` v2 `Responsive` with `GRID_ROW_HEIGHT = 64`,
  `GRID_MARGIN = [16, 16]`. An item of `h` rows is `h * 64 + (h - 1) * 16` px
  tall. RGL has no built-in auto-height; height must be fed in via `layouts`.
- Layouts persist per user through `usePreference` (localStorage plus server
  blob when signed in). `sanitizeLayouts()` in `useDashboardLayout.js` is the
  only place stored geometry is reconciled with the registry; it already
  re-clamps stored `h` into the registry's `[minH, maxH]` per breakpoint.
- Mobile resize is disabled (`resizeConfig.enabled = editing && !isMobile`), so
  on `sm` the ceiling is whatever is stored (default from the registry) and the
  user cannot change it.
- `DashboardPanel` is the RGL child: RGL injects `style`, `className`, handlers
  and the resize handle. Our content goes in via `body`.
- React 19, Vite, Tailwind v4, vitest + jsdom. jsdom has no `ResizeObserver`,
  so tests mock it.
- ES modules, no new dependencies.

## Approaches considered

1. **Auto wins; width only is the user's.** Fit panels ignore stored height
   completely and the corner drag only changes width. Simplest to explain, but
   removes a control users have today and gives no way to cap a long list.
2. **Fitted height, user drag sets the ceiling.** Height is
   `min(rowsNeeded, storedH)`, floored at 1. Stored `h` keeps its meaning for
   non-fit panels and becomes "max rows" for fit panels. Keeps today's gesture,
   adds collapse and grow. **Chosen.**
3. **Per-panel "fit to content" pin.** A toggle in Customize mode per panel.
   Most flexible, most UI, and nobody has asked for a list panel that stays
   tall while empty.

The user picked 2 and set the default ceiling to 5 rows.

## Design

### Registry (`web/src/lib/dashboardPanels.js`)

Add `fit: true` to these panels: `quietHours`, `anomalies`, `staleDevices`,
`alertsSummary`, `topMovers`, `batteryLevels`, `recentEpisodes`,
`sensorEnvironment`, `roomSparklines`.

For each fit panel: `lg.h` becomes the default ceiling, 5; `minH` becomes 1
(the collapse floor). `smH` follows `lg.h` unless set. `minW` unchanged.

Add `FIT_PANEL_IDS` export for the hook and grid.

### Height arithmetic (`web/src/lib/dashboardPanels.js`)

```
rowsForHeight(px) = max(1, ceil((px + marginY) / (rowHeight + marginY)))
```

With the current constants, 64px or less is 1 row, 65 to 144 is 2, 145 to 224
is 3, and so on. Pure function, unit tested.

### Measurement (`DashboardPanel.jsx`)

New props: `fit` (bool) and `onContentHeight(px)`.

When `fit` is set, the body is rendered inside a measured wrapper whose height
is intrinsic: a plain block element that is not a stretched flex child and has
no `h-full`. A `ResizeObserver` on that element calls `onContentHeight` with
its `offsetHeight` plus the wrapper's own vertical padding (the `p-4 sm:p-5`
for non-bare panels; bare panels draw their own card, so their padding is
already inside the measured element). The outer panel element keeps RGL's
`style` height, so when content is taller than the cell the body wrapper still
scrolls (`overflow-auto` stays on the outer body container).

Measurement runs in both view and edit mode so the grid always knows the
fitted size when the user leaves Customize.

### Effective layout (`DashboardGrid.jsx`)

Holds `fitRows: Map<panelId, rows>` in state, updated from `onContentHeight`
via `rowsForHeight`. Only sets state when the integer changes.

Builds `effectiveLayouts` from `visibleLayouts`:

- Not editing: for each fit panel, `h = clamp(lastRows(id), 1, stored.h)`.
- Editing on desktop: fit panels use `h = stored.h`, so the box the user is
  dragging is the ceiling itself.
- Editing on mobile (`sm`): there is no resize handle, so there is no ceiling
  to show. Fit panels stay at their fitted height exactly as in view mode.

`lastRows(id)` is the most recent measurement for that panel. `DashboardPage`
unmounts on every tab switch (`App.jsx` renders it conditionally), so the
measurement cache lives at module level in `dashboardPanels.js` or the grid
module, keyed by panel id, and survives tab switches for the life of the page.
A panel with no measurement yet (first visit in this browser session) starts
at the floor, 1 row, and grows once measured. Starting low means the common
case (empty list, cached data) paints at its final size with no shift, and a
populated list grows into place rather than collapsing from a 5-row box on
every visit.

Non-fit panels pass through unchanged. RGL's vertical compaction pulls the
panels below a collapsed panel up, which is the visible "collapse".

### Persisting (`useDashboardLayout.js`)

`applyLayoutChange` receives RGL's layout, which carries the *effective* `h`.
Nothing user-driven can change geometry outside Customize mode (drag and
resize are both disabled), so the rule is simple: **layout changes that arrive
while not editing are discarded.** The only changes RGL reports in view mode
are its own compaction after a fit panel grows or shrinks, and persisting
those would write the preference blob on every dashboard visit and make stored
`y` values drift between the collapsed and expanded arrangements. The hook
needs to know whether editing is on: `applyLayoutChange` gains an `editing`
flag (either as a parameter the grid passes, or the page wraps it). Guard it
against a stale closure when the user leaves Customize mid-drag.

While editing on desktop, `h` is taken from RGL as today, since that is the
user dragging the ceiling. While editing on mobile, fit panels render at their
fitted height (see above), so for fit panels on `sm` the stored `h` is kept
even in edit mode and only `x`/`y`/`w` are taken.

Consequence for the migration below: today the mount-time `onLayoutChange`
is what persists the result of `sanitizeLayouts`. With view-mode writes gone,
the migration has to be persisted explicitly when it runs (the hook's
once-per-instance seed effect is the natural place), not left to RGL.

### One-time ceiling migration

Nobody has set a ceiling yet, so every stored `h` for a fit panel is an old
fixed height (2 for Quiet Hours, 4 or 5 for the others). On the first load
after upgrade, `sanitizeLayouts` raises each fit panel's stored `h` (both
breakpoints) to at least the registry default, then records that it has done
so, so a user who later drags a ceiling down to 3 keeps 3. The marker travels
with the layouts blob through `usePreference` so it syncs like the layout
itself, and the raised blob is written through at the time of migration (see
Persisting). Mechanism (a version field on the blob, or a per-item flag) is
the builder's call; the behaviour is not.

### Collapsed states in the panels

For the collapse to reach 1 row the empty state has to fit in 24px of content
height (64px row minus 40px of card padding at the `sm:` breakpoint). Each fit
panel's empty and loading states become a single line: icon, title, then the
message inline in muted text, with the title/message separated by a middle
dot. Example for Quiet Hours:

```
🌙 Quiet Hours · No unexpected activity (11 PM – 6 AM)
```

Long messages truncate with an ellipsis and the full text in `title=`. The
error state ("No quiet hours data yet…") follows the same single-line form, and
so does the not-configured state (`data.enabled === false`), whose copy is
shortened to "Not set up. Configure in Settings." so new installs collapse too.
The populated state is unchanged apart from dropping `h-full` from the card so
its height is intrinsic (the `embedded` flag's fill behaviour becomes
unnecessary once the grid fits the cell to the content).

At mobile width (under 640px, where padding is `p-4`) the budget is 32px, so
the same single line fits.

### Edit-mode hint

The Customize help text on `DashboardPage.jsx` gains one sentence: "List panels
fit their content; dragging their corner sets the maximum height."

### Tests

- `dashboardPanels.test.js`: `rowsForHeight` boundaries (64, 65, 144, 145).
- `useDashboardLayout.test.js`: view-mode layout change is a no-op; edit-mode
  change on `lg` takes `h`; edit-mode change on `sm` keeps `h` for fit panels;
  migration raises 2 to 5 once, writes through, and does not raise again after
  a user sets 3.
- `DashboardPanel.test.jsx`: with `fit`, mounting attaches a `ResizeObserver`
  (mocked) and reports height; without `fit`, no observer.
- `DashboardGrid` or an extracted `effectiveLayouts()` helper: collapsed when
  measured below ceiling, pinned to ceiling while editing on `lg`, fitted while
  editing on `sm`, unmeasured starts at 1, passes non-fit panels through.
- `QuietHoursPanel.test.jsx`: empty state renders on one line with the range;
  existing behaviours unchanged.

Run `npm test` in `web/` before and after.

## Left to the builder

- Exact migration marker shape.
- Whether `onContentHeight` is debounced (a `requestAnimationFrame` coalesce is
  fine; a timer is not needed).
- Whether `effectiveLayouts` lives inline in `DashboardGrid` or as a pure helper
  in `dashboardPanels.js` (the latter is easier to test).
- Where exactly the module-level measurement cache lives, and whether the
  measured height includes the panel's 2px border (it should, so rows are not
  under-counted by a pixel).
- Renumbering the default `lg.y` values in the registry after the fit panels'
  default `h` changes, so fresh installs get a gap-free default layout.
- How the single-line empty state is shared across the nine panels (a small
  `PanelEmptyLine` component, or inline). Keep it consistent.
- Which existing `h-full flex flex-col min-h-0` wrappers in the nine panels
  need to go. Rule: nothing inside a fit panel's body may size itself from the
  cell.
