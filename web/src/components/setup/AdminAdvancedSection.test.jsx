import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '../Toast.jsx';
import AdminAdvancedSection from './AdminAdvancedSection.jsx';

vi.mock('../../lib/api.js', () => ({
  fetchJson: vi.fn().mockResolvedValue({}),
  API_BASE: '',
  withApiAuthHeaders: () => ({}),
}));

function makeSetup(overrides = {}) {
  return {
    logLevelConfig: { level: 'info' },
    saveLogLevelMutation: { mutateAsync: vi.fn().mockResolvedValue({}), isError: false, error: null },
    dbAccessories: [],
    deleteAccessoryMutation: { mutate: vi.fn(), isPending: false },
    paired: [],
    matterPairings: [],
    deletePairingMutation: { mutate: vi.fn(), isPending: false },
    deleteMatterPairingMutation: { mutate: vi.fn(), isPending: false },
    retentionConfig: { toastsEnabled: true },
    ...overrides,
  };
}

function renderSection(setup) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ToastProvider>
        <AdminAdvancedSection setup={setup} />
      </ToastProvider>
    </QueryClientProvider>
  );
}

describe('AdminAdvancedSection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the Log level select with the current value', () => {
    renderSection(makeSetup({ logLevelConfig: { level: 'debug' } }));
    expect(screen.getByText('Log level')).toBeInTheDocument();
    const select = screen.getByRole('combobox');
    expect(select.value).toBe('debug');
  });

  it('calls saveLogLevelMutation.mutateAsync with the chosen level string when changed', async () => {
    const saveLogLevelMutation = { mutateAsync: vi.fn().mockResolvedValue({}), isError: false, error: null };
    renderSection(makeSetup({ saveLogLevelMutation }));
    const select = screen.getByRole('combobox');
    await userEvent.selectOptions(select, 'warn');
    expect(saveLogLevelMutation.mutateAsync).toHaveBeenCalledWith('warn');
  });

  it('invalidates the log-level query when the save fails', async () => {
    const saveLogLevelMutation = { mutateAsync: vi.fn().mockRejectedValue(new Error('boom')), isError: false, error: null };
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const invalidateSpy = vi.spyOn(qc, 'invalidateQueries');
    render(
      <QueryClientProvider client={qc}>
        <ToastProvider>
          <AdminAdvancedSection setup={makeSetup({ saveLogLevelMutation })} />
        </ToastProvider>
      </QueryClientProvider>
    );
    const select = screen.getByRole('combobox');
    await userEvent.selectOptions(select, 'error');
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['setup', 'log-level'] });
  });

  it('shows Danger Zone heading and expands on click, revealing empty states', async () => {
    renderSection(makeSetup());
    expect(screen.getByText('Danger Zone')).toBeInTheDocument();
    // Collapsed by default — rows not present
    expect(screen.queryByText('No paired accessories.')).not.toBeInTheDocument();
    await userEvent.click(screen.getByText('Danger Zone'));
    expect(screen.getByText('No paired accessories.')).toBeInTheDocument();
    expect(screen.getByText('No accessory data in the database.')).toBeInTheDocument();
  });

  it('does not render the remove-all block when there are no pairings', async () => {
    renderSection(makeSetup());
    await userEvent.click(screen.getByText('Danger Zone'));
    expect(screen.queryByText(/Remove all pairings/)).not.toBeInTheDocument();
  });

  it('deletes a paired HomeKit accessory after expand + confirm', async () => {
    const deletePairingMutation = { mutate: vi.fn(), isPending: false };
    renderSection(makeSetup({
      paired: [{ id: 'acc-1', name: 'Living Room Lamp' }],
      deletePairingMutation,
    }));
    // Expand the Danger Zone first
    await userEvent.click(screen.getByText('Danger Zone'));
    // Walk up to the accessory row and click its trash button
    const row = screen.getByText('Living Room Lamp').closest('div[class*="px-4"]');
    const trashBtn = row.querySelector('button');
    await userEvent.click(trashBtn);
    await userEvent.click(screen.getByText('Yes, remove'));
    expect(deletePairingMutation.mutate).toHaveBeenCalledWith('acc-1', expect.anything());
  });
});
