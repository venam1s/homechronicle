import { useMemo } from 'react';
import { useRoomStats } from '../hooks/useEvents.js';
import { useAccentRgb } from '../hooks/useAccentRgb.js';

// Approximation: for each room show a coarse 2-point trend bar —
//   recent 7d average/day (count7/7) vs 30d average/day (count30/30).
// Per-room daily series does not exist in the API, so this is necessarily
// an approximation labeled "7d vs 30d avg/day".
const MAX_ROOMS = 8;

function SparkBar({ value, max, color }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className="flex items-center gap-1.5 flex-1 min-w-0">
      <div className="flex-1 min-w-0 h-2 rounded-full bg-hc-panel-border overflow-hidden">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
      </div>
      <span className="text-xs text-hc-muted w-8 text-right flex-shrink-0">
        {value.toFixed(1)}
      </span>
    </div>
  );
}

export default function RoomSparklinesPanel() {
  const { data: rooms7, isLoading: loading7 } = useRoomStats(7);
  const { data: rooms30, isLoading: loading30 } = useRoomStats(30);
  const accent = useAccentRgb();
  const accentStr = `rgb(${accent[0]},${accent[1]},${accent[2]})`;

  const rows = useMemo(() => {
    if (!rooms7 || !rooms30) return [];

    const map30 = new Map((rooms30 ?? []).map((r) => [r.room_name, Number(r.count ?? 0)]));

    return (rooms7 ?? [])
      .map((r) => ({
        name: r.room_name,
        avg7: Number(r.count ?? 0) / 7,
        avg30: (map30.get(r.room_name) ?? 0) / 30,
        count7: Number(r.count ?? 0),
      }))
      // Filter out empty/unassigned rows where both windows are 0.
      .filter((r) => r.name && (r.count7 > 0 || map30.get(r.name) > 0))
      .sort((a, b) => b.count7 - a.count7)
      .slice(0, MAX_ROOMS);
  }, [rooms7, rooms30]);

  const maxAvg = useMemo(() => Math.max(...rows.map((r) => Math.max(r.avg7, r.avg30)), 1), [rows]);

  const isLoading = loading7 || loading30;

  const header = (
    <div className="flex items-baseline justify-between mb-3">
      <h3 className="text-sm font-semibold text-hc-fg">Room Trends</h3>
      <span className="text-xs text-hc-muted">7d vs 30d avg/day (approx)</span>
    </div>
  );

  if (isLoading) {
    return <div>{header}<p className="text-sm text-hc-muted">Loading room data…</p></div>;
  }
  if (!rows.length) {
    return <div>{header}<p className="text-sm text-hc-muted">No room activity yet.</p></div>;
  }

  return (
    <div>
      {header}
      <div className="space-y-2">
        {rows.map((r) => (
          <div key={r.name} className="grid grid-cols-[minmax(0,1fr)_3fr_3fr] gap-2 items-center">
            <span className="text-xs text-hc-fg truncate">{r.name || 'Unassigned'}</span>
            <SparkBar value={r.avg7} max={maxAvg} color={accentStr} />
            <SparkBar value={r.avg30} max={maxAvg} color={`rgba(${accent[0]},${accent[1]},${accent[2]},0.45)`} />
          </div>
        ))}
        <div className="grid grid-cols-[minmax(0,1fr)_3fr_3fr] gap-2 mt-1">
          <span />
          <span className="text-xs text-hc-muted text-center">7d avg</span>
          <span className="text-xs text-hc-muted text-center">30d avg</span>
        </div>
      </div>
    </div>
  );
}
