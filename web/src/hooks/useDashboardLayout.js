import { useCallback, useEffect, useMemo, useRef } from 'react';
import {
  PANEL_IDS,
  OPTIONAL_PANEL_IDS,
  PANEL_BY_ID,
  defaultLayouts,
  defaultLayoutItem,
} from '../lib/dashboardPanels.js';
import { usePreference } from './usePreference.js';

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
      .map((it) => {
        // minW/minH/maxH always come from the CURRENT panel registry, never from
        // the stored blob. These are app-defined resize constraints, not user data
        // — a user can only ever change x/y/w/h by dragging. Trusting a stored
        // constraint value means a tightened minH/maxH in a later release never
        // reaches anyone who already has a saved layout (they keep round-tripping
        // the old, looser constraint through localStorage forever). Stored height
        // is still genuinely user data, so it's preserved, just re-clamped into
        // whatever the current [minH, maxH] window is.
        //
        // minH/maxH are read per-breakpoint (panel.smMinH/panel.smMaxH for
        // 'sm', falling back to panel.minH/panel.maxH) because a panel's two
        // breakpoints can need genuinely different windows — e.g. houseSummary
        // is pinned to [1,1] on desktop (so a legacy stale h:2 gets force-
        // corrected down with no manual resize) but needs [2,2] on mobile,
        // where the same content commonly wraps to two lines in a single
        // narrow column. A single shared minH/maxH can't satisfy both without
        // breaking one of them on the very next load: maxH is the only thing
        // that can pull a stored value DOWN (Math.min), minH the only thing
        // that can force one UP (Math.max) — a stale mobile h:1 persisted
        // while maxH:1 was shared across breakpoints needs its own smMinH to
        // ever recover.
        const panel = PANEL_BY_ID[it.i];
        const minH = (bp === 'sm' ? panel?.smMinH : null) ?? panel?.minH ?? 1;
        const maxH = (bp === 'sm' ? panel?.smMaxH : null) ?? panel?.maxH;
        const rawH = Number(it.h) || 1;
        const h = maxH != null ? Math.min(Math.max(rawH, minH), maxH) : Math.max(rawH, minH);
        return {
          i: it.i,
          x: Number(it.x) || 0,
          y: Number(it.y) || 0,
          w: Number(it.w) || 1,
          h,
          ...(panel?.minW != null ? { minW: panel.minW } : {}),
          minH,
          ...(maxH != null ? { maxH } : {}),
        };
      });
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
 * localStorage (and to the server blob when authenticated via usePreference).
 * Hidden panels are kept in `layouts` so their geometry is remembered across
 * a hide/show cycle.
 */
export function useDashboardLayout() {
  // Per-user preference layer for layouts. Use null default so sanitizeLayouts
  // can distinguish "nothing stored" (null) from a valid layout object — critical
  // for optional-panel seeding detection (D-15).
  const [storedLayouts, setStoredLayouts] = usePreference(
    'dashboardLayouts',
    null,
    { localStorageKey: LAYOUTS_KEY },
  );

  // Apply sanitizeLayouts to the raw stored value (may be null, corrupt, or valid).
  // useMemo provides referential stability: same storedLayouts ref → same layouts ref.
  // This preserves the RGL no-op guard (applyLayoutChange returns prev when nothing moved).
  const layouts = useMemo(() => sanitizeLayouts(storedLayouts), [storedLayouts]);

  // Per-user preference layer for hidden panels (stored as a serialized array).
  // Default [] for the case where localStorage has no entry (fresh install or cleared).
  // The first-seen seeding of optional panels runs in a one-time useEffect below (D-15).
  const [hiddenArr, setHiddenArr] = usePreference(
    'dashboardHidden',
    [],
    { localStorageKey: HIDDEN_KEY },
  );

  // Re-wrap the array as a Set for the API callers expect (hidden.has(id), hidden.size, etc.).
  const hidden = useMemo(
    () => new Set(Array.isArray(hiddenArr) ? sanitizeHidden(hiddenArr) : []),
    [hiddenArr],
  );

  // Mutable refs so callbacks always see the latest value without stale closures.
  // usePreference's setValue DOES support functional updaters now (web L-1), but this hook
  // deliberately keeps ref-based concrete values: these callbacks merge incoming RGL data
  // against a SANITIZED layout/hidden-list (sanitizeLayouts/sanitizeHidden), not raw prior
  // state, so a functional updater would need the same ref-read-and-sanitize work anyway.
  const storedLayoutsRef = useRef(storedLayouts);
  storedLayoutsRef.current = storedLayouts;
  const hiddenArrRef = useRef(hiddenArr);
  hiddenArrRef.current = hiddenArr;

  // First-seen seeding of optional panels (D-15 preservation).
  // Mirrors the original useState initializer logic: optional panels are hidden by
  // default for fresh installs and existing users whose stored layouts pre-date them.
  // Runs once per component instance (seedRef guard). Uses raw localStorage reads so
  // sanitizeLayouts output (which injects all registered panels) never falsely marks
  // new optional panels as "previously known" and defeats seeding.
  // Snapshot raw storage during the FIRST RENDER, not inside the effect below.
  //
  // react-grid-layout fires onLayoutChange from its own mount effect, and child
  // effects run before parent effects — so by the time a seeding effect ran, the
  // grid had already persisted a full 24-panel layout. Reading storage at that
  // point made every optional panel look "already known" and seeded nothing, so
  // a fresh install opened with all 24 panels instead of a curated 12. The state
  // it left behind (full layouts, no hidden key) is indistinguishable from a
  // legitimate existing user, so the read has to happen before the grid exists.
  // This hook renders before RGL mounts, which makes first render the only
  // correct moment to look.
  const initialRawRef = useRef(null);
  if (initialRawRef.current === null) {
    initialRawRef.current = {
      layouts: readJson(LAYOUTS_KEY),
      hidden: readJson(HIDDEN_KEY),
    };
  }

  const seedRef = useRef(false);
  useEffect(() => {
    if (seedRef.current) return;
    seedRef.current = true;

    const { layouts: rawLayouts, hidden: rawHidden } = initialRawRef.current;

    // Build the set of panel ids already known to this user (in their stored layout
    // or explicitly in their hidden list). An id in either place means it was seen before.
    const storedLgItems = Array.isArray(rawLayouts?.lg) ? rawLayouts.lg : [];
    const storedSmItems = Array.isArray(rawLayouts?.sm) ? rawLayouts.sm : [];
    const storedHiddenIds = Array.isArray(rawHidden) ? rawHidden : [];
    const knownIds = new Set([
      ...storedLgItems.map((it) => it?.i).filter(Boolean),
      ...storedSmItems.map((it) => it?.i).filter(Boolean),
      ...storedHiddenIds,
    ]);

    // Find optional panels not previously known to this user.
    const newToSeed = OPTIONAL_PANEL_IDS.filter((id) => !knownIds.has(id));
    if (newToSeed.length === 0) return;

    // Seed new optional panels into hidden using a concrete value read via ref. Functional
    // updaters ARE supported by usePreference.setValue now (web L-1); this stays ref-based
    // because the merge needs sanitizeHidden(prevArr), not the raw prior state.
    const currentHidden = hiddenArrRef.current;
    const prevArr = Array.isArray(currentHidden) ? currentHidden : [];
    const merged = [...new Set([...sanitizeHidden(prevArr), ...newToSeed])];
    setHiddenArr(merged);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Merge a breakpoint layout coming back from react-grid-layout. Two things
  // matter here:
  //   1. RGL only reports the *visible* items, so we splice them back over the
  //      stored full layout (hidden panels keep their geometry).
  //   2. RGL calls this on mount and on every internal sync. If we always
  //      returned a new object, the new `layouts` reference would flow back into
  //      RGL and could re-trigger onLayoutChange — an infinite render loop. So
  //      we only produce new state when an x/y/w/h actually changed, and return
  //      the previous reference otherwise (layouts memo ref stays stable).
  const applyLayoutChange = useCallback((_current, allLayouts) => {
    if (!allLayouts || typeof allLayouts !== 'object') return;

    // Read the latest stored value via ref (avoids stale closure; supports concurrent
    // renders without functional-updater support in usePreference.setValue).
    const prev = storedLayoutsRef.current;
    const prevLayouts = sanitizeLayouts(prev);

    let anyChanged = false;
    const next = { ...prevLayouts };
    for (const bp of Object.keys(prevLayouts)) {
      const incoming = allLayouts[bp];
      if (!Array.isArray(incoming)) continue;
      const byId = new Map((prevLayouts[bp] ?? []).map((it) => [it.i, it]));
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
          ...(prevItem?.maxH != null ? { maxH: prevItem.maxH }
            : it.maxH != null ? { maxH: Number(it.maxH) } : {}),
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
    // Only call the setter when something actually changed. Not calling the setter
    // means storedLayouts keeps its current ref → layouts memo ref stays stable →
    // no RGL feedback loop (D-15 guard). This replaces the functional-updater
    // "return prev" bail-out from the original implementation.
    if (!anyChanged) return;
    setStoredLayouts(next);
  }, [setStoredLayouts]);

  const hidePanel = useCallback((id) => {
    if (!VALID_IDS.has(id)) return;
    const currentArr = Array.isArray(hiddenArrRef.current) ? hiddenArrRef.current : [];
    if (currentArr.includes(id)) return;
    setHiddenArr([...currentArr, id]);
  }, [setHiddenArr]);

  const showPanel = useCallback((id) => {
    if (!VALID_IDS.has(id)) return;
    const currentArr = Array.isArray(hiddenArrRef.current) ? hiddenArrRef.current : [];
    if (!currentArr.includes(id)) return;
    setHiddenArr(currentArr.filter((x) => x !== id));

    // Guarantee the restored panel has geometry in every breakpoint.
    const currentStored = storedLayoutsRef.current;
    const prevLayouts = sanitizeLayouts(currentStored);
    const next = { ...prevLayouts };
    let changed = false;
    for (const bp of Object.keys(next)) {
      if (!next[bp].some((it) => it.i === id)) {
        const seed = defaultLayoutItem(id, bp);
        if (seed) {
          next[bp] = [...next[bp], seed];
          changed = true;
        }
      }
    }
    if (changed) setStoredLayouts(next);
  }, [setHiddenArr, setStoredLayouts]);

  const reset = useCallback(() => {
    setStoredLayouts(defaultLayouts());
    setHiddenArr([]);
  }, [setStoredLayouts, setHiddenArr]);

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
