/**
 * Race a promise against a timeout, guaranteeing the caller's await settles
 * even if the underlying operation never does (H-3: an accessory that
 * accepts a TCP connection but never answers a HAP request currently strands
 * the awaiting session — and the nightly repair scheduler — forever).
 *
 * @param {Promise} promise - the operation to bound
 * @param {number} ms - timeout in milliseconds; non-finite or <= 0 disables
 *   the timeout entirely (the original promise is returned unbounded)
 * @param {function(): void} [onTimeout] - optional cleanup invoked exactly
 *   once when the deadline wins (e.g. closing a stranded client). Errors
 *   thrown by onTimeout are swallowed — a failing cleanup must not mask the
 *   timeout rejection.
 * @param {string} [label='operation'] - name used in the timeout error message
 * @returns {Promise} resolves/rejects with the original promise's outcome,
 *   or rejects with an Error (code 'ETIMEDOUT') if the deadline wins first
 */
export function withTimeout(promise, ms, onTimeout, label = 'operation') {
  if (!Number.isFinite(ms) || ms <= 0) return Promise.resolve(promise);

  let timer;
  const timeoutPromise = new Promise((_resolve, reject) => {
    timer = setTimeout(() => {
      try {
        onTimeout?.();
      } catch (e) {
        // A failing cleanup must not mask the timeout rejection.
      }
      const err = new Error(`${label} timed out after ${ms}ms`);
      err.code = 'ETIMEDOUT';
      reject(err);
    }, ms);
  });

  return Promise.race([promise, timeoutPromise]).finally(() => clearTimeout(timer));
}

export function parseIntInRange(value, fallback, min, max) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

export function parentBridgeId(id) {
  const str = String(id ?? '');
  const parts = str.split(':');
  // HomeKit bridge child: "AA:BB:CC:DD:EE:FF:aid" → rejoin first 6 parts (MAC)
  if (parts.length > 6) return parts.slice(0, 6).join(':');
  // Matter endpoint: "nodeId:endpointId" → return nodeId
  if (parts.length === 2 && /^\d+$/.test(parts[0])) return parts[0];
  return str;
}

export function isLoopbackHostname(hostname) {
  const normalized = String(hostname ?? '').toLowerCase();
  return normalized === 'localhost'
    || normalized === '127.0.0.1'
    || normalized === '::1'
    || normalized.endsWith('.localhost');
}

export function extractBearerToken(headerValue) {
  const auth = String(headerValue ?? '').trim();
  if (!auth) return '';
  const spaceIndex = auth.indexOf(' ');
  if (spaceIndex <= 0) return '';
  const scheme = auth.slice(0, spaceIndex).toLowerCase();
  if (scheme !== 'bearer') return '';
  return auth.slice(spaceIndex + 1).trim();
}

/**
 * One CSV cell. Formula-triggering leading characters get a single-quote
 * prefix so a device name like "=HYPERLINK(...)" is not executed when the
 * export is opened in a spreadsheet (CSV injection). A plain number such as
 * a freezer's -18.5 cannot be a formula and is left alone, so spreadsheets
 * still read it as a number.
 */
export function csvCell(val) {
  if (val == null) return '';
  const str = val instanceof Date ? val.toISOString() : String(val);
  const isPlainNumber = /^[-+]?\d+(\.\d+)?$/.test(str);
  const safe = !isPlainNumber && /^[=+\-@\t\r]/.test(str) ? `'${str}` : str;
  return /[,"\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}
