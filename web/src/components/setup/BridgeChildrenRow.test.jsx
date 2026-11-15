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

// A split accessory can be kept together, and a kept one split again.
describe('BridgeChildrenRow keep together', () => {
  const outlets = [
    { childId: 'AA:BB:2:8', name: 'Holiday Outlet Tree', aid: 2, parentChildId: 'AA:BB:2', parentName: 'Holiday Outlet' },
    { childId: 'AA:BB:2:11', name: 'Holiday Outlet Garland', aid: 2, parentChildId: 'AA:BB:2', parentName: 'Holiday Outlet' },
    { childId: 'AA:BB:3', name: 'Lamp', aid: 3 },
  ];

  it('heads a split group once and offers to keep it together', async () => {
    fetchJson.mockResolvedValueOnce(outlets);
    renderRow({ canChangeSplit: true });
    expect(await screen.findByText('Holiday Outlet is logged as 2 separate devices')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Keep together' })).toHaveLength(1);

    fetchJson.mockResolvedValueOnce({ success: true, keepTogether: true });
    fireEvent.click(screen.getByRole('button', { name: 'Keep together' }));
    await vi.waitFor(() => expect(fetchJson).toHaveBeenCalledWith('/api/setup/keep-together', expect.objectContaining({
      method: 'PATCH',
      body: JSON.stringify({ accessoryId: 'AA:BB:2', keepTogether: true }),
    })));
  });

  it('offers to log a kept-together accessory separately', async () => {
    fetchJson.mockResolvedValueOnce([{ childId: 'AA:BB:2', name: 'Holiday Outlet', aid: 2, keepTogether: true, serviceCount: 2 }]);
    renderRow({ canChangeSplit: true });
    expect(await screen.findByText('2 services logged as one device')).toBeInTheDocument();

    fetchJson.mockResolvedValueOnce({ success: true, keepTogether: false });
    fireEvent.click(screen.getByRole('button', { name: 'Log separately' }));
    await vi.waitFor(() => expect(fetchJson).toHaveBeenCalledWith('/api/setup/keep-together', expect.objectContaining({
      body: JSON.stringify({ accessoryId: 'AA:BB:2', keepTogether: false }),
    })));
  });

  it('shows the state but no buttons to a member', async () => {
    fetchJson.mockResolvedValueOnce(outlets);
    renderRow();
    expect(await screen.findByText('Holiday Outlet is logged as 2 separate devices')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Keep together' })).not.toBeInTheDocument();
  });

  it('says so when the change fails', async () => {
    fetchJson.mockResolvedValueOnce(outlets);
    renderRow({ canChangeSplit: true });
    await screen.findByText('Holiday Outlet is logged as 2 separate devices');
    fetchJson.mockRejectedValueOnce(new Error('Forbidden'));
    fireEvent.click(screen.getByRole('button', { name: 'Keep together' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not change how this accessory is logged: Forbidden');
  });
});
