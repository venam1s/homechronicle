/**
 * usePreference — single per-key preference abstraction.
 *
 * usePreference(key, defaultValue, { localStorageKey, serialize?, deserialize? })
 *   returns [value, setValue]
 *
 * Authenticated path (PREF-04/D-10):
 *   - value = serverBlob[key] (when present and type-valid) ?? localStorage ?? defaultValue
 *   - setValue writes to server blob via setPrefsBlob + mirrors to localStorage
 *
 * Anonymous path (PREF-05/D-15):
 *   - value = localStorage ?? defaultValue (zero server calls — byte-for-byte today's behavior)
 *   - setValue writes to localStorage only; never calls setPrefsBlob or fetchJson
 *
 * Seeding (PREF-11/D-14):
 *   - When authed and server blob is empty (Object.keys === 0), calls setPrefsBlob once
 *     with the local snapshot to populate the blob. Ref-guarded: never fires twice per
 *     hook instance. The caller's blob becoming non-empty is the durable cross-reload guard.
 *
 * Codecs:
 *   - Default: JSON.stringify / JSON.parse (round-trips numbers, booleans, arrays, objects)
 *   - Identity codecs (v => v): for raw-string keys (theme, accent, sidebar-collapsed)
 *     that store bare strings, not JSON values. Pass via { serialize: v => v, deserialize: v => v }.
 *
 * Resilience (D-18):
 *   - Malformed localStorage value (JSON.parse throws) falls back to defaultValue.
 *   - Malformed server blob value (wrong type vs defaultValue) falls back to defaultValue.
 *   - Unknown keys are not read by consumers; non-object blobs are ignored.
 *
 * First paint (D-16): useState initializer reads localStorage synchronously — no flash.
 *
 * Functional updaters (web L-1): setValue(prevValue => nextValue) is supported. The
 * updater is resolved against the latest RENDERED value (via a ref kept in sync every
 * render) before any side effect runs — never inside a setValue_(prev => ...) updater,
 * because React StrictMode double-invokes state updaters and a side effect (localStorage
 * write, blob PUT) must fire exactly once.
 */

import { useEffect, useRef, useState } from 'react';
import { useAuth } from './useAuth.js';
import { useUserPreferences } from './useUserPreferences.js';

/** Default codec: JSON round-trip. */
const defaultSerialize = JSON.stringify;
const defaultDeserialize = JSON.parse;

/**
 * Cross-instance sync registry (localStorageKey -> Set<setState>).
 *
 * The same preference key is mounted by several components at once — theme by
 * AppearanceProvider (the painter), Masthead, and AppearanceSection — and each
 * instance owns its own useState. Without an in-tab broadcast they only ever
 * reconverge through the server-blob echo, which does not exist on the anon
 * path and is best-effort on the authed one. Concretely: picking "System" in
 * Settings updated only the Settings instance, so once it unmounted the painter
 * still held the old explicit theme and OS scheme flips repainted nothing until
 * a full reload. setValue notifies every sibling instance of the same key.
 */
const instancesByKey = new Map();

function broadcast(localStorageKey, value, except) {
  const set = instancesByKey.get(localStorageKey);
  if (!set) return;
  for (const setState of set) {
    if (setState !== except) setState(value);
  }
}

/**
 * Read a value from localStorage using the provided deserialize function.
 * Returns null on any error (missing key, parse failure, storage unavailable).
 */
function readLocal(localStorageKey, deserialize) {
  try {
    const raw = window.localStorage.getItem(localStorageKey);
    if (raw == null) return null;
    return deserialize(raw);
  } catch {
    return null;
  }
}

/**
 * Write a value to localStorage using the provided serialize function.
 * Silently ignores write failures (private mode, quota, blocked storage).
 */
function writeLocal(localStorageKey, value, serialize) {
  try {
    window.localStorage.setItem(localStorageKey, serialize(value));
  } catch {
    // Ignore write failures (private mode, quota, blocked storage, test env stubs).
  }
}

export function usePreference(key, defaultValue, {
  localStorageKey,
  serialize = defaultSerialize,
  deserialize = defaultDeserialize,
} = {}) {
  const { user } = useAuth();
  const { prefs, setPrefsBlob } = useUserPreferences();

  // Synchronous first-paint value from localStorage (D-16).
  const [value, setValue_] = useState(() => {
    const local = readLocal(localStorageKey, deserialize);
    return local !== null ? local : defaultValue;
  });

  // web L-1: kept in sync every render so the setter can resolve a functional updater
  // against the latest rendered value without a stale closure.
  const valueRef = useRef(value);
  valueRef.current = value;

  // Register this instance for in-tab sibling broadcasts. setValue_ is stable
  // across renders (React guarantees setState identity), so the effect runs once
  // per mount and the cleanup cannot leak entries.
  useEffect(() => {
    if (!localStorageKey) return undefined;
    let set = instancesByKey.get(localStorageKey);
    if (!set) {
      set = new Set();
      instancesByKey.set(localStorageKey, set);
    }
    set.add(setValue_);
    return () => {
      set.delete(setValue_);
      if (set.size === 0) instancesByKey.delete(localStorageKey);
    };
  }, [localStorageKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // SEEDING NOTE (PREF-11/D-14): seeding is owned solely by UserPreferencesProvider's
  // seedIfEmpty (invoked once from App.jsx with the full localStorage snapshot + shared
  // toast/grouping values). The previous per-key seeding effect here was removed — having
  // both produced an uncoordinated race that could persist a partial blob and permanently
  // block the full seed (CR-01 second harm).

  // RECONCILIATION (D-10):
  // When the server blob resolves (or updates), reconcile the local state to the blob value.
  // Only accept the value when it is type-compatible with defaultValue (D-18 malformed guard).
  useEffect(() => {
    if (!user || !prefs || typeof prefs !== 'object') return;
    if (!(key in prefs)) return;

    const serverVal = prefs[key];

    // D-18 malformed guard: accept blob value only when it has the same JS type as defaultValue.
    // This prevents a number in the blob from being used for a string preference.
    if (typeof serverVal !== typeof defaultValue) return;

    // Reconcile state and write-through to localStorage.
    setValue_(serverVal);
    writeLocal(localStorageKey, serverVal, serialize);
  }, [prefs]); // eslint-disable-line react-hooks/exhaustive-deps

  // SETTER
  function setValue(newVal) {
    // web L-1: resolve a functional updater against the latest rendered value BEFORE any
    // side effect runs. Without this, a caller like setCollapsed(c => !c) would write the
    // function itself (String(fn) via the codec, or a raw function into the optimistic
    // cache) instead of the concrete boolean — the classic "String((c)=>!c)" bug.
    const resolved = typeof newVal === 'function' ? newVal(valueRef.current) : newVal;

    setValue_(resolved);
    writeLocal(localStorageKey, resolved, serialize);
    // Keep every other mounted instance of this key in agreement — the painter
    // (AppearanceProvider) must learn about a change made from Settings even on
    // the anon path, where no server-blob echo will ever reconcile it.
    broadcast(localStorageKey, resolved, setValue_);

    // Authed path: also update the server blob (debounced in useUserPreferences).
    if (user) {
      setPrefsBlob({ [key]: resolved });
    }
    // Anon path: localStorage only — zero server calls (D-15).
  }

  return [value, setValue];
}
