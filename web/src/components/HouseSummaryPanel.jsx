import { useDailyStats, useRoomStats, useQuietHours } from '../hooks/useEvents.js';
import { formatHour12, utcHourToLocal } from '../lib/hours.js';

const dayKey = (d) => d.toISOString().slice(0, 10);

/** Count for a given date from the daily-stats series. */
function countFor(daily, date) {
  const key = dayKey(date);
  return Number(daily?.find((d) => String(d.day ?? '').startsWith(key))?.count ?? 0);
}

/**
 * Greeting for the current local hour. Plain time-of-day, not a mood.
 */
function greeting(hour) {
  if (hour < 5) return 'Late tonight';
  if (hour < 12) return 'This morning';
  if (hour < 18) return 'This afternoon';
  return 'This evening';
}

/**
 * A sentence describing how today compares to yesterday. Returns null when
 * there is nothing worth saying (no data yet).
 */
function describeToday(today, yesterday) {
  if (today === 0) return 'Nothing has been recorded yet today.';
  const delta = today - yesterday;
  const noun = today === 1 ? 'event' : 'events';
  if (yesterday === 0) return `${today} ${noun} so far today.`;
  if (Math.abs(delta) < Math.max(3, yesterday * 0.1)) {
    return `${today} ${noun} so far today — about the same as yesterday.`;
  }
  return delta > 0
    ? `${today} ${noun} so far today — ${delta} more than yesterday.`
    : `${today} ${noun} so far today — ${Math.abs(delta)} fewer than yesterday.`;
}

/**
 * House Summary — the dashboard's lede (DASH-05).
 *
 * One sentence on the state of the house, assembled from data already on the
 * page rather than a new endpoint. Deliberately reads as prose: this is the
 * panel that tells someone who is not studying the charts whether anything
 * needs their attention.
 *
 * `bare` panel: it draws its own type, with no card around it.
 */
export default function HouseSummaryPanel() {
  const { data: daily } = useDailyStats(2);
  const { data: rooms } = useRoomStats(7);
  const { data: quiet } = useQuietHours();

  const now = new Date();
  const today = countFor(daily, now);
  const yesterday = countFor(daily, new Date(now.getTime() - 864e5));

  const topRoom = Array.isArray(rooms) && rooms.length > 0
    ? [...rooms].sort((a, b) => Number(b.count ?? b.event_count ?? 0) - Number(a.count ?? a.event_count ?? 0))[0]
    : null;

  const quietEvents = quiet?.events ?? [];
  const quietWindow = quiet?.enabled === false
    ? null
    : `${formatHour12(utcHourToLocal(quiet?.quietHoursStart ?? 23))} – ${formatHour12(utcHourToLocal(quiet?.quietHoursEnd ?? 6))}`;

  return (
    <div className="flex flex-col gap-1 py-1">
      {/* Truncated to one line each: the panel's grid row (h:1, maxH:1) is sized
          for exactly this — a wrapped second line would overflow the box and
          produce DashboardPanel's overflow-auto scrollbar instead of the
          intended "reads as prose" glance. See dashboardPanels.js houseSummary. */}
      <h2 className="text-hc-page-title font-semibold text-hc-fg-strong leading-tight truncate">
        {greeting(now.getHours())}
        {topRoom
          ? <> — <span className="text-hc-accent-strong">{topRoom.room_name || 'an unnamed room'}</span> is doing most of the talking.</>
          : ' — the house is quiet.'}
      </h2>
      <p className="text-hc-body text-hc-muted truncate">
        {describeToday(today, yesterday)}
        {quietWindow && (
          quietEvents.length > 0
            ? ` ${quietEvents.length} ${quietEvents.length === 1 ? 'event' : 'events'} during quiet hours (${quietWindow}).`
            : ` Nothing stirred during quiet hours (${quietWindow}).`
        )}
      </p>
    </div>
  );
}
