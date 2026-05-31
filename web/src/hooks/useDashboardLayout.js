import { useCallback, useEffect, useState } from 'react';
import {
  PANEL_IDS,
  defaultLayouts,
  defaultLayoutItem,
} from '../lib/dashboardPanels.js';

const LAYOUTS_KEY = 'hc_dashboard_layouts';
const HIDDEN_KEY = 'hc_dashboard_hidden';

const VALID_IDS = new Set(PANEL_IDS);

function readJson(key) {
  try {
    const raw = window.localStorage.getItem(key);
    return raw == null ? null : JSON.parse(raw);
  } catch {
    return null;
  }
}

function writeJson(key, value) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Ignore storage write failures (private mode, quota, blocked storage).
  }
}

// Reconcile a stored layout with the current panel registry:
//   - drop items for unknown ids (panels removed in a later release)
//   - add default geometry for registered panels missing from storage (panels
//     added in a later release, e.g. Quiet Hours) so upgrades don't silently
//     hide new panels
//   - ensure every breakpoint exists
// Returns a normalized {lg, sm} object.
function sanitizeLayouts(stored) {
  const base = defaultLayouts();
  if (!stored || typeof stored !== 'object') return base;
  const out = {};
  for (const bp of Object.keys(base)) {
    const arr = Array.isArray(stored[bp]) ? stored[bp] : base[bp];
    const cleaned = arr
      .filter((it) => it && typeof it.i === 'string' && VALID_IDS.has(it.i))
      .map((it) => ({
        i: it.i,
        x: Number(it.x) || 0,
        y: Number(it.y) || 0,
        w: Number(it.w) || 1,
        h: Number(it.h) || 1,
        ...(it.minW != null ? { minW: Number(it.minW) } : {}),
        ...(it.minH != null ? { minH: Number(it.minH) } : {}),
      }));
    if (cleaned.length === 0) {
      out[bp] = base[bp];
      continue;
    }
    const present = new Set(cleaned.map((it) => it.i));
    for (const id of PANEL_IDS) {
      if (!present.has(id)) {
        const seed = defaultLayoutItem(id, bp);
        if (seed) cleaned.push(seed);
      }
    }
    out[bp] = cleaned;
  }
  return out;
}

function sanitizeHidden(stored) {
  if (!Array.isArray(stored)) return [];
  return stored.filter((id) => typeof id === 'string' && VALID_IDS.has(id));
}

/**
 * Persistent, editable dashboard layout.
 *
 * Owns the full react-grid-layout `layouts` object (all panels, all
 * breakpoints) plus the set of hidden panel ids, and mirrors both to
 * localStorage. Hidden panels are kept in `layouts` so their geometry is
 * remembered across a hide/show cycle.
 */
export function useDashboardLayout() {
  const [layouts, setLayouts] = useState(() => sanitizeLayouts(readJson(LAYOUTS_KEY)));
  const [hidden, setHidden] = useState(() => new Set(sanitizeHidden(readJson(HIDDEN_KEY))));

  useEffect(() => { writeJson(LAYOUTS_KEY, layouts); }, [layouts]);
  useEffect(() => { writeJson(HIDDEN_KEY, [...hidden]); }, [hidden]);

  // Merge a breakpoint layout coming back from react-grid-layout. Two things
  // matter here:
  //   1. RGL only reports the *visible* items, so we splice them back over the
  //      stored full layout (hidden panels keep their geometry).
  //   2. RGL calls this on mount and on every internal sync. If we always
  //      returned a new object, the new `layouts` reference would flow back into
  //      RGL and could re-trigger onLayoutChange — an infinite render loop. So
  //      we only produce new state when an x/y/w/h actually changed, and return
  //      the previous reference otherwise.
  const applyLayoutChange = useCallback((_current, allLayouts) => {
    if (!allLayouts || typeof allLayouts !== 'object') return;
    setLayouts((prev) => {
      let anyChanged = false;
      const next = { ...prev };
      for (const bp of Object.keys(prev)) {
        const incoming = allLayouts[bp];
        if (!Array.isArray(incoming)) continue;
        const byId = new Map((prev[bp] ?? []).map((it) => [it.i, it]));
        let bpChanged = false;
        for (const it of incoming) {
          if (!VALID_IDS.has(it.i)) continue;
          const prevItem = byId.get(it.i);
          const merged = {
            i: it.i,
            x: Number(it.x) || 0,
            y: Number(it.y) || 0,
            w: Number(it.w) || 1,
            h: Number(it.h) || 1,
            // Prefer the authored min constraints; fall back to whatever RGL sent.
            ...(prevItem?.minW != null ? { minW: prevItem.minW }
              : it.minW != null ? { minW: Number(it.minW) } : {}),
            ...(prevItem?.minH != null ? { minH: prevItem.minH }
              : it.minH != null ? { minH: Number(it.minH) } : {}),
          };
          if (!prevItem || prevItem.x !== merged.x || prevItem.y !== merged.y
            || prevItem.w !== merged.w || prevItem.h !== merged.h) {
            bpChanged = true;
          }
          byId.set(it.i, merged);
        }
        if (bpChanged) {
          anyChanged = true;
          next[bp] = [...byId.values()];
        }
      }
      return anyChanged ? next : prev;
    });
  }, []);

  const hidePanel = useCallback((id) => {
    if (!VALID_IDS.has(id)) return;
    setHidden((prev) => {
      if (prev.has(id)) return prev;
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  }, []);

  const showPanel = useCallback((id) => {
    if (!VALID_IDS.has(id)) return;
    setHidden((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    // Guarantee the restored panel has geometry in every breakpoint.
    setLayouts((prev) => {
      const next = { ...prev };
      for (const bp of Object.keys(next)) {
        if (!next[bp].some((it) => it.i === id)) {
          const seed = defaultLayoutItem(id, bp);
          if (seed) next[bp] = [...next[bp], seed];
        }
      }
      return next;
    });
  }, []);

  const reset = useCallback(() => {
    setLayouts(defaultLayouts());
    setHidden(new Set());
  }, []);

  return {
    layouts,
    hidden,
    isHidden: useCallback((id) => hidden.has(id), [hidden]),
    applyLayoutChange,
    hidePanel,
    showPanel,
    reset,
  };
}
