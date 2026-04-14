import clsx from 'clsx';
import { Link2, Unlink2 } from 'lucide-react';
import StatsCards from '../components/StatsCards.jsx';
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

export const DASHBOARD_WINDOWS = [
  { label: '7d', days: 7 },
  { label: '30d', days: 30 },
  { label: '90d', days: 90 },
];
export const DASHBOARD_RANGE_STORAGE_KEY = 'hc_dashboard_global_days';
export const DASHBOARD_SYNC_STORAGE_KEY = 'hc_dashboard_sync_ranges';

export default function DashboardPage({
  dashboardDays,
  setDashboardDays,
  syncDashboardRanges,
  setSyncDashboardRanges,
  onSelectAccessory,
  onSelectRoom,
  onNavigateToAccessory,
  onViewDeviceRepair,
}) {
  return (
    <div className="max-w-5xl mx-auto py-4 sm:py-6 px-3 sm:px-4 space-y-4">

      <PairingHealthBanner onViewDetails={onViewDeviceRepair} />

      {/* KPI cards row */}
      <StatsCards />

      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-1 bg-white border border-gray-200 rounded-lg p-0.5 shadow-sm">
          {DASHBOARD_WINDOWS.map(({ label, days }) => (
            <button
              key={days}
              onClick={() => setDashboardDays(days)}
              className={clsx(
                'text-xs px-2.5 py-1 rounded-md transition-colors',
                dashboardDays === days
                  ? 'bg-blue-100 text-blue-700 font-medium'
                  : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'
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
              ? 'bg-blue-50 border-blue-200 text-blue-600'
              : 'bg-white border-gray-200 text-gray-400 hover:text-gray-600'
          )}
        >
          {syncDashboardRanges ? <Link2 size={12} /> : <Unlink2 size={12} />}
          <span className="hidden sm:inline">{syncDashboardRanges ? 'Synced' : 'Sync'}</span>
        </button>
      </div>

      {/* Full-width trend chart */}
      <div className="bg-white rounded-xl shadow-sm p-4 sm:p-5">
        <TrendChart
          forcedDays={syncDashboardRanges ? dashboardDays : null}
          onDaysChange={syncDashboardRanges ? setDashboardDays : null}
        />
      </div>

      {/* 2-col: hourly activity + room breakdown */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white rounded-xl shadow-sm p-4 sm:p-5">
          <ActivityChart />
        </div>
        <div className="bg-white rounded-xl shadow-sm p-4 sm:p-5">
          <RoomChart
            forcedDays={syncDashboardRanges ? dashboardDays : null}
            onDaysChange={syncDashboardRanges ? setDashboardDays : null}
          />
        </div>
      </div>

      {/* 2-col: top devices + heatmaps */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white rounded-xl shadow-sm p-4 sm:p-5">
          <TopDevices
            forcedDays={syncDashboardRanges ? dashboardDays : null}
            onDaysChange={syncDashboardRanges ? setDashboardDays : null}
          />
        </div>
        <div className="bg-white rounded-xl shadow-sm p-4 sm:p-5">
          <WeekdayHeatmap
            forcedDays={syncDashboardRanges ? dashboardDays : null}
            onDaysChange={syncDashboardRanges ? setDashboardDays : null}
          />
          <div className="mt-4 pt-4 border-t border-gray-100">
            <MonthlyHeatmap />
          </div>
        </div>
      </div>

      {/* Quiet hours */}
      <QuietHoursPanel onNavigateToAccessory={onNavigateToAccessory} />

      {/* 2-col: active outliers + stale devices */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white rounded-xl shadow-sm p-4 sm:p-5">
          <AnomalyPanel onSelectAccessory={onSelectAccessory} onSelectRoom={onSelectRoom} />
        </div>
        <div className="bg-white rounded-xl shadow-sm p-4 sm:p-5">
          <StaleDevicesPanel onSelectAccessory={onSelectAccessory} />
        </div>
      </div>

    </div>
  );
}
