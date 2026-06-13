import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import ActiveSessionsPanel from './ActiveSessionsPanel.jsx';

vi.mock('../lib/api.js', () => ({
  API_BASE: 'http://localhost:3001/api',
  fetchJson: vi.fn(),
}));

import { fetchJson } from '../lib/api.js';

const NOW = Date.now();
const MOCK_SESSIONS = [
  {
    id: 1,
    user_agent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) Safari/605',
    ip_address: '10.0.0.1',
    created_at: new Date(NOW - 3600_000).toISOString(),
    last_seen_at: new Date(NOW - 60_000).toISOString(),
    expires_at: new Date(NOW + 86_400_000).toISOString(),
    current: true,
  },
  {
    id: 2,
    user_agent: 'Mozilla/5.0 (Windows NT 10.0) Chrome/120 Safari/537',
    ip_address: '10.0.0.2',
    created_at: new Date(NOW - 7200_000).toISOString(),
    last_seen_at: new Date(NOW - 120_000).toISOString(),
    expires_at: new Date(NOW + 86_400_000).toISOString(),
    current: false,
  },
  {
    id: 3,
    user_agent: 'Mozilla/5.0 (X11; Linux x86_64) Firefox/121',
    ip_address: '10.0.0.3',
    created_at: new Date(NOW - 10800_000).toISOString(),
    last_seen_at: new Date(NOW - 300_000).toISOString(),
    expires_at: new Date(NOW + 86_400_000).toISOString(),
    current: false,
  },
];

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity }, mutations: { retry: false } },
  });
  return function Wrapper({ children }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

function mockApi() {
  fetchJson.mockImplementation((url, opts) => {
    if (opts?.method === 'DELETE') return Promise.resolve({ ok: true });
    return Promise.resolve({ sessions: MOCK_SESSIONS });
  });
}

describe('ActiveSessionsPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApi();
  });

  it('marks the current session "This device" and renders no revoke button for it', async () => {
    render(<ActiveSessionsPanel />, { wrapper: makeWrapper() });

    expect(await screen.findByText('This device')).toBeInTheDocument();
    // The current row is Safari on macOS — it must NOT have a revoke control
    expect(screen.queryByRole('button', { name: /Revoke Safari on macOS session/i })).toBeNull();
  });

  it('renders an enabled revoke button for each non-current session', async () => {
    render(<ActiveSessionsPanel />, { wrapper: makeWrapper() });

    const chromeBtn = await screen.findByRole('button', { name: /Revoke Chrome on Windows session/i });
    const firefoxBtn = await screen.findByRole('button', { name: /Revoke Firefox on Linux session/i });
    expect(chromeBtn).toBeEnabled();
    expect(firefoxBtn).toBeEnabled();
  });

  it('revoking one session calls DELETE for that id and leaves the other row enabled (pendingSessionId scoping)', async () => {
    render(<ActiveSessionsPanel />, { wrapper: makeWrapper() });

    const chromeBtn = await screen.findByRole('button', { name: /Revoke Chrome on Windows session/i });
    await userEvent.click(chromeBtn);

    await waitFor(() =>
      expect(fetchJson).toHaveBeenCalledWith('http://localhost:3001/api/auth/sessions/2', { method: 'DELETE' }),
    );
    // The other non-current row's button must NOT be disabled by revoking a different row
    const firefoxBtn = screen.getByRole('button', { name: /Revoke Firefox on Linux session/i });
    expect(firefoxBtn).toBeEnabled();
    // The current session must never be revoked
    expect(fetchJson).not.toHaveBeenCalledWith('http://localhost:3001/api/auth/sessions/1', { method: 'DELETE' });
  });

  it('"Log out other devices" revokes every non-current session and never the current one', async () => {
    render(<ActiveSessionsPanel />, { wrapper: makeWrapper() });

    const bulkBtn = await screen.findByRole('button', { name: /log out other devices/i });
    await userEvent.click(bulkBtn);

    await waitFor(() => {
      expect(fetchJson).toHaveBeenCalledWith('http://localhost:3001/api/auth/sessions/2', { method: 'DELETE' });
      expect(fetchJson).toHaveBeenCalledWith('http://localhost:3001/api/auth/sessions/3', { method: 'DELETE' });
    });
    expect(fetchJson).not.toHaveBeenCalledWith('http://localhost:3001/api/auth/sessions/1', { method: 'DELETE' });
  });
});
