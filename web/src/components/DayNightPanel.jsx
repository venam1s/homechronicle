import { useMemo } from 'react';
import {
  PieChart, Pie, Cell, ResponsiveContainer,
} from 'recharts';
import { useHourlyStats, useQuietHours } from '../hooks/useEvents.js';
import { utcHourToLocal } from '../lib/hours.js';

// Convert a UTC hour to local hour using the same helper as QuietHoursPanel.jsx.
// Build a 24-slot array of event counts indexed by local hour.
// Uses the same UTC->local bucketing strategy as the activity clock.
function buildLocalCounts(apiRows = []) {
  const offsetHours = -new Date().getTimezoneOffset() / 60;
  const utc = Array.from({ length: 24 }, (_, h) => {
    const found = apiRows.find((d) => Number.parseInt(d.hour, 10) === h);
    return found ? Number.parseInt(found.count, 10) : 0;
  });
  return Array.from({ length: 24 }, (_, localH) => {
    const utcH = ((localH - offsetHours) % 24 + 24) % 24;
    return utc[Math.floor(utcH) % 24];
  });
}

/**
 * Compute day vs night event split from hourly API rows and quiet hours config.
 *
 * @param {Array<{hour: string, count: string}>} hourlyRows - API hourly stats rows.
 * @param {{ enabled: boolean, quietHoursStart: number, quietHoursEnd: number }} quiet
 * @returns {{ day: number, night: number, dayPct: number, nightPct: number, total: number }}
 */
export function computeDayNightSplit(hourlyRows, quiet) {
  const localCounts = buildLocalCounts(hourlyRows);

  // Determine night window boundaries (local hours).
  let s, e;
  if (quiet?.enabled) {
    // quiet.quietHoursStart/End are UTC hours — convert to local.
    s = utcHourToLocal(quiet.quietHoursStart);
    e = utcHourToLocal(quiet.quietHoursEnd);
  } else {
    // Default night window: [22, 7) — already local, do NOT convert.
    s = 22;
    e = 7;
  }

  // Midnight-wrap rule:
  //   non-wrap (s <= e): night when s <= h < e
  //   wrap (s > e): night when h >= s || h < e
  let day = 0;
  let night = 0;
  for (let h = 0; h < 24; h++) {
    const count = localCounts[h];
    const isNight = s <= e ? (h >= s && h < e) : (h >= s || h < e);
    if (isNight) {
      night += count;
    } else {
      day += count;
    }
  }

  const total = day + night;
  return {
    day,
    night,
    total,
    dayPct: total === 0 ? 0 : (day / total) * 100,
    nightPct: total === 0 ? 0 : (night / total) * 100,
  };
}

export default function DayNightPanel() {
  const { data: hourlyData, isLoading, isError } = useHourlyStats();
  const { data: quiet } = useQuietHours();

  const split = useMemo(
    () => computeDayNightSplit(hourlyData ?? [], quiet ?? { enabled: false }),
    [hourlyData, quiet],
  );

  const hasData = split.total > 0;

  const header = (
    <div className="flex items-baseline justify-between mb-3">
      <h3 className="text-sm font-semibold text-hc-fg">Day vs Night</h3>
      <span className="text-xs text-hc-muted">events by time of day</span>
    </div>
  );

  if (isLoading) {
    return <div>{header}<p className="text-sm text-hc-muted">Loading activity…</p></div>;
  }
  if (isError) {
    return <div>{header}<p className="text-sm text-hc-muted">Could not load activity data.</p></div>;
  }
  if (!hasData) {
    return <div>{header}<p className="text-sm text-hc-muted">Not enough activity yet.</p></div>;
  }

  const dayPct = Math.round(split.dayPct);
  const nightPct = Math.round(split.nightPct);

  const pieData = [
    { name: 'Day', value: split.day },
    { name: 'Night', value: split.night },
  ];

  return (
    <div className="h-full flex flex-col min-h-0">
      {header}
      <div className="flex flex-1 min-h-0 gap-4 items-center">
        <div className="w-32 h-32 flex-shrink-0">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={pieData}
                cx="50%"
                cy="50%"
                innerRadius="55%"
                outerRadius="85%"
                dataKey="value"
                strokeWidth={0}
                isAnimationActive={false}
              >
                <Cell className="hc-fill-day" />
                <Cell className="hc-fill-night" />
              </Pie>
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div className="flex flex-col gap-1.5 text-sm min-w-0">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full flex-shrink-0 bg-hc-accent-strong" />
            <span className="text-hc-muted">Day</span>
            <span className="ml-auto font-semibold text-hc-fg">{dayPct}%</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full flex-shrink-0 bg-hc-muted" />
            <span className="text-hc-muted">Night</span>
            <span className="ml-auto font-semibold text-hc-fg">{nightPct}%</span>
          </div>
        </div>
      </div>
    </div>
  );
}
