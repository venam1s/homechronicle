import { API_BASE, withApiAuthHeaders } from './api.js';
import { saveBlob } from './download.js';

const FILTER_KEYS = ['room', 'accessory', 'characteristic', 'from', 'to'];

/** True when the API is served from this page's origin (production behind nginx). */
export function apiIsSameOrigin(apiBase = API_BASE) {
  try {
    return new URL(apiBase, window.location.href).origin === window.location.origin;
  } catch {
    return false;
  }
}

function filterParams(filters = {}, extra = {}) {
  const qs = new URLSearchParams(extra);
  for (const key of FILTER_KEYS) {
    const value = filters[key];
    if (value !== undefined && value !== null && value !== '') qs.set(key, String(value));
  }
  return qs.toString();
}

export function buildExportUrl(filters = {}, format = 'csv') {
  return `${API_BASE}/events/export?${filterParams(filters, { format })}`;
}

export function buildExportCheckUrl(filters = {}) {
  return `${API_BASE}/events/export/check?${filterParams(filters)}`;
}

function exportError(status) {
  if (status === 429) return new Error('Too many exports — try again in a minute');
  if (status === 401) return new Error('Your session has expired — sign in again to export');
  return new Error('Export failed');
}

function filenameFrom(res, format) {
  const match = /filename="([^"]+)"/.exec(res.headers.get('Content-Disposition') ?? '');
  return match?.[1] ?? `homechronicle-events.${format}`;
}

/**
 * Download the events matching the Timeline filters. Resolves with the row
 * counts the listener reports ({ total, rows, truncated }); rejects with a
 * user-facing message on a non-2xx response.
 *
 * Same origin (production): a plain link to the export URL, so the browser
 * streams the file straight to disk with the session cookie — no copy of a
 * possibly 500k-row file in page memory. A link reports nothing back, so a
 * check request first surfaces auth/rate-limit errors and the row counts.
 *
 * Cross origin (Vite dev, VITE_API_BASE_URL): a link can't carry the API token
 * header, so fetch it, buffer it and save the blob.
 */
export async function downloadEventsExport(filters, format) {
  if (apiIsSameOrigin()) {
    const check = await fetch(buildExportCheckUrl(filters), { credentials: 'include', headers: withApiAuthHeaders() });
    if (!check.ok) throw exportError(check.status);
    const counts = await check.json();

    const a = document.createElement('a');
    a.href = buildExportUrl(filters, format);
    a.download = '';
    a.style.display = 'none';
    document.body.appendChild(a);
    try {
      a.click();
    } finally {
      a.remove();
    }
    return { total: counts.total, rows: counts.rows, truncated: Boolean(counts.truncated) };
  }

  const res = await fetch(buildExportUrl(filters, format), {
    credentials: 'include',
    headers: withApiAuthHeaders(),
  });
  if (!res.ok) throw exportError(res.status);
  saveBlob(await res.blob(), filenameFrom(res, format));
  return {
    total: Number(res.headers.get('X-Export-Total') ?? 0),
    rows: Number(res.headers.get('X-Export-Rows') ?? 0),
    truncated: res.headers.get('X-Export-Truncated') === 'true',
  };
}
