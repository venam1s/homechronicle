import { useCallback, useEffect, useRef } from 'react';
import { useToast } from '../components/Toast.jsx';
import { createPatchQueue } from '../lib/patchQueue.js';

export function useSettingSaver(mutation, { toastsEnabled = true, onSaved } = {}) {
  const { addToast } = useToast();
  const latest = useRef({});
  latest.current = { mutation, toastsEnabled, onSaved, addToast };

  const queueRef = useRef(null);
  if (!queueRef.current) {
    // Toasts and onSaved fire once per send, however many save() calls it carried.
    queueRef.current = createPatchQueue({
      send: async (patch) => {
        let result;
        try {
          result = await latest.current.mutation.mutateAsync(patch);
        } catch (err) {
          latest.current.addToast('Failed to save setting', 'error');
          throw err;
        }
        const { onSaved: cb, toastsEnabled: enabled, addToast: toast } = latest.current;
        cb?.(result, patch);
        if (patch.toastsEnabled ?? enabled) toast('Setting saved', 'success');
        return result;
      },
    });
  }

  // Never dispose: a pending change must still be saved after unmount, and the
  // queue must survive StrictMode's simulated cleanup/setup cycle.
  useEffect(() => {
    const queue = queueRef.current;
    return () => queue.flush();
  }, []);

  return useCallback((patch) => queueRef.current.push(patch), []);
}
