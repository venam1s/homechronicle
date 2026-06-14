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
 */

import { useEffect, useRef, useState } from 'react';
import { useAuth } from './useAuth.js';
import { useUserPreferences } from './useUserPreferences.js';

/** Default codec: JSON round-trip. */
const defaultSerialize = JSON.stringify;
const defaultDeserialize = JSON.parse;

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

  // Seeding guard — fires exactly once per hook instance when the blob is empty.
  const seedFiredRef = useRef(false);

  // SEEDING (PREF-11/D-14):
  // When authenticated and the server blob is empty, fire ONE setPrefsBlob call with the
  // current localStorage value for this key (per-key snapshot). Ref-guarded.
  useEffect(() => {
    if (!user) return;
    if (seedFiredRef.current) return;
    if (!prefs || typeof prefs !== 'object') return;
    if (Object.keys(prefs).length > 0) return;

    // Blob is empty — seed with the current local value.
    seedFiredRef.current = true;
    const localVal = readLocal(localStorageKey, deserialize);
    const seedVal = localVal !== null ? localVal : defaultValue;
    setPrefsBlob({ [key]: seedVal });
  }, [user, prefs]); // eslint-disable-line react-hooks/exhaustive-deps

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
    setValue_(newVal);
    writeLocal(localStorageKey, newVal, serialize);

    // Authed path: also update the server blob (debounced in useUserPreferences).
    if (user) {
      setPrefsBlob({ [key]: newVal });
    }
    // Anon path: localStorage only — zero server calls (D-15).
  }

  return [value, setValue];
}
