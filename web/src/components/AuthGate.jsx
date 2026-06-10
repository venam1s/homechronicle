import { useQuery } from '@tanstack/react-query';
import { Navigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { fetchJson, API_BASE } from '../lib/api.js';

export default function AuthGate({ children }) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['auth', 'me'],
    queryFn: () => fetchJson(`${API_BASE}/auth/me`),
    staleTime: 60_000,
    retry: false,
  });

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
