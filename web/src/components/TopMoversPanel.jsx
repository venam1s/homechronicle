import { useMemo } from 'react';
import { TrendingUp, TrendingDown } from 'lucide-react';
import { useAnomalies, useAccessories } from '../hooks/useEvents.js';

function isBridgeParent(device) {
  const idParts = String(device?.accessory_id ?? '').split(':');
  return idParts.length === 6 && Number(device?.category) === 2;
}

export default function TopMoversPanel({ onSelectAccessory, onSelectRoom }) {
  const { data, isLoading, isError } = useAnomalies();
  const { data: accessories } = useAccessories();

  const nameToId = useMemo(() => {
    const map = new Map();
    for (const a of (accessories ?? []).filter((d) => !isBridgeParent(d))) {
      map.set(a.accessory_name, a.accessory_id);
    }
    return map;
  }, [accessories]);

  const rows = useMemo(() => {
    const devices = (data?.devices ?? []).map((r) => ({ ...r, scopeType: 'device' }));
    const rooms = (data?.rooms ?? []).map((r) => ({ ...r, scopeType: 'room' }));
    return [...devices, ...rooms]
      .sort((a, b) => Math.abs(b.score) - Math.abs(a.score))
      .slice(0, 6);
  }, [data]);

  const header = (
    <div className="flex items-baseline justify-between mb-3">
      <h3 className="text-sm font-semibold text-hc-fg">Top Movers</h3>
      <span className="text-xs text-hc-muted">vs baseline</span>
    </div>
  );

  if (isLoading) {
    return <div>{header}<p className="text-sm text-hc-muted">Analyzing activity…</p></div>;
  }
  if (isError) {
    return <div>{header}<p className="text-sm text-hc-muted">Could not load mover data.</p></div>;
  }
  if (!rows.length) {
    return <div>{header}<p className="text-sm text-hc-muted">No notable movers vs baseline.</p></div>;
  }

  return (
    <div>
      {header}
      <div className="space-y-1.5">
        {rows.map((row) => {
          const pctChange = Math.round(
            ((row.eventCount - row.baselineAvg) / Math.max(row.baselineAvg, 1)) * 100,
          );
          const isSpike = row.kind === 'spike';

          function handleClick() {
            if (row.scopeType === 'device') {
              const id = nameToId.get(row.scopeName);
              if (id) onSelectAccessory?.(id);
            } else {
              onSelectRoom?.(row.scopeName);
            }
          }

          function handleKeyDown(e) {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              handleClick();
            }
          }

          return (
            <div
              key={`${row.scopeType}:${row.scopeName}:${row.hour}`}
              role="button"
              tabIndex={0}
              onClick={handleClick}
              onKeyDown={handleKeyDown}
              className="flex items-center gap-2 px-2 py-1.5 rounded-lg border border-hc-panel-border bg-hc-panel-soft cursor-pointer hover:opacity-90 transition-opacity"
            >
              <div className="flex-1 min-w-0">
                <div className="text-sm text-hc-fg truncate">{row.scopeName}</div>
                <div className="text-xs text-hc-muted capitalize">
                  {row.scopeType} · {row.kind}
                </div>
              </div>
              <div className={`flex items-center gap-0.5 text-sm font-semibold flex-shrink-0 ${isSpike ? 'text-hc-success-text' : 'text-hc-danger-text'}`}>
                {isSpike ? '+' : ''}{pctChange}%
                {isSpike ? <TrendingUp size={13} /> : <TrendingDown size={13} />}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
