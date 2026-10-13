import { useHourlyStats, useQuietHours } from '../hooks/useEvents.js';
import { formatHour12, utcHourToLocal, rotateUtcHoursToLocal } from '../lib/hours.js';
import { SkeletonList } from './Skeleton.jsx';

// Semicircle geometry: midnight at the left, noon at the top, midnight again
// at the right. Hours map onto 180 degrees.
//
// The layout is derived from these constants rather than hand-placed, because
// hand-placing it went wrong: the "noon" label was pinned at y=10 while the
// apex of a 10px-wide stroke sat at y=14, i.e. occupying y 9-19 — so the label
// (y ~2-12 for an 8px font) ran straight through the arc. CY now leaves room
// above the apex for the label AND for the "now" dot, which is the widest
// thing on the dial. Exported so a test can assert the clearances instead of
// trusting the arithmetic. See RhythmArcPanel.test.jsx.
const R = 78;
const CX = 100;
const CY = 100;
const STROKE = 10;
const DOT_R = 6;
const DOT_STROKE = 3;
const FONT_SIZE = 8;
const VIEWBOX_H = 120;
// Baselines: the top label clears the apex, the bottom pair clear the arc ends.
// The bottom pair needed moving too — they overlapped the end caps by a pixel,
// which is the same mistake as the noon label, just too small to notice.
const NOON_LABEL_Y = 10;
const EDGE_LABEL_Y = 116;

export const GEOMETRY = {
  R, CX, CY, STROKE, DOT_R, DOT_STROKE, FONT_SIZE, VIEWBOX_H, NOON_LABEL_Y, EDGE_LABEL_Y,
};

function pointAt(hour) {
  const angle = Math.PI - (hour / 24) * Math.PI;
  return [CX + R * Math.cos(angle), CY - R * Math.sin(angle)];
}

/**
 * SVG arc path between two hours on the dial.
 *
 * The whole day spans a half circle, so no arc is ever longer than 180° and
 * the large-arc flag is always 0. It used to be set for spans over 12 hours,
 * which told SVG to take the long way round the full circle: a busy band of
 * 9 AM–10 PM looped off the dial instead of following it.
 */
export function arcPath(fromHour, toHour) {
  const [x1, y1] = pointAt(fromHour);
  const [x2, y2] = pointAt(toHour);
  return `M ${x1} ${y1} A ${R} ${R} 0 0 1 ${x2} ${y2}`;
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

  // The API buckets by UTC hour; the dial, "now" and quiet hours are local.
  const byUtcHour = new Array(24).fill(0);
  for (const row of Array.isArray(hourly) ? hourly : []) {
    const h = Number(row.hour);
    if (Number.isInteger(h) && h >= 0 && h < 24) byUtcHour[h] = Number(row.count ?? row.event_count ?? 0);
  }
  const byHour = rotateUtcHoursToLocal(byUtcHour);
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
      <svg viewBox={`0 0 200 ${VIEWBOX_H}`} className="w-full max-w-[280px] mx-auto" role="img"
           aria-label={hasData ? `Daily rhythm, busiest around ${formatHour12(peak)}` : 'Daily rhythm, no activity yet'}>
        {/* Dial */}
        <path d={arcPath(0, 24)} fill="none" stroke="var(--hc-panel-mid)" strokeWidth={STROKE} strokeLinecap="round" />
        {/* Quiet hours */}
        {/* Split only a window that crosses midnight (start after end). Testing
            "is midnight inside it" also matched a window that STARTS at
            midnight, and 12 AM–5 AM then painted the whole dial. */}
        {quietOn && (
          qStart > qEnd
            ? <>
                <path d={arcPath(0, qEnd)} fill="none" stroke="var(--hc-room-3)" strokeWidth={STROKE} strokeLinecap="round" />
                <path d={arcPath(qStart, 24)} fill="none" stroke="var(--hc-room-3)" strokeWidth={STROKE} strokeLinecap="round" />
              </>
            : <path d={arcPath(qStart, qEnd)} fill="none" stroke="var(--hc-room-3)" strokeWidth={STROKE} strokeLinecap="round" />
        )}
        {/* Busy band */}
        {hasData && (
          <path d={arcPath(busyStart, busyEnd)} fill="none" stroke="var(--hc-accent-strong)" strokeWidth={STROKE} strokeLinecap="round" />
        )}
        {/* Now */}
        <circle cx={nx} cy={ny} r={DOT_R} fill="var(--hc-accent-strong)" stroke="var(--hc-panel)" strokeWidth={DOT_STROKE} />
        <g fontSize={FONT_SIZE} fill="var(--hc-muted)" fontFamily="ui-monospace, Menlo, monospace">
          <text x="6" y={EDGE_LABEL_Y}>12 AM</text>
          <text x="194" y={EDGE_LABEL_Y} textAnchor="end">12 AM</text>
          <text x={CX} y={NOON_LABEL_Y} textAnchor="middle">noon</text>
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
