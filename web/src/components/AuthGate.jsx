import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Navigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { fetchJson, API_BASE } from '../lib/api.js';

export default function AuthGate({ children }) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['auth', 'me'],
    // Shares the ['auth','me'] cache entry with useAuth — MUST unwrap the same way,
    // otherwise whichever query resolves first decides the shape and the other reads
    // the wrong one (wrapped { user } leaves user.role/email undefined → no Admin tab).
    queryFn: () => fetchJson(`${API_BASE}/auth/me`).then((d) => d?.user ?? null),
    staleTime: 60_000,
    retry: false,
  });

  // CSRF token recovery: when authenticated but sessionStorage has no token,
  // fetch /auth/csrf-token to repopulate it (covers returning sessions and new tabs).
  // Runs only when /auth/me succeeds (data truthy); never for unauthenticated users.
  // Non-fatal: a failure does not block rendering children.
  useEffect(() => {
    if (!data) return;
    const existing = typeof sessionStorage !== 'undefined'
      ? sessionStorage.getItem('csrfToken')
      : null;
    if (existing) return;
    (async () => {
      try {
        const result = await fetchJson(`${API_BASE}/auth/csrf-token`);
        if (result?.csrfToken && typeof sessionStorage !== 'undefined') {
          sessionStorage.setItem('csrfToken', result.csrfToken);
        }
      } catch {
        // Non-fatal: children still render even if CSRF recovery fails
      }
    })();
  }, [data]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-hc-bg">
        <Loader2 size={32} className="animate-spin text-hc-muted" />
      </div>
    );
  }

  if (isError || !data) {
    return <Navigate to="/login" replace />;
  }

  return children;
}
