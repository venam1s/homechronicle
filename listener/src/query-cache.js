/**
 * query-cache.js — lightweight in-memory TTL cache for expensive read queries.
 *
 * Each entry stores the resolved value and an expiry timestamp.
 * Stale entries are served while a background refresh runs (stale-while-revalidate).
 */

import { log } from './logger.js';

const store = new Map();

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

  if (entry && now < entry.expiresAt) {
    return entry.value;
  }

  // Stale-while-revalidate: return stale data immediately, refresh in background
  if (entry && !entry.refreshing) {
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

  // No cached value at all — must wait for the query
  const value = await queryFn();
  store.set(key, { value, expiresAt: now + ttlMs, refreshing: false });
  return value;
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
