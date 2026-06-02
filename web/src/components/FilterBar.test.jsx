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
