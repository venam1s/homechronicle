import { useCallback, useEffect, useRef } from 'react';
import { useToast } from '../components/Toast.jsx';
import { createPatchQueue } from '../lib/patchQueue.js';

export function useSettingSaver(mutation, { toastsEnabled = true, onSaved } = {}) {
  const { addToast } = useToast();
  const latest = useRef({});
  latest.current = { mutation, toastsEnabled, onSaved, addToast };

  const queueRef = useRef(null);
  if (!queueRef.current) {
    queueRef.current = createPatchQueue({
      send: (patch) => latest.current.mutation.mutateAsync(patch),
    });
  }

  useEffect(() => {
    const queue = queueRef.current;
    return () => queue.dispose();
  }, []);

  return useCallback(async (patch) => {
    let result;
    try {
      result = await queueRef.current.push(patch);
    } catch (err) {
      latest.current.addToast('Failed to save setting', 'error');
      throw err;
    }
    const { onSaved: cb, toastsEnabled: enabled, addToast: toast } = latest.current;
    cb?.(result, patch);
    if (patch.toastsEnabled ?? enabled) toast('Setting saved', 'success');
    return result;
  }, []);
}
