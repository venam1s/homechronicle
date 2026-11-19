import { useWeekdayStats } from '../hooks/useEvents.js';
import { SkeletonBlock } from './Skeleton.jsx';
import { useEffect, useState } from 'react';
import clsx from 'clsx';
import { useAccentRgb } from '../hooks/useAccentRgb.js';
import { usePreference } from '../hooks/usePreference.js';

const CELL = 18; // px — column cap, matches MonthlyHeatmap's squares
const GAP  = 2;  // px
const LABEL_W = 30; // px for day name
// Rows stretch to fill the panel so this 7-row grid reads as tall as the
// 12-row MonthlyHeatmap beside it. A cell grows up to MAX_CELL_ASPECT times
// its width before the row leaves slack instead, so narrow panels (mobile)
// never degrade into thin bars.
const MAX_CELL_ASPECT = 1.5;
const ROW_COLUMNS = `${LABEL_W}px repeat(24, minmax(0, 1fr))`;
const WINDOWS = [
  { label: '7d', days: 7 },
  { label: '30d', days: 30 },
  { label: '90d', days: 90 },
];
const STORAGE_KEY = 'hc_dashboard_weekday_days';
const VALID_DAYS = new Set(WINDOWS.map((w) => w.days));

// DOW from PostgreSQL: 0 = Sunday
const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// Convert a UTC weekday/hour slot to the local weekday/hour slot.
function utcSlotToLocalSlot(utcDow, utcH) {
  const ref = new Date(Date.UTC(2024, 0, 7 + utcDow, utcH, 0, 0));
  return {
    day: ref.getDay(),
    hour: ref.getHours(),
  };
}

const AXIS_LABELS = ['midnight', '6 am', 'noon', '6 pm', ''];

export default function WeekdayHeatmap({ forcedDays = null, onDaysChange = null }) {
  const accent = useAccentRgb();
  const [days, setDays] = usePreference('dashboardWeekdayDays', 30, { localStorageKey: STORAGE_KEY });
  const { data = [], isLoading, isError } = useWeekdayStats(days);
  const [hoveredCell, setHoveredCell] = useState(null);

  useEffect(() => {
    if (!VALID_DAYS.has(forcedDays) || forcedDays === days) return;
    setDays(forcedDays);
  }, [forcedDays, days]);

  function handleSetDays(next) {
    setDays(next);
    onDaysChange?.(next);
  }

  if (isLoading) {
    return <SkeletonBlock className="h-32 w-full" />;
  }
  if (isError) {
    return <div className="h-32 flex items-center justify-center text-hc-danger-text text-sm">Failed to load weekday stats.</div>;
  }
  if (!data.length) {
    return <p className="text-sm text-hc-muted">No data yet.</p>;
  }

  // Build grid[dow 0-6][localHour 0-23]
  const grid = Array.from({ length: 7 }, () => new Array(24).fill(0));
  for (const row of data) {
    const dow = Number.parseInt(row.day_of_week, 10);
    const hour = Number.parseInt(row.hour, 10);
    const count = Number.parseInt(row.count, 10);
    const local = utcSlotToLocalSlot(dow, hour);
    grid[local.day][local.hour] += count;
  }

  const maxCount = Math.max(...grid.flat(), 1);

  return (
    <div className="h-full flex flex-col min-h-0">
      <div className="flex items-baseline justify-between mb-3 shrink-0">
        <h3 className="text-sm font-semibold text-hc-fg">Weekday Heatmap</h3>
        <div className="flex items-center gap-2">
          <span className="text-xs text-hc-muted">last {days} days · local time</span>
          <div className="flex gap-1">
            {WINDOWS.map(({ label, days: d }) => (
              <button
                key={d}
                onClick={() => handleSetDays(d)}
                className={clsx(
                  'text-[10px] px-1.5 py-0.5 rounded-md transition-colors',
                  days === d
                    ? 'bg-hc-accent-soft text-hc-accent-stronger font-medium'
                    : 'text-hc-muted hover:text-hc-fg hover:bg-hc-panel-mid'
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>
      <p className="text-xs text-hc-muted mb-3 min-h-4 shrink-0">
        {hoveredCell
          ? `${hoveredCell.day} · ${hoveredCell.hourLabel} · ${hoveredCell.count} event${hoveredCell.count !== 1 ? 's' : ''}`
          : 'Hover a cell for details'}
      </p>

      {/* Day rows: seven equal tracks that share whatever height the panel
          gives us, never shorter than a CELL square per row. */}
      <div
        data-testid="weekday-heatmap-rows"
        className="flex-1 min-h-0"
        style={{
          display: 'grid',
          gridTemplateRows: `repeat(7, minmax(${CELL}px, 1fr))`,
          rowGap: GAP,
        }}
      >
      {DAY_LABELS.map((day, dow) => (
        <div
          key={day}
          data-testid="weekday-heatmap-row"
          style={{
            display: 'grid',
            gridTemplateColumns: ROW_COLUMNS,
            columnGap: GAP,
            alignItems: 'center',
            minHeight: 0,
          }}
        >
          {/* Day label */}
          <div
            style={{
              width:      LABEL_W,
              fontSize:   10,
              color:      'var(--hc-muted)',
              textAlign:  'right',
              paddingRight: 6,
              lineHeight: 1,
            }}
          >
            {day}
          </div>

          {/* Hour cells */}
          {grid[dow].map((count, h) => {
            const intensity = count / maxCount;
            const hLabel =
              h === 0    ? 'midnight'
              : h < 12   ? `${h}am`
              : h === 12 ? 'noon'
              : `${h - 12}pm`;
            const bg = intensity === 0
              ? 'var(--hc-panel-mid)'
              : `rgba(${accent[0]},${accent[1]},${accent[2]},${0.15 + intensity * 0.85})`;
            return (
              <div
                key={h}
                title={`${day} ${hLabel} — ${count} event${count !== 1 ? 's' : ''}`}
                style={{
                  width:           '100%',
                  maxWidth:        CELL,
                  // Height follows the width up to MAX_CELL_ASPECT, clamped to
                  // the row so the grid fills the panel without overflowing it.
                  aspectRatio:     `1 / ${MAX_CELL_ASPECT}`,
                  maxHeight:       '100%',
                  justifySelf:     'center',
                  borderRadius:    3,
                  backgroundColor: bg,
                  transition:      'background-color 0.15s, transform 0.12s',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'scale(1.08)';
                  setHoveredCell({ day, hourLabel: hLabel, count });
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = '';
                  setHoveredCell(null);
                }}
              />
            );
          })}
        </div>
      ))}
      </div>

      {/* Bottom axis */}
      <div
        className="shrink-0"
        style={{
          display: 'grid',
          gridTemplateColumns: ROW_COLUMNS,
          columnGap: GAP,
          marginTop: 4,
        }}
      >
        <div />
        {AXIS_LABELS.map((label) => (
          <div
            key={label || 'end'}
            style={{
              gridColumn: 'span 6',
              fontSize:   10,
              color:      'var(--hc-chart-tick)',
            }}
          >
            {label}
          </div>
        ))}
      </div>
    </div>
  );
}
