// HomeKit accessories can announce several addresses over mDNS — e.g. a
// Homebridge container on both a Docker bridge network and a macvlan. Which of
// them the listener can reach depends on where it runs (a Docker host can't
// reach its own macvlan containers), and the announcement order is not stable.
// These helpers keep every announced address, stick with one that works, and
// rotate to the next when a connection fails.

/** Every address a discovery result announces, de-duplicated, in announcement order. */
export function advertisedAddresses(service) {
  if (!service) return [];
  const list = [
    ...(Array.isArray(service.allAddresses) ? service.allAddresses : []),
    ...(Array.isArray(service.addresses) ? service.addresses : []),
    service.address,
  ];
  return [...new Set(list.filter((a) => typeof a === 'string' && a.trim()))];
}

/**
 * The address to try after `failed`: the next announced one, wrapping around,
 * so repeated failures cycle through every announced address. An address that
 * is no longer announced starts from the first one. Null when none are known.
 */
export function nextAddress(failed, addresses) {
  if (!addresses?.length) return null;
  const i = addresses.indexOf(failed);
  return addresses[(i + 1) % addresses.length];
}

/**
 * Merge a fresh discovery result into a stored pairing. The in-use address is
 * kept while it is still announced — the order of announcements is not a
 * reason to move a working connection — and replaced by the first announced
 * address only when it has disappeared.
 *
 * @returns {{ address: string, port: number, addresses: string[], changed: boolean }}
 */
export function reconcileAdvertisedAddress(pairing, seen) {
  const addresses = advertisedAddresses(seen);
  const address = addresses.includes(pairing?.address) ? pairing.address : (addresses[0] ?? pairing?.address);
  const port = seen?.port ?? pairing?.port;
  const previous = Array.isArray(pairing?.addresses) ? pairing.addresses : [];
  const changed = address !== pairing?.address
    || port !== pairing?.port
    || addresses.length !== previous.length
    || addresses.some((a, i) => a !== previous[i]);
  return { address, port, addresses, changed };
}

const CONNECTION_ERROR_RE = /ECONNREFUSED|ETIMEDOUT|ENOTFOUND|EHOSTUNREACH|ENETUNREACH|ECONNRESET/i;

/** True for errors that mean "could not talk to this address", including request timeouts. */
export function isConnectionError(err) {
  if (!err) return false;
  return CONNECTION_ERROR_RE.test(String(err.code ?? '')) || CONNECTION_ERROR_RE.test(err.message ?? String(err));
}

/**
 * Union of address lists, first-seen order. Discovery can report only part of
 * what an accessory announces (dnssd resolves a service on its first address
 * and reports the rest later as changes), so a failure path must add what it
 * sees to what it already knew rather than replace it.
 */
export function mergeAddresses(...lists) {
  return [...new Set(lists.flat().filter((a) => typeof a === 'string' && a.trim()))];
}

/** `addresses` with `current` (the one that last worked) moved to the front. */
export function withCurrentFirst(current, addresses) {
  return current ? mergeAddresses([current], addresses) : [...addresses];
}

/**
 * Run `attempt(address)` against each address in turn, moving on only when an
 * address can't be reached; any other error (wrong PIN, already paired) is the
 * answer. `onSkip(address, err, next)` is told about each failover.
 *
 * @returns {Promise<{ result: *, address: string }>}
 */
export async function tryEachAddress(addresses, attempt, onSkip = () => {}) {
  if (!addresses?.length) throw new Error('No address to connect to');
  for (const [i, address] of addresses.entries()) {
    try {
      // eslint-disable-next-line no-await-in-loop
      return { result: await attempt(address), address };
    } catch (err) {
      if (!isConnectionError(err) || i === addresses.length - 1) throw err;
      onSkip(address, err, addresses[i + 1]);
    }
  }
  throw new Error('unreachable');
}

/**
 * Close everything a hap-controller HttpClient has open, including a
 * pair-setup in progress, so a timed-out attempt can't carry on and complete
 * with keys nobody saved. Never throws.
 */
export function abortHapClient(client) {
  try {
    Promise.resolve(client?.close?.()).catch(() => {});
  } catch (_e) { /* ignore */ }
}

/**
 * Order in which to try addresses when (re)connecting or re-pairing: the one
 * that last worked first while it is still announced, then the other
 * announced ones, then previously known ones discovery didn't report this
 * time (it may have caught only part of the announcement). A last-worked
 * address that is no longer announced is likely stale, so it goes last.
 */
export function addressesToTry(current, announced, known = []) {
  const live = mergeAddresses(announced);
  const ordered = live.includes(current) ? withCurrentFirst(current, live) : live;
  return mergeAddresses(ordered, known, current ? [current] : []);
}
