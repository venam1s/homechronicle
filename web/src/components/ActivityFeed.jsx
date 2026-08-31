import { useRef, useState, useEffect } from 'react';
import clsx from 'clsx';
import Card from './Card.jsx';
import { useEvents } from '../hooks/useEvents.js';

function relativeTime(isoTimestamp) {
  const date = new Date(isoTimestamp);
  const diffMs = Date.now() - date.getTime();
  const diffS = Math.floor(diffMs / 1000);
  if (diffS < 60) return `${diffS}s ago`;
  if (diffS < 3600) return `${Math.floor(diffS / 60)}m ago`;
  if (diffS < 86400) return `${Math.floor(diffS / 3600)}h ago`;
  return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric' }).format(date);
}

export default function ActivityFeed({ onNavigateToAccessory, onViewAll }) {
  const { data, isLoading } = useEvents({}, 1, 20);
  const events = data?.events ?? [];

  const scrollRef = useRef(null);
  const sentinelRef = useRef(null);
  const [isUserScrolled, setIsUserScrolled] = useState(false);
  const prevEventsLenRef = useRef(0);
  const [newEventsCount, setNewEventsCount] = useState(0);

  // Observer setup
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver(
      ([entry]) => setIsUserScrolled(!entry.isIntersecting),
      { root: scrollRef.current, threshold: 0.1 }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, []);

  // On mount: scroll to bottom immediately (no animation)
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, []);

  // Auto-scroll on new events (only when not user-scrolled)
  useEffect(() => {
    if (!isUserScrolled && scrollRef.current) {
      scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
      setNewEventsCount(0);
    }
    if (isUserScrolled && events.length > prevEventsLenRef.current) {
      setNewEventsCount(events.length - prevEventsLenRef.current);
    }
    prevEventsLenRef.current = events.length;
  }, [events, isUserScrolled]);

  function scrollToBottom() {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
    }
    setNewEventsCount(0);
  }

  if (!events.length && !isLoading) {
    return (
      // h-full + flex column so the card fills its dashboard panel cell.
      <Card className="h-full flex flex-col">
        <Card.Header title="Live Activity" />
        <div className="flex-1 min-h-0 flex items-center justify-center p-4">
          <div className="text-center">
            <p className="text-hc-body text-hc-fg font-medium">No recent events</p>
            <p className="text-hc-caption text-hc-muted mt-1">Events will appear here as your devices report changes.</p>
          </div>
        </div>
      </Card>
    );
  }

  return (
    // h-full + flex column lets the scroll region (flex-1) grow to fill the panel
    // when it is resized, instead of being capped at a fixed max-height.
    <Card className="h-full flex flex-col">
      <Card.Header
        title="Live Activity"
        actions={
          <div className="flex items-center gap-2">
            <span className="text-hc-caption bg-hc-accent-soft text-hc-accent-strong px-2 py-0.5 rounded-full">
              {events.length}
            </span>
            {onViewAll && (
              <button onClick={onViewAll} className="text-hc-caption text-hc-accent-strong hover:underline cursor-pointer">
                View all
              </button>
            )}
          </div>
        }
      />
      <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto">
        <div className="divide-y divide-hc-panel-border">
          {events.map((event) => (
            <div
              key={event.id}
              role="button"
              tabIndex={0}
              onClick={() => onNavigateToAccessory?.(event.accessory_name)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onNavigateToAccessory?.(event.accessory_name); }
              }}
              className="py-2 px-3 hover:bg-hc-panel-mid cursor-pointer flex items-center gap-2 text-hc-body"
            >
              <span className="text-hc-caption text-hc-muted min-w-[48px] flex-shrink-0">{relativeTime(event.timestamp)}</span>
              <span className="text-hc-fg font-medium truncate">{event.accessory_name}</span>
              <span className="text-hc-caption text-hc-muted truncate">
                {event.characteristic} {event.old_value ?? '—'} → {event.new_value ?? '—'}
              </span>
            </div>
          ))}
          <div ref={sentinelRef} />
        </div>
      </div>
      {isUserScrolled && newEventsCount > 0 && (
        <div className="px-4 pb-3">
          <button
            onClick={scrollToBottom}
            className={clsx(
              'w-full bg-hc-accent-soft text-hc-accent-strong text-hc-caption font-medium',
              'px-3 py-1.5 rounded-lg cursor-pointer hover:bg-hc-accent-strong hover:text-hc-on-accent transition-colors'
            )}
          >
            {newEventsCount} new event{newEventsCount !== 1 ? 's' : ''}
          </button>
        </div>
      )}
    </Card>
  );
}
