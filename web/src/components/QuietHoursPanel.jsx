import { useState } from 'react';
import { Moon, CheckCircle2, X, EyeOff } from 'lucide-react';
import { useQueryClient, useMutation } from '@tanstack/react-query';
import { useQuietHours } from '../hooks/useEvents.js';
import { fetchJson } from '../lib/api.js';

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

export default function QuietHoursPanel({ onNavigateToAccessory, embedded = false }) {
  const { data, isLoading, isError } = useQuietHours();
  const [dismissed, setDismissed] = useState(() => localStorage.getItem(DISMISS_KEY) === '1');
  const queryClient = useQueryClient();

  const excludeMutation = useMutation({
    mutationFn: async (accessoryId) => {
      const retention = queryClient.getQueryData(['setup', 'retention']) ?? {};
      const current = Array.isArray(retention.quietHoursExcludedAccessories)
        ? retention.quietHoursExcludedAccessories
        : [];
      if (current.includes(accessoryId)) return retention;
      return fetchJson('/api/setup/retention', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quietHoursExcludedAccessories: [...current, accessoryId] }),
      });
    },
    onSuccess: (next) => {
      if (next) queryClient.setQueryData(['setup', 'retention'], next);
      queryClient.invalidateQueries({ queryKey: ['stats', 'quiet-hours'] });
    },
  });

  function dismiss() {
    localStorage.setItem(DISMISS_KEY, '1');
    setDismissed(true);
  }

  // If quiet hours becomes enabled later, clear the dismissal so the panel reappears
  if (dismissed && data?.enabled) {
    localStorage.removeItem(DISMISS_KEY);
    setDismissed(false);
  }

  // When embedded as a dashboard grid panel, the grid's show/hide controls the
  // panel's visibility, so the legacy localStorage dismiss is ignored (otherwise
  // a previously-dismissed user would see an empty grid cell).
  if (!embedded && dismissed) return null;

  // When embedded as a grid panel, fill the cell (like ActivityFeed/RoomBreakdown)
  // so the unused bottom of the panel's row span doesn't show through as a gap.
  const card = `bg-hc-panel rounded-xl shadow-sm p-4 sm:p-5${embedded ? ' h-full flex flex-col' : ''}`;

  const header = (
    <div className="flex items-center gap-2 mb-3">
      <Moon size={14} style={{ color: 'rgb(var(--hc-accent-rgb))' }} />
      <h3 className="text-sm font-semibold text-hc-fg">Quiet Hours</h3>
    </div>
  );

  if (isLoading) {
    return <div className={card}>{header}<p className="text-sm text-hc-muted">Checking quiet hours…</p></div>;
  }
  if (isError || (!isLoading && !data)) {
    return (
      <div className={card}>
        {header}
        <p className="text-sm text-hc-muted">
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
            <h3 className="text-sm font-semibold text-hc-fg">Quiet Hours</h3>
          </div>
          {!embedded && (
            <button onClick={dismiss} className="text-hc-muted hover:text-hc-fg p-0.5 rounded" title="Dismiss">
              <X size={14} />
            </button>
          )}
        </div>
        <p className="text-sm text-hc-muted">
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
        <div className="flex items-center gap-2 text-sm text-hc-muted">
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
          <h3 className="text-sm font-semibold text-hc-fg">Quiet Hours Activity</h3>
        </div>
        <span className="text-xs text-hc-muted">{startLocal} – {endLocal}</span>
      </div>
      <div className="space-y-2 flex-1 min-h-0 overflow-auto">
        {events.map((row) => (
          <div
            key={`${row.accessoryId ?? row.accessoryName}:${row.lastSeenAt}`}
            className={`rounded-lg px-3 py-2${onNavigateToAccessory ? ' cursor-pointer hover:brightness-95 transition-[filter]' : ''}`}
            style={{
              border: '1px solid rgba(var(--hc-accent-rgb), 0.15)',
              backgroundColor: 'rgba(var(--hc-accent-rgb), 0.06)',
            }}
            onClick={onNavigateToAccessory ? () => onNavigateToAccessory(row.accessoryName) : undefined}
          >
            <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--hc-accent-strong)' }}>
              <Moon size={12} />
              <span className="font-semibold truncate">{row.accessoryName}</span>
              {row.room && <span className="truncate" style={{ color: 'rgb(var(--hc-accent-rgb))', opacity: 0.7 }}>{row.room}</span>}
              <span className="ml-auto whitespace-nowrap flex items-center gap-2">
                {row.count} event{row.count !== 1 ? 's' : ''}
                {row.accessoryId && (
                  <button
                    onClick={(e) => { e.stopPropagation(); excludeMutation.mutate(row.accessoryId); }}
                    disabled={excludeMutation.isPending}
                    className="p-0.5 rounded hover:bg-black/10 transition-colors"
                    title={`Exclude ${row.accessoryName} from quiet hours`}
                  >
                    <EyeOff size={12} />
                  </button>
                )}
              </span>
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
