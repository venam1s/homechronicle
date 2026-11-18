import { useCallback, useEffect, useRef, useState } from 'react';

// Optimistic value: shows the new value at once, reverts if the commit fails,
// and drops the override once the saved value changes.
export function useSetting(saved, commit) {
  const [override, setOverride] = useState({ active: false, value: undefined });
  const commitRef = useRef(commit);
  commitRef.current = commit;
  const latestChange = useRef(0);

  useEffect(() => {
    setOverride((o) => (o.active ? { active: false, value: undefined } : o));
  }, [saved]);

  const change = useCallback(async (next) => {
    const id = ++latestChange.current;
    setOverride({ active: true, value: next });
    try {
      return await commitRef.current(next);
    } catch (err) {
      // A newer change owns the override now; only the latest may revert it.
      if (id === latestChange.current) setOverride({ active: false, value: undefined });
      throw err;
    }
  }, []);

  return [override.active ? override.value : saved, change];
}
