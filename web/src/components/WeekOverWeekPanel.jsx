import { useMemo } from 'react';
import { format, subDays } from 'date-fns';
import { TrendingUp, TrendingDown } from 'lucide-react';
import Card from './Card.jsx';
import { useDailyStats, useTopDevices, useRoomStats } from '../hooks/useEvents.js';

function deltaPercent(current, prior) {
  if (!prior && !current) return null;
  if (!prior) return 100;
  return Math.round(((current - prior) / prior) * 100);
}

function DeltaBadge({ pct }) {
  if (pct === null || pct === undefined) return <span className="text-hc-muted text-sm">—</span>;
  const positive = pct >= 0;
  return (
    <span className={`inline-flex items-center gap-0.5 text-base font-semibold ${positive ? 'text-hc-success-text' : 'text-hc-danger-text'}`}>
      {positive ? '+' : ''}{pct}%
      {positive ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
    </span>
  );
}

export default function WeekOverWeekPanel() {
  const { data: daily14, isLoading } = useDailyStats(14);
  const { data: topDevices } = useTopDevices(7);
  const { data: rooms } = useRoomStats(7);

  const { currentTotal, priorTotal, pct } = useMemo(() => {
    if (!daily14?.length) return { currentTotal: 0, priorTotal: 0, pct: null };
    const dayMap = new Map(
      daily14.map((d) => [String(d.day).slice(0, 10), Number(d.count ?? 0)]),
    );
    let cur = 0;
    let prior = 0;
    for (let i = 0; i < 7; i++) {
      cur += dayMap.get(format(subDays(new Date(), i), 'yyyy-MM-dd')) ?? 0;
      prior += dayMap.get(format(subDays(new Date(), 7 + i), 'yyyy-MM-dd')) ?? 0;
    }
    return { currentTotal: cur, priorTotal: prior, pct: deltaPercent(cur, prior) };
  }, [daily14]);

  const topDevice = topDevices?.[0]?.accessory_name;
  const topRoom = rooms?.find((r) => r.room_name)?.room_name;

  const bothZero = !isLoading && currentTotal === 0 && priorTotal === 0;

  return (
    <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 h-full items-stretch">
      <Card className="flex flex-col">
        <Card.Body compact>
          <div className="text-hc-caption font-semibold uppercase tracking-wider text-hc-muted mb-1">
            Week vs Prior
          </div>
          {bothZero ? (
            <div className="text-sm text-hc-muted">Not enough history</div>
          ) : isLoading ? (
            <div className="text-hc-muted text-sm">…</div>
          ) : (
            <>
              <DeltaBadge pct={pct} />
              <div className="text-xs text-hc-muted mt-1">
                {currentTotal.toLocaleString()} vs {priorTotal.toLocaleString()} events
              </div>
            </>
          )}
        </Card.Body>
      </Card>

      <Card className="flex flex-col">
        <Card.Body compact>
          <div className="text-hc-caption font-semibold uppercase tracking-wider text-hc-muted mb-1">
            Top Device (7d)
          </div>
          <div className="text-sm font-semibold text-hc-fg truncate">
            {isLoading ? '…' : (topDevice ?? '—')}
          </div>
        </Card.Body>
      </Card>

      <Card className="flex flex-col">
        <Card.Body compact>
          <div className="text-hc-caption font-semibold uppercase tracking-wider text-hc-muted mb-1">
            Top Room (7d)
          </div>
          <div className="text-sm font-semibold text-hc-fg truncate">
            {isLoading ? '…' : (topRoom ?? '—')}
          </div>
        </Card.Body>
      </Card>
    </div>
  );
}
