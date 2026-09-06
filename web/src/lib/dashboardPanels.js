// Dashboard panel registry.
//
// Single source of truth for which panels exist on the customizable dashboard,
// their human-readable titles, and their default react-grid-layout geometry.
// Rendering of each panel lives in DashboardGrid (it has the data/callback
// context); this module stays serializable metadata only so it can seed
// localStorage layouts and survive JSON round-trips.

// Breakpoints + columns for the responsive grid.
// lg  -> desktop & tablet (>= 768px): 12-column grid
// sm  -> mobile (< 768px): single column, everything stacks full width
export const GRID_BREAKPOINTS = { lg: 768, sm: 0 };
export const GRID_COLS = { lg: 12, sm: 1 };
export const GRID_ROW_HEIGHT = 64;
export const GRID_MARGIN = [16, 16];

// Ordered list of panels. `lg` is the default desktop geometry (x/y/w/h in grid
// units). minW/minH are resize floors. The order here is also the default
// stacking order on mobile and the order shown in the "add panel" tray.
// `bare` panels render components that already draw their own card chrome
// (KPI tiles, the self-carded live feed and room breakdown), so the grid
// wrapper stays transparent to avoid a card-in-card look.
export const PANELS = [
  // v0.4 default arrangement follows the Almanac reading order: the headline
  // numbers, then the thirty-day shape, then the shape of a day, then notes,
  // then what is happening now, then devices, deep history, and outliers last.
  // Changing these defaults does NOT disturb a saved layout — sanitizeLayouts
  // only consults them for panels absent from storage (DASH-03).
  // Desktop (lg): h:1, minH:1, maxH:1 — measured in a real browser (Chrome via
  // Playwright), the heading (single line, truncated) plus the paragraph (up
  // to 2 lines, `line-clamp-2`) plus the panel's own py-1/gap-1 spacing need
  // at most ~56px at any width >= 768px, even with worst-case realistic
  // content (long room name, large numbers, full quiet-hours clause) — a
  // one-row (64px) box fits with only ~8px slack. It sat in a 144px box (h:2)
  // before, so ~95px was dead space AND the grid refused to let anyone drag
  // it smaller. maxH is pinned to minH (1) so sanitizeLayouts' registry-
  // derived clamp actually collapses a stale stored height (e.g. 2, from
  // before this row shrank) down to 1 for already-onboarded desktop users,
  // not just fresh installs — Math.min(rawH, maxH) is the only thing that can
  // pull a stored value DOWN, so this ceiling has to stay tight for the
  // migration to keep working with no manual resize required.
  //
  // Mobile (sm): smH:2 / smMaxH:2. The same content is measured in a real
  // browser to need up to 80px on a single narrow phone column (the
  // paragraph's 2-clause sentence commonly wraps at that width even for
  // everyday, non-extreme content) — more than a single 64px row can hold no
  // matter how much of the panel's own py-1/gap-1 spacing is trimmed (heading
  // 20px + a 2-line paragraph at 48px already exceeds 64px before any
  // padding). smMaxH is a SEPARATE registry field from `maxH`, not just a
  // different smH default: minH/maxH used to be read from a single value
  // shared by both breakpoints in sanitizeLayouts() (see useDashboardLayout.js),
  // so pinning `maxH` to 1 for the desktop migration above would also clamp a
  // correctly-persisted mobile h:2 down to 1 on every load after the first —
  // react-grid-layout persists a layout from its own mount effect, so that's
  // the SECOND page view, not a rare edge case. smMaxH lets sm keep its own,
  // looser ceiling. There's no `smMinH`: mobile resize is already disabled
  // (DashboardGrid's resizeConfig is `enabled: editing && !isMobile`), so a
  // mobile floor wouldn't do anything.
  //
  // smMinH:2 is the mirror of smMaxH:2, needed for the same reason: minH is
  // also read per-breakpoint in sanitizeLayouts() and is the only thing that
  // can force a stored value UP (`Math.max(rawH, minH)`). Without it, anyone
  // who loaded the dashboard on mobile while `maxH:1` was shared across both
  // breakpoints (b111d05/dd8db08) would have had their `sm` height clamped
  // and persisted at 1 — and a bare minH:1 floor would leave them stuck there
  // forever, the same "stale constraint never reaches an already-onboarded
  // user" bug class this whole fix targets, just on the floor instead of the
  // ceiling. Pinning smMinH:2 == smMaxH:2 costs nothing: mobile resize is
  // already disabled (DashboardGrid's resizeConfig is
  // `enabled: editing && !isMobile`), so a mobile floor above 1 has no UX
  // effect beyond correcting exactly this stale-value case.
  //
  // Known limitation, not fixed here: minW/minH stay a single shared value on
  // desktop. A user who drags this panel's WIDTH down to minW:4 on desktop
  // gets a permanent scrollbar (no matching height increase), since maxH:1
  // leaves no headroom to grow into. Self-inflicted via manual resize, out of
  // scope for this pass, called out here so it isn't rediscovered as a surprise.
  { id: 'houseSummary',   title: 'House Summary',       lg: { x: 0, y: 0,  w: 12, h: 1 }, minW: 4, minH: 1, maxH: 1, smH: 2, smMinH: 2, smMaxH: 2, bare: true },
  // kpis follows the same migration mechanics as houseSummary above, for the
  // same bug on the neighbouring panel: the KPI card row's measured content
  // height used to sit BETWEEN two row sizes (160px vs a 144px h:2 box), so
  // h:2 scrolled and h:3 left a ~64px blank band under the cards — the
  // "gap between widgets" report. KpiCards is now trimmed to ~136px (see its
  // layout notes) and stretches to fill its box, and maxH:2 == minH:2 pins the
  // desktop height so sanitizeLayouts clamps an already-persisted h:3 back
  // down on load, with no manual resize or layout reset.
  //
  // Mobile (sm): the cards stack 2x2 in the single narrow column and measure
  // ~256px — the old shared h:2 (144px) box has ALWAYS overflowed there.
  // smH/smMinH/smMaxH: 4 (304px box) gives the stack room; auto-rows-fr in
  // KpiCards distributes the slack inside the cards rather than below them.
  // smMinH is the half that migrates existing users UP from a stored sm h:2
  // (Math.max), smMaxH pins the ceiling; mobile resize is disabled anyway.
  { id: 'kpis',           title: 'Overview',            lg: { x: 0, y: 1,  w: 12, h: 2 }, minW: 4, minH: 2, maxH: 2, smH: 4, smMinH: 4, smMaxH: 4, bare: true },
  { id: 'roomMap',        title: 'Where Things Happen', lg: { x: 0, y: 3,  w: 7,  h: 5 }, minW: 4, minH: 4 },
  { id: 'rhythmArc',      title: "Today's Rhythm",      lg: { x: 7, y: 3,  w: 5,  h: 5 }, minW: 3, minH: 4 },
  { id: 'trend',          title: 'Daily Activity',      lg: { x: 0, y: 8,  w: 12, h: 5 }, minW: 4, minH: 3 },
  { id: 'hourly',         title: 'Events by Hour',      lg: { x: 0, y: 13, w: 6,  h: 4 }, minW: 3, minH: 3 },
  { id: 'rooms',          title: 'Events by Room',      lg: { x: 6, y: 13, w: 6,  h: 4 }, minW: 3, minH: 3 },
  { id: 'quietHours',     title: 'Quiet Hours',         lg: { x: 0, y: 17, w: 12, h: 2 }, minW: 4, minH: 2, bare: true },
  { id: 'activityFeed',   title: 'Live Activity',       lg: { x: 0, y: 19, w: 6,  h: 6 }, minW: 3, minH: 4, bare: true },
  { id: 'roomBreakdown',  title: 'Rooms',               lg: { x: 6, y: 19, w: 6,  h: 6 }, minW: 3, minH: 4, bare: true },
  { id: 'topDevices',     title: 'Most Active Devices', lg: { x: 0, y: 25, w: 6,  h: 5 }, minW: 3, minH: 3 },
  { id: 'weekdayHeatmap', title: 'Weekly Pattern',      lg: { x: 6, y: 25, w: 6,  h: 5 }, minW: 3, minH: 3 },
  { id: 'monthlyHeatmap', title: 'Monthly Activity',    lg: { x: 0, y: 30, w: 12, h: 4 }, minW: 4, minH: 3 },
  { id: 'anomalies',      title: 'Active Outliers',     lg: { x: 0, y: 34, w: 6,  h: 4 }, minW: 3, minH: 3 },
  { id: 'staleDevices',   title: 'Stale Devices',       lg: { x: 6, y: 34, w: 6,  h: 4 }, minW: 3, minH: 3 },
  // Optional panels — hidden by default; power users opt in via the "+ Add" tray.
  { id: 'weekOverWeek',   title: 'Week over Week',      lg: { x: 0, y: 39, w: 12, h: 2 }, minW: 4, minH: 2, maxH: 2, bare: true, optional: true },
  { id: 'healthDonut',    title: 'Device Health',       lg: { x: 0, y: 41, w: 6,  h: 4 }, minW: 3, minH: 3, optional: true },
  { id: 'alertsSummary',  title: 'Alerts Summary',      lg: { x: 6, y: 41, w: 6,  h: 4 }, minW: 3, minH: 3, optional: true },
  { id: 'topMovers',      title: 'Top Movers',          lg: { x: 0, y: 45, w: 6,  h: 4 }, minW: 3, minH: 3, optional: true },
  { id: 'dayNight',       title: 'Day vs Night',         lg: { x: 6, y: 45, w: 6,  h: 4 }, minW: 3, minH: 3, optional: true },
  { id: 'quietCompliance', title: 'Quiet Hours Score',  lg: { x: 0, y: 49, w: 6,  h: 4 }, minW: 3, minH: 3, optional: true },
  { id: 'roomSparklines', title: 'Room Trends',         lg: { x: 6, y: 49, w: 6,  h: 4 }, minW: 3, minH: 3, optional: true },
  // Tier 2 optional panels — also hidden by default; backed by read-only stats endpoints.
  { id: 'sensorEnvironment', title: 'Sensor Environment', lg: { x: 0, y: 53, w: 6,  h: 4 }, minW: 3, minH: 3, optional: true },
  { id: 'batteryLevels',     title: 'Battery Levels',     lg: { x: 6, y: 53, w: 6,  h: 4 }, minW: 3, minH: 3, optional: true },
  { id: 'recentEpisodes',    title: 'Recent Episodes',    lg: { x: 0, y: 57, w: 6,  h: 5 }, minW: 3, minH: 4, optional: true },
  { id: 'retentionHealth',   title: 'Retention Health',   lg: { x: 6, y: 57, w: 6,  h: 4 }, minW: 3, minH: 3, optional: true },
  { id: 'eventTypeBreakdown', title: 'Event Types',       lg: { x: 0, y: 62, w: 6,  h: 4 }, minW: 3, minH: 3, optional: true },
];

export const PANEL_IDS = PANELS.map((p) => p.id);
export const PANEL_TITLES = Object.fromEntries(PANELS.map((p) => [p.id, p.title]));
export const OPTIONAL_PANEL_IDS = PANELS.filter((p) => p.optional).map((p) => p.id);
// Lookup by id. minW/minH/maxH are app-defined resize constraints (never something
// a user sets directly — RGL resize only ever changes x/y/w/h), so callers should
// always read them from here rather than from a persisted layout blob. See
// sanitizeLayouts() in useDashboardLayout.js for why: a constraint that tightens in
// a later release must reach users who already have a saved layout, not just fresh
// installs.
export const PANEL_BY_ID = Object.fromEntries(PANELS.map((p) => [p.id, p]));

function lgLayoutItem(panel) {
  return {
    i: panel.id,
    x: panel.lg.x,
    y: panel.lg.y,
    w: panel.lg.w,
    h: panel.lg.h,
    minW: panel.minW,
    minH: panel.minH,
    ...(panel.maxH != null ? { maxH: panel.maxH } : {}),
  };
}

// Mobile layout: one column, panels stacked in registry order, full width.
// `y` is the cumulative height of preceding panels so the column is gap-free.
function smLayoutItem(panel, y) {
  return {
    i: panel.id,
    x: 0,
    y,
    w: 1,
    // `smH` overrides the desktop height for the single-column layout: a lede
    // that fits one row at 1600px wraps to several lines at phone width.
    h: panel.smH ?? panel.lg.h,
    minW: 1,
    // `smMinH` overrides the desktop minH the same way `smH` overrides h: see
    // sanitizeLayouts() in useDashboardLayout.js, which reads this same field
    // per-breakpoint as the floor a stale stored value gets forced UP to.
    minH: panel.smMinH ?? panel.minH,
    // `smMaxH` overrides the desktop maxH the same way `smH` overrides h: when
    // a panel's mobile default genuinely needs to be taller than its desktop
    // ceiling (houseSummary: sm needs 2 rows, lg is pinned to 1), the shared
    // `maxH` can't express both — see sanitizeLayouts() in
    // useDashboardLayout.js, which reads this same field per-breakpoint.
    ...(panel.smMaxH != null ? { maxH: panel.smMaxH }
      : panel.maxH != null ? { maxH: panel.maxH } : {}),
  };
}

// Factory so callers always get a fresh, deeply-owned copy (react-grid-layout
// mutates layout arrays it is handed, and we persist these to localStorage).
export function defaultLayouts() {
  let smY = 0;
  const sm = PANELS.map((panel) => {
    const item = smLayoutItem(panel, smY);
    smY += panel.smH ?? panel.lg.h;
    return item;
  });
  return {
    lg: PANELS.map(lgLayoutItem),
    sm,
  };
}

// Build a single-breakpoint default layout array for a known panel id, used when
// restoring a previously-hidden panel that has no stored geometry. RGL compacts
// the result, so an approximate stacked position is fine for the mobile seed.
export function defaultLayoutItem(panelId, breakpoint = 'lg') {
  const index = PANELS.findIndex((p) => p.id === panelId);
  if (index === -1) return null;
  const panel = PANELS[index];
  if (breakpoint !== 'sm') return lgLayoutItem(panel);
  const y = PANELS.slice(0, index).reduce((acc, p) => acc + (p.smH ?? p.lg.h), 0);
  return smLayoutItem(panel, y);
}
