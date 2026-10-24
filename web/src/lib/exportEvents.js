import { API_BASE, withApiAuthHeaders } from './api.js';

const FILTER_KEYS = ['room', 'accessory', 'characteristic', 'from', 'to'];

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
 * Download the events matching the Timeline filters. Resolves with the row
 * counts the listener reports so the caller can say when the export was cut
 * off at the row cap; rejects on a non-2xx response.
 */
export async function downloadEventsExport(filters, format) {
  const res = await fetch(buildExportUrl(filters, format), {
    credentials: 'include',
    headers: withApiAuthHeaders(),
  });
  if (!res.ok) throw new Error(res.status === 429 ? 'Too many exports — try again in a minute' : 'Export failed');
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filenameFrom(res, format);
  a.click();
  URL.revokeObjectURL(url);
  return {
    total: Number(res.headers.get('X-Export-Total') ?? 0),
    rows: Number(res.headers.get('X-Export-Rows') ?? 0),
    truncated: res.headers.get('X-Export-Truncated') === 'true',
  };
}
