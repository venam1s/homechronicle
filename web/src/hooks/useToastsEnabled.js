import { useAuth } from './useAuth.js';
import { usePreference } from './usePreference.js';

/**
 * Whether confirmation toasts are on for the current viewer.
 *
 * Signed in: the viewer's own preference (PREF-10), the same value App.jsx and
 * useToastPrefs use. Signed out: the household flag, on until it says otherwise.
 */
export function useToastsEnabled(setup) {
  const { user } = useAuth();
  const [ownToastsEnabled] = usePreference('toastsEnabled', true, { localStorageKey: 'hc_pref_toastsEnabled' });
  return user ? ownToastsEnabled : (setup?.retentionConfig?.toastsEnabled ?? true);
}
