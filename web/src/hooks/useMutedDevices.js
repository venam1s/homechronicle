import { useCallback, useMemo } from 'react';
import { usePreference } from './usePreference.js';

const STORAGE_KEY = 'hc_muted';

export function useMutedDevices() {
  const [mutedArr, setMutedArr] = usePreference('mutedDevices', [], { localStorageKey: STORAGE_KEY });

  // Wrap the stored array in a Set so callers retain the existing has/add/delete API.
  const muted = useMemo(() => new Set(mutedArr), [mutedArr]);

  const mute = useCallback((name) => {
    const next = new Set(muted);
    next.add(name);
    setMutedArr([...next]);
  }, [muted, setMutedArr]);

  const unmute = useCallback((name) => {
    const next = new Set(muted);
    next.delete(name);
    setMutedArr([...next]);
  }, [muted, setMutedArr]);

  const unmuteAll = useCallback(() => {
    // Empty array is equivalent to today's removeItem — the preference layer
    // writes [] to localStorage and (when authed) to the server blob.
    setMutedArr([]);
  }, [setMutedArr]);

  return { muted, mute, unmute, unmuteAll };
}
