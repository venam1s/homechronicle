import { useEffect, useState } from 'react';
import clsx from 'clsx';
import { Link2, Unlink2, LayoutGrid, Check, RotateCcw } from 'lucide-react';
import PairingHealthBanner from '../components/PairingHealthBanner.jsx';
import DashboardGrid from '../components/DashboardGrid.jsx';
import PageContainer from '../components/PageContainer.jsx';
import { useDashboardLayout } from '../hooks/useDashboardLayout.js';

const DASHBOARD_WINDOWS = [
  { label: '7d', days: 7 },
  { label: '30d', days: 30 },
  { label: '90d', days: 90 },
];
const RANGE_KEY = 'hc_dashboard_global_days';
const SYNC_KEY = 'hc_dashboard_sync_ranges';

export default function DashboardPage({
  onSelectAccessory,
  onSelectRoom,
  onNavigateToAccessory,
  onViewDeviceRepair,
}) {
  const [dashboardDays, setDashboardDays] = useState(() => {
    try {
      const stored = Number.parseInt(window.localStorage.getItem(RANGE_KEY) ?? '', 10);
      return DASHBOARD_WINDOWS.some((w) => w.days === stored) ? stored : 30;
    } catch { return 30; }
  });
  const [syncDashboardRanges, setSyncDashboardRanges] = useState(() => {
    try {
      const stored = window.localStorage.getItem(SYNC_KEY);
      return stored == null ? true : stored !== 'false';
    } catch { return true; }
  });
  const [editing, setEditing] = useState(false);

  const {
    layouts,
    hidden,
    applyLayoutChange,
    hidePanel,
    showPanel,
    reset,
  } = useDashboardLayout();

  useEffect(() => { try { window.localStorage.setItem(RANGE_KEY, String(dashboardDays)); } catch {} }, [dashboardDays]);
  useEffect(() => { try { window.localStorage.setItem(SYNC_KEY, String(syncDashboardRanges)); } catch {} }, [syncDashboardRanges]);

  function handleReset() {
    const ok = typeof window === 'undefined' || typeof window.confirm !== 'function'
      ? true
      : window.confirm('Reset the dashboard to its default layout? This restores all panels and their positions.');
    if (ok) reset();
  }

  return (
    <PageContainer className="space-y-4">

      <div className="mb-2">
        <h1 className="text-hc-page-title font-semibold text-hc-fg-strong">Dashboard</h1>
      </div>

      <PairingHealthBanner onViewDetails={onViewDeviceRepair} />

      <div className="flex items-center justify-between gap-3 px-1">
        {/* Left: range window + sync toggle */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 bg-hc-panel border border-hc-panel-border rounded-lg p-0.5 shadow-sm">
            {DASHBOARD_WINDOWS.map(({ label, days }) => (
              <button
                key={days}
                onClick={() => setDashboardDays(days)}
                className={clsx(
                  'text-xs px-2.5 py-1 rounded-md transition-colors',
                  dashboardDays === days
                    ? 'bg-hc-accent-soft text-hc-accent-strong font-medium'
                    : 'text-hc-muted hover:text-hc-fg hover:bg-hc-panel-hover'
                )}
              >
                {label}
              </button>
            ))}
          </div>
          <button
            onClick={() => setSyncDashboardRanges((v) => !v)}
            title={syncDashboardRanges ? 'Charts synced — click to unsync' : 'Charts independent — click to sync'}
            className={clsx(
              'flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border transition-colors',
              syncDashboardRanges
                ? 'bg-hc-accent-soft border-hc-accent-strong/30 text-hc-accent-strong'
                : 'bg-hc-panel border-hc-panel-border text-hc-muted hover:text-hc-fg'
            )}
          >
            {syncDashboardRanges ? <Link2 size={12} /> : <Unlink2 size={12} />}
            <span className="hidden sm:inline">{syncDashboardRanges ? 'Synced' : 'Sync'}</span>
          </button>
        </div>

        {/* Right: customize controls */}
        <div className="flex items-center gap-2">
          {editing && (
            <button
              onClick={handleReset}
              className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border border-hc-panel-border bg-hc-panel text-hc-muted hover:text-hc-fg transition-colors"
            >
              <RotateCcw size={13} />
              <span className="hidden sm:inline">Reset</span>
            </button>
          )}
          <button
            onClick={() => setEditing((v) => !v)}
            className={clsx(
              'flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border transition-colors',
              editing
                ? 'bg-hc-accent-strong border-hc-accent-strong text-white hover:opacity-90'
                : 'bg-hc-panel border-hc-panel-border text-hc-muted hover:text-hc-fg',
            )}
          >
            {editing ? <Check size={13} /> : <LayoutGrid size={13} />}
            <span>{editing ? 'Done' : 'Customize'}</span>
          </button>
        </div>
      </div>

      {editing && (
        <p className="text-xs text-hc-muted px-1">
          Drag panels by their header to rearrange, drag the bottom-right corner to resize, or remove them with ✕. Changes save automatically.
        </p>
      )}

      <DashboardGrid
        editing={editing}
        layouts={layouts}
        hidden={hidden}
        onLayoutChange={applyLayoutChange}
        onHidePanel={hidePanel}
        onShowPanel={showPanel}
        dashboardDays={dashboardDays}
        syncDashboardRanges={syncDashboardRanges}
        setDashboardDays={setDashboardDays}
        onSelectAccessory={onSelectAccessory}
        onSelectRoom={onSelectRoom}
        onNavigateToAccessory={onNavigateToAccessory}
      />

    </PageContainer>
  );
}
