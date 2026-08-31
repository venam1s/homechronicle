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
  { id: 'kpis',           title: 'Overview',            lg: { x: 0, y: 0,  w: 12, h: 2 }, minW: 4, minH: 2, bare: true },
  { id: 'trend',          title: 'Daily Activity',      lg: { x: 0, y: 2,  w: 12, h: 5 }, minW: 4, minH: 3 },
  { id: 'hourly',         title: 'Events by Hour',      lg: { x: 0, y: 7,  w: 6,  h: 4 }, minW: 3, minH: 3 },
  { id: 'rooms',          title: 'Events by Room',      lg: { x: 6, y: 7,  w: 6,  h: 4 }, minW: 3, minH: 3 },
  { id: 'quietHours',     title: 'Quiet Hours',         lg: { x: 0, y: 11, w: 12, h: 2 }, minW: 4, minH: 2, bare: true },
  { id: 'activityFeed',   title: 'Live Activity',       lg: { x: 0, y: 13, w: 6,  h: 6 }, minW: 3, minH: 4, bare: true },
  { id: 'roomBreakdown',  title: 'Rooms',               lg: { x: 6, y: 13, w: 6,  h: 6 }, minW: 3, minH: 4, bare: true },
  { id: 'topDevices',     title: 'Most Active Devices', lg: { x: 0, y: 19, w: 6,  h: 5 }, minW: 3, minH: 3 },
  { id: 'weekdayHeatmap', title: 'Weekly Pattern',      lg: { x: 6, y: 19, w: 6,  h: 5 }, minW: 3, minH: 3 },
  { id: 'monthlyHeatmap', title: 'Monthly Activity',    lg: { x: 0, y: 24, w: 12, h: 4 }, minW: 4, minH: 3 },
  { id: 'anomalies',      title: 'Active Outliers',     lg: { x: 0, y: 28, w: 6,  h: 4 }, minW: 3, minH: 3 },
  { id: 'staleDevices',   title: 'Stale Devices',       lg: { x: 6, y: 28, w: 6,  h: 4 }, minW: 3, minH: 3 },
  // Optional panels — hidden by default; power users opt in via the "+ Add" tray.
  { id: 'weekOverWeek',   title: 'Week over Week',      lg: { x: 0, y: 32, w: 12, h: 2 }, minW: 4, minH: 2, maxH: 2, bare: true, optional: true },
  { id: 'healthDonut',    title: 'Device Health',       lg: { x: 0, y: 35, w: 6,  h: 4 }, minW: 3, minH: 3, optional: true },
  { id: 'alertsSummary',  title: 'Alerts Summary',      lg: { x: 6, y: 35, w: 6,  h: 4 }, minW: 3, minH: 3, optional: true },
  { id: 'topMovers',      title: 'Top Movers',          lg: { x: 0, y: 39, w: 6,  h: 4 }, minW: 3, minH: 3, optional: true },
  { id: 'dayNight',       title: 'Day vs Night',         lg: { x: 6, y: 39, w: 6,  h: 4 }, minW: 3, minH: 3, optional: true },
  { id: 'quietCompliance', title: 'Quiet Hours Score',  lg: { x: 0, y: 43, w: 6,  h: 4 }, minW: 3, minH: 3, optional: true },
  { id: 'roomSparklines', title: 'Room Trends',         lg: { x: 6, y: 43, w: 6,  h: 4 }, minW: 3, minH: 3, optional: true },
  // Tier 2 optional panels — also hidden by default; backed by read-only stats endpoints.
  { id: 'sensorEnvironment', title: 'Sensor Environment', lg: { x: 0, y: 47, w: 6,  h: 4 }, minW: 3, minH: 3, optional: true },
  { id: 'batteryLevels',     title: 'Battery Levels',     lg: { x: 6, y: 47, w: 6,  h: 4 }, minW: 3, minH: 3, optional: true },
  { id: 'recentEpisodes',    title: 'Recent Episodes',    lg: { x: 0, y: 51, w: 6,  h: 5 }, minW: 3, minH: 4, optional: true },
  { id: 'retentionHealth',   title: 'Retention Health',   lg: { x: 6, y: 51, w: 6,  h: 4 }, minW: 3, minH: 3, optional: true },
  { id: 'eventTypeBreakdown', title: 'Event Types',       lg: { x: 0, y: 56, w: 6,  h: 4 }, minW: 3, minH: 3, optional: true },
];

export const PANEL_IDS = PANELS.map((p) => p.id);
export const PANEL_TITLES = Object.fromEntries(PANELS.map((p) => [p.id, p.title]));
export const OPTIONAL_PANEL_IDS = PANELS.filter((p) => p.optional).map((p) => p.id);
// Per-panel max grid height (rows). Used to clamp stored layouts on load so a
// previously-saved oversize height (e.g. a panel the user dragged taller before
// a max was introduced) is corrected down without requiring a manual resize.
export const PANEL_MAX_H = Object.fromEntries(
  PANELS.filter((p) => p.maxH != null).map((p) => [p.id, p.maxH]),
);

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
    h: panel.lg.h,
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
    smY += panel.lg.h;
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
  const y = PANELS.slice(0, index).reduce((acc, p) => acc + p.lg.h, 0);
  return smLayoutItem(panel, y);
}
