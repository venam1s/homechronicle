/**
 * UserPreferencesProvider — the SINGLE shared owner of the per-user preference blob.
 *
 * Why a provider (CR-01 fix): the debounce buffer, the timer, the pending-PUT resolvers,
 * and the once-only seed guard MUST be shared across every preference key. When each
 * usePreference() instance owned its own debounce refs, a synced change cascading across
 * N consumers fired N independent whole-blob last-writer-wins PUTs racing on unordered
 * connections — the PUT that arrived last (carrying the fewest keys) won, silently dropping
 * the others' values cross-device. With one provider there is ONE buffer → ONE coalesced
 * PUT containing every key set during the window → no racing PUTs, no dropped keys.
 *
 * Exposes via context: { prefs, isLoading, setPrefsBlob, seedIfEmpty }.
 *
 * Query key: ['me', 'preferences'] — distinct from ['auth', 'me'] (D-09 collision guard).
 * Enabled: !!user?.id — automatically disabled when logged out or AUTH_ENABLED=false.
 * Debounce interval: 500ms — multi-key writes within the window coalesce into ONE PUT.
 *
 * The context default (used when no provider is mounted — e.g. anon shells, unit tests that
 * render a consumer without the provider) is a safe no-op: an empty blob and no-op writers,
 * so consumers degrade to their pure-localStorage anon path (PREF-05/D-15) with zero server calls.
 */

import { createContext, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchJson, API_BASE, withApiAuthHeaders } from '../lib/api.js';
import { useAuth } from '../hooks/useAuth.js';
import { D12_KEYS } from '../lib/prefKeys.js';

// Debounce interval for coalescing rapid setPrefsBlob calls into one PUT.
const DEBOUNCE_MS = 500;
// M-7: bounded wait for the ['me','preferences'] GET to settle before a flush is abandoned
// (no PUT dispatched). 10s / 500ms = 20 re-arm attempts (T-dfe-03).
const MAX_FLUSH_WAIT_MS = 10_000;
const MAX_FLUSH_WAITS = MAX_FLUSH_WAIT_MS / DEBOUNCE_MS;
// A PUT that fails on a transient error (502 during a listener restart, a network blip) is
// re-sent: each PUT carries only its own changed keys, so nothing later would carry them.
const MAX_PUT_RETRIES = 3;
const PUT_RETRY_BASE_MS = 2_000;
// The server rejected the request itself (too large, signed out, forbidden): retrying can't help.
const PERMANENT_PUT_FAILURES = new Set([400, 401, 403]);

// D12_KEYS now lives in ../lib/prefKeys.js (single source of truth, shared with useAuth.js's
// logout purge without creating an import cycle — see that module's header comment).

/** Read a value from localStorage using the correct codec. Returns undefined when absent. */
function readD12Key(lsKey, codec) {
  try {
    const raw = window.localStorage.getItem(lsKey);
    if (raw == null) return undefined;
    if (codec === 'raw') return raw;
    if (codec === 'bool') return raw === 'true';
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

/** Build the full D-12 snapshot object from localStorage. */
function buildLocalSnapshot() {
  const snapshot = {};
  for (const { lsKey, blobKey, codec } of D12_KEYS) {
    const val = readD12Key(lsKey, codec);
    if (val !== undefined) {
      snapshot[blobKey] = val;
    }
  }
  return snapshot;
}

// Safe no-op context value — used when no provider is mounted (anon shells / unit tests).
const NO_PROVIDER_DEFAULT = {
  prefs: {},
  isLoading: false,
  setPrefsBlob: () => Promise.resolve(),
  patchCache: () => {},
  seedIfEmpty: () => {},
  // Outside the provider (anonymous pages, tests) there is nothing buffered to
  // write, so a flush is a no-op that still resolves — callers can always await it.
  flushNow: () => Promise.resolve(),
};

export const UserPreferencesContext = createContext(NO_PROVIDER_DEFAULT);

export function UserPreferencesProvider({ children }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // SHARED debounce state — one buffer, one timer, one resolver list for ALL keys (CR-01).
  const pendingPartialRef = useRef({});
  const debounceTimerRef = useRef(null);
  const pendingResolversRef = useRef([]);

  // SHARED once-only seeding guard — survives re-renders; one seed per app session.
  const seedFiredRef = useRef(false);

  // PUT serialization: chain flushes so the server applies them in dispatch order — two
  // writes of the same key must land newest-last.
  const inFlightRef = useRef(Promise.resolve());
  // Monotonic flush sequence — guards the cache echo so a slow earlier PUT cannot clobber a
  // newer flush's value.
  const flushSeqRef = useRef(0);

  // M-7 flush gate bookkeeping: how many times the current flush has been re-armed while
  // waiting for the GET to settle, and whether we've already kicked a one-shot refetch for
  // this provider instance after seeing the query land in 'error'.
  const flushWaitsRef = useRef(0);
  const refetchKickedRef = useRef(false);
  // Consecutive failed PUTs, for the retry cap. Reset by any successful PUT.
  const putFailuresRef = useRef(0);

  const { data: prefs, isLoading } = useQuery({
    queryKey: ['me', 'preferences'],
    // Self-contained queryFn — unwraps { prefs: {...} } envelope (D-09).
    queryFn: () =>
      fetchJson(`${API_BASE}/me/preferences`).then((d) => d?.prefs ?? {}),
    enabled: !!user?.id,
    staleTime: 60_000,
    retry: false,
  });

  const putMutation = useMutation({
    mutationFn: (blob) =>
      fetchJson(`${API_BASE}/me/preferences`, {
        method: 'PUT',
        body: JSON.stringify({ prefs: blob }),
      }),
    // Cache reconciliation is done in the serialized flush below (sequence-guarded), NOT here —
    // an unguarded onSuccess lets a stale out-of-order echo overwrite a newer value.
  });

  // Clear any pending debounce on unmount (e.g. logout/route change) so a trailing PUT is not
  // fired against an unauthenticated session after the provider is gone.
  useEffect(() => () => {
    if (debounceTimerRef.current != null) clearTimeout(debounceTimerRef.current);
  }, []);

  // Buffered writes belong to the account that made them. The provider sits above the router
  // and does not unmount on sign-out, so when the user changes, drop whatever is still buffered
  // (e.g. a failed PUT waiting for its retry) — otherwise it would be sent under the next
  // session and land in someone else's account.
  const userIdRef = useRef(user?.id);
  userIdRef.current = user?.id;
  const ownerIdRef = useRef(user?.id);
  useEffect(() => {
    if (ownerIdRef.current === user?.id) return;
    ownerIdRef.current = user?.id;
    if (debounceTimerRef.current != null) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = null;
    pendingPartialRef.current = {};
    putFailuresRef.current = 0;
    flushWaitsRef.current = 0;
    flushSeqRef.current += 1; // ignore replies to PUTs from the previous session
    pendingResolversRef.current.splice(0).forEach(({ resolve }) => resolve());
  }, [user?.id]);

  /**
   * setPrefsBlob(partial) — debounced PUT of the changed keys against the SHARED buffer.
   *
   * Accumulates partial into the single shared buffer. On flush (500ms after the last call
   * across ALL keys), fires ONE PUT carrying every buffered key — and ONLY those keys. The
   * server shallow-merges (`prefs || new`), so a partial is all it needs. Sending this tab's
   * cached blob as well used to push stale values back: a tab loaded while the theme was
   * 'dark' re-sent 'dark' with every unrelated save, undoing a 'system' chosen in another tab
   * or on another device. Because the buffer is shared, concurrent writes from different
   * preference keys/instances are merged — never raced into separate PUTs (CR-01).
   *
   * Returns a promise that resolves after the debounced PUT completes.
   */
  /**
   * flushPending — the debounce callback. Named (not inline) so the M-7 gate can re-arm it
   * via setTimeout(flushPending, DEBOUNCE_MS) without duplicating the flush body.
   */
  function flushPending() {
    debounceTimerRef.current = null;

    // M-7 GATE: never flush while the authenticated ['me','preferences'] GET is still
    // pending or has errored. The PUT body no longer comes from the cache, but the cache
    // update below does: a GET that resolved after this write would put the pre-write
    // account values back into the cache, and every usePreference would reconcile to them. Scoped to user?.id deliberately: with no user the query is permanently
    // disabled (status stays 'pending' forever), and gating on that would re-arm forever;
    // without a user, usePreference never calls setPrefsBlob anyway (D-15 anon path), so
    // today's behaviour is unchanged for that path.
    const status = queryClient.getQueryState(['me', 'preferences'])?.status;
    if (user?.id && status !== 'success') {
      // One-shot recovery: a GET that failed under retry:false (e.g. a transient 502) gets
      // exactly one refetch kick instead of burning the whole wait budget doing nothing.
      if (status === 'error' && !refetchKickedRef.current) {
        refetchKickedRef.current = true;
        queryClient.refetchQueries({ queryKey: ['me', 'preferences'] });
      }

      if (flushWaitsRef.current < MAX_FLUSH_WAITS) {
        flushWaitsRef.current += 1;
        // Re-arm WITHOUT touching pendingPartialRef/pendingResolversRef/flushSeqRef — the
        // buffered partial and its resolvers must survive every re-arm so the eventual PUT
        // (once the GET resolves) carries both the fetched keys and everything buffered
        // while waiting.
        debounceTimerRef.current = setTimeout(flushPending, DEBOUNCE_MS);
        return;
      }

      // Budget exhausted: abandon this flush WITHOUT dispatching a PUT. A truncated PUT is
      // worse than a deferred one — the Part-B server-side merge is the belt-and-braces that
      // makes even this pathological (permanently-failing GET) case non-destructive. Leave
      // pendingPartialRef intact so a later setPrefsBlob call coalesces and retries it; drain
      // and resolve pendingResolversRef so no caller's fire-and-forget promise hangs.
      flushWaitsRef.current = 0;
      const strandedResolvers = pendingResolversRef.current.splice(0);
      strandedResolvers.forEach(({ resolve }) => resolve());
      return;
    }

    // Normal (non-gated) flush — reset the wait counter for the next gated window.
    flushWaitsRef.current = 0;

    const mySeq = ++flushSeqRef.current;
    const flushOwner = user?.id;
    const partial = pendingPartialRef.current;
    const latestCache = queryClient.getQueryData(['me', 'preferences']) ?? {};
    const merged = { ...latestCache, ...partial };

    pendingPartialRef.current = {};
    const resolvers = pendingResolversRef.current.splice(0);

    // Optimistically update the cache before the PUT.
    queryClient.setQueryData(['me', 'preferences'], merged);

    // Serialize: chain after any in-flight PUT so the server applies the partials in dispatch
    // order (CR-01 across-window).
    inFlightRef.current = inFlightRef.current
      .catch(() => {})
      .then(async () => {
        try {
          const data = await putMutation.mutateAsync(partial);
          putFailuresRef.current = 0;
          // The reply is the server's whole merged blob, so a stale tab also picks up what
          // other tabs and devices saved. Adopt it only if no newer flush (or a value adopted
          // from another tab, see patchCache) has superseded this one — prevents a slow
          // earlier PUT's response from clobbering a fresher value.
          if (mySeq === flushSeqRef.current) {
            queryClient.setQueryData(['me', 'preferences'], data?.prefs ?? merged);
          }
        } catch (err) {
          // Never reject — callers are fire-and-forget, and an unawaited rejection would be an
          // unhandledrejection. A transient failure puts the keys back underneath anything set
          // since and tries again: nothing else will ever send them, and the next GET would
          // otherwise reconcile the old server value back over them.
          if (userIdRef.current === flushOwner
            && !PERMANENT_PUT_FAILURES.has(err?.status) && putFailuresRef.current < MAX_PUT_RETRIES) {
            putFailuresRef.current += 1;
            pendingPartialRef.current = { ...partial, ...pendingPartialRef.current };
            if (debounceTimerRef.current == null) {
              debounceTimerRef.current = setTimeout(flushPending, PUT_RETRY_BASE_MS * putFailuresRef.current);
            }
          } else {
            putFailuresRef.current = 0;
          }
        } finally {
          resolvers.forEach(({ resolve }) => resolve());
        }
      });
  }

  function setPrefsBlob(partial) {
    Object.assign(pendingPartialRef.current, partial);

    if (debounceTimerRef.current != null) {
      clearTimeout(debounceTimerRef.current);
    }

    // Returned promise always RESOLVES (never rejects) — callers are fire-and-forget; a
    // rejecting promise nobody awaits becomes an unhandledrejection (e.g. PUT 401 after logout).
    const promise = new Promise((resolve) => {
      pendingResolversRef.current.push({ resolve });
    });

    debounceTimerRef.current = setTimeout(flushPending, DEBOUNCE_MS);

    return promise;
  }

  /**
   * patchCache(partial) — adopt values another tab already saved, without a PUT.
   *
   * usePreference calls this when a 'storage' event brings a value from another tab. Its own
   * state is not enough: this tab's cached account blob would still hold the old value, and
   * the next optimistic merge, flushOnHide or newly mounted usePreference would reconcile
   * every consumer back to it — and write it to localStorage, flipping the other tab too.
   * Bumping the flush sequence also stops an in-flight PUT's reply (which may predate the
   * other tab's save) from overwriting the patched value.
   */
  function patchCache(partial) {
    const current = queryClient.getQueryData(['me', 'preferences']);
    if (!current || typeof current !== 'object') return; // not loaded: the GET brings server truth
    flushSeqRef.current += 1;
    queryClient.setQueryData(['me', 'preferences'], { ...current, ...partial });
  }

  /**
   * seedIfEmpty(sharedSeedValues) — the SOLE once-only seeding path (PREF-11/D-14).
   *
   * When the authenticated query has resolved to an empty blob, assembles the full D-12
   * localStorage snapshot (per-key codecs) merged with sharedSeedValues (retention
   * toast/grouping) and PUTs exactly once. Ref-guarded; never re-runs. With a single
   * shared seedFiredRef there is no seeding race (CR-01 second harm) — the per-key seeding
   * effect that previously lived in usePreference has been removed.
   */
  function seedIfEmpty(sharedSeedValues = {}) {
    if (seedFiredRef.current) return;
    if (!prefs || typeof prefs !== 'object') return;
    if (Object.keys(prefs).length > 0) return;

    seedFiredRef.current = true;

    const snapshot = buildLocalSnapshot();
    const seedBlob = { ...snapshot, ...sharedSeedValues };

    setPrefsBlob(seedBlob);
  }

  /**
   * flushOnHide — last-chance write when the page is going away.
   *
   * flushNow() is useless here: nothing can be awaited once the page is being
   * torn down, and a normal fetch is cancelled with the document. So this is a
   * separate path that hands the request to the browser with `keepalive: true`,
   * which keeps it in flight after the page is gone.
   *
   * It sends ONLY the un-written partial, not the merged blob. The server-side
   * update is a shallow `jsonb ||` merge, so a partial is sufficient — and it
   * means this path needs no "has the GET settled?" gate (there is no cache to
   * read) and stays comfortably inside keepalive's 64 KB body cap.
   *
   * Best-effort by construction: nothing can observe the outcome, and the value
   * is already in localStorage regardless.
   */
  function flushOnHide() {
    if (debounceTimerRef.current == null) return;   // nothing buffered
    clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = null;

    const pending = pendingPartialRef.current;
    if (!user?.id || Object.keys(pending).length === 0) return;

    pendingPartialRef.current = {};
    const resolvers = pendingResolversRef.current.splice(0);

    // Keep the cache consistent with what we just sent.
    flushSeqRef.current += 1;
    queryClient.setQueryData(
      ['me', 'preferences'],
      { ...(queryClient.getQueryData(['me', 'preferences']) ?? {}), ...pending },
    );

    try {
      const csrfToken = typeof sessionStorage !== 'undefined'
        ? (sessionStorage.getItem('csrfToken') ?? '')
        : '';
      fetch(`${API_BASE}/me/preferences`, {
        method: 'PUT',
        credentials: 'include',
        keepalive: true,
        headers: withApiAuthHeaders({
          'Content-Type': 'application/json',
          ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}),
        }),
        body: JSON.stringify({ prefs: pending }),
      }).catch(() => {});
    } catch {
      // Unload is best-effort; localStorage already holds the value.
    }

    resolvers.forEach(({ resolve }) => resolve());
  }

  // Keep the listeners below bound to the CURRENT closure (user, cache) without
  // re-subscribing on every render.
  const flushOnHideRef = useRef(null);
  flushOnHideRef.current = flushOnHide;

  useEffect(() => {
    const onHide = () => flushOnHideRef.current?.();
    // Deliberately NOT 'beforeunload': it does not fire reliably when a mobile
    // tab is discarded, and registering it makes the page ineligible for the
    // back/forward cache. 'visibilitychange' -> hidden is the only signal that
    // is delivered in every "the user is done with this page" case; 'pagehide'
    // covers desktop close/navigate and bfcache entry.
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') onHide();
    };
    window.addEventListener('pagehide', onHide);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('pagehide', onHide);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  /**
   * flushNow — write any buffered preference edit immediately and wait for it.
   *
   * Preference writes are debounced by DEBOUNCE_MS, and the logout mutation only
   * DELETEs the session. So changing a palette or dragging a dashboard panel and
   * then signing out inside the debounce window killed the session before the PUT
   * landed, and the change was silently lost. Callers that are about to end the
   * session (or the page) await this first.
   *
   * Safe to call with nothing buffered: it resolves once any in-flight PUT settles.
   * Never rejects — a failed flush must not block the sign-out the user asked for.
   */
  async function flushNow() {
    try {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
        flushPending();
      }
      await inFlightRef.current;
    } catch {
      // A failed preference write is not a reason to keep someone signed in.
    }
  }

  const value = {
    prefs: prefs ?? (user?.id ? undefined : {}),
    isLoading,
    setPrefsBlob,
    patchCache,
    seedIfEmpty,
    flushNow,
  };

  return (
    <UserPreferencesContext.Provider value={value}>
      {children}
    </UserPreferencesContext.Provider>
  );
}
