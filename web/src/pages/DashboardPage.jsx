import { useEffect, useState } from 'react';
import clsx from 'clsx';
import { Link2, Unlink2 } from 'lucide-react';
import KpiCards from '../components/KpiCards.jsx';
import ActivityFeed from '../components/ActivityFeed.jsx';
import RoomBreakdown from '../components/RoomBreakdown.jsx';
import ActivityChart from '../components/ActivityChart.jsx';
import TrendChart from '../components/TrendChart.jsx';
import TopDevices from '../components/TopDevices.jsx';
import RoomChart from '../components/RoomChart.jsx';
import WeekdayHeatmap from '../components/WeekdayHeatmap.jsx';
import MonthlyHeatmap from '../components/MonthlyHeatmap.jsx';
import AnomalyPanel from '../components/AnomalyPanel.jsx';
import StaleDevicesPanel from '../components/StaleDevicesPanel.jsx';
import QuietHoursPanel from '../components/QuietHoursPanel.jsx';
import PairingHealthBanner from '../components/PairingHealthBanner.jsx';
import Card from '../components/Card.jsx';

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

  useEffect(() => { try { window.localStorage.setItem(RANGE_KEY, String(dashboardDays)); } catch {} }, [dashboardDays]);
  useEffect(() => { try { window.localStorage.setItem(SYNC_KEY, String(syncDashboardRanges)); } catch {} }, [syncDashboardRanges]);
  return (
    <div className="max-w-5xl mx-auto py-4 sm:py-6 px-3 sm:px-4 space-y-4">

      <div className="mb-6">
        <h1 className="text-hc-page-title font-semibold text-hc-fg-strong">Dashboard</h1>
      </div>

      <PairingHealthBanner onViewDetails={onViewDeviceRepair} />

      {/* KPI cards row */}
      <KpiCards dashboardDays={dashboardDays} />

      <div className="flex items-center justify-between px-1">
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

      {/* Full-width trend chart */}
      <Card>
        <Card.Body>
          <TrendChart
            forcedDays={syncDashboardRanges ? dashboardDays : null}
            onDaysChange={syncDashboardRanges ? setDashboardDays : null}
          />
        </Card.Body>
      </Card>

      {/* Quiet hours */}
      <QuietHoursPanel onNavigateToAccessory={onNavigateToAccessory} />

      {/* 2-col: hourly activity + room breakdown */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <Card.Body>
            <ActivityChart />
          </Card.Body>
        </Card>
        <Card>
          <Card.Body>
            <RoomChart
              forcedDays={syncDashboardRanges ? dashboardDays : null}
              onDaysChange={syncDashboardRanges ? setDashboardDays : null}
            />
          </Card.Body>
        </Card>
      </div>

      {/* 2-col: top devices + heatmaps */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <Card.Body>
            <TopDevices
              forcedDays={syncDashboardRanges ? dashboardDays : null}
              onDaysChange={syncDashboardRanges ? setDashboardDays : null}
            />
          </Card.Body>
        </Card>
        <Card>
          <Card.Body>
            <WeekdayHeatmap
              forcedDays={syncDashboardRanges ? dashboardDays : null}
              onDaysChange={syncDashboardRanges ? setDashboardDays : null}
            />
            <div className="mt-4 pt-4 border-t border-hc-panel-border">
              <MonthlyHeatmap />
            </div>
          </Card.Body>
        </Card>
      </div>

      {/* Live activity feed */}
      <ActivityFeed
        onNavigateToAccessory={onNavigateToAccessory}
        onViewAll={() => onNavigateToAccessory?.(null)}
      />

      {/* Room breakdown */}
      <RoomBreakdown onSelectRoom={onSelectRoom} />

      {/* 2-col: active outliers + stale devices */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <Card.Body>
            <AnomalyPanel onSelectAccessory={onSelectAccessory} onSelectRoom={onSelectRoom} />
          </Card.Body>
        </Card>
        <Card>
          <Card.Body>
            <StaleDevicesPanel onSelectAccessory={onSelectAccessory} />
          </Card.Body>
        </Card>
      </div>

    </div>
  );
}
