import { Sun, Moon, SunMoon, Check, CalendarDays, CalendarOff } from 'lucide-react';
import clsx from 'clsx';
import Card from './Card.jsx';
import SettingsGroup from './settings/SettingsGroup.jsx';
import SettingsRow from './settings/SettingsRow.jsx';
import Segmented from './settings/Segmented.jsx';
import { FOCUS_RING } from './settings/fieldStyles.js';
import { useTheme } from '../hooks/useTheme.js';
import { usePalette } from '../hooks/usePalette.js';
import { useTemperatureUnit } from '../hooks/useTemperatureUnit.js';
import { useMastheadDate } from '../hooks/useMastheadDate.js';
import { PALETTE_IDS, PALETTES, rampFor } from '../lib/palettes.js';

const THEME_OPTIONS = [
  { id: 'light', label: 'Light', icon: Sun, hint: 'Always the light palette.' },
  { id: 'dark', label: 'Dark', icon: Moon, hint: 'Always the dark palette.' },
  { id: 'system', label: 'System', icon: SunMoon, hint: "Follows this device's appearance and switches with it." },
];

const UNIT_OPTIONS = [
  { id: 'c', label: '°C' },
  { id: 'f', label: '°F' },
];

const DATE_OPTIONS = [
  { id: 'show', label: 'Show', icon: CalendarDays },
  { id: 'hide', label: 'Hide', icon: CalendarOff },
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
 * Appearance settings — theme (Light / Dark / System), units, the date in the
 * top bar, and palette selection.
 *
 * All are per-user preferences: they sync to the account when signed in and
 * fall back to localStorage when not (PAL-03 / PAL-04). Selection applies
 * immediately, with no save step and no reload (PAL-01).
 */
export default function AppearanceSection() {
  const { preference, resolvedTheme, setPreference } = useTheme();
  const { palette, setPalette } = usePalette();
  const { unit, setUnit } = useTemperatureUnit();
  const { showDate, setShowDate } = useMastheadDate();

  const activeTheme = THEME_OPTIONS.find((o) => o.id === preference) ?? THEME_OPTIONS[2];

  return (
    <>
      <SettingsGroup title="Appearance">
        <SettingsRow
          label="Theme"
          description={(
            <>
              {activeTheme.hint}
              {preference === 'system' && (
                <> Currently showing the <strong className="font-semibold">{resolvedTheme}</strong> palette.</>
              )}
            </>
          )}
          control={(
            <Segmented
              ariaLabel="Theme"
              options={THEME_OPTIONS}
              value={preference}
              onChange={setPreference}
            />
          )}
        />
        <SettingsRow
          label="Temperature"
          description="Applies everywhere you read or type a temperature, including alert rules, alert emails and exports. Readings are stored in °C."
          control={(
            <Segmented
              ariaLabel="Temperature unit"
              options={UNIT_OPTIONS}
              value={unit}
              onChange={setUnit}
            />
          )}
        />
        <SettingsRow
          label="Date in top bar"
          description="Today's date at the right of the top bar on wide screens. Hiding it changes nothing else."
          control={(
            <Segmented
              ariaLabel="Date in the top bar"
              options={DATE_OPTIONS}
              value={showDate ? 'show' : 'hide'}
              onChange={(id) => setShowDate(id === 'show')}
            />
          )}
        />
      </SettingsGroup>

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
                      <span className="block text-sm font-semibold text-hc-fg-strong truncate">{name}</span>
                      <span className="block text-xs text-hc-muted truncate">{tagline}</span>
                    </span>
                    {selected && (
                      <Check size={16} className="shrink-0 text-hc-accent-strong" aria-hidden="true" />
                    )}
                  </span>
                </button>
              );
            })}
          </div>

          <p className="mt-3 text-xs text-hc-muted">
            Your palette follows your account across devices. Room colours, charts and the
            wordmark all follow it, and each palette has its own dark mode rather than a
            dimmed version of the light one.
          </p>
        </Card.Body>
      </Card>
    </>
  );
}
