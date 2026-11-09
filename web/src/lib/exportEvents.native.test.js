vi.mock('./api.js', () => ({ API_BASE: '/api', withApiAuthHeaders: (h = {}) => h }));

import { downloadEventsExport, apiIsSameOrigin, buildExportUrl } from './exportEvents.js';

describe('downloadEventsExport — same-origin API (production)', () => {
  let clicked;
  beforeEach(() => {
    global.fetch = vi.fn();
    clicked = [];
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function click() {
      clicked.push({ href: this.getAttribute('href'), download: this.hasAttribute('download'), attached: document.body.contains(this) });
    });
  });
  afterEach(() => vi.restoreAllMocks());

  it('checks the export, then hands the URL to the browser instead of buffering it in the page', async () => {
    global.fetch.mockResolvedValue({ ok: true, status: 200, json: async () => ({ total: 812345, rows: 500000, truncated: true }) });
    expect(apiIsSameOrigin()).toBe(true);
    const result = await downloadEventsExport({ room: 'Kitchen', accessory: '' }, 'csv');
    expect(result).toEqual({ total: 812345, rows: 500000, truncated: true });
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(global.fetch.mock.calls[0][0]).toBe('/api/events/export/check?room=Kitchen');
    expect(clicked).toEqual([{ href: buildExportUrl({ room: 'Kitchen' }, 'csv'), download: true, attached: true }]);
    expect(clicked[0].href).toBe('/api/events/export?format=csv&room=Kitchen');
    expect(document.querySelector('a[download]')).toBeNull();
  });

  it('adds unit=f to the check and download URLs when asked', async () => {
    global.fetch.mockResolvedValue({ ok: true, status: 200, json: async () => ({ total: 1, rows: 1, truncated: false }) });
    await downloadEventsExport({ room: 'Kitchen' }, 'csv', { unit: 'f' });
    expect(global.fetch.mock.calls[0][0]).toBe('/api/events/export/check?room=Kitchen&unit=f');
    expect(clicked[0].href).toBe('/api/events/export?format=csv&room=Kitchen&unit=f');
    expect(buildExportUrl({}, 'csv', 'c')).toBe('/api/events/export?format=csv');
  });

  it('reports an expired session instead of saving an error body as the file', async () => {
    global.fetch.mockResolvedValue({ ok: false, status: 401 });
    await expect(downloadEventsExport({}, 'csv')).rejects.toThrow(/session has expired/);
    expect(clicked).toEqual([]);
  });

  it('reports a rate limit', async () => {
    global.fetch.mockResolvedValue({ ok: false, status: 429 });
    await expect(downloadEventsExport({}, 'json')).rejects.toThrow(/Too many exports/);
    expect(clicked).toEqual([]);
  });
});

describe('apiIsSameOrigin', () => {
  it('is false for an API on another origin', () => {
    expect(apiIsSameOrigin('http://localhost:3001/api')).toBe(false);
  });
});
