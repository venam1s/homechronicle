import { useQuery } from '@tanstack/react-query';
import { MapPin, FileText, Loader, Pencil } from 'lucide-react';
import clsx from 'clsx';
import { fetchJson } from '../../lib/api.js';

export default function BridgeChildrenRow({ bridgeId, isExpanded, roomInputs, savedRooms = {}, bridgeRoom = '', onRoomChange, onRoomBlur, noteInputs = {}, savedNotes = {}, onNoteChange, onNoteBlur, displayNameInputs = {}, savedDisplayNames = {}, onDisplayNameChange, onDisplayNameBlur }) {
  const { data: children = [], isLoading, isError } = useQuery({
    queryKey: ['bridge-children', bridgeId],
    queryFn: () => fetchJson(`/api/setup/bridge-children/${encodeURIComponent(bridgeId)}`),
    enabled: isExpanded,
    staleTime: 5 * 60 * 1000,
  });

  if (!isExpanded) return null;

  if (isLoading) {
    return (
      <div className="ml-9 mt-2 pb-2 flex items-center gap-1.5 text-xs text-hc-muted">
        <Loader size={11} className="animate-spin" /> Querying bridge…
      </div>
    );
  }
  if (isError) {
    return (
      <div className="ml-9 mt-2 pb-2 text-xs text-hc-danger-text">
        Could not load child accessories — is the bridge reachable?
      </div>
    );
  }
  if (children.length === 0) {
    return (
      <div className="ml-9 mt-2 pb-2 space-y-1.5">
        <p className="text-xs text-hc-muted italic">No child accessories found on this bridge.</p>
        <div className="flex items-center gap-1">
          <FileText size={10} className="text-hc-muted flex-shrink-0" />
          <input
            type="text"
            placeholder="Add note..."
            value={noteInputs[bridgeId] ?? savedNotes[bridgeId] ?? ''}
            onChange={(e) => onNoteChange?.(bridgeId, e.target.value)}
            onBlur={() => onNoteBlur?.(bridgeId)}
            onKeyDown={(e) => e.key === 'Enter' && onNoteBlur?.(bridgeId)}
            className="text-xs border border-hc-panel-border bg-hc-panel text-hc-fg rounded px-2 py-0.5 w-48 focus:outline-none focus:ring-1 focus:ring-hc-focus-ring placeholder-hc-muted"
          />
        </div>
      </div>
    );
  }

  return (
    <div className="ml-9 mt-2 pb-2 border-l-2 border-hc-panel-border pl-3 space-y-1.5">
      {children.map((child) => {
        const childRoom = roomInputs[child.childId] ?? savedRooms[child.childId] ?? '';
        // One outlet of a multi-outlet plug inherits the plug's room first.
        const inheritedRoom = (child.parentChildId && savedRooms[child.parentChildId]) || bridgeRoom;
        const isInheriting = !childRoom && !!inheritedRoom;
        return (
          <div key={child.childId} className="space-y-1">
            <div className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-hc-success-text flex-shrink-0" />
              <div className="flex items-center gap-1 flex-1 min-w-0">
                <Pencil size={9} className="text-hc-muted flex-shrink-0" />
                <input
                  type="text"
                  placeholder={child.name}
                  aria-label={`Display name for ${child.name}`}
                  value={displayNameInputs[child.childId] ?? savedDisplayNames[child.childId] ?? ''}
                  onChange={(e) => onDisplayNameChange?.(child.childId, e.target.value)}
                  onBlur={() => onDisplayNameBlur?.(child.childId)}
                  onKeyDown={(e) => e.key === 'Enter' && onDisplayNameBlur?.(child.childId)}
                  className="text-xs text-hc-fg bg-transparent border-0 border-b border-transparent hover:border-hc-panel-border focus:border-hc-accent-strong focus:outline-none px-0 py-0 w-full truncate placeholder-hc-muted"
                />
                {child.parentName && !child.name?.toLowerCase().includes(child.parentName.toLowerCase()) && (
                  <span className="text-[10px] text-hc-muted whitespace-nowrap flex-shrink-0">on {child.parentName}</span>
                )}
              </div>
            </div>
            <div className="flex flex-col gap-1 ml-3.5">
              <div className="flex items-center gap-1">
                <MapPin size={9} className={isInheriting ? 'text-hc-accent-strong' : 'text-hc-muted'} />
                <input
                  type="text"
                  placeholder={inheritedRoom ? `Inherits: ${inheritedRoom}` : 'Room…'}
                  value={childRoom}
                  list="hc-room-list"
                  onChange={(e) => onRoomChange(child.childId, e.target.value)}
                  onBlur={() => onRoomBlur(child.childId)}
                  onKeyDown={(e) => e.key === 'Enter' && onRoomBlur(child.childId)}
                  className={clsx(
                    'text-xs border rounded px-2 py-0.5 w-32 focus:outline-none focus:ring-1 focus:ring-hc-focus-ring',
                    isInheriting
                      ? 'border-hc-accent-soft bg-hc-accent-soft/40 placeholder-hc-muted text-hc-accent-stronger'
                      : 'border-hc-panel-border bg-hc-panel text-hc-fg placeholder-hc-muted',
                  )}
                />
              </div>
              <div className="flex items-center gap-1">
                <FileText size={9} className="text-hc-muted flex-shrink-0" />
                <input
                  type="text"
                  placeholder="Add note..."
                  value={noteInputs[child.childId] ?? savedNotes[child.childId] ?? ''}
                  onChange={(e) => onNoteChange?.(child.childId, e.target.value)}
                  onBlur={() => onNoteBlur?.(child.childId)}
                  onKeyDown={(e) => e.key === 'Enter' && onNoteBlur?.(child.childId)}
                  className="text-xs border border-hc-panel-border bg-hc-panel text-hc-fg rounded px-2 py-0.5 w-44 focus:outline-none focus:ring-1 focus:ring-hc-focus-ring placeholder-hc-muted"
                />
              </div>
            </div>
          </div>
        );
      })}

      {bridgeRoom && (
        <p className="text-[10px] text-hc-muted pt-0.5">
          Child accessories with no room set inherit the bridge room automatically.
        </p>
      )}
    </div>
  );
}
