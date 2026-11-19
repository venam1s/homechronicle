import { useState, useEffect } from 'react';
import { Moon, CheckCircle2, X, EyeOff } from 'lucide-react';
import { useQueryClient, useMutation } from '@tanstack/react-query';
import { useQuietHours } from '../hooks/useEvents.js';
import { useAuth } from '../hooks/useAuth.js';
import { useUserPreferences } from '../hooks/useUserPreferences.js';
import { useToast } from './Toast.jsx';
import { fetchJson } from '../lib/api.js';
import { utcHourToLocal, formatHour12 } from '../lib/hours.js';

const DISMISS_KEY = 'hc:quiet-hours-dismissed';

function formatLastSeen(ts) {
  if (!ts) return null;
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

/**
 * True when the panel has an event list to show: quiet hours are enabled and
 * at least one accessory was active in the window. Everything else (loading,
 * error, disabled, a quiet night) renders as a single row, and DashboardGrid
 * uses this same predicate to collapse the grid box to match (compactH in
 * lib/dashboardPanels.js), so keep the two in step.
 */
export function quietHoursHasActivity(data) {
  return data?.enabled !== false && Array.isArray(data?.events) && data.events.length > 0;
}

export default function QuietHoursPanel({ onNavigateToAccessory, embedded = false }) {
  const { data, isLoading, isError } = useQuietHours();
  const [dismissed, setDismissed] = useState(() => localStorage.getItem(DISMISS_KEY) === '1');
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { prefs, setPrefsBlob } = useUserPreferences();
  const { addToast } = useToast();

  // M-9: since Phase 25, stats-router resolves quiet hours from user_preferences whenever
  // the blob carries quietHoursEnabled — mirrors the blobHasQh predicate in
  // settings/QuietHoursGroup.jsx so the presence check stays coherent between the two write sites.
  const blobHasQh = !!user && prefs != null && 'quietHoursEnabled' in prefs;

  const excludeMutation = useMutation({
    mutationFn: async (accessoryId) => {
      if (blobHasQh) {
        // Blob branch: the server reads quiet hours from user_preferences for this user, so
        // the retention PATCH below would mutate the wrong store (and 403 for non-admins).
        const current = Array.isArray(prefs.quietHoursExcludedAccessories)
          ? prefs.quietHoursExcludedAccessories
          : [];
        if (current.includes(accessoryId)) return null;
        // All four QH keys every time (QH-08) — keeps the presence predicate coherent.
        await setPrefsBlob({
          quietHoursEnabled: prefs.quietHoursEnabled,
          quietHoursStart: prefs.quietHoursStart ?? 23,
          quietHoursEnd: prefs.quietHoursEnd ?? 6,
          quietHoursExcludedAccessories: [...current, accessoryId],
        });
        // Marker: null means "no retention cache to write" — onSuccess distinguishes branches.
        return null;
      }

      // Retention branch (today's code, verbatim) — admin-only PATCH.
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
      // Invalidate in both branches so the excluded row disappears either way (as
      // settings/QuietHoursGroup.jsx does when a chip is removed).
      queryClient.invalidateQueries({ queryKey: ['stats', 'quiet-hours'] });
    },
    // setPrefsBlob's promise always resolves (never rejects), so the blob branch will not
    // normally reach onError — that is expected. This toast exists for the retention
    // branch's 403/500 and for genuine network failures; do not "fix" this by making
    // setPrefsBlob reject, which would reintroduce unhandled rejections elsewhere.
    onError: (err) => {
      addToast(`Could not exclude accessory: ${err?.message ?? 'request failed'}`, 'error');
    },
  });

  function dismiss() {
    localStorage.setItem(DISMISS_KEY, '1');
    setDismissed(true);
  }

  // If quiet hours becomes enabled later, clear the dismissal so the panel reappears
  useEffect(() => {
    if (dismissed && data?.enabled) {
      localStorage.removeItem(DISMISS_KEY);
      setDismissed(false);
    }
  }, [dismissed, data?.enabled]);

  // When embedded as a dashboard grid panel, the grid's show/hide controls the
  // panel's visibility, so the legacy localStorage dismiss is ignored (otherwise
  // a previously-dismissed user would see an empty grid cell).
  if (!embedded && dismissed) return null;

  // When embedded as a grid panel, fill the cell (like ActivityFeed/RoomBreakdown)
  // so the unused bottom of the panel's row span doesn't show through as a gap.
  const card = `bg-hc-panel rounded-xl border border-hc-panel-border${embedded ? ' h-full flex flex-col' : ''}`;
  const fullCard = `${card} p-4 sm:p-5`;
  // The quiet states are one row: title and message side by side. On desktop
  // the grid draws that in a single 64px row (compactH), so the row stays
  // single-line (truncating rather than wrapping) and sits in 46px of
  // chrome: py-3 + a 20px line + the border. Below md the message is allowed
  // to wrap under the title and the box is two rows.
  const compactCard = `${card} px-4 sm:px-5 py-3 justify-center`;

  const compactRow = (message, { icon = null, action = null } = {}) => (
    <div className={compactCard}>
      <div className="flex flex-wrap md:flex-nowrap items-center gap-x-3 gap-y-1">
        <div className="flex items-center gap-2 shrink-0">
          <Moon size={14} className="text-hc-quiet-text" />
          <h3 className="text-sm font-semibold text-hc-fg whitespace-nowrap">Quiet Hours</h3>
        </div>
        <div className="flex items-center gap-2 min-w-0 flex-1 text-sm text-hc-muted">
          {icon}
          <span className="min-w-0 md:truncate">{message}</span>
        </div>
        {action}
      </div>
    </div>
  );

  if (isLoading) {
    return compactRow('Checking quiet hours…');
  }
  if (isError || (!isLoading && !data)) {
    return compactRow('No quiet hours data yet. Events will appear here once activity is recorded.');
  }

  if (data?.enabled === false) {
    return compactRow(
      'Configure quiet hours in Settings to flag unexpected nighttime activity.',
      {
        action: !embedded && (
          <button onClick={dismiss} className="ml-auto shrink-0 text-hc-muted hover:text-hc-fg p-0.5 rounded" title="Dismiss">
            <X size={14} />
          </button>
        ),
      },
    );
  }

  const startLocal = formatHour12(utcHourToLocal(data?.quietHoursStart ?? 23));
  const endLocal = formatHour12(utcHourToLocal(data?.quietHoursEnd ?? 6));
  const events = data?.events ?? [];

  if (!events.length) {
    return compactRow(
      `No unexpected activity during quiet hours (${startLocal} – ${endLocal})`,
      { icon: <CheckCircle2 size={14} className="text-hc-success-text shrink-0" /> },
    );
  }

  return (
    <div className={fullCard}>
      <div className="flex items-baseline justify-between mb-3">
        <div className="flex items-center gap-2">
          <Moon size={14} className="text-hc-quiet-text" />
          <h3 className="text-sm font-semibold text-hc-fg">Quiet Hours Activity</h3>
        </div>
        <span className="text-xs text-hc-muted">{startLocal} – {endLocal}</span>
      </div>
      <div className="space-y-2 flex-1 min-h-0 overflow-auto">
        {events.map((row) => (
          <div
            key={`${row.accessoryId ?? row.accessoryName}:${row.lastSeenAt}`}
            className={`rounded-lg border border-hc-quiet-border bg-hc-quiet-bg px-3 py-2${onNavigateToAccessory ? ' cursor-pointer hover:brightness-95 transition-[filter]' : ''}`}
            onClick={onNavigateToAccessory ? () => onNavigateToAccessory(row.accessoryName) : undefined}
          >
            <div className="flex items-center gap-2 text-xs text-hc-quiet-text">
              <Moon size={12} />
              <span className="font-semibold truncate">{row.accessoryName}</span>
              {row.room && <span className="truncate opacity-80">{row.room}</span>}
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
              <div className="text-xs text-hc-quiet-text mt-0.5">
                Last seen {formatLastSeen(row.lastSeenAt)}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
