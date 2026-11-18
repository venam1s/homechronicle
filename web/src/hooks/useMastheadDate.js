import { usePreference } from './usePreference.js';

/**
 * useMastheadDate — whether the top bar shows today's date (default: shown).
 *
 * Persists through usePreference exactly like theme and the temperature unit:
 * a signed-in user's choice syncs to their account blob (key `showMastheadDate`);
 * a signed-out user's choice stays in this browser's localStorage. Stored as a
 * JSON boolean; anything that is not literally `false` counts as shown, so a
 * hand-edited key or a stale blob can only ever fail towards the default.
 */

export const STORAGE_KEY = 'hc_show_masthead_date';

export function useMastheadDate() {
  const [stored, setStored] = usePreference(
    'showMastheadDate',
    true,
    { localStorageKey: STORAGE_KEY, followOtherTabs: true },
  );

  return {
    showDate: stored !== false,
    setShowDate: (next) => setStored(next !== false),
  };
}
