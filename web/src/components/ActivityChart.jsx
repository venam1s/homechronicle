import { useMemo } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts';
import { useHourlyStats } from '../hooks/useEvents.js';
import { SkeletonChart } from './Skeleton.jsx';
import { useAccentRgb } from '../hooks/useAccentRgb.js';

// Convert the UTC-hour data from the API to local-time hours so the
// peak bar lines up with the user's actual clock, not UTC.
function utcHoursToLocal(apiRows = []) {
  const offsetHours = -new Date().getTimezoneOffset() / 60; // e.g. +10 for AEST, -5 for EST
  const utc = Array.from({ length: 24 }, (_, h) => {
    const found = apiRows.find((d) => Number.parseInt(d.hour, 10) === h);
    return found ? Number.parseInt(found.count, 10) : 0;
  });
  return Array.from({ length: 24 }, (_, localH) => {
    const utcH = ((localH - offsetHours) % 24 + 24) % 24;
    const label =
      localH === 0  ? 'midnight'
      : localH < 12 ? `${localH}am`
      : localH === 12 ? 'noon'
      : `${localH - 12}pm`;
    return { hour: label, localH, count: utc[Math.floor(utcH) % 24] };
  });
}

const TOOLTIP_STYLE = { fontSize: 12, borderRadius: 8, border: '1px solid var(--hc-tooltip-border)', backgroundColor: 'var(--hc-tooltip-bg)', color: 'var(--hc-tooltip-text)' };

export default function ActivityChart() {
  const accent = useAccentRgb();
  const accentStr = `rgb(${accent[0]},${accent[1]},${accent[2]})`;
  const { data, isLoading, isError } = useHourlyStats();

  const chartData = useMemo(() => utcHoursToLocal(data ?? []), [data]);

  if (isLoading) {
    return <SkeletonChart className="h-48" />;
  }
  if (isError) {
    return <div className="h-48 flex items-center justify-center text-red-500 text-sm">Failed to load hourly stats.</div>;
  }
  if (!data?.length) {
    return (
      <div>
        <h3 className="text-sm font-semibold text-hc-fg mb-3">Events by Hour</h3>
        <div className="h-48 flex items-center justify-center text-sm text-hc-muted">No activity in the last 30 days.</div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-baseline justify-between mb-3">
        <h3 className="text-sm font-semibold text-hc-fg">Events by Hour</h3>
        <span className="text-xs text-hc-muted">last 30 days · local time</span>
      </div>
      <div className="h-[150px] md:h-[180px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
            <defs>
              <linearGradient id="activityBarGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor={accentStr} stopOpacity={0.85} />
                <stop offset="95%" stopColor={accentStr} stopOpacity={0.35} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--hc-chart-grid)" vertical={false} />
            <XAxis
              dataKey="hour"
              tick={{ fontSize: 10, fill: 'var(--hc-chart-tick)' }}
              interval={5}
              tickLine={false}
              axisLine={false}
            />
            <YAxis tick={{ fontSize: 10, fill: 'var(--hc-chart-tick)' }} tickLine={false} axisLine={false} />
            <Tooltip
              contentStyle={TOOLTIP_STYLE}
              formatter={(val) => [val, 'events']}
              labelStyle={{ fontWeight: 600, marginBottom: 2, color: 'var(--hc-tooltip-text)' }}
              itemStyle={{ color: 'var(--hc-tooltip-text)' }}
            />
            <Bar dataKey="count" radius={[3, 3, 0, 0]} maxBarSize={20}
                 fill="url(#activityBarGradient)" />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
