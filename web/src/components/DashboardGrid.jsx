import { useMemo } from 'react';
import { Responsive, useContainerWidth } from 'react-grid-layout';
import { Plus } from 'lucide-react';
import DashboardPanel from './DashboardPanel.jsx';
import { useMediaQuery } from '../hooks/useMediaQuery.js';
import {
  PANELS,
  PANEL_TITLES,
  GRID_BREAKPOINTS,
  GRID_COLS,
  GRID_ROW_HEIGHT,
  GRID_MARGIN,
} from '../lib/dashboardPanels.js';

import KpiCards from './KpiCards.jsx';
import TrendChart from './TrendChart.jsx';
import ActivityChart from './ActivityChart.jsx';
import RoomChart from './RoomChart.jsx';
import TopDevices from './TopDevices.jsx';
import WeekdayHeatmap from './WeekdayHeatmap.jsx';
import MonthlyHeatmap from './MonthlyHeatmap.jsx';
import ActivityFeed from './ActivityFeed.jsx';
import RoomBreakdown from './RoomBreakdown.jsx';
import AnomalyPanel from './AnomalyPanel.jsx';
import StaleDevicesPanel from './StaleDevicesPanel.jsx';

// Maps a panel id to its content element. Kept here (not in the registry) so the
// registry stays serializable and this has access to live data/callbacks.
function renderPanelBody(id, ctx) {
  const {
    dashboardDays,
    syncDashboardRanges,
    setDashboardDays,
    onSelectAccessory,
    onSelectRoom,
    onNavigateToAccessory,
  } = ctx;
  const forcedDays = syncDashboardRanges ? dashboardDays : null;
  const onDaysChange = syncDashboardRanges ? setDashboardDays : null;

  switch (id) {
    case 'kpis':
      return <KpiCards dashboardDays={dashboardDays} />;
    case 'trend':
      return <TrendChart forcedDays={forcedDays} onDaysChange={onDaysChange} />;
    case 'hourly':
      return <ActivityChart />;
    case 'rooms':
      return <RoomChart forcedDays={forcedDays} onDaysChange={onDaysChange} />;
    case 'topDevices':
      return <TopDevices forcedDays={forcedDays} onDaysChange={onDaysChange} />;
    case 'weekdayHeatmap':
      return <WeekdayHeatmap forcedDays={forcedDays} onDaysChange={onDaysChange} />;
    case 'monthlyHeatmap':
      return <MonthlyHeatmap />;
    case 'activityFeed':
      return (
        <ActivityFeed
          onNavigateToAccessory={onNavigateToAccessory}
          onViewAll={() => onNavigateToAccessory?.(null)}
        />
      );
    case 'roomBreakdown':
      return <RoomBreakdown onSelectRoom={onSelectRoom} />;
    case 'anomalies':
      return <AnomalyPanel onSelectAccessory={onSelectAccessory} onSelectRoom={onSelectRoom} />;
    case 'staleDevices':
      return <StaleDevicesPanel onSelectAccessory={onSelectAccessory} />;
    default:
      return null;
  }
}

export default function DashboardGrid({
  editing,
  layouts,
  hidden,
  onLayoutChange,
  onHidePanel,
  onShowPanel,
  ...panelCtx
}) {
  const { width, containerRef, mounted } = useContainerWidth();
  const isMobile = useMediaQuery('(max-width: 767px)');

  const visiblePanels = useMemo(
    () => PANELS.filter((p) => !hidden.has(p.id)),
    [hidden],
  );

  // RGL should only know about visible items; hidden geometry stays in state.
  const visibleLayouts = useMemo(() => {
    const out = {};
    for (const bp of Object.keys(layouts)) {
      out[bp] = layouts[bp].filter((it) => !hidden.has(it.i));
    }
    return out;
  }, [layouts, hidden]);

  const hiddenPanels = PANELS.filter((p) => hidden.has(p.id));

  const dragConfig = { enabled: editing, handle: '.hc-drag-handle', cancel: '.hc-no-drag' };
  const resizeConfig = { enabled: editing && !isMobile, handles: ['se'] };

  return (
    // Defensive width clamp for the useContainerWidth measurement target:
    // min-w-0 lets this grid/flex child shrink below its content, and
    // overflow-x-hidden keeps react-grid-layout's absolutely-positioned items
    // (which can extend past the container mid-drag) from widening it. Measured
    // layout was already correctly bounded without these, so this is belt-and-
    // suspenders rather than a fix for an observed overflow.
    <div ref={containerRef} className="w-full min-w-0 overflow-x-hidden">
      {editing && hiddenPanels.length > 0 && (
        <div className="mb-3 rounded-lg border border-dashed border-hc-panel-border bg-hc-panel-soft p-3">
          <div className="text-xs font-semibold uppercase tracking-wide text-hc-muted mb-2">
            Hidden panels
          </div>
          <div className="flex flex-wrap gap-2">
            {hiddenPanels.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => onShowPanel(p.id)}
                className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border border-hc-panel-border bg-hc-panel text-hc-fg hover:border-hc-accent-strong/40 hover:text-hc-accent-strong transition-colors"
              >
                <Plus size={12} />
                {PANEL_TITLES[p.id]}
              </button>
            ))}
          </div>
        </div>
      )}

      {visiblePanels.length === 0 ? (
        <div className="rounded-xl border border-dashed border-hc-panel-border bg-hc-panel-soft p-10 text-center text-sm text-hc-muted">
          All panels are hidden.{' '}
          {editing ? 'Add one back from the tray above.' : 'Click Customize to add panels back.'}
        </div>
      ) : (
        mounted && width > 0 && (
          <Responsive
            className={editing ? 'hc-grid-editing' : undefined}
            width={width}
            breakpoints={GRID_BREAKPOINTS}
            cols={GRID_COLS}
            rowHeight={GRID_ROW_HEIGHT}
            margin={GRID_MARGIN}
            containerPadding={[0, 0]}
            layouts={visibleLayouts}
            dragConfig={dragConfig}
            resizeConfig={resizeConfig}
            onLayoutChange={onLayoutChange}
          >
            {visiblePanels.map((panel) => (
              <DashboardPanel
                key={panel.id}
                title={panel.title}
                editing={editing}
                bare={panel.bare}
                onRemove={() => onHidePanel(panel.id)}
                body={renderPanelBody(panel.id, panelCtx)}
              />
            ))}
          </Responsive>
        )
      )}
    </div>
  );
}
