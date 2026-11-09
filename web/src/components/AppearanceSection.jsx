import { Sun, Moon, SunMoon, Check, Thermometer } from 'lucide-react';
import clsx from 'clsx';
import Card from './Card.jsx';
import { useTheme } from '../hooks/useTheme.js';
import { usePalette } from '../hooks/usePalette.js';
import { useTemperatureUnit } from '../hooks/useTemperatureUnit.js';
import { PALETTE_IDS, PALETTES, rampFor } from '../lib/palettes.js';

const FOCUS_RING = 'focus-visible:outline-2 focus-visible:outline-hc-focus-ring focus-visible:outline-offset-2';

const THEME_OPTIONS = [
  { id: 'light', label: 'Light', icon: Sun, hint: 'Always the light palette.' },
  { id: 'dark', label: 'Dark', icon: Moon, hint: 'Always the dark palette.' },
  { id: 'system', label: 'System', icon: SunMoon, hint: "Follows this device's appearance and switches with it." },
];

const UNIT_OPTIONS = [
  { id: 'c', label: 'Celsius (°C)' },
  { id: 'f', label: 'Fahrenheit (°F)' },
];

/**
 * Three swatch dots for one half of a palette card: the accent followed by the
 * first two room colors, which is enough to read the palette's character
 * without turning the card into a colour chart.
 */
function SwatchRow({ paletteId, mode }) {
  const { bg, accent } = PALETTES[paletteId][mode];
  const ramp = rampFor(paletteId, mode);
  const dots = [accent, ramp[1], ramp[3]];

  return (
    <div
      className="flex-1 flex items-center justify-center gap-1.5 py-3"
      style={{ backgroundColor: bg }}
    >
      {dots.map((color, i) => (
        <span
          key={i}
          className="w-2.5 h-2.5 rounded-full"
          style={{ backgroundColor: color }}
        />
      ))}
    </div>
  );
}

/**
 * Appearance settings — theme (Light / Dark / System) and palette selection.
 *
 * Both are per-user preferences: they sync to the account when signed in and
 * fall back to localStorage when not (PAL-03 / PAL-04). Selection applies
 * immediately, with no save step and no reload (PAL-01).
 */
export default function AppearanceSection() {
  const { preference, resolvedTheme, setPreference } = useTheme();
  const { palette, setPalette } = usePalette();
  const { unit, setUnit } = useTemperatureUnit();

  const activeTheme = THEME_OPTIONS.find((o) => o.id === preference) ?? THEME_OPTIONS[2];

  return (
    <>
      <Card>
        <Card.Header title="Theme" headingLevel={2} />
        <Card.Body>
          <div
            role="radiogroup"
            aria-label="Theme"
            className="inline-flex gap-1 p-1 rounded-lg bg-hc-panel-mid"
          >
            {THEME_OPTIONS.map(({ id, label, icon: Icon }) => {
              const selected = preference === id;
              return (
                <button
                  key={id}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => setPreference(id)}
                  className={clsx(
                    'flex items-center gap-2 px-4 py-2 rounded-md text-hc-label font-semibold transition-colors',
                    FOCUS_RING,
                    selected
                      ? 'bg-hc-panel text-hc-fg-strong border border-hc-panel-border'
                      : 'text-hc-muted hover:text-hc-fg',
                  )}
                >
                  <Icon size={16} aria-hidden="true" />
                  {label}
                </button>
              );
            })}
          </div>

          <p className="mt-3 text-hc-caption text-hc-muted">
            {activeTheme.hint}
            {preference === 'system' && (
              <> Currently showing the <strong className="font-semibold">{resolvedTheme}</strong> palette.</>
            )}
          </p>
        </Card.Body>
      </Card>

      <Card>
        <Card.Header title="Units" headingLevel={2} />
        <Card.Body>
          <div
            role="radiogroup"
            aria-label="Temperature unit"
            className="inline-flex gap-1 p-1 rounded-lg bg-hc-panel-mid"
          >
            {UNIT_OPTIONS.map(({ id, label }) => {
              const selected = unit === id;
              return (
                <button
                  key={id}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => setUnit(id)}
                  className={clsx(
                    'flex items-center gap-2 px-4 py-2 rounded-md text-hc-label font-semibold transition-colors',
                    FOCUS_RING,
                    selected
                      ? 'bg-hc-panel text-hc-fg-strong border border-hc-panel-border'
                      : 'text-hc-muted hover:text-hc-fg',
                  )}
                >
                  <Thermometer size={16} aria-hidden="true" />
                  {label}
                </button>
              );
            })}
          </div>

          <p className="mt-3 text-hc-caption text-hc-muted">
            Applies everywhere you read or type a temperature, including alert rules, alert emails
            and exports. Readings are stored in °C.
          </p>
        </Card.Body>
      </Card>

      <Card>
        <Card.Header title="Palette" headingLevel={2} />
        <Card.Body>
          <div
            role="radiogroup"
            aria-label="Palette"
            className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(180px,1fr))]"
          >
            {PALETTE_IDS.map((id) => {
              const { name, tagline } = PALETTES[id];
              const selected = palette === id;
              return (
                <button
                  key={id}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => setPalette(id)}
                  className={clsx(
                    'group flex flex-col overflow-hidden rounded-xl text-left transition-colors',
                    FOCUS_RING,
                    selected
                      ? 'border-2 border-hc-accent-strong'
                      : 'border border-hc-panel-border hover:border-hc-border-strong',
                  )}
                >
                  {/* Light half beside dark half, so the pair can be judged at once. */}
                  <span className="flex" aria-hidden="true">
                    <SwatchRow paletteId={id} mode="light" />
                    <SwatchRow paletteId={id} mode="dark" />
                  </span>
                  <span className="flex items-center justify-between gap-2 px-3 py-2 bg-hc-panel">
                    <span className="min-w-0">
                      <span className="block text-hc-label font-semibold text-hc-fg-strong truncate">{name}</span>
                      <span className="block text-hc-caption text-hc-muted truncate">{tagline}</span>
                    </span>
                    {selected && (
                      <Check size={16} className="shrink-0 text-hc-accent-strong" aria-hidden="true" />
                    )}
                  </span>
                </button>
              );
            })}
          </div>

          <p className="mt-3 text-hc-caption text-hc-muted">
            Your palette follows your account across devices. Room colours, charts and the
            wordmark all follow it, and each palette has its own dark mode rather than a
            dimmed version of the light one.
          </p>
        </Card.Body>
      </Card>
    </>
  );
}
