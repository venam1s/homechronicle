/**
 * query-cache.js — lightweight in-memory TTL cache for expensive read queries.
 *
 * Each entry stores the resolved value and an expiry timestamp.
 * Stale entries are served while a background refresh runs (stale-while-revalidate).
 *
 * Cold-path protections (M-4):
 *   - In-flight dedup: concurrent callers on a cold miss share a single queryFn()
 *     invocation instead of each firing their own (thundering-herd prevention).
 *   - Negative caching: when queryFn() rejects, a short-lived error sentinel is
 *     stored so immediate retries return the same rejection without hammering the DB.
 */

import { log } from './logger.js';

const store = new Map();

// Separate map for in-flight Promises (keyed by cache key).
// Using a distinct map keeps the existing fresh/stale/refreshing logic untouched.
const inflight = new Map();

// Maximum time stale data can be served before forcing a synchronous refresh.
const MAX_STALE_MS = 5 * 60_000;

// How long a negative-cache sentinel is kept before another attempt is allowed.
const NEGATIVE_TTL_MS = 5_000;

/**
 * Get a cached value or execute the query function.
 *
 * @param {string} key         — unique cache key
 * @param {function} queryFn   — async function that returns the value to cache
 * @param {number} ttlMs       — time-to-live in milliseconds
 * @returns {Promise<any>}
 */
export async function cached(key, queryFn, ttlMs) {
  const entry = store.get(key);
  const now = Date.now();

  // Negative-cache sentinel: rethrow without calling queryFn again (M-4).
  if (entry && entry.negativeError && now < entry.expiresAt) {
    throw entry.negativeError;
  }

  if (entry && now < entry.expiresAt) {
    return entry.value;
  }

  // Stale-while-revalidate: return stale data immediately, refresh in background.
  // If data is too stale (background refreshes kept failing), fall through to
  // a synchronous refresh below.
  if (entry && !entry.refreshing && (now - entry.expiresAt) < MAX_STALE_MS) {
    entry.refreshing = true;
    queryFn()
      .then((value) => {
        store.set(key, { value, expiresAt: Date.now() + ttlMs, refreshing: false });
      })
      .catch((err) => {
        log.debug(`[cache] Background refresh failed for ${key}:`, err.message);
        entry.refreshing = false;
      });
    return entry.value;
  }

  // In-flight dedup: if a cold-miss query is already running for this key,
  // await its Promise instead of firing a second queryFn() (M-4).
  if (inflight.has(key)) {
    return inflight.get(key);
  }

  // No cached value, or data exceeded max staleness — must wait for the query.
  // Store the Promise immediately so concurrent callers share this one invocation.
  const promise = queryFn().then(
    (value) => {
      store.set(key, { value, expiresAt: Date.now() + ttlMs, refreshing: false });
      inflight.delete(key);
      return value;
    },
    (err) => {
      // Negative caching: store an error sentinel for NEGATIVE_TTL_MS so
      // immediate retries reject fast without hitting the DB (M-4).
      store.set(key, { negativeError: err, expiresAt: Date.now() + NEGATIVE_TTL_MS });
      inflight.delete(key);
      throw err;
    },
  );
  inflight.set(key, promise);
  return promise;
}

/**
 * Invalidate a specific cache key or all keys matching a prefix.
 */
export function invalidate(keyOrPrefix) {
  if (store.has(keyOrPrefix)) {
    store.delete(keyOrPrefix);
    return;
  }
  for (const key of store.keys()) {
    if (key.startsWith(keyOrPrefix)) store.delete(key);
  }
}
