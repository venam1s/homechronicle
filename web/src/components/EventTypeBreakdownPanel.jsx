import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip,
} from 'recharts';
import { useCharacteristicBreakdown } from '../hooks/useEvents.js';

const TOOLTIP_STYLE = {
  fontSize: 12,
  borderRadius: 8,
  border: '1px solid var(--hc-tooltip-border)',
  backgroundColor: 'var(--hc-tooltip-bg)',
  color: 'var(--hc-tooltip-text)',
};

// 9 categorical slots (top 8 + 'Other'). Fills are CSS-driven via .hc-cat-N
// classes (see index.css) so they stay theme-reactive — never feed computed
// hex into Recharts.
const SLOT_COUNT = 9;

export default function EventTypeBreakdownPanel() {
  const { data, isLoading, isError } = useCharacteristicBreakdown(7);

  const header = (
    <div className="flex items-baseline justify-between mb-3">
      <h3 className="text-sm font-semibold text-hc-fg">Event Types</h3>
      <span className="text-xs text-hc-muted">last 7 days</span>
    </div>
  );

  if (isLoading) {
    return <div>{header}<p className="text-sm text-hc-muted">Loading event breakdown…</p></div>;
  }
  if (isError) {
    return <div>{header}<p className="text-sm text-hc-muted">Could not load event breakdown.</p></div>;
  }

  const rows = data ?? [];
  if (!rows.length) {
    return <div>{header}<p className="text-sm text-hc-muted">No events to break down yet.</p></div>;
  }

  return (
    <div className="h-full flex flex-col min-h-0">
      {header}
      <div className="flex flex-1 min-h-0 gap-4 items-center">
        <div className="w-32 h-32 flex-shrink-0">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={rows}
                cx="50%"
                cy="50%"
                innerRadius="55%"
                outerRadius="85%"
                dataKey="count"
                nameKey="characteristic"
                strokeWidth={0}
                isAnimationActive={false}
              >
                {rows.map((entry, i) => (
                  <Cell key={entry.characteristic} className={`hc-cat-${i % SLOT_COUNT}`} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={TOOLTIP_STYLE}
                formatter={(val, name) => [val, name]}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div className="flex flex-col gap-1 text-sm min-w-0 flex-1 overflow-auto">
          {rows.map((entry, i) => (
            <div key={entry.characteristic} className="flex items-center gap-2">
              <span className={`hc-cat-${i % SLOT_COUNT} w-2.5 h-2.5 rounded-sm flex-shrink-0`} />
              <span className="text-hc-muted truncate">{entry.characteristic}</span>
              <span className="ml-auto font-semibold text-hc-fg tabular-nums">{entry.count}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
