import { useMemo } from 'react';
import { format, subDays } from 'date-fns';
import { Wifi, WifiOff, AlertTriangle, Zap, TrendingUp, TrendingDown } from 'lucide-react';
import { ResponsiveContainer, AreaChart, Area } from 'recharts';
import clsx from 'clsx';
import Card from './Card.jsx';
import { useAccessories, useDailyStats } from '../hooks/useEvents.js';
import { useAccentRgb } from '../hooks/useAccentRgb.js';

function toInt(value, fallback = 0) {
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? fallback : parsed;
}

function deriveHealthCounts(accessories = []) {
  const counts = { online: 0, offline: 0, stale: 0 };
  for (const acc of accessories) {
    const status = acc?.health?.status;
    if (status === 'online') counts.online++;
    else if (status === 'offline') counts.offline++;
    else if (status === 'stale') counts.stale++;
  }
  return counts;
}

function calcEventsTodayDelta(dailyData) {
  if (!dailyData?.length) return null;
  const todayKey = format(new Date(), 'yyyy-MM-dd');
  const yesterdayKey = format(subDays(new Date(), 1), 'yyyy-MM-dd');
  const todayCount = Number(dailyData.find(d => d.day?.startsWith(todayKey))?.count ?? 0);
  const yesterdayCount = Number(dailyData.find(d => d.day?.startsWith(yesterdayKey))?.count ?? 0);
  if (!yesterdayCount && !todayCount) return null;
  return todayCount - yesterdayCount;
}

const KPI_DEFS = [
  { key: 'online', label: 'ONLINE', icon: Wifi, bgClass: 'bg-hc-success-bg', iconClass: 'text-hc-success-text' },
  { key: 'offline', label: 'OFFLINE', icon: WifiOff, bgClass: 'bg-hc-danger-bg', iconClass: 'text-hc-danger-text' },
  { key: 'stale', label: 'STALE', icon: AlertTriangle, bgClass: 'bg-hc-warning-bg', iconClass: 'text-hc-warning-text' },
  { key: 'today', label: 'TODAY', icon: Zap, bgClass: 'bg-hc-accent-soft', iconClass: 'text-hc-accent-strong' },
];

export default function KpiCards({ dashboardDays = 7 }) {
  const { data: accessories, isLoading: accLoading } = useAccessories();
  const { data: daily, isLoading: dailyLoading } = useDailyStats(dashboardDays);
  const { data: sparkDaily } = useDailyStats(7);
  const accent = useAccentRgb();
  const accentStr = `rgb(${accent[0]},${accent[1]},${accent[2]})`;

  const sparkData = useMemo(() => {
    const dayMap = new Map((sparkDaily ?? []).map((d) => [String(d.day).slice(0, 10), Number(d.count ?? 0)]));
    return Array.from({ length: 7 }, (_, i) => {
      const key = format(subDays(new Date(), 6 - i), 'yyyy-MM-dd');
      return { i, count: dayMap.get(key) ?? 0 };
    });
  }, [sparkDaily]);

  const isLoading = accLoading && dailyLoading;

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {KPI_DEFS.map(def => (
          <Card key={def.key}>
            <Card.Body compact>
              <div className="skeleton h-16 rounded-lg" />
            </Card.Body>
          </Card>
        ))}
      </div>
    );
  }

  const healthCounts = deriveHealthCounts(accessories ?? []);

  const todayKey = format(new Date(), 'yyyy-MM-dd');
  const todayRow = daily?.find(d => d.day?.startsWith(todayKey));
  const eventsToday = todayRow ? toInt(todayRow.count) : 0;
  const delta = calcEventsTodayDelta(daily);

  function getTrendSubText() {
    if (delta === null || delta === 0) return '—';
    if (delta > 0) {
      return (
        <span className="inline-flex items-center gap-0.5 text-hc-success-text">
          +{delta} <TrendingUp size={12} />
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-0.5 text-hc-danger-text">
        {delta} <TrendingDown size={12} />
      </span>
    );
  }

  const cardValues = {
    online: accessories ? String(healthCounts.online) : '…',
    offline: accessories ? String(healthCounts.offline) : '…',
    stale: accessories ? String(healthCounts.stale) : '…',
    today: daily ? String(eventsToday) : '…',
  };

  const cardSubTexts = {
    online: '—',
    offline: '—',
    stale: '—',
    today: getTrendSubText(),
  };

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
      {KPI_DEFS.map(def => (
        <Card key={def.key}>
          <Card.Body compact>
            <div className="flex items-start gap-3">
              <div className={clsx('flex-shrink-0 w-9 h-9 rounded-xl flex items-center justify-center', def.bgClass)}>
                <def.icon size={16} className={def.iconClass} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-hc-caption font-semibold uppercase tracking-wider text-hc-muted mb-0.5">
                  {def.label}
                </div>
                <div className="text-2xl font-semibold text-hc-fg-strong leading-tight">
                  {cardValues[def.key]}
                </div>
                <div className="text-hc-caption text-hc-muted mt-0.5">
                  {cardSubTexts[def.key]}
                </div>
              </div>
            </div>
            {def.key === 'today' && sparkData.length > 0 && (
              <div className="mt-2 -mx-1">
                <ResponsiveContainer width="100%" height={36}>
                  <AreaChart data={sparkData} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="sparklineGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%"  stopColor={accentStr} stopOpacity={0.3} />
                        <stop offset="95%" stopColor={accentStr} stopOpacity={0}   />
                      </linearGradient>
                    </defs>
                    <Area
                      type="monotone"
                      dataKey="count"
                      stroke={accentStr}
                      strokeWidth={1.5}
                      fill="url(#sparklineGradient)"
                      dot={false}
                      isAnimationActive={false}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </Card.Body>
        </Card>
      ))}
    </div>
  );
}
