/**
 * hours.js — shared hour helpers for the dashboard's time-of-day panels.
 *
 * The quiet-hours API reports its window in UTC hours; every consumer has to
 * render it in the viewer's local time. This logic previously existed as
 * identical private copies in QuietHoursPanel and DayNightPanel — extracted
 * here when a third consumer (the rhythm panel) arrived.
 */

/** Convert a UTC hour (0-23) to the viewer's local hour (0-23). */
export function utcHourToLocal(utcHour) {
  return ((Number(utcHour) + new Date().getTimezoneOffset() / -60) % 24 + 24) % 24;
}

/**
 * The UTC hour (0-23) whose events land in the viewer's local hour `localHour`.
 * Half-hour offsets (India, Nepal) floor to the UTC hour the local hour starts in.
 */
export function localHourToUtc(localHour) {
  const offsetHours = -new Date().getTimezoneOffset() / 60;
  return Math.floor(((Number(localHour) - offsetHours) % 24 + 24) % 24) % 24;
}

/**
 * Re-index a 24-slot array keyed by UTC hour so slot `h` holds local hour `h`.
 * The API buckets every hourly series in UTC.
 */
export function rotateUtcHoursToLocal(utcArr) {
  return Array.from({ length: 24 }, (_, localH) => utcArr[localHourToUtc(localH)] ?? 0);
}

/** Format an hour (0-23) as a 12-hour label, e.g. `11 PM`. */
export function formatHour12(h) {
  const hour = ((Math.floor(Number(h)) % 24) + 24) % 24;
  const period = hour < 12 ? 'AM' : 'PM';
  const display = hour % 12 === 0 ? 12 : hour % 12;
  return `${display} ${period}`;
}

/** True when `hour` falls inside a window that may wrap past midnight. */
export function isWithinHourWindow(hour, start, end) {
  if (start === end) return false;
  return start < end ? hour >= start && hour < end : hour >= start || hour < end;
}
