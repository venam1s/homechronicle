import { useMemo } from 'react';
import { format, subDays } from 'date-fns';
import { Zap, Calendar, Activity, MapPin, TrendingUp, TrendingDown } from 'lucide-react';
import { ResponsiveContainer, AreaChart, Area } from 'recharts';
import clsx from 'clsx';
import Card from './Card.jsx';
import { useDailyStats, useTopDevices, useRoomStats } from '../hooks/useEvents.js';
import { useAccentRgb } from '../hooks/useAccentRgb.js';

function toInt(value, fallback = 0) {
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? fallback : parsed;
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
  { key: 'today', label: 'TODAY', icon: Zap, bgClass: 'bg-hc-accent-soft', iconClass: 'text-hc-accent-strong' },
  { key: 'week', label: 'THIS WEEK', icon: Calendar, bgClass: 'bg-hc-accent-soft', iconClass: 'text-hc-accent-strong' },
  { key: 'topDevice', label: 'TOP DEVICE', icon: Activity, bgClass: 'bg-hc-accent-soft', iconClass: 'text-hc-accent-strong' },
  { key: 'topRoom', label: 'TOP ROOM', icon: MapPin, bgClass: 'bg-hc-accent-soft', iconClass: 'text-hc-accent-strong' },
];

export default function KpiCards({ dashboardDays = 7 }) {
  const { data: daily, isLoading: dailyLoading } = useDailyStats(dashboardDays);
  // Single source of truth for the 7-day window: drives both the WEEK card sum
  // and the sparkline. TanStack Query dedupes identical `useDailyStats(7)` calls,
  // so no extra request — the previous `sparkDaily` was the same query.
  const { data: weekDaily } = useDailyStats(7);
  const { data: topDevices, isLoading: topLoading } = useTopDevices();
  const { data: rooms, isLoading: roomsLoading } = useRoomStats(7);
  const accent = useAccentRgb();
  const accentStr = `rgb(${accent[0]},${accent[1]},${accent[2]})`;

  const sparkData = useMemo(() => {
    const dayMap = new Map((weekDaily ?? []).map((d) => [String(d.day).slice(0, 10), Number(d.count ?? 0)]));
    return Array.from({ length: 7 }, (_, i) => {
      const key = format(subDays(new Date(), 6 - i), 'yyyy-MM-dd');
      return { i, count: dayMap.get(key) ?? 0 };
    });
  }, [weekDaily]);

  const isLoading = dailyLoading && topLoading && roomsLoading;

  if (isLoading) {
    return (
      <div className="grid h-full auto-rows-fr grid-cols-2 md:grid-cols-4 gap-3">
        {KPI_DEFS.map(def => (
          <Card key={def.key}>
            <div className="p-3">
              <div className="skeleton h-16 rounded-lg" />
            </div>
          </Card>
        ))}
      </div>
    );
  }

  const todayKey = format(new Date(), 'yyyy-MM-dd');
  const todayRow = daily?.find(d => d.day?.startsWith(todayKey));
  const eventsToday = todayRow ? toInt(todayRow.count) : 0;
  // H-01: WEEK card always sums the last 7 days, independent of the dashboard window.
  // Was previously `daily?.reduce(...)` over the dashboardDays-bound query, which
  // showed a 30/90-day total under a "last 7 days" caption.
  const eventsWeek = weekDaily?.reduce((sum, d) => sum + toInt(d.count), 0) ?? null;
  const delta = calcEventsTodayDelta(daily);

  const topDevice = topDevices?.[0];
  const topRoom = rooms?.find((r) => r.room_name);

  function getTrendSubText() {
    // L-03/L-05: hide the trend sub-text entirely when there is no comparison
    // (no yesterday data) or when today exactly matches yesterday. Bare 'events'
    // here read as "today's count" rather than "no trend available".
    if (delta === null || delta === 0) return null;
    if (delta > 0) {
      return (
        <span className="inline-flex items-center gap-0.5">
          events <span className="text-hc-success-text inline-flex items-center gap-0.5 ml-1">+{delta} <TrendingUp size={12} /></span>
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-0.5">
        events <span className="text-hc-danger-text inline-flex items-center gap-0.5 ml-1">{delta} <TrendingDown size={12} /></span>
      </span>
    );
  }

  const cardValues = {
    today: daily ? eventsToday.toLocaleString() : '…',
    week: eventsWeek != null ? eventsWeek.toLocaleString() : '…',
    topDevice: topDevices ? (topDevice?.accessory_name ?? 'None') : '…',
    topRoom: rooms ? (topRoom?.room_name ?? 'Unknown') : '…',
  };

  const cardSubTexts = {
    today: getTrendSubText(),
    week: 'last 7 days',
    // H-03: TOP DEVICE / TOP ROOM are hard-pinned to a 7-day window regardless of
    // the dashboard range toggle (see useTopDevices() / useRoomStats(7) above).
    // The (7d) qualifier makes that explicit so users don't expect these to
    // track the global window.
    topDevice: topDevice ? `${toInt(topDevice.event_count).toLocaleString()} events (7d)` : null,
    topRoom: topRoom ? `${toInt(topRoom.count).toLocaleString()} events (7d)` : null,
  };

  // Layout notes (all measured in a real browser, Chromium via Playwright):
  // - h-full + auto-rows-fr: the card row stretches to fill whatever box the
  //   grid gives this panel, so leftover height becomes card interior instead
  //   of a blank band below the row (the "gap between widgets" bug).
  // - md:grid-cols-4 (not lg:): the dashboard grid's desktop breakpoint starts
  //   at 768px, so the cards must go 4-across there too — with lg: the
  //   768-1023px band stacked them 2x2 inside a 2-row box and overflowed.
  // - p-3 body + 24px sparkline + mt-1: the tallest card (TODAY, with the
  //   sparkline) measures ~136px, fitting the panel's 2-row 144px box with
  //   ~8px slack. Card.Body compact (p-3 sm:p-4 = 16px) plus a 36px sparkline
  //   measured 160px — 16px of overflow that no integer row height could
  //   resolve (h:2 scrolled, h:3 left a 64px gap).
  return (
    <div className="grid h-full auto-rows-fr grid-cols-2 md:grid-cols-4 gap-3">
      {KPI_DEFS.map(def => (
        <Card key={def.key}>
          <div className="p-3">
            <div className="flex items-start gap-3">
              <div className={clsx('flex-shrink-0 w-9 h-9 rounded-xl flex items-center justify-center', def.bgClass)}>
                <def.icon size={16} className={def.iconClass} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-hc-caption font-semibold uppercase tracking-wider text-hc-muted mb-0.5">
                  {def.label}
                </div>
                <div className="text-2xl font-semibold text-hc-fg-strong leading-tight truncate" title={String(cardValues[def.key])}>
                  {cardValues[def.key]}
                </div>
                {cardSubTexts[def.key] != null && (
                  <div className="text-hc-caption text-hc-muted mt-0.5 truncate">
                    {cardSubTexts[def.key]}
                  </div>
                )}
              </div>
            </div>
            {def.key === 'today' && sparkData.length > 0 && (
              <div className="mt-1 -mx-1">
                <ResponsiveContainer width="100%" height={24}>
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
          </div>
        </Card>
      ))}
    </div>
  );
}
