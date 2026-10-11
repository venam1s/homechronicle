import { useRoomStats } from '../hooks/useEvents.js';
import { getRoomColor } from '../lib/roomColors.js';
import { SkeletonList } from './Skeleton.jsx';

const toCount = (v) => Number.parseInt(v, 10) || 0;

/**
 * Room Map — "where things happen" (DASH-06).
 *
 * Blocks sized by share of events, so the busiest room is physically the
 * biggest thing on the panel. Selecting one opens that room's timeline.
 *
 * Layout is proportional flex rather than a true treemap: the top room takes a
 * full-width band and the remainder share a second band weighted by count.
 * That keeps every label readable at panel size, which a real squarified
 * treemap does not once a room's share gets small.
 */
export default function RoomMapPanel({ onSelectRoom }) {
  const { data, isLoading, isError } = useRoomStats(30);

  if (isLoading) return <SkeletonList rows={3} />;
  if (isError) return <p className="text-hc-body text-hc-muted">Room data is unavailable right now.</p>;

  const rooms = (Array.isArray(data) ? data : [])
    .map((r) => ({ name: r.room_name, count: toCount(r.count ?? r.event_count) }))
    .filter((r) => r.name && r.count > 0)
    .sort((a, b) => b.count - a.count);

  if (rooms.length === 0) {
    return <p className="text-hc-body text-hc-muted">No room activity yet. Assign rooms to your devices to see them here.</p>;
  }

  const total = rooms.reduce((sum, r) => sum + r.count, 0);
  const [lead, ...rest] = rooms;
  const share = (n) => Math.round((n / total) * 100);

  const Block = ({ room, big }) => {
    const color = getRoomColor(room.name);
    return (
      <button
        type="button"
        onClick={() => onSelectRoom?.(room.name)}
        title={`${room.name} — ${room.count.toLocaleString()} events`}
        style={{ backgroundColor: color.dot, color: color.on, flexGrow: room.count, flexBasis: 0 }}
        className={[
          'group relative flex flex-col justify-end min-w-[84px] rounded-lg px-3 py-2 text-left',
          'transition-transform hover:scale-[1.01] focus-visible:outline-2 focus-visible:outline-hc-focus-ring focus-visible:outline-offset-2',
          big ? 'h-24' : 'h-16',
        ].join(' ')}
      >
        {/* Label colour comes from --hc-room-N-on, derived per palette and
            mode to meet AA on that slot. The ramps run light in dark mode, so
            a fixed white label measured as low as 1.5:1. */}
        <span className={`font-semibold ${big ? 'text-hc-section' : 'text-hc-label'}`}>
          {room.count.toLocaleString()}
        </span>
        <span className="text-hc-caption truncate">
          {room.name}{big ? ` · ${share(room.count)}%` : ''}
        </span>
      </button>
    );
  };

  return (
    <div className="flex flex-col gap-2 h-full">
      <div className="flex gap-2">
        <Block room={lead} big />
      </div>
      {rest.length > 0 && (
        <div className="flex gap-2 flex-wrap">
          {rest.map((room) => <Block key={room.name} room={room} />)}
        </div>
      )}
      <p className="text-hc-caption text-hc-muted mt-auto pt-1">
        Block size follows event count over 30 days. Select a room to open its timeline.
      </p>
    </div>
  );
}
