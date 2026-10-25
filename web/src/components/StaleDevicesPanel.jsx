import { Unplug } from 'lucide-react';
import { useAccessories } from '../hooks/useEvents.js';

function staleScore(device) {
  const offline = Number(device?.health?.offlineDurationSeconds) || 0;
  const missed = Number(device?.health?.missedHeartbeats) || 0;
  return offline * 100 + missed;
}

function isBridgeParent(device) {
  const idParts = String(device?.accessory_id ?? '').split(':');
  return idParts.length === 6 && Number(device?.category) === 2;
}

export default function StaleDevicesPanel({ onSelectAccessory }) {
  const { data: accessories, isLoading } = useAccessories();

  if (isLoading) {
    return <div className="text-sm text-hc-muted">Checking device heartbeat…</div>;
  }

  const staleRows = (accessories ?? [])
    .filter((device) => device?.health?.isStale && !isBridgeParent(device))
    .sort((a, b) => staleScore(b) - staleScore(a))
    .slice(0, 8);

  if (!staleRows.length) {
    return <p className="text-sm text-hc-muted">No stale devices right now.</p>;
  }

  return (
    <div>
      <div className="flex items-baseline justify-between mb-3">
        <div className="flex items-center gap-2">
          <Unplug size={14} className="text-hc-stale-text" />
          <h3 className="text-sm font-semibold text-hc-fg">Stale Devices</h3>
        </div>
        <span className="text-xs text-hc-muted">heartbeat lagging</span>
      </div>
      <div className="space-y-2">
        {staleRows.map((device) => (
          <div key={device.accessory_id} role="button" tabIndex={0} onClick={() => onSelectAccessory?.(device.accessory_id)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelectAccessory?.(device.accessory_id); } }} className="rounded-lg border border-hc-stale-border bg-hc-stale-bg px-3 py-2 cursor-pointer hover:opacity-90 transition-opacity">
            <div className="flex items-center gap-2 text-xs text-hc-stale-text">
              <Unplug size={12} />
              <span className="uppercase tracking-wide font-semibold">Device</span>
              {device.health?.status && (
                <span className="opacity-80">{device.health.status}</span>
              )}
            </div>
            <div className="text-sm text-hc-fg mt-1">
              {device.accessory_name}
            </div>
            <div className="text-xs text-hc-stale-text mt-0.5">
              {Number.isFinite(device?.health?.missedHeartbeats) ? `${device.health.missedHeartbeats} missed heartbeat${device.health.missedHeartbeats === 1 ? '' : 's'}` : 'heartbeat missing'}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
