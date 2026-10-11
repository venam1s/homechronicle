import { useMemo } from 'react';
import { AlertTriangle } from 'lucide-react';
import { useAnomalies, useAccessories } from '../hooks/useEvents.js';
import { utcHourToLocal, formatHour12 } from '../lib/hours.js';

/**
 * The outlier sentence in the viewer's local time. The listener's `message` is
 * pre-formatted with a UTC hour ("drop-off at 12pm UTC"), which was the one UTC
 * time on a dashboard that is otherwise local, so rebuild it from the
 * structured `hour` and `kind` fields. Falls back to `message` if they are
 * missing.
 */
export function describeOutlier(row) {
  const hour = Number(row.hour);
  if (row.hour == null || !Number.isInteger(hour) || hour < 0 || hour > 23) return row.message;
  const what = row.kind === 'spike' ? 'spike' : 'drop-off';
  return `${row.scopeType} activity ${what} at ${formatHour12(utcHourToLocal(hour))}`;
}

function labelFor(scopeType) {
  return scopeType === 'room' ? 'Room' : 'Device';
}

export default function AnomalyPanel({ onSelectAccessory, onSelectRoom }) {
  const { data, isLoading, isError } = useAnomalies();
  const { data: accessories } = useAccessories();

  const nameToId = useMemo(() => {
    const map = new Map();
    for (const a of accessories ?? []) map.set(a.accessory_name, a.accessory_id);
    return map;
  }, [accessories]);

  const header = (
    <div className="flex items-baseline justify-between mb-3">
      <div className="flex items-center gap-2">
        <AlertTriangle size={14} className="text-hc-warning-text" />
        <h3 className="text-sm font-semibold text-hc-fg">Active Outliers</h3>
      </div>
      <span className="text-xs text-hc-muted">devices + rooms</span>
    </div>
  );

  if (isLoading) {
    return <div>{header}<p className="text-sm text-hc-muted">Analyzing baselines…</p></div>;
  }
  if (isError) {
    return <div>{header}<p className="text-sm text-hc-danger-text">Failed to load anomaly data.</p></div>;
  }

  const rows = [
    ...(data?.devices ?? []).map((row) => ({ ...row, scopeType: 'device' })),
    ...(data?.rooms ?? []).map((row) => ({ ...row, scopeType: 'room' })),
  ].slice(0, 8);

  if (!rows.length) {
    return <div>{header}<p className="text-sm text-hc-muted">No active outliers versus baseline in the last 24 hours.</p></div>;
  }

  return (
    <div>
      {header}
      <div className="space-y-2">
        {rows.map((row) => (
          <div
            key={`${row.scopeType}:${row.scopeName}:${row.hour}:${row.kind}`}
            role="button"
            tabIndex={0}
            onClick={() => {
              if (row.scopeType === 'device') {
                const id = nameToId.get(row.scopeName);
                if (id) onSelectAccessory?.(id);
              } else {
                onSelectRoom?.(row.scopeName);
              }
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                if (row.scopeType === 'device') {
                  const id = nameToId.get(row.scopeName);
                  if (id) onSelectAccessory?.(id);
                } else {
                  onSelectRoom?.(row.scopeName);
                }
              }
            }}
            className="rounded-lg border border-hc-warning-border bg-hc-warning-bg px-3 py-2 cursor-pointer hover:opacity-90 transition-opacity"
          >
            <div className="flex items-center gap-2 text-xs text-hc-warning-text">
              <AlertTriangle size={12} />
              <span className="uppercase tracking-wide font-semibold">{labelFor(row.scopeType)}</span>
              <span className="text-hc-warning-text opacity-80">{row.kind}</span>
              <span className="ml-auto">score {row.score}</span>
            </div>
            <div className="text-sm text-hc-fg mt-1">
              {row.scopeName}
            </div>
            <div className="text-xs text-hc-warning-text mt-0.5">
              {describeOutlier(row)} · observed {row.eventCount}, baseline {row.baselineAvg}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
