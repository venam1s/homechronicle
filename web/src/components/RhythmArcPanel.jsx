import { useHourlyStats, useQuietHours } from '../hooks/useEvents.js';
import { formatHour12, utcHourToLocal, isWithinHourWindow } from '../lib/hours.js';
import { SkeletonList } from './Skeleton.jsx';

// Semicircle geometry: midnight at the left, noon at the top, midnight again
// at the right. Hours map onto 180 degrees.
const R = 78;
const CX = 100;
const CY = 92;

function pointAt(hour) {
  const angle = Math.PI - (hour / 24) * Math.PI;
  return [CX + R * Math.cos(angle), CY - R * Math.sin(angle)];
}

/** SVG arc path between two hours on the dial. */
function arcPath(fromHour, toHour) {
  const [x1, y1] = pointAt(fromHour);
  const [x2, y2] = pointAt(toHour);
  const large = Math.abs(toHour - fromHour) > 12 ? 1 : 0;
  return `M ${x1} ${y1} A ${R} ${R} 0 ${large} 1 ${x2} ${y2}`;
}

/**
 * Today's Rhythm — the day as an arc (DASH-07).
 *
 * Shows when the house is typically busy, where quiet hours fall, and where
 * "now" sits on that day. The busy band is derived from the hourly profile
 * rather than hard-coded, so it reflects this house rather than an assumption
 * about mornings.
 */
export default function RhythmArcPanel() {
  const { data: hourly, isLoading } = useHourlyStats();
  const { data: quiet } = useQuietHours();

  if (isLoading) return <SkeletonList rows={2} />;

  const byHour = new Array(24).fill(0);
  for (const row of Array.isArray(hourly) ? hourly : []) {
    const h = Number(row.hour);
    if (Number.isInteger(h) && h >= 0 && h < 24) byHour[h] = Number(row.count ?? row.event_count ?? 0);
  }
  const peak = byHour.reduce((best, n, h) => (n > byHour[best] ? h : best), 0);
  const hasData = byHour.some((n) => n > 0);

  const quietOn = quiet?.enabled !== false;
  const qStart = utcHourToLocal(quiet?.quietHoursStart ?? 23);
  const qEnd = utcHourToLocal(quiet?.quietHoursEnd ?? 6);
  const quietEvents = quiet?.events ?? [];

  const now = new Date();
  const nowHour = now.getHours() + now.getMinutes() / 60;
  const [nx, ny] = pointAt(nowHour);

  // The busy band: contiguous hours at or above 60% of peak, around the peak.
  const threshold = byHour[peak] * 0.6;
  let busyStart = peak;
  let busyEnd = peak + 1;
  while (busyStart > 0 && byHour[busyStart - 1] >= threshold) busyStart -= 1;
  while (busyEnd < 24 && byHour[busyEnd] >= threshold) busyEnd += 1;

  return (
    <div className="flex flex-col h-full">
      <svg viewBox="0 0 200 108" className="w-full max-w-[280px] mx-auto" role="img"
           aria-label={hasData ? `Daily rhythm, busiest around ${formatHour12(peak)}` : 'Daily rhythm, no activity yet'}>
        {/* Dial */}
        <path d={arcPath(0, 24)} fill="none" stroke="var(--hc-panel-mid)" strokeWidth="10" strokeLinecap="round" />
        {/* Quiet hours */}
        {quietOn && (
          isWithinHourWindow(0, qStart, qEnd)
            ? <>
                <path d={arcPath(0, qEnd)} fill="none" stroke="var(--hc-room-3)" strokeWidth="10" strokeLinecap="round" />
                <path d={arcPath(qStart, 24)} fill="none" stroke="var(--hc-room-3)" strokeWidth="10" strokeLinecap="round" />
              </>
            : <path d={arcPath(qStart, qEnd)} fill="none" stroke="var(--hc-room-3)" strokeWidth="10" strokeLinecap="round" />
        )}
        {/* Busy band */}
        {hasData && (
          <path d={arcPath(busyStart, busyEnd)} fill="none" stroke="var(--hc-accent-strong)" strokeWidth="10" strokeLinecap="round" />
        )}
        {/* Now */}
        <circle cx={nx} cy={ny} r="6" fill="var(--hc-accent-strong)" stroke="var(--hc-panel)" strokeWidth="3" />
        <g fontSize="8" fill="var(--hc-muted)" fontFamily="ui-monospace, Menlo, monospace">
          <text x="6" y="104">12 AM</text>
          <text x="194" y="104" textAnchor="end">12 AM</text>
          <text x={CX} y="10" textAnchor="middle">noon</text>
        </g>
      </svg>

      <ul className="flex flex-col gap-1.5 mt-2 text-hc-body">
        {quietOn && (
          <li className="flex items-start gap-2">
            <span className="w-2.5 h-2.5 rounded-full mt-1.5 shrink-0" style={{ backgroundColor: 'var(--hc-room-3)' }} />
            <span>
              <strong className="font-semibold text-hc-fg-strong">Quiet hours</strong>{' '}
              <span className="text-hc-muted">
                {formatHour12(qStart)} – {formatHour12(qEnd)} ·{' '}
                {quietEvents.length === 0
                  ? 'nothing stirred'
                  : `${quietEvents.length} ${quietEvents.length === 1 ? 'event' : 'events'}`}
              </span>
            </span>
          </li>
        )}
        {hasData && (
          <li className="flex items-start gap-2">
            <span className="w-2.5 h-2.5 rounded-full mt-1.5 shrink-0" style={{ backgroundColor: 'var(--hc-accent-strong)' }} />
            <span>
              <strong className="font-semibold text-hc-fg-strong">Busiest</strong>{' '}
              <span className="text-hc-muted">
                around {formatHour12(peak)}, usually {formatHour12(busyStart)}–{formatHour12(busyEnd % 24)}
              </span>
            </span>
          </li>
        )}
        {!hasData && <li className="text-hc-muted">No activity recorded yet today.</li>}
      </ul>
    </div>
  );
}
