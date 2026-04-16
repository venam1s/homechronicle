import { memo, useState } from 'react';
import { ChevronDown, ChevronRight, Home, Moon, LogIn, LogOut } from 'lucide-react';
import SceneGroup from './SceneGroup.jsx';

function getEpisodeIcon(kind) {
  switch (kind) {
    case 'arrival':
      return LogIn;
    case 'departure':
      return LogOut;
    case 'bedtime':
      return Moon;
    default:
      return Home;
  }
}

export default memo(function EpisodeGroup({ episode, scenes, eventMetaMap, hoveredCell, onMute }) {
  const [expanded, setExpanded] = useState(false);
  const events = scenes.flat();
  const Icon = getEpisodeIcon(episode.kind);
  const ts = new Date(events[0].timestamp);
  const rooms = [...new Set(events.map((event) => event.room_name).filter(Boolean))];

  return (
    <div data-scene-id={events[0].id} className="hc-episode-card mx-3 my-2 rounded-xl overflow-hidden">
      <button
        onClick={() => setExpanded((value) => !value)}
        className="hc-episode w-full text-left px-4 py-3.5 transition-colors"
      >
        <div className="flex items-start gap-3">
          <div className="flex-shrink-0 w-10 h-10 rounded-full hc-episode-icon flex items-center justify-center mt-0.5">
            <Icon size={17} className="hc-episode-icon-glyph" />
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-semibold text-hc-fg-strong">{episode.title}</span>
              <span className="text-[11px] uppercase tracking-[0.18em] hc-episode-label font-semibold">
                Episode
              </span>
            </div>
            <p className="text-sm text-hc-fg mt-0.5">{episode.summary}</p>
            <div className="text-xs text-hc-muted mt-1.5">
              {events.length} events across {scenes.length} burst{scenes.length === 1 ? '' : 's'}
              {rooms.length > 0 ? ` · ${rooms.join(', ')}` : ''}
            </div>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0 ml-2">
            <span className="text-xs text-hc-muted">
              {ts.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
            {expanded
              ? <ChevronDown size={14} className="text-hc-muted" />
              : <ChevronRight size={14} className="text-hc-muted" />}
          </div>
        </div>
      </button>

      {expanded && (
        <div className="hc-episode-expanded">
          {scenes.map((scene) => (
            <SceneGroup
              key={scene[0].id}
              events={scene}
              eventMetaMap={eventMetaMap}
              hoveredCell={hoveredCell}
              onMute={onMute}
            />
          ))}
        </div>
      )}
    </div>
  );
})
