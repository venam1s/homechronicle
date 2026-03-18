import { AlertTriangle } from 'lucide-react';
import { useAnomalies } from '../hooks/useEvents.js';

function labelFor(scopeType) {
  return scopeType === 'room' ? 'Room' : 'Device';
}

export default function AnomalyPanel() {
  const { data, isLoading, isError } = useAnomalies();

  const header = (
    <div className="flex items-baseline justify-between mb-3">
      <div className="flex items-center gap-2">
        <AlertTriangle size={14} className="text-amber-500" />
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200">Active Outliers</h3>
      </div>
      <span className="text-xs text-gray-400 dark:text-gray-500">devices + rooms</span>
    </div>
  );

  if (isLoading) {
    return <div>{header}<p className="text-sm text-gray-400 dark:text-gray-500">Analyzing baselines…</p></div>;
  }
  if (isError) {
    return <div>{header}<p className="text-sm text-red-500">Failed to load anomaly data.</p></div>;
  }

  const rows = [
    ...(data?.devices ?? []).map((row) => ({ ...row, scopeType: 'device' })),
    ...(data?.rooms ?? []).map((row) => ({ ...row, scopeType: 'room' })),
  ].slice(0, 8);

  if (!rows.length) {
    return <div>{header}<p className="text-sm text-gray-400 dark:text-gray-500">No active outliers versus baseline in the last 24 hours.</p></div>;
  }

  return (
    <div>
      {header}
      <div className="space-y-2">
        {rows.map((row) => (
          <div key={`${row.scopeType}:${row.scopeName}:${row.hour}:${row.kind}`} className="rounded-lg border border-amber-100 bg-amber-50/70 dark:border-amber-500/20 dark:bg-amber-500/10 px-3 py-2">
            <div className="flex items-center gap-2 text-xs text-amber-700 dark:text-amber-300">
              <AlertTriangle size={12} />
              <span className="uppercase tracking-wide font-semibold">{labelFor(row.scopeType)}</span>
              <span className="text-amber-500 dark:text-amber-400">{row.kind}</span>
              <span className="ml-auto">score {row.score}</span>
            </div>
            <div className="text-sm text-amber-900 dark:text-amber-200 mt-1">
              {row.scopeName}
            </div>
            <div className="text-xs text-amber-700 dark:text-amber-400 mt-0.5">
              {row.message} · observed {row.eventCount}, baseline {row.baselineAvg}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
