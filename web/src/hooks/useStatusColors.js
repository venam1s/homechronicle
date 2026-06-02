import { useEffect, useState } from 'react';

// CSS variable names for status text colors (theme-aware, light + dark).
const VAR_SUCCESS = '--hc-success-text';
const VAR_WARNING = '--hc-warning-text';
const VAR_DANGER = '--hc-danger-text';

function readStatusColors() {
  if (typeof document === 'undefined') {
    return { success: '#15803d', warning: '#b45309', danger: '#b91c1c' };
  }
  const style = getComputedStyle(document.documentElement);
  return {
    success: style.getPropertyValue(VAR_SUCCESS).trim() || '#15803d',
    warning: style.getPropertyValue(VAR_WARNING).trim() || '#b45309',
    danger: style.getPropertyValue(VAR_DANGER).trim() || '#b91c1c',
  };
}

/**
 * Returns theme-reactive { success, warning, danger } color strings.
 * These are resolved from CSS vars so they update on light/dark toggle.
 * Use in Recharts <Cell fill={...}> where CSS vars cannot be used directly.
 */
export function useStatusColors() {
  const [colors, setColors] = useState(readStatusColors);

  useEffect(() => {
    const el = document.documentElement;
    const observer = new MutationObserver(() => {
      setColors(readStatusColors());
    });
    observer.observe(el, { attributes: true, attributeFilter: ['class', 'data-accent'] });
    // Read once on mount in case theme changed before observer attached.
    setColors(readStatusColors());
    return () => observer.disconnect();
  }, []);

  return colors;
}
