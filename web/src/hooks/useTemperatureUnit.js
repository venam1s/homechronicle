import { usePreference } from './usePreference.js';
import { normalizeTemperatureUnit, temperatureSymbol } from '../lib/temperature.js';

/**
 * useTemperatureUnit — the user's temperature unit, 'c' (default) or 'f'.
 *
 * Persists through usePreference exactly like theme: a signed-in user's choice
 * syncs to their account blob (key `temperatureUnit`); a signed-out user's
 * choice stays in this browser's localStorage. Readings are stored in °C
 * everywhere; this unit is applied only where a person reads or types one.
 */

export const STORAGE_KEY = 'hc_temperature_unit';

export function useTemperatureUnit() {
  // Identity codec: hc_temperature_unit stores a raw 'c' / 'f' string, not JSON.
  const [stored, setStored] = usePreference(
    'temperatureUnit',
    'c',
    { localStorageKey: STORAGE_KEY, serialize: (v) => v, deserialize: (v) => v, followOtherTabs: true },
  );

  // Guard on the way out: a synced blob or a hand-edited key may hold anything.
  const unit = normalizeTemperatureUnit(stored);

  return {
    unit,
    symbol: temperatureSymbol(unit),
    setUnit: (next) => setStored(normalizeTemperatureUnit(next)),
  };
}
