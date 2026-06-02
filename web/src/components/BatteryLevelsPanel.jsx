import { BatteryLow, Battery } from 'lucide-react';
import { useBatteryLevels } from '../hooks/useEvents.js';

const LOW_THRESHOLD = 20;

function isLow(row) {
  return row.lowBattery === true || (row.batteryLevel != null && row.batteryLevel <= LOW_THRESHOLD);
}

export default function BatteryLevelsPanel() {
  const { data, isLoading, isError } = useBatteryLevels();

  const header = (
    <div className="flex items-baseline justify-between mb-3">
      <h3 className="text-sm font-semibold text-hc-fg">Battery Levels</h3>
      <span className="text-xs text-hc-muted">low first</span>
    </div>
  );

  if (isLoading) {
    return <div>{header}<p className="text-sm text-hc-muted">Checking battery levels…</p></div>;
  }
  if (isError) {
    return <div>{header}<p className="text-sm text-hc-muted">Could not load battery data.</p></div>;
  }

  const rows = data ?? [];
  if (!rows.length) {
    return <div>{header}<p className="text-sm text-hc-muted">No battery-powered devices reporting.</p></div>;
  }

  return (
    <div className="h-full flex flex-col min-h-0">
      {header}
      <div className="flex-1 min-h-0 overflow-auto space-y-2">
        {rows.map((r) => {
          const low = isLow(r);
          const Icon = low ? BatteryLow : Battery;
          const pct = r.batteryLevel;
          return (
            <div key={r.accessoryId} className="flex items-center gap-3 text-sm">
              <Icon size={15} className={low ? 'text-hc-warning-text shrink-0' : 'text-hc-muted shrink-0'} />
              <div className="min-w-0 flex-1">
                <div className="text-hc-fg truncate">{r.accessoryName}</div>
                {r.roomName && <div className="text-xs text-hc-muted truncate">{r.roomName}</div>}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {pct != null ? (
                  <>
                    <div className="w-16 h-1.5 rounded-full bg-hc-panel-mid overflow-hidden">
                      <div
                        className={low ? 'h-full bg-hc-warning-text' : 'h-full bg-hc-success-text'}
                        style={{ width: `${Math.max(0, Math.min(100, pct))}%` }}
                      />
                    </div>
                    <span className={`tabular-nums font-semibold ${low ? 'text-hc-warning-text' : 'text-hc-fg'}`}>
                      {pct}%
                    </span>
                  </>
                ) : (
                  <span className={`text-xs font-semibold uppercase tracking-wide ${low ? 'text-hc-warning-text' : 'text-hc-muted'}`}>
                    {low ? 'Low' : 'OK'}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
