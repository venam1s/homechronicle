import { formatDistanceToNow } from 'date-fns';
import { useAccessories } from '../hooks/useEvents.js';
import { SkeletonList } from './Skeleton.jsx';
import { getServiceIcon } from '../lib/icons.js';
import { getRoomColor } from '../lib/roomColors.js';
import { AlertTriangle, ChevronRight, Network } from 'lucide-react';
import clsx from 'clsx';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// "AA:BB:CC:DD:EE:FF:3" → "AA:BB:CC:DD:EE:FF"  |  6-part ID → unchanged
function parentId(id) {
  const parts = id.split(':');
  return parts.length > 6 ? parts.slice(0, 6).join(':') : null;
}

// Activity dot color based on last_seen recency
// Recency as a status colour, drawn from the palette's reserved status tokens
// rather than fixed Tailwind hues, so it follows the active palette and stays
// legible in both modes.
function activityDot(lastSeen) {
  if (!lastSeen) return 'bg-hc-muted';
  const age = Date.now() - new Date(lastSeen).getTime();
  if (age < 3_600_000)  return 'bg-hc-success-text';   // < 1 hour
  if (age < 86_400_000) return 'bg-hc-warning-text';   // < 24 hours
  return 'bg-hc-border-strong';
}

function formatSeconds(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return null;
  const days = Math.floor(seconds / 86_400);
  const hours = Math.floor((seconds % 86_400) / 3_600);
  const mins = Math.floor((seconds % 3_600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

function metadataSummary(accessory) {
  const parts = [];
  if (accessory.manufacturer) parts.push(accessory.manufacturer);
  if (accessory.model) parts.push(accessory.model);
  if (accessory.firmware_revision) parts.push(`FW ${accessory.firmware_revision}`);
  return parts.join(' · ');
}

function reliabilitySummary(accessory) {
  const stats = accessory.reliability ?? null;
  if (!stats) return null;

  const parts = [];
  if (Number.isFinite(stats.disconnects) && stats.disconnects > 0) {
    parts.push(`${stats.disconnects} disconnect${stats.disconnects === 1 ? '' : 's'}`);
  }
  if (Number.isFinite(stats.reconnect_attempts) && stats.reconnect_attempts > 0) {
    parts.push(`${stats.reconnect_attempts} reconnect${stats.reconnect_attempts === 1 ? '' : 's'}`);
  }
  if (Number.isFinite(stats.resubscribe_failures) && stats.resubscribe_failures > 0) {
    parts.push(`${stats.resubscribe_failures} resubscribe fail${stats.resubscribe_failures === 1 ? '' : 's'}`);
  }
  return parts.length ? parts.join(' · ') : null;
}

// ---------------------------------------------------------------------------
export default function AccessoryList({ onSelectAccessory }) {
  const { data: accessories, isLoading } = useAccessories();

  if (isLoading) {
    return <SkeletonList rows={6} className="max-w-4xl mx-auto mt-6" />;
  }

  if (!accessories?.length) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-hc-muted">
        <p className="text-lg font-medium">No accessories seen yet</p>
        <p className="text-sm mt-1">Pair your accessories and wait for the first event.</p>
      </div>
    );
  }

  // Build a map of bridgeId → bridge accessory for bridge banners
  const bridgeMap = {};
  const nonBridgeAccessories = [];
  for (const a of accessories) {
    const parts = a.accessory_id.split(':');
    const isBridge = parts.length === 6 && a.category === 2;
    if (isBridge) {
      bridgeMap[a.accessory_id] = a;
    } else {
      nonBridgeAccessories.push(a);
    }
  }

  // Group non-bridge accessories by room
  const byRoom = nonBridgeAccessories.reduce((acc, a) => {
    const room = a.room_name ?? 'No room';
    if (!acc[room]) acc[room] = [];
    acc[room].push(a);
    return acc;
  }, {});

  // Within each room, sort: group children by bridge first, then standalone,
  // and within each group sort by last_seen desc
  for (const items of Object.values(byRoom)) {
    items.sort((a, b) => {
      const aBridge = parentId(a.accessory_id) ?? '';
      const bBridge = parentId(b.accessory_id) ?? '';
      // Bridge children before standalone devices
      if (aBridge && !bBridge) return -1;
      if (!aBridge && bBridge) return 1;
      // Group by same bridge
      if (aBridge !== bBridge) return aBridge.localeCompare(bBridge);
      // Within same group, sort by last_seen desc
      if (!a.last_seen && !b.last_seen) return 0;
      if (!a.last_seen) return 1;
      if (!b.last_seen) return -1;
      return new Date(b.last_seen) - new Date(a.last_seen);
    });
  }

  return (
    <div className="space-y-6">
      {Object.entries(byRoom)
        .sort(([a], [b]) => {
          if (a === 'No room') return 1;
          if (b === 'No room') return -1;
          return a.localeCompare(b);
        })
        .map(([room, items]) => {
        const roomColor = getRoomColor(room === 'No room' ? null : room);

        // Build ordered list of rows with bridge banners inserted
        const rows = [];
        let lastBridgeId = null;
        for (const accessory of items) {
          const bridgeId = parentId(accessory.accessory_id);
          if (bridgeId && bridgeId !== lastBridgeId) {
            const bridge = bridgeMap[bridgeId];
            // Prefer bridge_name from child (pairing name), then bridge record's own name, then raw ID
            const name = accessory.bridge_name || bridge?.accessory_name || bridgeId;
            rows.push({ type: 'bridge-banner', bridgeId, bridgeName: name });
          }
          lastBridgeId = bridgeId;
          rows.push({ type: 'accessory', accessory });
        }

        return (
        <div key={room}>
          <div className="flex items-center gap-2 mb-2">
            {roomColor && (
              <span
                className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                style={{ backgroundColor: roomColor.dot }}
              />
            )}
            <h2 className="text-xs font-semibold uppercase tracking-wider text-hc-muted">
              {room}
            </h2>
          </div>
          <div
            className="bg-hc-panel rounded-xl border border-hc-panel-border divide-y divide-hc-panel-border overflow-hidden"
            style={roomColor ? { borderLeft: `3px solid ${roomColor.dot}` } : {}}
          >
            {rows.map((row) => {
              if (row.type === 'bridge-banner') {
                return (
                  <div
                    key={`bridge:${row.bridgeId}`}
                    className="flex items-center gap-2 px-4 py-1.5 bg-hc-panel-mid"
                  >
                    <Network size={12} className="text-hc-muted" />
                    <span className="text-[11px] font-medium text-hc-muted tracking-wide">{row.bridgeName}</span>
                  </div>
                );
              }

              const accessory = row.accessory;
              const Icon       = getServiceIcon(accessory.service_type);
              const dot        = activityDot(accessory.last_seen);
              const health     = accessory.health ?? {};
              const offlineFor = formatSeconds(health.offlineDurationSeconds);
              const heartbeatFor = formatSeconds(health.heartbeatSeconds);
              const showStale = Boolean(health.isStale);
              const metadata = metadataSummary(accessory);
              const reliability = reliabilitySummary(accessory);
              const bridgeId = parentId(accessory.accessory_id);
              const isChild = Boolean(bridgeId);

              return (
                <button
                  key={accessory.accessory_id + ':' + (accessory.service_type ?? '')}
                  type="button"
                  onClick={() => onSelectAccessory?.(accessory.accessory_id)}
                  className={clsx(
                    'w-full flex items-center gap-3 py-3 text-left hover:bg-hc-panel-mid transition-colors',
                    isChild ? 'pl-6 pr-4' : 'px-4',
                  )}
                >
                  {/* Activity dot */}
                  <div className={`w-2 h-2 rounded-full flex-shrink-0 ${dot}`} />

                  {/* Icon */}
                  <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 bg-hc-interactive">
                    <Icon size={18} className="text-hc-accent-strong" />
                  </div>

                  {/* Text + badges. Below sm the badges drop under the text: as a
                      fixed right-hand column they left a 390px screen ~15
                      characters for the name. */}
                  <div className="flex-1 min-w-0 flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
                    <div className="min-w-0 sm:flex-1">
                      <div className="font-medium text-hc-fg-strong line-clamp-2 break-words sm:line-clamp-none sm:truncate" title={accessory.accessory_name}>{accessory.accessory_name}</div>
                      <div className="text-xs text-hc-muted mt-0.5 flex flex-wrap items-center gap-x-1.5">
                        {accessory.protocol && (
                          <span className="inline-block text-[10px] font-semibold uppercase tracking-wide rounded px-1 py-px bg-hc-panel-mid text-hc-muted border border-hc-panel-border">
                            {accessory.protocol === 'matter' ? 'Matter' : 'HomeKit'}
                          </span>
                        )}
                        {accessory.service_type
                          ? <span>{accessory.service_type}</span>
                          : <span className="italic">waiting for first event</span>
                        }
                        {accessory.last_seen && (
                          <><span className="text-hc-muted">·</span>
                          <span>last seen {formatDistanceToNow(new Date(accessory.last_seen), { addSuffix: true })}</span></>
                        )}
                        {health.status && health.status !== 'online' && (
                          <><span className="text-hc-muted">·</span>
                          <span>{health.status}</span></>
                        )}
                      </div>
                      <div className="text-[11px] text-hc-muted mt-0.5 flex flex-wrap gap-x-1.5">
                        {metadata && (
                          <span>{metadata}</span>
                        )}
                        {offlineFor && health.status !== 'online' && (
                          <>
                            {metadata && <span className="text-hc-muted">·</span>}
                            <span>offline for {offlineFor}</span>
                          </>
                        )}
                        {Number.isFinite(health.missedHeartbeats) && health.missedHeartbeats > 0 && (
                          <>
                            <span className="text-hc-muted">·</span>
                            <span>
                              missed {health.missedHeartbeats} heartbeat{health.missedHeartbeats === 1 ? '' : 's'}
                            </span>
                          </>
                        )}
                        {heartbeatFor && (
                          <>
                            <span className="text-hc-muted">·</span>
                            <span>heartbeat ~{heartbeatFor}</span>
                          </>
                        )}
                        {reliability && (
                          <>
                            <span className="text-hc-muted">·</span>
                            <span>{reliability}</span>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Event count badge */}
                    {(accessory.event_count > 0 || showStale) && (
                      <div className="flex flex-row flex-wrap items-center gap-1 sm:flex-col sm:items-end">
                        {showStale && (
                          <div className="inline-flex items-center gap-1 text-[11px] text-hc-warning-text bg-hc-warning-bg border border-hc-warning-border rounded-full px-2 py-0.5 whitespace-nowrap">
                            <AlertTriangle size={11} />
                            stale device
                          </div>
                        )}
                        {accessory.event_count > 0 && (
                          <div className="flex-shrink-0 text-xs text-hc-muted bg-hc-panel-mid border border-hc-panel-border rounded-full px-2 py-0.5 whitespace-nowrap">
                            {accessory.event_count.toLocaleString()} {accessory.event_count === 1 ? 'event' : 'events'}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  <ChevronRight size={14} className="text-hc-muted flex-shrink-0" />
                </button>
              );
            })}
          </div>
        </div>
        );
      })}
    </div>
  );
}
