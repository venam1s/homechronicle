import { describe, it, expect, vi } from 'vitest';
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
