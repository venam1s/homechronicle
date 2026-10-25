import { render, screen, fireEvent } from '@testing-library/react';
import FilterBar from './FilterBar.jsx';

// FilterBar calls these hooks; give them stable shapes. heatmapData has one
// entry so the Activity-heatmap toggle is enabled (hasHeatmapData = true).
vi.mock('../hooks/useEvents.js', () => ({
  useAccessories: () => ({ data: [{ accessory_id: 'a1', room_name: 'Kitchen' }] }),
  useHeatmap: () => ({ data: [{ accessory_name: 'Lamp', hour: 10, count: 3 }], isLoading: false }),
}));

vi.mock('../hooks/useAccentRgb.js', () => ({
  useAccentRgb: () => [37, 99, 235],
}));

// Stub HeatmapGrid so the test doesn't depend on its internals.
vi.mock('./HeatmapGrid.jsx', () => ({
  default: () => <div data-testid="heatmap-grid" />,
}));

function setup(props = {}) {
  const onChange = vi.fn();
  const onToggle = vi.fn();
  const onHeatmapToggle = vi.fn();
  const utils = render(
    <FilterBar
      filters={props.filters ?? {}}
      onChange={onChange}
      open={props.open ?? false}
      onToggle={onToggle}
      heatmapOpen={props.heatmapOpen ?? false}
      onHeatmapToggle={onHeatmapToggle}
      onHoverCell={() => {}}
      onHoverEnd={() => {}}
      onClickCell={() => {}}
      lockedCell={null}
    />,
  );
  return { onChange, onToggle, onHeatmapToggle, ...utils };
}

describe('FilterBar', () => {
  it('renders the Search & filters and Activity heatmap toggles', () => {
    setup();
    expect(screen.getByText('Search & filters')).toBeInTheDocument();
    expect(screen.getByText('Activity heatmap')).toBeInTheDocument();
  });

  it('does not render an edge-to-edge white wrapper bar', () => {
    const { container } = setup();
    // The removed strip was <div className="bg-hc-panel border-b border-hc-panel-border">.
    expect(container.querySelector('.border-b.border-hc-panel-border')).toBeNull();
  });

  it('calls onToggle when Search & filters is clicked', () => {
    const { onToggle } = setup();
    fireEvent.click(screen.getByText('Search & filters'));
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it('calls onHeatmapToggle when Activity heatmap is clicked', () => {
    const { onHeatmapToggle } = setup();
    fireEvent.click(screen.getByText('Activity heatmap'));
    expect(onHeatmapToggle).toHaveBeenCalledTimes(1);
  });

  it('shows the active-filter indicator only when filters are set', () => {
    const empty = setup({ filters: {} });
    expect(screen.queryByText(/active/)).toBeNull();
    empty.unmount();

    setup({ filters: { room: 'Kitchen' } });
    expect(screen.getByText('1 active')).toBeInTheDocument();
  });

  it('renders the filter inputs when open and calls onChange on search input', () => {
    const { onChange } = setup({ open: true });
    const input = screen.getByPlaceholderText('Search accessory…');
    expect(input).toBeInTheDocument();
    fireEvent.change(input, { target: { value: 'lamp' } });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ accessory: 'lamp' }));
  });

  it('renders the heatmap panel when heatmapOpen', () => {
    setup({ heatmapOpen: true });
    expect(screen.getByTestId('heatmap-grid')).toBeInTheDocument();
  });
});

describe('FilterBar export', () => {
  let originalFetch;
  let originalCreate;
  let originalRevoke;
  beforeEach(() => {
    originalFetch = global.fetch;
    originalCreate = URL.createObjectURL;
    originalRevoke = URL.revokeObjectURL;
    URL.createObjectURL = vi.fn(() => 'blob:x');
    URL.revokeObjectURL = vi.fn();
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  });
  afterEach(() => {
    global.fetch = originalFetch;
    URL.createObjectURL = originalCreate;
    URL.revokeObjectURL = originalRevoke;
    vi.restoreAllMocks();
  });

  function mockExportResponse({ ok = true, status = 200, headers = {} } = {}) {
    global.fetch = vi.fn(async () => ({
      ok,
      status,
      headers: new Headers({ 'Content-Disposition': 'attachment; filename="homechronicle-events-20261024-1300.csv"', ...headers }),
      blob: async () => new Blob(['id\n']),
    }));
  }

  it('exports with the current filters and the chosen format', async () => {
    mockExportResponse({ headers: { 'X-Export-Total': '3', 'X-Export-Rows': '3' } });
    setup({ open: true, filters: { room: 'Kitchen', accessory: '', characteristic: 'On' } });
    fireEvent.click(screen.getByRole('button', { name: 'Export matching events as CSV' }));

    await vi.waitFor(() => expect(HTMLAnchorElement.prototype.click).toHaveBeenCalled());
    const [url, opts] = global.fetch.mock.calls[0];
    const parsed = new URL(url, 'http://x');
    expect(parsed.pathname).toMatch(/\/events\/export$/);
    expect(Object.fromEntries(parsed.searchParams)).toEqual({ format: 'csv', room: 'Kitchen', characteristic: 'On' });
    expect(opts.credentials).toBe('include');
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('says when the export was cut off at the row cap', async () => {
    mockExportResponse({ headers: { 'X-Export-Total': '900000', 'X-Export-Rows': '500000', 'X-Export-Truncated': 'true' } });
    setup({ open: true });
    fireEvent.click(screen.getByRole('button', { name: 'Export matching events as JSON' }));
    expect(await screen.findByRole('status')).toHaveTextContent(/oldest 500,000 of 900,000 events/);
  });

  it('shows an error when the export fails', async () => {
    mockExportResponse({ ok: false, status: 500 });
    setup({ open: true });
    fireEvent.click(screen.getByRole('button', { name: 'Export matching events as CSV' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Export failed');
  });
});

describe('FilterBar export — same-origin download warns from the match count', () => {
  afterEach(() => vi.restoreAllMocks());

  it('warns before a download that would hit the row cap', async () => {
    const mod = await import('../lib/exportEvents.js');
    vi.spyOn(mod, 'downloadEventsExport').mockResolvedValue({ native: true });
    render(
      <FilterBar
        filters={{}}
        onChange={() => {}}
        open
        onToggle={() => {}}
        heatmapOpen={false}
        onHeatmapToggle={() => {}}
        onHoverCell={() => {}}
        onHoverEnd={() => {}}
        onClickCell={() => {}}
        lockedCell={null}
        matchCount={812345}
        matchCountEstimated
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Export matching events as CSV' }));
    expect(await screen.findByRole('status')).toHaveTextContent(/oldest 500,000 of about 812,345 events/);
  });
});
