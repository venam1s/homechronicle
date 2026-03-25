import { useQuery } from '@tanstack/react-query';
import { AlertTriangle } from 'lucide-react';
import { fetchJson } from '../lib/api.js';

export default function PairingHealthBanner({ onViewDetails }) {
  const { data } = useQuery({
    queryKey: ['health'],
    queryFn: () => fetchJson('/api/health'),
    refetchInterval: 30_000,
  });

  const count = data?.subscribers?.needsRepair ?? 0;
  if (count === 0) return null;

  return (
    <div className="bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-700 rounded-lg px-4 py-3 flex items-center justify-between gap-3">
      <div className="flex items-center gap-2 text-amber-800 dark:text-amber-200 text-sm">
        <AlertTriangle size={16} className="shrink-0" />
        <span>
          <strong>{count}</strong> device{count !== 1 ? 's have' : ' has'} pairing issues and may not be receiving events.
        </span>
      </div>
      {onViewDetails && (
        <button
          onClick={onViewDetails}
          className="text-xs px-3 py-1 rounded bg-amber-100 dark:bg-amber-800 text-amber-700 dark:text-amber-200 hover:bg-amber-200 dark:hover:bg-amber-700 transition-colors whitespace-nowrap"
        >
          View Details
        </button>
      )}
    </div>
  );
}
