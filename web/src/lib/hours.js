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
