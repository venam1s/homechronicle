import { TrendingDown, TrendingUp } from 'lucide-react';
import { useCategoryStats } from '../hooks/useCategories.js';

const DAYS = 7;

// Fixed colour slot per category so a category keeps its colour whatever the
// ranking. Fills are CSS-driven via .hc-cat-N (see index.css) so they follow
// the palette and light/dark mode.
const CATEGORY_SLOT = {
  security: 0,
  safety: 1,
  access: 2,
  climate: 3,
  lighting: 4,
  power: 5,
  cleaning: 6,
  other: 7,
};

function trendLabel(events, previousEvents) {
  if (!previousEvents) return null;
  const pct = Math.round(((events - previousEvents) / previousEvents) * 100);
  if (pct === 0) return null;
  return { pct, up: pct > 0 };
}

export default function CategoriesPanel({ onSelectAccessory }) {
  const { data, isLoading, isError } = useCategoryStats(DAYS);

  const header = (
    <div className="flex items-baseline justify-between mb-3">
      <h3 className="text-sm font-semibold text-hc-fg">Device Categories</h3>
      <span className="text-xs text-hc-muted">last {DAYS} days</span>
    </div>
  );

  if (isLoading) {
    return <div>{header}<p className="text-sm text-hc-muted">Loading categories…</p></div>;
  }
  if (isError) {
    return <div>{header}<p className="text-sm text-hc-muted">Could not load categories.</p></div>;
  }

  const categories = data?.categories ?? [];
  if (!categories.length) {
    return <div>{header}<p className="text-sm text-hc-muted">No device activity in the last {DAYS} days.</p></div>;
  }
  const maxEvents = Math.max(1, ...categories.map((c) => c.events));

  return (
    <div className="h-full flex flex-col min-h-0">
      {header}
      <ul className="flex flex-col gap-3 flex-1 min-h-0 overflow-auto">
        {categories.map((c) => {
          const trend = trendLabel(c.events, c.previousEvents);
          const slot = CATEGORY_SLOT[c.id] ?? CATEGORY_SLOT.other;
          return (
            <li key={c.id} className="min-w-0">
              <div className="flex items-center gap-2 text-sm">
                <span className={`hc-cat-${slot} w-2.5 h-2.5 rounded-sm flex-shrink-0`} aria-hidden="true" />
                <span className="font-medium text-hc-fg truncate">{c.label}</span>
                <span className="text-xs text-hc-muted whitespace-nowrap">
                  {c.devices} {c.devices === 1 ? 'device' : 'devices'}
                </span>
                <span className="ml-auto font-semibold text-hc-fg tabular-nums">{c.events.toLocaleString()}</span>
                {trend && (
                  <span
                    className="inline-flex items-center gap-0.5 text-xs text-hc-muted tabular-nums w-14 justify-end"
                    title={`${c.previousEvents.toLocaleString()} events the ${DAYS} days before`}
                  >
                    {trend.up ? <TrendingUp size={12} aria-hidden="true" /> : <TrendingDown size={12} aria-hidden="true" />}
                    <span className="sr-only">{trend.up ? 'up' : 'down'}</span>
                    {Math.abs(trend.pct)}%
                  </span>
                )}
                {!trend && <span className="w-14" aria-hidden="true" />}
              </div>
              <div className="mt-1 h-1.5 rounded-full bg-hc-panel-mid overflow-hidden" aria-hidden="true">
                <div className={`hc-cat-${slot} h-full rounded-full`} style={{ width: `${(c.events / maxEvents) * 100}%` }} />
              </div>
              {c.topDevices.length > 0 && (
                <p className="mt-1 text-xs text-hc-muted truncate">
                  {c.topDevices.map((d, i) => (
                    <span key={d.accessoryId}>
                      {i > 0 && ', '}
                      {onSelectAccessory ? (
                        <button
                          type="button"
                          onClick={() => onSelectAccessory(d.accessoryId)}
                          className="hc-no-drag hover:text-hc-fg underline-offset-2 hover:underline"
                        >
                          {d.name}
                        </button>
                      ) : d.name}
                    </span>
                  ))}
                </p>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
