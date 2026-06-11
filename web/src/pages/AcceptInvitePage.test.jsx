import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import AcceptInvitePage from './AcceptInvitePage.jsx';

// Mock fetchJson
vi.mock('../lib/api.js', () => ({
  API_BASE: 'http://localhost:3001/api',
  fetchJson: vi.fn(),
}));

import { fetchJson } from '../lib/api.js';

function makeWrapper({ initialPath = '/accept-invite' } = {}) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: Infinity },
    },
  });
  return function Wrapper({ children }) {
    return (
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={[initialPath]}>
          <Routes>
            <Route path="/accept-invite" element={<AcceptInvitePage />} />
            <Route path="/" element={<div data-testid="app-home">Home</div>} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    );
  };
}

describe('AcceptInvitePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
  });

  it('no ?token in URL: renders expired/invalid card, no password field', () => {
    const Wrapper = makeWrapper({ initialPath: '/accept-invite' });
    render(<AcceptInvitePage />, { wrapper: Wrapper });
    // Should show expired copy
    expect(screen.getByText(/expired or is no longer valid/i)).toBeInTheDocument();
    // Should NOT show a password input
    expect(screen.queryByLabelText(/password/i)).not.toBeInTheDocument();
  });

  it('with ?token: renders password + confirm fields + Create account button', () => {
    const Wrapper = makeWrapper({ initialPath: '/accept-invite?token=abc123' });
    render(<AcceptInvitePage />, { wrapper: Wrapper });
    expect(screen.getByLabelText('Password')).toBeInTheDocument();
    expect(screen.getByLabelText('Confirm password')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /create account/i })).toBeInTheDocument();
  });

  it('password mismatch: shows "Passwords don\'t match." and does not POST', async () => {
    const Wrapper = makeWrapper({ initialPath: '/accept-invite?token=abc123' });
    render(<AcceptInvitePage />, { wrapper: Wrapper });

    fireEvent.change(screen.getByLabelText('Password'), {
      target: { value: 'MyPassphrase2024!' },
    });
    fireEvent.change(screen.getByLabelText('Confirm password'), {
      target: { value: 'DifferentPassphrase!' },
    });
    fireEvent.click(screen.getByRole('button', { name: /create account/i }));

    expect(screen.getByText("Passwords don't match.")).toBeInTheDocument();
    expect(fetchJson).not.toHaveBeenCalled();
  });

  it('successful submit: calls accept-invite, fetches csrf-token, navigates to /', async () => {
    fetchJson.mockImplementation((url) => {
      if (url.includes('/auth/accept-invite')) {
        return Promise.resolve({ ok: true, user: { email: 'test@example.com', role: 'member' } });
      }
      if (url.includes('/auth/csrf-token')) {
        return Promise.resolve({ csrfToken: 'test-csrf-token' });
      }
      return Promise.reject(new Error(`Unexpected URL: ${url}`));
    });

    const Wrapper = makeWrapper({ initialPath: '/accept-invite?token=validtoken' });
    render(<AcceptInvitePage />, { wrapper: Wrapper });

    fireEvent.change(screen.getByLabelText('Password'), {
      target: { value: 'MyStrongPassphrase2024!' },
    });
    fireEvent.change(screen.getByLabelText('Confirm password'), {
      target: { value: 'MyStrongPassphrase2024!' },
    });
    fireEvent.click(screen.getByRole('button', { name: /create account/i }));

    await waitFor(() => {
      expect(fetchJson).toHaveBeenCalledWith(
        expect.stringContaining('/auth/accept-invite'),
        expect.objectContaining({ method: 'POST' })
      );
    });

    await waitFor(() => {
      expect(sessionStorage.getItem('csrfToken')).toBe('test-csrf-token');
    });

    await waitFor(() => {
      expect(screen.getByTestId('app-home')).toBeInTheDocument();
    });
  });

  it('server 400 error: shows inline error banner with server message', async () => {
    const err = new Error('Invalid or expired invitation.');
    err.status = 400;
    fetchJson.mockRejectedValueOnce(err);

    const Wrapper = makeWrapper({ initialPath: '/accept-invite?token=badtoken' });
    render(<AcceptInvitePage />, { wrapper: Wrapper });

    fireEvent.change(screen.getByLabelText('Password'), {
      target: { value: 'MyStrongPassphrase2024!' },
    });
    fireEvent.change(screen.getByLabelText('Confirm password'), {
      target: { value: 'MyStrongPassphrase2024!' },
    });
    fireEvent.click(screen.getByRole('button', { name: /create account/i }));

    await waitFor(() => {
      expect(screen.getByText('Invalid or expired invitation.')).toBeInTheDocument();
    });
  });
});
