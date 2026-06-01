import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, X } from 'lucide-react';
import { fetchJson } from '../lib/api.js';

const DISMISS_KEY = 'hc:pairingHealthBanner:dismissedCount';

export default function PairingHealthBanner({ onViewDetails }) {
  const { data } = useQuery({
    queryKey: ['health'],
    queryFn: () => fetchJson('/api/health'),
    refetchInterval: 30_000,
  });

  const [dismissedCount, setDismissedCount] = useState(() => {
    const stored = Number(sessionStorage.getItem(DISMISS_KEY));
    return Number.isFinite(stored) ? stored : 0;
  });

  const count = data?.subscribers?.needsRepair ?? 0;
  if (count === 0) return null;
  // Stay hidden until the number of affected devices changes (a new problem re-surfaces it).
  if (count === dismissedCount) return null;

  const handleDismiss = () => {
    sessionStorage.setItem(DISMISS_KEY, String(count));
    setDismissedCount(count);
  };

  return (
    <div className="bg-hc-warning-bg border border-hc-warning-border rounded-lg px-4 py-3 flex items-center justify-between gap-3">
      <div className="flex items-center gap-2 text-hc-warning-text text-sm">
        <AlertTriangle size={16} className="shrink-0" />
        <span>
          <strong>{count}</strong> device{count !== 1 ? 's have' : ' has'} pairing issues and may not be receiving events.
        </span>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {onViewDetails && (
          <button
            onClick={onViewDetails}
            className="text-xs px-3 py-1 rounded bg-hc-warning-border text-hc-warning-text hover:opacity-90 transition-opacity whitespace-nowrap"
          >
            View Details
          </button>
        )}
        <button
          onClick={handleDismiss}
          aria-label="Dismiss"
          title="Dismiss"
          className="p-1 rounded text-hc-warning-text hover:bg-hc-warning-border transition-colors"
        >
          <X size={16} />
        </button>
      </div>
    </div>
  );
}
