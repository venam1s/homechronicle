import { API_BASE, withApiAuthHeaders } from './api.js';
import { saveBlob } from './download.js';

const FILTER_KEYS = ['room', 'accessory', 'characteristic', 'from', 'to'];

// The listener's default EVENTS_MAX_EXPORT_ROWS; used to warn before a download
// that would be cut off. (An operator can change the server value.)
export const EXPORT_ROW_CAP = 500_000;

/** True when the API is served from this page's origin (production behind nginx). */
export function apiIsSameOrigin(apiBase = API_BASE) {
  try {
    return new URL(apiBase, window.location.href).origin === window.location.origin;
  } catch {
    return false;
  }
}

export function buildExportUrl(filters = {}, format = 'csv') {
  const qs = new URLSearchParams({ format });
  for (const key of FILTER_KEYS) {
    const value = filters[key];
    if (value !== undefined && value !== null && value !== '') qs.set(key, String(value));
  }
  return `${API_BASE}/events/export?${qs.toString()}`;
}

function filenameFrom(res, format) {
  const match = /filename="([^"]+)"/.exec(res.headers.get('Content-Disposition') ?? '');
  return match?.[1] ?? `homechronicle-events.${format}`;
}

/**
 * Download the events matching the Timeline filters.
 *
 * Same origin (production): a plain link to the export URL, so the browser
 * streams the file straight to disk with the session cookie — no copy of a
 * possibly 500k-row file in page memory. Resolves { native: true }; the
 * caller warns about the row cap beforehand from the Timeline's own count.
 *
 * Cross origin (Vite dev, VITE_API_BASE_URL): a link can't carry the API token
 * header, so fetch it, buffer it and save the blob. Resolves with the row
 * counts the listener reports; rejects on a non-2xx response.
 */
export async function downloadEventsExport(filters, format) {
  if (apiIsSameOrigin()) {
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
    return { native: true };
  }

  const res = await fetch(buildExportUrl(filters, format), {
    credentials: 'include',
    headers: withApiAuthHeaders(),
  });
  if (!res.ok) throw new Error(res.status === 429 ? 'Too many exports — try again in a minute' : 'Export failed');
  saveBlob(await res.blob(), filenameFrom(res, format));
  return {
    total: Number(res.headers.get('X-Export-Total') ?? 0),
    rows: Number(res.headers.get('X-Export-Rows') ?? 0),
    truncated: res.headers.get('X-Export-Truncated') === 'true',
  };
}
