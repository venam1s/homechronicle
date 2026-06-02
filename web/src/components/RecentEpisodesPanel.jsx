import { useMemo } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { Sparkles } from 'lucide-react';
import { useEvents } from '../hooks/useEvents.js';
import { groupIntoScenes, groupScenesIntoEpisodes } from '../lib/episodes.js';

const EPISODE_LIMIT = 6;

function episodeStart(entry) {
  const ts = entry?.scenes?.[0]?.[0]?.timestamp;
  return ts ? new Date(ts) : null;
}

export default function RecentEpisodesPanel() {
  // Reuse the events feed (page 1) and derive episodes client-side, exactly as
  // the Timeline does — no dedicated backend endpoint.
  const { data, isLoading, isError } = useEvents({}, 1, 500);

  const episodes = useMemo(() => {
    const events = data?.events ?? [];
    if (!events.length) return [];
    return groupScenesIntoEpisodes(groupIntoScenes(events))
      .filter((entry) => entry.kind === 'episode')
      .slice(0, EPISODE_LIMIT);
  }, [data?.events]);

  const header = (
    <div className="flex items-baseline justify-between mb-3">
      <h3 className="text-sm font-semibold text-hc-fg">Recent Episodes</h3>
      <span className="text-xs text-hc-muted">grouped activity</span>
    </div>
  );

  if (isLoading) {
    return <div>{header}<p className="text-sm text-hc-muted">Loading recent activity…</p></div>;
  }
  if (isError) {
    return <div>{header}<p className="text-sm text-hc-muted">Could not load recent activity.</p></div>;
  }
  if (!episodes.length) {
    return <div>{header}<p className="text-sm text-hc-muted">No recent episodes.</p></div>;
  }

  return (
    <div className="h-full flex flex-col min-h-0">
      {header}
      <div className="flex-1 min-h-0 overflow-auto space-y-2">
        {episodes.map((entry) => {
          const start = episodeStart(entry);
          const eventCount = entry.scenes.reduce((sum, scene) => sum + scene.length, 0);
          return (
            <div
              key={entry.scenes[0][0].id}
              className="rounded-lg border border-hc-panel-border bg-hc-panel-soft px-3 py-2"
            >
              <div className="flex items-center gap-2 text-xs text-hc-muted">
                <Sparkles size={12} className="text-hc-accent-strong" />
                <span className="uppercase tracking-wide font-semibold">{entry.episode.title}</span>
                {start && (
                  <span className="ml-auto">{formatDistanceToNow(start, { addSuffix: true })}</span>
                )}
              </div>
              <div className="text-sm text-hc-fg mt-1">{entry.episode.summary}</div>
              <div className="text-xs text-hc-muted mt-0.5">
                {eventCount} change{eventCount === 1 ? '' : 's'}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
