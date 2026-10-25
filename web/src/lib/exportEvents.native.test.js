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

  it('hands the URL to the browser instead of buffering it in the page', async () => {
    expect(apiIsSameOrigin()).toBe(true);
    const result = await downloadEventsExport({ room: 'Kitchen', accessory: '' }, 'csv');
    expect(result).toEqual({ native: true });
    expect(global.fetch).not.toHaveBeenCalled();
    expect(clicked).toEqual([{ href: buildExportUrl({ room: 'Kitchen' }, 'csv'), download: true, attached: true }]);
    expect(clicked[0].href).toBe('/api/events/export?format=csv&room=Kitchen');
    expect(document.querySelector('a[download]')).toBeNull();
  });
});

describe('apiIsSameOrigin', () => {
  it('is false for an API on another origin', () => {
    expect(apiIsSameOrigin('http://localhost:3001/api')).toBe(false);
  });
});
