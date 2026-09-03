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
  // h:1, minH:1, maxH:1 — the lede is one heading and one sentence, about 50px.
  // It sat in a 144px box (h:2) with minH:2, so ~95px was dead space AND the
  // grid refused to let anyone drag it smaller. maxH is pinned to 1 (not just
  // h/minH) so sanitizeLayouts' registry-derived clamp actually collapses a
  // stale stored height (e.g. 2, from before this row shrank) down to 1 for
  // already-onboarded users, not just fresh installs. HouseSummaryPanel.jsx
  // truncates the heading and paragraph to a single line each, so content is
  // deterministically bounded and never needs to grow past one row.
  // Tradeoff: maxH is a single registry value shared by both breakpoints (see
  // smLayoutItem), so it can't be 1 on desktop and looser on mobile — the old
  // smH:2 override that gave phones extra height for wrapped text is gone.
  // On a narrow phone column the truncated heading/sentence lose more of
  // their tail than on desktop (same 1-line cap, much less width). Accepted
  // as a deliberate product tradeoff: the panel is a compact glance, and the
  // same underlying data (today's count, top room, quiet-hours activity) is
  // fully available elsewhere on the dashboard (KPI cards, Quiet Hours panel).
  { id: 'houseSummary',   title: 'House Summary',       lg: { x: 0, y: 0,  w: 12, h: 1 }, minW: 4, minH: 1, maxH: 1, bare: true },
  { id: 'kpis',           title: 'Overview',            lg: { x: 0, y: 1,  w: 12, h: 2 }, minW: 4, minH: 2, bare: true },
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
    minH: panel.minH,
    ...(panel.maxH != null ? { maxH: panel.maxH } : {}),
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
