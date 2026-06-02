import { useMemo } from 'react';
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip,
} from 'recharts';
import { useAccessories } from '../hooks/useEvents.js';
import { useStatusColors } from '../hooks/useStatusColors.js';

const TOOLTIP_STYLE = {
  fontSize: 12,
  borderRadius: 8,
  border: '1px solid var(--hc-tooltip-border)',
  backgroundColor: 'var(--hc-tooltip-bg)',
  color: 'var(--hc-tooltip-text)',
};

function isBridgeParent(device) {
  const idParts = String(device?.accessory_id ?? '').split(':');
  return idParts.length === 6 && Number(device?.category) === 2;
}

function CenterLabel({ cx, cy, total }) {
  return (
    <text x={cx} y={cy} textAnchor="middle" dominantBaseline="central">
      <tspan x={cx} dy="-0.4em" fontSize="22" fontWeight="600" fill="var(--hc-fg)">
        {total}
      </tspan>
      <tspan x={cx} dy="1.4em" fontSize="11" fill="var(--hc-chart-tick)">
        devices
      </tspan>
    </text>
  );
}

export default function HealthDonutPanel() {
  const { data: accessories, isLoading } = useAccessories();
  const colors = useStatusColors();

  const { counts, total } = useMemo(() => {
    const devices = (accessories ?? []).filter((d) => !isBridgeParent(d));
    const c = { online: 0, stale: 0, offline: 0 };
    for (const d of devices) {
      const status = d?.health?.status;
      if (status === 'online') c.online++;
      else if (status === 'stale') c.stale++;
      else c.offline++; // offline + unknown -> offline bucket
    }
    return { counts: c, total: devices.length };
  }, [accessories]);

  const pieData = [
    { name: 'Online',  value: counts.online,  color: colors.success },
    { name: 'Stale',   value: counts.stale,   color: colors.warning },
    { name: 'Offline', value: counts.offline,  color: colors.danger  },
  ].filter((d) => d.value > 0);

  const header = (
    <div className="flex items-baseline justify-between mb-3">
      <h3 className="text-sm font-semibold text-hc-fg">Device Health</h3>
      <span className="text-xs text-hc-muted">online / stale / offline</span>
    </div>
  );

  if (isLoading) {
    return (
      <div>
        {header}
        <p className="text-sm text-hc-muted">Checking device health…</p>
      </div>
    );
  }

  if (!total) {
    return (
      <div>
        {header}
        <p className="text-sm text-hc-muted">No devices yet.</p>
      </div>
    );
  }

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
                {pieData.map((entry) => (
                  <Cell key={entry.name} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={TOOLTIP_STYLE}
                formatter={(val) => [val, 'devices']}
              />
              <CenterLabel cx="50%" cy="50%" total={total} />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div className="flex flex-col gap-1.5 text-sm min-w-0">
          {[
            { label: 'Online',  value: counts.online,  color: colors.success },
            { label: 'Stale',   value: counts.stale,   color: colors.warning },
            { label: 'Offline', value: counts.offline,  color: colors.danger  },
          ].map(({ label, value, color }) => (
            <div key={label} className="flex items-center gap-2">
              <span
                className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                style={{ backgroundColor: color }}
              />
              <span className="text-hc-muted">{label}</span>
              <span className="ml-auto font-semibold text-hc-fg">{value}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
