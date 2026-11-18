import { useMemo, useState } from 'react';
import { useDailyStats } from '../hooks/useEvents.js';
import { useAccentRgb } from '../hooks/useAccentRgb.js';

// Match WeekdayHeatmap: fluid columns, cells capped at CELL px squares.
const CELL = 18;
const GAP = 2;
const LABEL_W = 30;
const COLUMNS = `${LABEL_W}px repeat(31, minmax(0, 1fr))`;
const AXIS_DAYS = [1, 8, 15, 22, 29];

function monthLabel(date) {
  return date.toLocaleString(undefined, { month: 'short' });
}

function toYmd(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export default function MonthlyHeatmap() {
  const accent = useAccentRgb();
  const { data = [], isLoading } = useDailyStats(365);
  const [hovered, setHovered] = useState(null);

  const rows = useMemo(() => {
    const countByDay = new Map();
    for (const row of data) {
      const key = String(row.day ?? '').slice(0, 10);
      const count = Number.parseInt(String(row.count ?? '0'), 10);
      countByDay.set(key, Number.isFinite(count) ? count : 0);
    }

    const now = new Date();
    const months = [];
    for (let back = 11; back >= 0; back--) {
      months.push(new Date(now.getFullYear(), now.getMonth() - back, 1));
    }

    return months.map((monthStart) => {
      const year = monthStart.getFullYear();
      const month = monthStart.getMonth();
      const daysInMonth = new Date(year, month + 1, 0).getDate();
      const cells = Array.from({ length: 31 }, (_, i) => {
        const day = i + 1;
        if (day > daysInMonth) return null;
        const date = new Date(year, month, day);
        const key = toYmd(date);
        return {
          day,
          key,
          count: countByDay.get(key) ?? 0,
          label: date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }),
        };
      });
      return {
        id: `${year}-${month}`,
        label: monthLabel(monthStart),
        cells,
      };
    });
  }, [data]);

  if (isLoading) {
    return <div className="h-24 flex items-center justify-center text-hc-muted text-sm">Loading…</div>;
  }
  if (!data.length) {
    return (
      <div>
        <h3 className="text-sm font-semibold text-hc-fg mb-2">Monthly Heatmap</h3>
        <div className="h-24 flex items-center justify-center text-sm text-hc-muted">No activity in the last 12 months.</div>
      </div>
    );
  }

  const maxCount = Math.max(1, ...rows.flatMap((r) => r.cells.map((c) => c?.count ?? 0)));

  return (
    <div>
      <div className="flex items-baseline justify-between mb-3">
        <h3 className="text-sm font-semibold text-hc-fg">Monthly Heatmap</h3>
        <span className="text-xs text-hc-muted">last 12 months</span>
      </div>
      <p className="text-xs text-hc-muted mb-3 min-h-4">
        {hovered ? `${hovered.label} · ${hovered.count} event${hovered.count !== 1 ? 's' : ''}` : 'Hover a day for details'}
      </p>

      {rows.map((row) => (
        <div
          key={row.id}
          data-testid="monthly-heatmap-row"
          style={{
            display: 'grid',
            gridTemplateColumns: COLUMNS,
            columnGap: GAP,
            alignItems: 'center',
            marginBottom: GAP,
          }}
        >
          <div
            style={{
              width: LABEL_W,
              fontSize: 10,
              color: 'var(--hc-chart-label)',
              textAlign: 'right',
              paddingRight: 6,
              lineHeight: `${CELL}px`,
            }}
          >
            {row.label}
          </div>
          {row.cells.map((cell, idx) => (
            <div
              key={idx}
              title={cell ? `${cell.label} — ${cell.count} event${cell.count !== 1 ? 's' : ''}` : ''}
              style={{
                width: '100%',
                maxWidth: CELL,
                aspectRatio: '1 / 1',
                justifySelf: 'center',
                borderRadius: 3,
                backgroundColor: cell
                  ? cell.count / maxCount <= 0
                    ? 'var(--hc-panel-mid)'
                    : `rgba(${accent[0]},${accent[1]},${accent[2]},${0.15 + (cell.count / maxCount) * 0.85})`
                  : 'transparent',
                transition: 'transform 0.12s, background-color 0.15s',
                cursor: cell ? 'default' : 'inherit',
              }}
              onMouseEnter={(e) => {
                if (!cell) return;
                e.currentTarget.style.transform = 'scale(1.08)';
                setHovered(cell);
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = '';
                setHovered(null);
              }}
            />
          ))}
        </div>
      ))}

      {/* Day-of-month axis */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: COLUMNS,
          columnGap: GAP,
          marginTop: 4,
        }}
      >
        <div />
        {AXIS_DAYS.map((d) => (
          <div
            key={d}
            style={{
              gridColumn: `${d + 1} / ${Math.min(d + 8, 33)}`,
              whiteSpace: 'nowrap',
              fontSize: 10,
              color: 'var(--hc-chart-tick)',
            }}
          >
            {d}
          </div>
        ))}
      </div>
    </div>
  );
}
