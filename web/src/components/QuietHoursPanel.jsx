import { useState } from 'react';
import { Moon, CheckCircle2, X } from 'lucide-react';
import { useQuietHours } from '../hooks/useEvents.js';

const DISMISS_KEY = 'hc:quiet-hours-dismissed';

function utcHourToLocal(utcHour) {
  return ((utcHour + new Date().getTimezoneOffset() / -60) % 24 + 24) % 24;
}

function formatHour12(h) {
  const period = h < 12 ? 'AM' : 'PM';
  const display = h % 12 === 0 ? 12 : h % 12;
  return `${display} ${period}`;
}

function formatLastSeen(ts) {
  if (!ts) return null;
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

export default function QuietHoursPanel() {
  const { data, isLoading, isError } = useQuietHours();
  const [dismissed, setDismissed] = useState(() => localStorage.getItem(DISMISS_KEY) === '1');

  function dismiss() {
    localStorage.setItem(DISMISS_KEY, '1');
    setDismissed(true);
  }

  // If quiet hours becomes enabled later, clear the dismissal so the panel reappears
  if (dismissed && data?.enabled) {
    localStorage.removeItem(DISMISS_KEY);
    setDismissed(false);
  }

  if (dismissed) return null;

  const card = 'bg-white dark:bg-gray-800 rounded-xl shadow-sm p-4 sm:p-5';

  const header = (
    <div className="flex items-center gap-2 mb-3">
      <Moon size={14} style={{ color: 'rgb(var(--hc-accent-rgb))' }} />
      <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200">Quiet Hours</h3>
    </div>
  );

  if (isLoading) {
    return <div className={card}>{header}<p className="text-sm text-gray-400 dark:text-gray-500">Checking quiet hours…</p></div>;
  }
  if (isError || (!isLoading && !data)) {
    return (
      <div className={card}>
        {header}
        <p className="text-sm text-gray-400 dark:text-gray-500">
          No quiet hours data yet. Events will appear here once activity is recorded.
        </p>
      </div>
    );
  }

  if (data?.enabled === false) {
    return (
      <div className={card}>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Moon size={14} style={{ color: 'rgb(var(--hc-accent-rgb))' }} />
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200">Quiet Hours</h3>
          </div>
          <button onClick={dismiss} className="text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 p-0.5 rounded" title="Dismiss">
            <X size={14} />
          </button>
        </div>
        <p className="text-sm text-gray-400 dark:text-gray-500">
          Configure quiet hours in Settings to flag unexpected nighttime activity.
        </p>
      </div>
    );
  }

  const startLocal = formatHour12(utcHourToLocal(data?.quietHoursStart ?? 23));
  const endLocal = formatHour12(utcHourToLocal(data?.quietHoursEnd ?? 6));
  const events = data?.events ?? [];

  if (!events.length) {
    return (
      <div className={card}>
        {header}
        <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
          <CheckCircle2 size={14} className="text-emerald-500 flex-shrink-0" />
          <span>No unexpected activity during quiet hours ({startLocal} – {endLocal})</span>
        </div>
      </div>
    );
  }

  return (
    <div className={card}>
      <div className="flex items-baseline justify-between mb-3">
        <div className="flex items-center gap-2">
          <Moon size={14} style={{ color: 'rgb(var(--hc-accent-rgb))' }} />
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200">Quiet Hours Activity</h3>
        </div>
        <span className="text-xs text-gray-400 dark:text-gray-500">{startLocal} – {endLocal}</span>
      </div>
      <div className="space-y-2">
        {events.map((row) => (
          <div
            key={`${row.accessoryId ?? row.accessoryName}:${row.lastSeenAt}`}
            className="rounded-lg px-3 py-2"
            style={{
              border: '1px solid rgba(var(--hc-accent-rgb), 0.15)',
              backgroundColor: 'rgba(var(--hc-accent-rgb), 0.06)',
            }}
          >
            <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--hc-accent-strong)' }}>
              <Moon size={12} />
              <span className="font-semibold truncate">{row.accessoryName}</span>
              {row.room && <span className="truncate" style={{ color: 'rgb(var(--hc-accent-rgb))', opacity: 0.7 }}>{row.room}</span>}
              <span className="ml-auto whitespace-nowrap">{row.count} event{row.count !== 1 ? 's' : ''}</span>
            </div>
            {row.lastSeenAt && (
              <div className="text-xs mt-0.5" style={{ color: 'var(--hc-accent-strong)' }}>
                Last seen {formatLastSeen(row.lastSeenAt)}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
