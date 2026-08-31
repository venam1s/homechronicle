import { useState, useMemo, useRef, useEffect, Fragment } from 'react';
import { format, startOfDay } from 'date-fns';
import { ChevronLeft, ChevronRight, VolumeX, X, Loader2 } from 'lucide-react';

import { useQuery } from '@tanstack/react-query';
import { useEvents, useAnomalies } from '../hooks/useEvents.js';
import { useMutedDevices } from '../hooks/useMutedDevices.js';
import { useAuth } from '../hooks/useAuth.js';
import { useUserPreferences } from '../hooks/useUserPreferences.js';
import { usePreference } from '../hooks/usePreference.js';
import { API_BASE, withApiAuthHeaders, fetchJson } from '../lib/api.js';
import { groupIntoScenes, groupScenesIntoEpisodes } from '../lib/episodes.js';
import { useQuietHours } from '../hooks/useEvents.js';
import { utcHourToLocal, isWithinHourWindow, formatHour12 } from '../lib/hours.js';
import { formatGap } from '../lib/icons.js';
import EpisodeGroup from './EpisodeGroup.jsx';
import SceneGroup from './SceneGroup.jsx';
import FilterBar from './FilterBar.jsx';

const PAGE_SIZE = 50;

function isValidTimestamp(value) {
  const date = new Date(value);
  return !Number.isNaN(date.getTime());
}

/** Groups an event array (any order) into a Map keyed by ISO start-of-day string. */
// An entry is either an episode or a plain scene group; both bottom out in
// events, so the first event's timestamp works for either shape.
function entryTimestamp(entry) {
  const first = entry?.scenes?.[0]?.[0];
  return first?.timestamp ? new Date(first.timestamp) : null;
}

/**
 * Render a day's entries, ruling off the quiet-hours stretch.
 *
 * Entries run newest-first, so a quiet window that starts late in the evening
 * and ends in the morning puts the quiet events at the END of the day's list.
 * One divider before the first of them separates "while you were asleep" from
 * the rest of the day (VIEW-03).
 */
export function withQuietDivider(entries, { quietOn, quietStart, quietEnd }, renderEntry) {
  const firstQuiet = quietOn
    ? entries.findIndex((entry) => {
        const ts = entryTimestamp(entry);
        return ts ? isWithinHourWindow(ts.getHours(), quietStart, quietEnd) : false;
      })
    : -1;

  return entries.map((entry, index) => {
    const content = renderEntry(entry);
    if (index !== firstQuiet) return content;
    return (
      <Fragment key={`quiet-${index}`}>
        <div className="flex items-center gap-3 px-4 pt-1">
          <span className="flex-1 border-t border-dashed border-hc-panel-border" aria-hidden="true" />
          <span className="text-hc-caption uppercase tracking-[0.14em] text-hc-muted whitespace-nowrap">
            quiet hours · {formatHour12(quietStart)} – {formatHour12(quietEnd)}
          </span>
          <span className="flex-1 border-t border-dashed border-hc-panel-border" aria-hidden="true" />
        </div>
        {content}
      </Fragment>
    );
  });
}

function groupByDay(events) {
  const groups = new Map();
  for (const event of events) {
    const day = startOfDay(new Date(event.timestamp)).toISOString();
    if (!groups.has(day)) groups.set(day, []);
    groups.get(day).push(event);
  }
  return groups;
}

// ── Component ──────────────────────────────────────────────────────────────

export default function Timeline({ initialFilters, onSelectAccessory }) {
  const [filters, setFilters]         = useState(initialFilters ?? {});
  const [page, setPage]               = useState(1);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [heatmapOpen, setHeatmapOpen] = useState(false);
  const [hoveredCell, setHoveredCell] = useState(null); // transient: cleared on mouse-leave
  const [lockedCell,  setLockedCell]  = useState(null); // persistent: set by click, cleared by re-click
  const [isJumping,   setIsJumping]   = useState(false);
  const scrollRef                     = useRef(null);
  const pendingJumpId                 = useRef(null);   // event id to scroll to after page loads
  const [backfilledEvents, setBackfilledEvents] = useState([]);

  // The cell used for dim/highlight logic — prefer locked over hovered
  const activeCell = lockedCell ?? hoveredCell;

  const { data, isLoading, isError } = useEvents(filters, page);
  const { data: anomalies }          = useAnomalies();
  const { muted, mute, unmute }      = useMutedDevices();
  const mutedKey = useMemo(() => [...muted].sort().join(','), [muted]);
  const { data: retentionConfig }    = useQuery({
    queryKey: ['setup', 'retention'],
    queryFn: () => fetchJson('/api/setup/retention'),
    staleTime: 30_000,
  });

  // VIEW-03: the quiet-hours window, used only to rule off the quiet stretch of
  // each day. Non-fatal if unavailable — the divider simply is not drawn.
  const { data: quietData } = useQuietHours();
  const quietOn = quietData?.enabled !== false;
  const quietStart = utcHourToLocal(quietData?.quietHoursStart ?? 23);
  const quietEnd = utcHourToLocal(quietData?.quietHoursEnd ?? 6);

  // M-8: read grouping values from the per-user blob when present, retention otherwise.
  // Keys/defaults/localStorage keys mirror SettingsTab.jsx:61-63 exactly so the same blob
  // key is read here that SettingsTab writes. Timeline never writes these — read-only.
  const { user } = useAuth();
  const { prefs } = useUserPreferences();
  const [blobEpisodeWindowMinutes] = usePreference('episodeWindowMinutes', 3, {
    localStorageKey: 'hc_pref_episodeWindowMinutes',
  });
  const [blobSceneWindowSeconds] = usePreference('sceneWindowSeconds', 5, {
    localStorageKey: 'hc_pref_sceneWindowSeconds',
  });
  const [blobEpisodeMinEventCount] = usePreference('episodeMinEventCount', 3, {
    localStorageKey: 'hc_pref_episodeMinEventCount',
  });

  // Per-key presence predicate (mirrors SettingsTab's blobHasQh convention, D-25-03) rather
  // than a blanket `user ? blob : retention` — App.jsx:93-102 seeds these three keys from
  // retention on first login, so an authed user with no grouping key in the blob is a narrow
  // upgrade cohort that the retention fallback below still covers. The retention fallback is
  // read directly from retentionConfig (not passed as usePreference's defaultValue) so it
  // stays REACTIVE — a defaultValue is only read once by the useState initializer and would
  // freeze anon users at whatever retentionConfig happened to be on first render.
  function hasBlobKey(k) {
    return !!user && prefs != null && typeof prefs === 'object' && k in prefs;
  }

  const episodeWindowMinutes = hasBlobKey('episodeWindowMinutes')
    ? blobEpisodeWindowMinutes
    : (retentionConfig?.episodeWindowMinutes ?? 3);
  const sceneWindowSeconds = hasBlobKey('sceneWindowSeconds')
    ? blobSceneWindowSeconds
    : (retentionConfig?.sceneWindowSeconds ?? 5);
  const episodeMinEventCount = hasBlobKey('episodeMinEventCount')
    ? blobEpisodeMinEventCount
    : (retentionConfig?.episodeMinEventCount ?? 3);

  const episodeWindowMs = episodeWindowMinutes * 60_000;
  const sceneWindowMs = sceneWindowSeconds * 1000;
  const filtersKey = JSON.stringify(filters);

  const anomalyMap = useMemo(() => {
    const byDeviceHour = new Map();
    const byRoomHour = new Map();

    for (const row of anomalies?.devices ?? []) {
      if (row.kind !== 'spike') continue;
      byDeviceHour.set(`${row.scopeName}|${row.hour}`, row);
    }
    for (const row of anomalies?.rooms ?? []) {
      if (row.kind !== 'spike') continue;
      byRoomHour.set(`${row.scopeName}|${row.hour}`, row);
    }
    return { byDeviceHour, byRoomHour };
  }, [anomalies]);

  // Reset filters when initialFilters prop changes (e.g. navigating from dashboard panels)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    setFilters(initialFilters ?? {});
    setPage(1);
  // JSON.stringify comparison avoids infinite loops on object identity changes
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(initialFilters)]);

  // When muting removes many rows, pull additional pages to keep this page full.
  useEffect(() => {
    let cancelled = false;

    async function backfill() {
      const baseEvents = data?.events ?? [];
      setBackfilledEvents([]);

      if (!baseEvents.length) return;

      const baseVisibleCount = baseEvents.filter((e) => !muted.has(e.accessory_name)).length;
      const totalPages = data?.pages ?? 1;
      if (baseVisibleCount >= PAGE_SIZE || page >= totalPages) return;

      const extras = [];
      let visibleCount = baseVisibleCount;
      let nextPage = page + 1;

      while (visibleCount < PAGE_SIZE && nextPage <= totalPages) {
        const qs = new URLSearchParams({ ...filters, page: String(nextPage), limit: String(PAGE_SIZE) });
        const res = await fetch(`${API_BASE}/events?${qs}`, { headers: withApiAuthHeaders() });
        if (!res.ok) break;

        const payload = await res.json();
        const events = payload?.events ?? [];
        if (!events.length) break;

        extras.push(...events);
        visibleCount += events.filter((e) => !muted.has(e.accessory_name)).length;
        nextPage += 1;
      }

      if (!cancelled) {
        setBackfilledEvents(extras);
      }
    }

    backfill();

    return () => {
      cancelled = true;
    };
  }, [data?.events, data?.pages, filtersKey, mutedKey, page]);

  // Filter muted devices after combining the current page + backfilled events.
  const { visibleEvents, droppedInvalidCount } = useMemo(() => {
    const seen = new Set();
    const combined = [...(data?.events ?? []), ...backfilledEvents].filter((e) => {
      if (seen.has(e.id)) return false;
      seen.add(e.id);
      return true;
    });
    let droppedInvalid = 0;
    const safeEvents = combined.filter((e) => {
      if (isValidTimestamp(e.timestamp)) return true;
      droppedInvalid += 1;
      return false;
    });
    return {
      visibleEvents: safeEvents.filter((e) => !muted.has(e.accessory_name)),
      droppedInvalidCount: droppedInvalid,
    };
  }, [data?.events, backfilledEvents, muted]);

  /**
   * eventMetaMap — per-event metadata keyed by event id.
   * Computed once per visibleEvents + anomalyMap change.
   *
   * Each value: { gap, marker, rank, dayTotal, anomalyLabel }
   *   gap          — human string ("4h 12m") or undefined
   *   marker       — 'first' | 'last' | 'only' | undefined
   *   rank         — 1-based count of this event for this device today
   *   dayTotal     — total events for this device today
   *   anomalyLabel — string describing why it's unusual, or undefined
   */
  const eventMetaMap = useMemo(() => {
    if (!visibleEvents.length) return {};
    const map = {};

    for (const [, dayEvents] of groupByDay(visibleEvents)) {
      // Bucket by device
      const byDevice = new Map();
      for (const e of dayEvents) {
        if (!byDevice.has(e.accessory_name)) byDevice.set(e.accessory_name, []);
        byDevice.get(e.accessory_name).push(e);
      }

      for (const [, devEvents] of byDevice) {
        const dayTotal = devEvents.length;

        // Sort oldest → newest so rank/gap/marker are computed chronologically
        const sorted = [...devEvents].sort(
          (a, b) => new Date(a.timestamp) - new Date(b.timestamp)
        );

        sorted.forEach((e, i) => {
          const meta = { dayTotal, rank: i + 1 };

          // ── First / last / only marker ──────────────────────────────────
          if (dayTotal === 1) {
            meta.marker = 'only';
          } else if (i === 0) {
            meta.marker = 'first';
          } else if (i === dayTotal - 1) {
            meta.marker = 'last';
          }

          // ── Gap since previous event of this device today ────────────────
          if (i > 0) {
            const gapMs = new Date(e.timestamp) - new Date(sorted[i - 1].timestamp);
            meta.gap = formatGap(gapMs);   // undefined when < 2 min
          }

          // ── Baseline outlier detection (device and room) ────────────────
          const hour = new Date(e.timestamp).getUTCHours();
          const deviceOutlier = anomalyMap.byDeviceHour.get(`${e.accessory_name}|${hour}`);
          const roomOutlier = e.room_name
            ? anomalyMap.byRoomHour.get(`${e.room_name}|${hour}`)
            : null;

          if (deviceOutlier) {
            meta.anomalyLabel = 'device spike vs baseline';
          } else if (roomOutlier) {
            meta.anomalyLabel = 'room spike vs baseline';
          }

          map[e.id] = meta;
        });
      }
    }

    return map;
  }, [visibleEvents, anomalyMap]);

  // ── Scroll-after-page-change ───────────────────────────────────────────────
  // When handleClickCell navigates to a different page, it stores the target
  // event id in pendingJumpId. This effect fires whenever the loaded data
  // changes and scrolls as soon as the element appears in the DOM.
  useEffect(() => {
    if (!pendingJumpId.current || !scrollRef.current || isLoading) return;
    const el = scrollRef.current.querySelector(`[data-scene-id="${CSS.escape(pendingJumpId.current)}"]`);
    if (el) {
      pendingJumpId.current = null;
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [data, isLoading]);

  // ── Handlers ──────────────────────────────────────────────────────────────

  function handleFilterChange(newFilters) {
    setFilters(newFilters);
    setPage(1);
  }

  /** Hover: highlight visible events only. No scroll — avoids mouse-leave side effects. */
  function handleHoverCell(name, hour) {
    setHoveredCell({ accessoryName: name, hour });
  }

  /**
   * Click: lock the highlight, collapse the heatmap, ask the server which
   * page the most recent match lives on, navigate there, then scroll to it.
   * The useEffect above handles the scroll once the page data loads.
   * Clicking the same cell a second time unlocks it.
   */
  async function handleClickCell(name, hour) {
    const isAlreadyLocked = lockedCell?.accessoryName === name && lockedCell?.hour === hour;

    if (isAlreadyLocked) {
      setLockedCell(null);
      return;
    }

    setLockedCell({ accessoryName: name, hour });
    setHeatmapOpen(false);
    setIsJumping(true);

    try {
      const qs = new URLSearchParams({ accessory: name, hour, limit: PAGE_SIZE });
      if (filters.room) qs.set('room', filters.room);
      if (filters.from) qs.set('from', filters.from);
      if (filters.to)   qs.set('to',   filters.to);

      const res   = await fetch(`${API_BASE}/events/jump?${qs}`, {
        headers: withApiAuthHeaders(),
      });
      if (!res.ok) return;
      const { page: targetPage, eventId } = await res.json();

      if (!eventId) return; // no match in DB

      pendingJumpId.current = eventId;

      if (targetPage && targetPage !== page) {
        // Navigate to the right page — useEffect scrolls after data loads
        setPage(targetPage);
      } else {
        // Already on the correct page — scroll immediately after heatmap collapses
        setTimeout(() => {
          const el = scrollRef.current?.querySelector(`[data-scene-id="${CSS.escape(eventId)}"]`);
          if (el) {
            pendingJumpId.current = null;
            el.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }
        }, 120);
      }
    } catch (err) {
      if (import.meta.env.DEV) console.error('[timeline] jump failed:', err);
    } finally {
      setIsJumping(false);
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <FilterBar
        filters={filters}
        onChange={handleFilterChange}
        open={filtersOpen}
        onToggle={() => setFiltersOpen((o) => !o)}
        heatmapOpen={heatmapOpen}
        onHeatmapToggle={() => { setHeatmapOpen((o) => !o); setLockedCell(null); }}
        onHoverCell={handleHoverCell}
        onHoverEnd={() => setHoveredCell(null)}
        onClickCell={handleClickCell}
        lockedCell={lockedCell}
      />

      {/* Locked-cell banner — shows when a heatmap cell has been clicked */}
      {lockedCell && (
        <div className="max-w-4xl mx-auto w-full px-3 sm:px-4 py-1.5 flex items-center gap-2">
          {isJumping
            ? <Loader2 size={11} className="text-hc-warning-text animate-spin flex-shrink-0" />
            : <span className="w-2 h-2 rounded-full bg-hc-warning-text flex-shrink-0" />
          }
          <span className="text-xs text-hc-warning-text font-medium truncate">
            {isJumping
              ? `Finding ${lockedCell.accessoryName} at ${lockedCell.hour}:00 UTC…`
              : `${lockedCell.accessoryName} · ${lockedCell.hour}:00 UTC`
            }
          </span>
          {!isJumping && (
            <button
              onClick={() => setLockedCell(null)}
              aria-label="Clear heatmap selection"
              className="text-[10px] text-hc-muted hover:text-hc-fg underline ml-auto flex-shrink-0"
            >
              clear
            </button>
          )}
        </div>
      )}

      {/* Muted devices banner */}
      {muted.size > 0 && (
        <div className="max-w-4xl mx-auto w-full px-3 sm:px-4 py-2 flex items-center gap-2 flex-wrap">
          <VolumeX size={12} className="text-hc-muted flex-shrink-0" />
          <span className="text-xs text-hc-muted">Muted:</span>
          {[...muted].map((name) => (
            <span
              key={name}
              className="inline-flex items-center gap-1 text-xs bg-hc-panel-mid text-hc-muted px-2 py-0.5 rounded-full"
            >
              {name}
              <button
                onClick={() => unmute(name)}
                className="hover:text-hc-fg-strong ml-0.5"
                title={`Unmute ${name}`}
                aria-label={`Unmute ${name}`}
              >
                <X size={10} />
              </button>
            </span>
          ))}
        </div>
      )}

      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        {isLoading && (
          <div className="flex justify-center py-12 text-hc-muted">Loading…</div>
        )}

        {isError && (
          <div className="flex justify-center py-12 text-hc-danger-text">
            Failed to load events. Is the listener container running?
          </div>
        )}

        {data && (data.events?.length ?? 0) === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-hc-muted">
            <p className="text-lg font-medium">No events yet</p>
            <p className="text-sm mt-1">
              Events will appear here as your HomeKit accessories change state.
            </p>
          </div>
        )}

        {!isLoading && !isError && data && (data.events?.length ?? 0) > 0 && visibleEvents.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-hc-muted">
            <p className="text-lg font-medium">No visible events</p>
            <p className="text-sm mt-1 text-center px-6">
              {muted.size > 0
                ? 'Your current filters only match muted devices. Clear filters or unmute devices to view results.'
                : droppedInvalidCount > 0
                  ? 'Matching events were found, but could not be rendered because they contain invalid timestamps.'
                  : 'No matching events could be rendered.'}
            </p>
          </div>
        )}

        {visibleEvents.length > 0 && (
          <div className="max-w-4xl mx-auto px-3 sm:px-4 py-4">
            {[...groupByDay(visibleEvents)].map(([day, events]) => (
              <div key={day} className="mb-6">
                <h2 className="text-xs font-semibold uppercase tracking-wider text-hc-muted px-4 mb-2">
                  {format(new Date(day), 'EEEE, MMMM d')}
                </h2>
                <div className="space-y-3">
                  {withQuietDivider(
                    groupScenesIntoEpisodes(
                      groupIntoScenes(events, { sceneWindowMs }),
                      { episodeWindowMs, episodeMinEventCount },
                    ),
                    { quietOn, quietStart, quietEnd },
                    (entry) => (
                      entry.kind === 'episode' ? (
                        <EpisodeGroup
                          key={entry.scenes[0][0].id}
                          episode={entry.episode}
                          scenes={entry.scenes}
                          eventMetaMap={eventMetaMap}
                          hoveredCell={activeCell}
                          onMute={mute}
                          onSelectAccessory={onSelectAccessory}
                        />
                      ) : (
                        entry.scenes.map((group) => (
                          <SceneGroup
                            key={group[0].id}
                            events={group}
                            eventMetaMap={eventMetaMap}
                            hoveredCell={activeCell}
                            onMute={mute}
                            onSelectAccessory={onSelectAccessory}
                          />
                        ))
                      )
                    ),
                  )}
                </div>
              </div>
            ))}

            {(data?.pages ?? 1) > 1 && (
              <div className="flex items-center justify-between px-4 py-3 text-sm text-hc-fg">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  aria-label="Previous page"
                  className="flex items-center gap-1 disabled:opacity-40"
                >
                  <ChevronLeft size={16} /> Previous
                </button>
                <span>Page {page} of {data?.pages ?? 1}</span>
                <button
                  onClick={() => setPage((p) => Math.min(data?.pages ?? 1, p + 1))}
                  disabled={page === (data?.pages ?? 1)}
                  aria-label="Next page"
                  className="flex items-center gap-1 disabled:opacity-40"
                >
                  Next <ChevronRight size={16} />
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
