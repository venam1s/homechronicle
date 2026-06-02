import { useMemo } from 'react';
import {
  RadialBarChart, RadialBar, ResponsiveContainer,
} from 'recharts';
import { Moon } from 'lucide-react';
import { useQuietHours } from '../hooks/useEvents.js';
import { useStatusColors } from '../hooks/useStatusColors.js';

// Compliance formula (k=5: each violating event costs 5 points; 20+ -> 0%):
//   compliance = clamp(100 - min(100, totalViolatingEvents * 5), 0, 100)
function calcCompliance(events) {
  const total = (events ?? []).reduce((sum, e) => sum + Number(e.count ?? 0), 0);
  return Math.max(0, Math.min(100, 100 - Math.min(100, total * 5)));
}

export default function QuietHoursCompliancePanel() {
  const { data, isLoading, isError } = useQuietHours();
  const colors = useStatusColors();

  const compliance = useMemo(() => {
    if (!data?.enabled) return null;
    return calcCompliance(data.events);
  }, [data]);

  const gaugeColor = useMemo(() => {
    if (compliance === null) return colors.success;
    if (compliance >= 80) return colors.success;
    if (compliance >= 40) return colors.warning;
    return colors.danger;
  }, [compliance, colors]);

  const header = (
    <div className="flex items-center gap-2 mb-3">
      <Moon size={14} className="text-hc-muted" />
      <h3 className="text-sm font-semibold text-hc-fg">Quiet Hours Score</h3>
    </div>
  );

  if (isLoading) {
    return <div>{header}<p className="text-sm text-hc-muted">Checking compliance…</p></div>;
  }
  if (isError) {
    return <div>{header}<p className="text-sm text-hc-muted">Could not load quiet hours data.</p></div>;
  }

  // Mirror QuietHoursPanel empty state when feature is off.
  if (!data?.enabled) {
    return (
      <div>
        {header}
        <p className="text-sm text-hc-muted">
          Configure quiet hours in Settings to track compliance.
        </p>
      </div>
    );
  }

  const label = compliance === 100
    ? 'All clear'
    : compliance >= 80
      ? 'Good'
      : compliance >= 40
        ? 'Fair'
        : 'Poor';

  const gaugeData = [{ value: compliance, fill: gaugeColor }];

  return (
    <div className="h-full flex flex-col min-h-0">
      {header}
      <div className="flex flex-1 min-h-0 items-center gap-4">
        <div className="w-28 h-28 flex-shrink-0 relative">
          <ResponsiveContainer width="100%" height="100%">
            <RadialBarChart
              cx="50%"
              cy="50%"
              innerRadius="55%"
              outerRadius="85%"
              startAngle={225}
              endAngle={-45}
              data={gaugeData}
            >
              <RadialBar
                dataKey="value"
                cornerRadius={6}
                background={{ fill: 'var(--hc-panel-border)' }}
                isAnimationActive={false}
              />
            </RadialBarChart>
          </ResponsiveContainer>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-xl font-bold text-hc-fg">{compliance}%</span>
          </div>
        </div>

        <div className="flex flex-col gap-1 text-sm">
          <span className="font-semibold" style={{ color: gaugeColor }}>{label}</span>
          <span className="text-xs text-hc-muted">
            {(data.events ?? []).reduce((s, e) => s + Number(e.count ?? 0), 0)} violation events
          </span>
          <span className="text-xs text-hc-muted">in current quiet period</span>
        </div>
      </div>
    </div>
  );
}
