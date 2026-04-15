import clsx from 'clsx';
import Card from './Card.jsx';
import { useAccessories } from '../hooks/useEvents.js';

function isBridgeParent(device) {
  const idParts = String(device?.accessory_id ?? '').split(':');
  return idParts.length === 6 && Number(device?.category) === 2;
}

function groupByRoom(accessories = []) {
  const rooms = new Map();
  for (const acc of accessories) {
    const roomName = acc.room_name || 'Unassigned';
    if (!rooms.has(roomName)) rooms.set(roomName, []);
    rooms.get(roomName).push(acc);
  }
  return rooms;
}

function roomHealthBadge(devices) {
  const hasOffline = devices.some(d => d?.health?.status === 'offline');
  const hasStale = devices.some(d => d?.health?.status === 'stale');
  if (hasOffline) {
    const count = devices.filter(d => d?.health?.status === 'offline').length;
    return { variant: 'danger', text: `${count} offline` };
  }
  if (hasStale) {
    const count = devices.filter(d => d?.health?.status === 'stale').length;
    return { variant: 'warning', text: `${count} stale` };
  }
  return { variant: 'success', text: 'All online' };
}

const BADGE_TOKENS = {
  success: 'bg-hc-success-bg text-hc-success-text border-hc-success-border',
  warning: 'bg-hc-warning-bg text-hc-warning-text border-hc-warning-border',
  danger: 'bg-hc-danger-bg text-hc-danger-text border-hc-danger-border',
};

const DOT_TOKENS = {
  success: 'bg-hc-success-text',
  warning: 'bg-hc-warning-text',
  danger: 'bg-hc-danger-text',
};

export default function RoomBreakdown({ onSelectRoom }) {
  const { data: accessories, isLoading } = useAccessories();

  if (isLoading) {
    return (
      <Card>
        <Card.Header title="Rooms" />
        <Card.Body>
          <p className="text-hc-caption text-hc-muted">Loading…</p>
        </Card.Body>
      </Card>
    );
  }

  const filtered = (accessories ?? []).filter(a => !isBridgeParent(a));
  const rooms = groupByRoom(filtered);

  if (rooms.size === 0) {
    return (
      <Card>
        <Card.Header title="Rooms" />
        <Card.Body>
          <div className="text-center py-6">
            <p className="text-hc-body text-hc-fg font-medium">No rooms configured</p>
            <p className="text-hc-caption text-hc-muted mt-1">Assign rooms to your accessories in the Devices tab to see a room breakdown.</p>
          </div>
        </Card.Body>
      </Card>
    );
  }

  return (
    <Card>
      <Card.Header title="Rooms" />
      <Card.Body>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {[...rooms.entries()].map(([roomName, devices]) => {
            const badge = roomHealthBadge(devices);
            return (
              <div
                key={roomName}
                role="button"
                tabIndex={0}
                onClick={() => onSelectRoom?.(roomName)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelectRoom?.(roomName); }
                }}
                className="bg-hc-panel-soft border border-hc-panel-border rounded-lg p-3 cursor-pointer hover:opacity-90 transition-opacity"
              >
                <div className="text-hc-label font-semibold text-hc-fg truncate">{roomName}</div>
                <div className="text-hc-caption text-hc-muted">{devices.length} device{devices.length !== 1 ? 's' : ''}</div>
                <span className={clsx(
                  'inline-flex items-center gap-1 text-hc-caption font-medium px-1.5 py-0.5 rounded-full border mt-2',
                  BADGE_TOKENS[badge.variant]
                )}>
                  <span className={clsx('w-1.5 h-1.5 rounded-full', DOT_TOKENS[badge.variant])} />
                  {badge.text}
                </span>
              </div>
            );
          })}
        </div>
      </Card.Body>
    </Card>
  );
}
