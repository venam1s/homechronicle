import { useAccessories } from '../hooks/useEvents.js';
import { useHeatmap } from '../hooks/useEvents.js';
import { useAccentRgb } from '../hooks/useAccentRgb.js';
import { getRoomColor } from '../lib/roomColors.js';
import { Search, SlidersHorizontal, ChevronDown, ChevronUp, BarChart2 } from 'lucide-react';
import HeatmapGrid from './HeatmapGrid.jsx';

export default function FilterBar({
  filters,
  onChange,
  open,
  onToggle,
  heatmapOpen,
  onHeatmapToggle,
  onHoverCell,
  onHoverEnd,
  onClickCell,
  lockedCell,
}) {
  const { data: accessories = [] } = useAccessories();
  const { data: heatmapData = [], isLoading: heatmapLoading } = useHeatmap();
  const accent = useAccentRgb();
  const hasHeatmapData = !heatmapLoading && heatmapData.length > 0;

  const rooms = [...new Set(accessories.map((a) => a.room_name).filter(Boolean))].sort();

  function update(key, value) {
    onChange({ ...filters, [key]: value });
  }

  const activeRoomColor = filters.room ? getRoomColor(filters.room) : null;
  const activeCount = Object.values(filters).filter(Boolean).length;

  return (
    // Full-width but transparent wrapper (no background/border): these controls
    // sit in the Timeline header on the page background, not an edge-to-edge
    // white strip. The wrapper must be full width so the inner max-w-4xl rows
    // center and left-align with the page title (as a bare flex-column child a
    // max-w row would otherwise collapse to its content width). Toggle row +
    // panels stack at the shared max-w-4xl width.
    <div className="w-full">
      {/* ── Combined toggle bar ────────────────────────────────── */}
      <div className="max-w-4xl mx-auto px-3 sm:px-4 flex items-center py-2">
        {/* Search & filters toggle */}
        <button
          onClick={onToggle}
          aria-expanded={open}
          aria-controls="filter-bar-panel"
          className="flex items-center gap-1.5 py-0.5 px-2 rounded-md transition-colors hc-filter-toggle"
        >
          <Search size={13} style={{ color: 'rgb(var(--hc-accent-rgb))' }} />
          <span className="text-xs font-semibold" style={{ color: 'var(--hc-accent-stronger)' }}>Search & filters</span>
          {activeCount > 0 && (
            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full" style={{ color: 'var(--hc-accent-strong)', backgroundColor: 'var(--hc-accent-soft)' }}>
              {activeCount} active
            </span>
          )}
          {open
            ? <ChevronUp size={12} style={{ color: 'var(--hc-accent-strong)' }} />
            : <ChevronDown size={12} style={{ color: 'var(--hc-accent-strong)' }} />
          }
        </button>

        {/* Separator dot */}
        <span className="mx-2 text-[8px]" style={{ color: 'var(--hc-muted)', opacity: 0.4 }}>●</span>

        {/* Activity heatmap toggle */}
        <button
          onClick={onHeatmapToggle}
          disabled={!hasHeatmapData && !heatmapLoading}
          className="flex items-center gap-1.5 py-0.5 px-2 rounded-md transition-colors hc-filter-toggle disabled:cursor-default disabled:opacity-40"
        >
          <BarChart2 size={13} style={hasHeatmapData ? { color: 'rgb(var(--hc-accent-rgb))' } : undefined} className={hasHeatmapData ? '' : 'text-hc-muted'} />
          <span className={`text-xs font-semibold ${hasHeatmapData ? '' : 'text-hc-muted'}`} style={hasHeatmapData ? { color: 'var(--hc-accent-stronger)' } : undefined}>
            Activity heatmap
          </span>
          {hasHeatmapData && (
            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full" style={{ color: 'var(--hc-accent-strong)', backgroundColor: 'var(--hc-accent-soft)' }}>
              Jump view
            </span>
          )}
          {heatmapLoading && <span className="text-[10px] text-hc-muted">Loading…</span>}
          {hasHeatmapData && (
            heatmapOpen
              ? <ChevronUp size={12} style={{ color: 'var(--hc-accent-strong)' }} />
              : <ChevronDown size={12} style={{ color: 'var(--hc-accent-strong)' }} />
          )}
        </button>
      </div>

      {/* ── Filter panel ───────────────────────────────────────── */}
      {open && (
        <div id="filter-bar-panel" className="max-w-4xl mx-auto px-3 sm:px-4 pb-3">
          <div className="flex flex-wrap gap-2 sm:gap-3">
            {/* Search by name */}
            <div className="relative w-full sm:w-56">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-hc-muted pointer-events-none" />
              <input
                type="search"
                placeholder="Search accessory…"
                value={filters.accessory ?? ''}
                onChange={(e) => update('accessory', e.target.value)}
                className="border border-hc-border-strong bg-hc-panel text-hc-fg rounded-lg pl-8 pr-3 py-2 sm:py-1.5 text-sm w-full focus:outline-none focus:ring-2 focus:ring-hc-focus-ring"
              />
            </div>

            {/* Room filter with color swatch when active */}
            <div className="relative flex items-center w-full sm:w-auto">
              {activeRoomColor && (
                <span
                  className="absolute left-2.5 w-2 h-2 rounded-full pointer-events-none"
                  style={{ backgroundColor: activeRoomColor.dot }}
                />
              )}
              <select
                value={filters.room ?? ''}
                onChange={(e) => update('room', e.target.value)}
                className={`border border-hc-border-strong bg-hc-panel text-hc-fg rounded-lg py-2 sm:py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-hc-focus-ring w-full sm:w-auto ${activeRoomColor ? 'pl-7 pr-3' : 'px-3'}`}
              >
                <option value="">All rooms</option>
                {rooms.map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
            </div>

            {/* Characteristic filter */}
            <input
              type="search"
              placeholder="Characteristic…"
              value={filters.characteristic ?? ''}
              onChange={(e) => update('characteristic', e.target.value)}
              className="border border-hc-border-strong bg-hc-panel text-hc-fg rounded-lg px-3 py-2 sm:py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-hc-focus-ring w-full sm:w-36"
            />

            {/* Date from */}
            <input
              type="datetime-local"
              value={filters.from ?? ''}
              onChange={(e) => update('from', e.target.value)}
              className="border border-hc-border-strong bg-hc-panel text-hc-fg rounded-lg px-3 py-2 sm:py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-hc-focus-ring w-full sm:w-auto"
            />

            {/* Date to */}
            <input
              type="datetime-local"
              value={filters.to ?? ''}
              onChange={(e) => update('to', e.target.value)}
              className="border border-hc-border-strong bg-hc-panel text-hc-fg rounded-lg px-3 py-2 sm:py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-hc-focus-ring w-full sm:w-auto"
            />

            {/* Clear */}
            {activeCount > 0 && (
              <button
                onClick={() => onChange({})}
                className="inline-flex items-center gap-1 text-sm px-2.5 rounded-lg sm:ml-auto"
                style={{
                  color: 'var(--hc-accent-strong)',
                  backgroundColor: 'var(--hc-accent-soft)',
                  borderWidth: '1px',
                  borderColor: 'rgba(var(--hc-accent-rgb), 0.2)',
                }}
              >
                <SlidersHorizontal size={12} />
                Clear filters
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── Heatmap panel ──────────────────────────────────────── */}
      {heatmapOpen && hasHeatmapData && (
        <HeatmapGrid
          data={heatmapData}
          accent={accent}
          onHoverCell={onHoverCell}
          onHoverEnd={onHoverEnd}
          onClickCell={onClickCell}
          lockedCell={lockedCell}
        />
      )}
    </div>
  );
}
