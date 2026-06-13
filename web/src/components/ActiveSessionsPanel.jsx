import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Loader2, Monitor } from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import { useSessions, useRevokeSession } from '../hooks/useAuth.js';
import { useToast } from './Toast.jsx';
import Card from './Card.jsx';

// Abbreviate a raw user_agent into a short "Browser on OS" label (SEC-05 / D-02).
// Rendered as text (React-escaped) — never via dangerouslySetInnerHTML (T-23-XSS).
function deviceLabel(ua) {
  if (!ua) return 'Unknown device';
  let browser = 'Browser';
  if (/Edg\//.test(ua)) browser = 'Edge';
  else if (/OPR\/|Opera/.test(ua)) browser = 'Opera';
  else if (/Chrome\//.test(ua)) browser = 'Chrome';
  else if (/Firefox\//.test(ua)) browser = 'Firefox';
  else if (/Safari\//.test(ua)) browser = 'Safari';

  let os = '';
  if (/Windows/.test(ua)) os = 'Windows';
  else if (/Mac OS X|Macintosh/.test(ua)) os = 'macOS';
  else if (/Android/.test(ua)) os = 'Android';
  else if (/iPhone|iPad|iPod/.test(ua)) os = 'iOS';
  else if (/Linux/.test(ua)) os = 'Linux';

  return os ? `${browser} on ${os}` : browser;
}

function fmtDate(ts) {
  if (!ts) return '—';
  try {
    return format(new Date(ts), 'PP p');
  } catch {
    return '—';
  }
}

function fmtRelative(ts) {
  if (!ts) return '—';
  try {
    return formatDistanceToNow(new Date(ts), { addSuffix: true });
  } catch {
    return '—';
  }
}

/**
 * Active Sessions panel (SEC-05) — Settings → Account.
 * Lists the caller's own sessions, marks the current one "This device" (no revoke),
 * allows per-row revoke (scoped pending) and a bulk "Log out other devices" action
 * that iterates the existing CSRF-protected DELETE over non-current sessions (D-03).
 */
export default function ActiveSessionsPanel() {
  const { data, isLoading, isError } = useSessions();
  const revoke = useRevokeSession();
  const queryClient = useQueryClient();
  const { addToast } = useToast();
  const [pendingSessionId, setPendingSessionId] = useState(null);
  const [bulkPending, setBulkPending] = useState(false);

  const sessions = data?.sessions ?? [];
  const others = sessions.filter((s) => !s.current);

  function handleRevoke(id) {
    setPendingSessionId(id);
    revoke.mutate(id, {
      onError: () => addToast('Could not revoke that session.', 'error'),
      onSettled: () => setPendingSessionId((cur) => (cur === id ? null : cur)),
    });
  }

  async function handleBulkRevoke() {
    setBulkPending(true);
    try {
      // allSettled (not all): one failed revoke must not abandon the rest, and a
      // partial silent failure on a "log out other devices" action is a trust gap.
      const results = await Promise.allSettled(others.map((s) => revoke.mutateAsync(s.id)));
      const failed = results.filter((r) => r.status === 'rejected').length;
      if (failed > 0) {
        addToast(
          `Could not log out ${failed} of ${others.length} other device${others.length === 1 ? '' : 's'}.`,
          'error',
        );
      }
    } finally {
      // Always refetch so the list reflects reality even if every revoke failed —
      // the per-mutation onSuccess only invalidates for the ones that succeeded.
      queryClient.invalidateQueries({ queryKey: ['auth', 'sessions'] });
      setBulkPending(false);
    }
  }

  return (
    <Card>
      <Card.Header
        title="Active Sessions"
        headingLevel={2}
        actions={(
          <button
            type="button"
            onClick={handleBulkRevoke}
            disabled={others.length === 0 || bulkPending}
            className="w-auto py-2 px-4 rounded-lg border border-hc-panel-border text-hc-body text-hc-fg hover:bg-hc-panel-hover disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
          >
            {bulkPending ? <Loader2 size={16} className="animate-spin" /> : null}
            Log out other devices
          </button>
        )}
      />
      <Card.Body>
      <div className="space-y-4">

      {isLoading && <p className="text-hc-caption text-hc-muted">Loading sessions…</p>}
      {isError && <p className="text-hc-caption text-hc-danger-text">Could not load sessions.</p>}
      {!isLoading && !isError && sessions.length === 0 && (
        <p className="text-hc-caption text-hc-muted">No active sessions.</p>
      )}

      <ul className="space-y-2">
        {sessions.map((s) => {
          const label = deviceLabel(s.user_agent);
          const rowPending = pendingSessionId === s.id;
          return (
            <li
              key={s.id}
              className="flex items-start justify-between gap-4 p-4 rounded-lg border border-hc-panel-border bg-hc-panel"
            >
              <div className="min-w-0 space-y-1">
                <div className="flex items-center gap-2">
                  <Monitor size={16} className="text-hc-muted shrink-0" />
                  <span className="text-hc-body font-semibold text-hc-fg-strong">{label}</span>
                  {s.current && (
                    <span className="px-2 py-0.5 rounded-full bg-hc-panel-mid text-hc-caption text-hc-fg-strong border border-hc-panel-border">
                      This device
                    </span>
                  )}
                </div>
                <p className="text-hc-caption text-hc-muted">IP: {s.ip_address || '—'}</p>
                <p className="text-hc-caption text-hc-muted">
                  Signed in {fmtDate(s.created_at)} · Last active {fmtRelative(s.last_seen_at)} · Expires {fmtDate(s.expires_at)}
                </p>
              </div>

              {!s.current && (
                <button
                  type="button"
                  onClick={() => handleRevoke(s.id)}
                  disabled={rowPending || bulkPending}
                  aria-label={`Revoke ${label} session`}
                  className="shrink-0 w-auto py-2 px-4 rounded-lg bg-hc-danger-bg text-hc-danger-text text-hc-body font-semibold hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
                >
                  {rowPending ? <Loader2 size={16} className="animate-spin" /> : null}
                  Revoke
                </button>
              )}
            </li>
          );
        })}
      </ul>
      </div>
      </Card.Body>
    </Card>
  );
}
