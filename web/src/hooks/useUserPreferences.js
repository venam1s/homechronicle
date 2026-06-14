/**
 * useUserPreferences — consumer of the shared UserPreferencesContext.
 *
 * The server-blob query, the debounced merging PUT, and the once-only seeding all live in
 * UserPreferencesProvider (a SINGLE shared instance). This hook is a thin reader so that
 * every preference key shares one debounce buffer and one seed guard (CR-01 fix).
 *
 * Returns { prefs, isLoading, setPrefsBlob, seedIfEmpty }.
 * When no provider is mounted (anon shell / isolated unit test), the context default is a
 * safe no-op (empty blob, no-op writers) so consumers fall back to pure-localStorage.
 */

import { useContext } from 'react';
import { UserPreferencesContext } from '../components/UserPreferencesProvider.jsx';

export function useUserPreferences() {
  return useContext(UserPreferencesContext);
}
