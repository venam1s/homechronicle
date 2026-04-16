import { formatDistanceToNow, format } from 'date-fns';
import { VolumeX } from 'lucide-react';
import { getServiceIcon, getServiceLabel, describeChange, describeBeforeAfter } from '../lib/icons.js';
import { getRoomColor } from '../lib/roomColors.js';

/** 1st / 2nd / 3rd … Nth */
function ordinal(n) {
  if (n === 1) return '1st';
  if (n === 2) return '2nd';
  if (n === 3) return '3rd';
  return `${n}th`;
}

/**
 * EventRow — renders one event with optional rich metadata.
 *
 * Props:
 *   event        — event object from API
 *   hoveredCell  — { accessoryName, hour } | null (from TimelineHeatmap)
 *   meta         — { gap, marker, rank, dayTotal, anomalyLabel } (from Timeline eventMetaMap)
 *   onMute       — fn(accessoryName) — called when user clicks mute
 */
export default function EventRow({ event, hoveredCell = null, meta = {}, onMute, onSelectAccessory }) {
  const Icon        = getServiceIcon(event.service_type);
  const serviceName = getServiceLabel(event.service_type);
  const ts          = new Date(event.timestamp);
  const description = describeChange(event.characteristic, event.new_value);
  const beforeAfter = describeBeforeAfter(event.characteristic, event.old_value, event.new_value);
  const roomColor   = getRoomColor(event.room_name);

  const { gap, marker, rank, dayTotal, anomalyLabel } = meta;

  // Heatmap highlight: does this event match the hovered cell?
  const isHighlighted = hoveredCell &&
    event.accessory_name === hoveredCell.accessoryName &&
    ts.getUTCHours() === hoveredCell.hour;
  const isDimmed = hoveredCell && !isHighlighted;

  // Third meta row is shown only when there's something worth displaying
  const showMetaRow = gap || anomalyLabel || (dayTotal > 1 && rank) || marker === 'first' || marker === 'last' || marker === 'only';

  return (
    <div
      className={`group flex items-start gap-3 py-3 px-4 transition-all relative ${
        isHighlighted ? 'bg-blue-50'
        : isDimmed    ? 'opacity-40'
        : 'hover:bg-hc-panel-mid'
      }`}
      style={isHighlighted ? { boxShadow: `inset 3px 0 0 0 rgba(var(--hc-accent-rgb), 0.65)` } : undefined}
    >
      <div className="flex-1 min-w-0">

        {/* ── Row 1: name · anomaly badge · mute button · relative time ── */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
            {onSelectAccessory && event.accessory_id ? (
              <button
                onClick={(e) => { e.stopPropagation(); onSelectAccessory(event.accessory_id); }}
                className="font-medium text-hc-fg-strong truncate hover:text-blue-600 hover:underline transition-colors text-left"
              >
                {event.accessory_name}
              </button>
            ) : (
              <span className="font-medium text-hc-fg-strong truncate">{event.accessory_name}</span>
            )}
            {anomalyLabel && (
              <span className="inline-flex items-center gap-1 text-xs text-hc-warning-text bg-hc-warning-bg border border-hc-warning-border px-1.5 py-0.5 rounded-full flex-shrink-0">
                ⚠ {anomalyLabel}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            {/* Hover-reveal mute button */}
            {onMute && (
              <button
                onClick={(e) => { e.stopPropagation(); onMute(event.accessory_name); }}
                className="opacity-0 group-hover:opacity-100 transition-opacity text-hc-muted hover:text-hc-muted focus:opacity-100"
                title={`Mute ${event.accessory_name}`}
                aria-label={`Mute ${event.accessory_name}`}
              >
                <VolumeX size={12} />
              </button>
            )}
            <span className="text-xs text-hc-muted whitespace-nowrap" title={format(ts, 'PPpp')}>
              {formatDistanceToNow(ts, { addSuffix: true })}
            </span>
          </div>
        </div>

        {/* ── Row 2: service type ── */}
        <div className="flex items-center gap-1.5 mt-0.5">
          <Icon size={12} className="text-hc-muted flex-shrink-0" />
          <span className="text-xs text-hc-muted">{serviceName}</span>
        </div>

        {/* ── Row 3: description · before→after · room badge ── */}
        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
          <span className="text-sm text-hc-fg">{description}</span>
          {beforeAfter && (
            <span className="text-xs font-mono text-hc-muted bg-hc-panel-mid border border-hc-panel-border px-1.5 py-0.5 rounded">
              {beforeAfter.from} → {beforeAfter.to}
            </span>
          )}
          {event.room_name && (
            <span
              className="text-xs px-1.5 py-0.5 rounded-full font-medium flex-shrink-0"
              style={roomColor
                ? { backgroundColor: roomColor.bg, color: roomColor.text }
                : { color: 'var(--hc-room-fallback)' }}
            >
              {event.room_name}
            </span>
          )}
        </div>

        {/* ── Row 3: gap · frequency rank · first/last markers ── */}
        {showMetaRow && (
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            {gap && (
              <span className="text-xs text-hc-muted">quiet {gap} before</span>
            )}

            {/* "1st today" is implied by the 'first' marker badge, so skip ordinal when rank === 1 */}
            {dayTotal > 1 && rank && rank > 1 && (
              <span className="text-xs text-hc-muted">{ordinal(rank)} today</span>
            )}

            {marker === 'first' && (
              <span className="text-xs px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-600 border border-emerald-100 font-medium">
                first today
              </span>
            )}
            {marker === 'last' && (
              <span className="text-xs px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-500 border border-slate-200 font-medium">
                last today
              </span>
            )}
            {marker === 'only' && (
              <span className="text-xs text-hc-muted">only event today</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
