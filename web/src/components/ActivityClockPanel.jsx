import { useMemo } from 'react';
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
} from 'recharts';
import { useHourlyStats } from '../hooks/useEvents.js';
import { useAccentRgb } from '../hooks/useAccentRgb.js';

const TOOLTIP_STYLE = {
  fontSize: 12,
  borderRadius: 8,
  border: '1px solid var(--hc-tooltip-border)',
  backgroundColor: 'var(--hc-tooltip-bg)',
  color: 'var(--hc-tooltip-text)',
};

// Reuse the same UTC->local conversion as ActivityChart.jsx so the clock
// reflects the user's wall-clock time rather than UTC hour numbers.
function utcHoursToLocal(apiRows = []) {
  const offsetHours = -new Date().getTimezoneOffset() / 60;
  const utc = Array.from({ length: 24 }, (_, h) => {
    const found = apiRows.find((d) => Number.parseInt(d.hour, 10) === h);
    return found ? Number.parseInt(found.count, 10) : 0;
  });
  return Array.from({ length: 24 }, (_, localH) => {
    const utcH = ((localH - offsetHours) % 24 + 24) % 24;
    const label =
      localH === 0   ? 'midnight'
      : localH < 12  ? `${localH}am`
      : localH === 12 ? 'noon'
      : `${localH - 12}pm`;
    return { hour: label, localH, count: utc[Math.floor(utcH) % 24] };
  });
}

export default function ActivityClockPanel() {
  const { data, isLoading, isError } = useHourlyStats();
  const accent = useAccentRgb();

  const chartData = useMemo(() => utcHoursToLocal(data ?? []), [data]);
  const maxCount = useMemo(() => Math.max(...chartData.map((d) => d.count), 1), [chartData]);
  const hasData = chartData.some((d) => d.count > 0);

  // Radial dial using PieChart: 24 equal-angle wedges, sized by event count
  // relative to the max hour (innerRadius = min so there's always a thin ring).
  const accentStr = `rgb(${accent[0]},${accent[1]},${accent[2]})`;

  const header = (
    <div className="flex items-baseline justify-between mb-3">
      <h3 className="text-sm font-semibold text-hc-fg">Activity Clock</h3>
      <span className="text-xs text-hc-muted">events by hour · local time</span>
    </div>
  );

  if (isLoading) {
    return <div>{header}<p className="text-sm text-hc-muted">Loading hourly activity…</p></div>;
  }
  if (isError) {
    return <div>{header}<p className="text-sm text-hc-muted">Could not load activity data.</p></div>;
  }
  if (!hasData) {
    return <div>{header}<p className="text-sm text-hc-muted">No activity in the last 30 days.</p></div>;
  }

  // Build a single-level radial bar as 24 pie wedges sized by count.
  // Each wedge occupies 15° (360/24). We use a constant outer radius for
  // the pie; opacity encodes relative count so the dial reads as intensity.
  const pieData = chartData.map((d) => ({ ...d, value: 1 }));

  return (
    <div className="h-full flex flex-col min-h-0">
      {header}
      <div className="flex-1 min-h-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <defs>
              <radialGradient id="activityClockGradient">
                <stop offset="30%" stopColor={accentStr} stopOpacity={0.2} />
                <stop offset="100%" stopColor={accentStr} stopOpacity={0.8} />
              </radialGradient>
            </defs>
            <Pie
              data={pieData}
              cx="50%"
              cy="50%"
              innerRadius="25%"
              outerRadius="80%"
              dataKey="value"
              startAngle={90}
              endAngle={-270}
              strokeWidth={1}
              stroke="var(--hc-chart-grid)"
              isAnimationActive={false}
            >
              {pieData.map((entry) => {
                const intensity = entry.count / maxCount;
                return (
                  <Cell
                    key={`${entry.localH}`}
                    fill={accentStr}
                    fillOpacity={0.1 + intensity * 0.8}
                  />
                );
              })}
            </Pie>
            <Tooltip
              contentStyle={TOOLTIP_STYLE}
              formatter={(_, __, props) => [props.payload.count, 'events']}
              labelFormatter={(_, payload) => payload?.[0]?.payload?.hour ?? ''}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
