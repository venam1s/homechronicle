import { Thermometer, Droplets } from 'lucide-react';
import { useSensorEnvironment } from '../hooks/useEvents.js';

export default function SensorEnvironmentPanel() {
  const { data, isLoading, isError } = useSensorEnvironment();

  const header = (
    <div className="flex items-baseline justify-between mb-3">
      <h3 className="text-sm font-semibold text-hc-fg">Sensor Environment</h3>
      <span className="text-xs text-hc-muted">latest temp &amp; humidity</span>
    </div>
  );

  if (isLoading) {
    return <div>{header}<p className="text-sm text-hc-muted">Loading sensor readings…</p></div>;
  }
  if (isError) {
    return <div>{header}<p className="text-sm text-hc-muted">Could not load sensor data.</p></div>;
  }

  const rows = data ?? [];
  if (!rows.length) {
    return <div>{header}<p className="text-sm text-hc-muted">No sensor readings yet.</p></div>;
  }

  return (
    <div className="h-full flex flex-col min-h-0">
      {header}
      <div className="flex-1 min-h-0 overflow-auto space-y-1.5">
        {rows.map((r) => (
          <div key={r.accessoryId} className="flex items-center gap-3 text-sm">
            <div className="min-w-0 flex-1">
              <div className="text-hc-fg truncate">{r.accessoryName}</div>
              {r.roomName && <div className="text-xs text-hc-muted truncate">{r.roomName}</div>}
            </div>
            {r.temperature !== null && (
              <span className="flex items-center gap-1 text-hc-fg tabular-nums whitespace-nowrap">
                <Thermometer size={13} className="text-hc-muted" />
                {r.temperature.toFixed(1)}°
              </span>
            )}
            {r.humidity !== null && (
              <span className="flex items-center gap-1 text-hc-fg tabular-nums whitespace-nowrap">
                <Droplets size={13} className="text-hc-muted" />
                {Math.round(r.humidity)}%
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
