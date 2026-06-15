import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, findByLabelText } from '@testing-library/react';
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

  // -- No-token path --

  it('no ?token in URL: renders invalid card immediately, no password field, no invite-status call', () => {
    const Wrapper = makeWrapper({ initialPath: '/accept-invite' });
    render(<AcceptInvitePage />, { wrapper: Wrapper });
    // Reason-aware copy for missing token (reason 'invalid')
    expect(screen.getByText('Invitation not valid')).toBeInTheDocument();
    expect(screen.getByText(/This invitation link is invalid/i)).toBeInTheDocument();
    // Should NOT show a password input
    expect(screen.queryByLabelText(/password/i)).not.toBeInTheDocument();
    // invite-status must NOT be fetched when there is no token
    expect(fetchJson).not.toHaveBeenCalled();
  });

  // -- Token present: invite-status loading state --

  it('with ?token: shows spinner while invite-status is loading, no form yet', async () => {
    // Never-resolving promise keeps the query in loading state
    fetchJson.mockReturnValue(new Promise(() => {}));

    const Wrapper = makeWrapper({ initialPath: '/accept-invite?token=abc123' });
    render(<AcceptInvitePage />, { wrapper: Wrapper });

    // Should show a spinner (animate-spin class on Loader2)
    expect(document.querySelector('.animate-spin')).toBeInTheDocument();
    // Should NOT show the form or reason card yet
    expect(screen.queryByLabelText(/password/i)).not.toBeInTheDocument();
    expect(screen.queryByText('Create your account')).not.toBeInTheDocument();
  });

  // -- Token present: valid invite → form --

  it('with ?token and valid:true: renders password + confirm fields + Create account button', async () => {
    fetchJson.mockResolvedValue({ valid: true });

    const Wrapper = makeWrapper({ initialPath: '/accept-invite?token=abc123' });
    render(<AcceptInvitePage />, { wrapper: Wrapper });

    // Wait for the query to resolve and the form to appear
    expect(await screen.findByLabelText('Password')).toBeInTheDocument();
    expect(screen.getByLabelText('Confirm password')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /create account/i })).toBeInTheDocument();
  });

  // -- Token present: invalid / revoked / expired / used → reason-aware card --

  it('invite-status returns valid:false reason:revoked → shows revoked card, no form', async () => {
    fetchJson.mockResolvedValue({ valid: false, reason: 'revoked' });

    const Wrapper = makeWrapper({ initialPath: '/accept-invite?token=revokedtoken' });
    render(<AcceptInvitePage />, { wrapper: Wrapper });

    expect(await screen.findByText('Invitation revoked')).toBeInTheDocument();
    expect(screen.getByText(/This invitation has been revoked/i)).toBeInTheDocument();
    expect(screen.getByText(/Contact your administrator to request a new invitation/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/password/i)).not.toBeInTheDocument();
  });

  it('invite-status returns valid:false reason:expired → shows expired card, no form', async () => {
    fetchJson.mockResolvedValue({ valid: false, reason: 'expired' });

    const Wrapper = makeWrapper({ initialPath: '/accept-invite?token=expiredtoken' });
    render(<AcceptInvitePage />, { wrapper: Wrapper });

    expect(await screen.findByText('Invitation expired')).toBeInTheDocument();
    expect(screen.getByText(/This invitation has expired/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/password/i)).not.toBeInTheDocument();
  });

  it('invite-status returns valid:false reason:used → shows used card, no form', async () => {
    fetchJson.mockResolvedValue({ valid: false, reason: 'used' });

    const Wrapper = makeWrapper({ initialPath: '/accept-invite?token=usedtoken' });
    render(<AcceptInvitePage />, { wrapper: Wrapper });

    expect(await screen.findByText('Invitation already used')).toBeInTheDocument();
    expect(screen.getByText(/This invitation has already been used/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/password/i)).not.toBeInTheDocument();
  });

  it('invite-status returns valid:false with no reason → falls back to invalid card', async () => {
    fetchJson.mockResolvedValue({ valid: false });

    const Wrapper = makeWrapper({ initialPath: '/accept-invite?token=unknowntoken' });
    render(<AcceptInvitePage />, { wrapper: Wrapper });

    expect(await screen.findByText('Invitation not valid')).toBeInTheDocument();
    expect(screen.queryByLabelText(/password/i)).not.toBeInTheDocument();
  });

  it('invite-status query errors (network/DB failure) → shows invalid card, no form', async () => {
    fetchJson.mockRejectedValue(new Error('Network error'));

    const Wrapper = makeWrapper({ initialPath: '/accept-invite?token=badtoken' });
    render(<AcceptInvitePage />, { wrapper: Wrapper });

    expect(await screen.findByText('Invitation not valid')).toBeInTheDocument();
    expect(screen.queryByLabelText(/password/i)).not.toBeInTheDocument();
  });

  // -- Form interaction: password mismatch --

  it('password mismatch: shows "Passwords don\'t match." and does not POST accept-invite', async () => {
    // invite-status resolves valid so form appears
    fetchJson.mockResolvedValueOnce({ valid: true });

    const Wrapper = makeWrapper({ initialPath: '/accept-invite?token=abc123' });
    render(<AcceptInvitePage />, { wrapper: Wrapper });

    // Wait for the form to appear after invite-status resolves
    await screen.findByLabelText('Password');

    fireEvent.change(screen.getByLabelText('Password'), {
      target: { value: 'MyPassphrase2024!' },
    });
    fireEvent.change(screen.getByLabelText('Confirm password'), {
      target: { value: 'DifferentPassphrase!' },
    });
    fireEvent.click(screen.getByRole('button', { name: /create account/i }));

    expect(screen.getByText("Passwords don't match.")).toBeInTheDocument();
    // accept-invite must NOT have been called (only invite-status was called)
    const acceptCalls = fetchJson.mock.calls.filter((args) => args[0]?.includes('/auth/accept-invite'));
    expect(acceptCalls).toHaveLength(0);
  });

  // -- Successful submit --

  it('successful submit: calls accept-invite, fetches csrf-token, navigates to /', async () => {
    fetchJson.mockImplementation((url) => {
      if (url.includes('/auth/invite-status')) {
        return Promise.resolve({ valid: true });
      }
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

    // Wait for the form
    await screen.findByLabelText('Password');

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

  // -- Server 400 on submit (race: token revoked between load and submit) --

  it('server 400 after valid invite-status: shows inline error banner, form stays visible', async () => {
    const err = new Error('Invalid or expired invitation.');
    err.status = 400;

    fetchJson.mockImplementation((url) => {
      if (url.includes('/auth/invite-status')) {
        return Promise.resolve({ valid: true });
      }
      // accept-invite fails (token revoked between load and submit)
      return Promise.reject(err);
    });

    const Wrapper = makeWrapper({ initialPath: '/accept-invite?token=racytoken' });
    render(<AcceptInvitePage />, { wrapper: Wrapper });

    await screen.findByLabelText('Password');

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
    // Form must still be present (inline error, not card replacement)
    expect(screen.getByRole('button', { name: /create account/i })).toBeInTheDocument();
  });
});
