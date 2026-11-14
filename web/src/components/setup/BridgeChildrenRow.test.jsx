import { describe, it, expect, vi } from 'vitest';
import { fetchJson } from '../../lib/api.js';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import BridgeChildrenRow from './BridgeChildrenRow.jsx';

vi.mock('../../lib/api.js', () => ({
  fetchJson: vi.fn(async () => [{ childId: 'AA:BB:2', name: 'PB01009G24410010060', aid: 2 }]),
}));

function renderRow(props = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <BridgeChildrenRow bridgeId="AA:BB" isExpanded roomInputs={{}} onRoomChange={() => {}} onRoomBlur={() => {}} {...props} />
    </QueryClientProvider>,
  );
}

describe('BridgeChildrenRow display names', () => {
  it('shows the reported name as the placeholder until a display name is set', async () => {
    renderRow();
    const input = await screen.findByLabelText('Display name for PB01009G24410010060');
    expect(input).toHaveAttribute('placeholder', 'PB01009G24410010060');
    expect(input).toHaveValue('');
  });

  it('shows the saved display name and saves edits by child id', async () => {
    const onDisplayNameChange = vi.fn();
    const onDisplayNameBlur = vi.fn();
    renderRow({ savedDisplayNames: { 'AA:BB:2': 'Neakasa' }, onDisplayNameChange, onDisplayNameBlur });
    const input = await screen.findByLabelText('Display name for PB01009G24410010060');
    expect(input).toHaveValue('Neakasa');

    fireEvent.change(input, { target: { value: 'Litter Box' } });
    expect(onDisplayNameChange).toHaveBeenCalledWith('AA:BB:2', 'Litter Box');
    fireEvent.blur(input);
    expect(onDisplayNameBlur).toHaveBeenCalledWith('AA:BB:2');
  });
});

// Issue #4: each outlet of a multi-outlet plug is its own child.
describe('BridgeChildrenRow split outlets', () => {
  const outlets = [
    { childId: 'AA:BB:2:8', name: 'Tree', aid: 2, parentChildId: 'AA:BB:2', parentName: 'Holiday Outlet' },
    { childId: 'AA:BB:2:11', name: 'Garland', aid: 2, parentChildId: 'AA:BB:2', parentName: 'Holiday Outlet' },
  ];

  it('names the plug each outlet is on and inherits the plug\'s room before the bridge\'s', async () => {
    fetchJson.mockResolvedValueOnce(outlets);
    renderRow({ savedRooms: { 'AA:BB:2': 'Front', 'AA:BB:2:11': 'Porch' }, bridgeRoom: 'Office' });
    await screen.findByLabelText('Display name for Tree');
    expect(screen.getAllByText('on Holiday Outlet')).toHaveLength(2);
    const rooms = screen.getAllByPlaceholderText(/Inherits:|Room…/);
    expect(rooms[0]).toHaveAttribute('placeholder', 'Inherits: Front');
    expect(rooms[0]).toHaveValue('');
    expect(rooms[1]).toHaveValue('Porch');
  });

  it('leaves out the plug hint when the outlet name already says it', async () => {
    fetchJson.mockResolvedValueOnce([
      { childId: 'AA:BB:2:8', name: 'Holiday Outlet Tree', aid: 2, parentChildId: 'AA:BB:2', parentName: 'Holiday Outlet' },
    ]);
    renderRow();
    await screen.findByLabelText('Display name for Holiday Outlet Tree');
    expect(screen.queryByText('on Holiday Outlet')).toBeNull();
  });
});
