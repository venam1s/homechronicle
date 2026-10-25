import { saveBlob } from './download.js';

describe('saveBlob', () => {
  let clicked;
  beforeEach(() => {
    vi.useFakeTimers();
    URL.createObjectURL = vi.fn(() => 'blob:test');
    URL.revokeObjectURL = vi.fn();
    clicked = [];
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function click() {
      clicked.push({ inDocument: document.body.contains(this), href: this.href, download: this.download });
    });
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('clicks an attached anchor, removes it, and revokes the URL only later', () => {
    saveBlob(new Blob(['x']), 'events.csv');
    expect(clicked).toEqual([{ inDocument: true, href: 'blob:test', download: 'events.csv' }]);
    expect(document.querySelector('a[download]')).toBeNull();
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();
    vi.advanceTimersByTime(60_000);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:test');
  });
});
