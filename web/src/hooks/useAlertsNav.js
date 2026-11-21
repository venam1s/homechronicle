import { usePreference } from './usePreference.js';
import { PREF_LS_PREFIX } from '../lib/prefKeys.js';

/**
 * useAlertsNav — whether the navigation shows the Alerts link (default: shown).
 *
 * A per-viewer choice, not a household switch: hiding the link stops nothing.
 * Alert rules keep running and the Alerts page stays reachable from the links
 * that point at it (MALERT-07 — alerts are enabled per rule, never per home).
 *
 * Persists through usePreference like the top-bar date: a signed-in user's
 * choice syncs to their account blob (key `showAlertsNav`); a signed-out
 * user's choice stays in this browser's localStorage. Stored as a JSON
 * boolean; anything that is not literally `false` counts as shown, so a
 * hand-edited key or a stale blob can only ever fail towards the default.
 *
 * The localStorage key carries the hc_pref_ prefix so the sign-out purge
 * removes it: one member hiding Alerts must not hide it for the next person
 * who signs in on the same browser.
 */

export const STORAGE_KEY = `${PREF_LS_PREFIX}showAlertsNav`;

export function useAlertsNav() {
  const [stored, setStored] = usePreference(
    'showAlertsNav',
    true,
    { localStorageKey: STORAGE_KEY, followOtherTabs: true },
  );

  return {
    showAlerts: stored !== false,
    setShowAlerts: (next) => setStored(next !== false),
  };
}
