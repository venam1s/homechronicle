import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import ResetPasswordPage from './ResetPasswordPage.jsx';

vi.mock('../lib/api.js', () => ({
  API_BASE: 'http://localhost:3001/api',
  fetchJson: vi.fn(),
}));

import { fetchJson } from '../lib/api.js';

function makeWrapper({ initialPath = '/reset-password' } = {}) {
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
            <Route path="/reset-password" element={<ResetPasswordPage />} />
            <Route path="/login" element={<div data-testid="login-page">Login</div>} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    );
  };
}

describe('ResetPasswordPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('View A — no token (request form)', () => {
    it('renders the Forgot your password? heading and email field', () => {
      const Wrapper = makeWrapper({ initialPath: '/reset-password' });
      render(<ResetPasswordPage />, { wrapper: Wrapper });
      expect(screen.getByText('Forgot your password?')).toBeInTheDocument();
      expect(screen.getByLabelText('Email address')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /send reset link/i })).toBeInTheDocument();
    });

    it('renders Back to sign in link', () => {
      const Wrapper = makeWrapper({ initialPath: '/reset-password' });
      render(<ResetPasswordPage />, { wrapper: Wrapper });
      expect(screen.getByText('Back to sign in')).toBeInTheDocument();
    });

    it('on submit: shows enumeration-safe confirmation copy (same for registered/unknown email)', async () => {
      fetchJson.mockResolvedValueOnce({ message: 'If that address is registered, a reset link has been sent.' });

      const Wrapper = makeWrapper({ initialPath: '/reset-password' });
      render(<ResetPasswordPage />, { wrapper: Wrapper });

      fireEvent.change(screen.getByLabelText('Email address'), {
        target: { value: 'anyone@example.com' },
      });
      fireEvent.click(screen.getByRole('button', { name: /send reset link/i }));

      await waitFor(() => {
        expect(screen.getByText(
          "If that email address is registered, you'll receive a reset link shortly. The link expires after 1 hour."
        )).toBeInTheDocument();
      });
      // Form should be replaced — no more email input
      expect(screen.queryByLabelText('Email address')).not.toBeInTheDocument();
    });

    it('confirmation copy is the SAME for unknown email (enumeration safety)', async () => {
      // Server always returns identical 200; client must show identical copy
      fetchJson.mockResolvedValueOnce({ message: 'If that address is registered, a reset link has been sent.' });

      const Wrapper = makeWrapper({ initialPath: '/reset-password' });
      render(<ResetPasswordPage />, { wrapper: Wrapper });

      fireEvent.change(screen.getByLabelText('Email address'), {
        target: { value: 'unknown@nobody.com' },
      });
      fireEvent.click(screen.getByRole('button', { name: /send reset link/i }));

      await waitFor(() => {
        expect(screen.getByText(
          "If that email address is registered, you'll receive a reset link shortly. The link expires after 1 hour."
        )).toBeInTheDocument();
      });
    });
  });

  describe('View B — token present (set-new-password form)', () => {
    it('renders Reset your password heading + password fields', () => {
      const Wrapper = makeWrapper({ initialPath: '/reset-password?token=validtoken' });
      render(<ResetPasswordPage />, { wrapper: Wrapper });
      expect(screen.getByText('Reset your password')).toBeInTheDocument();
      expect(screen.getByLabelText('New password')).toBeInTheDocument();
      expect(screen.getByLabelText('Confirm password')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /set new password/i })).toBeInTheDocument();
    });

    it('password mismatch: shows "Passwords don\'t match." and does not POST', () => {
      const Wrapper = makeWrapper({ initialPath: '/reset-password?token=tok' });
      render(<ResetPasswordPage />, { wrapper: Wrapper });

      fireEvent.change(screen.getByLabelText('New password'), {
        target: { value: 'MyPassphrase2024!' },
      });
      fireEvent.change(screen.getByLabelText('Confirm password'), {
        target: { value: 'DifferentPassphrase!' },
      });
      fireEvent.click(screen.getByRole('button', { name: /set new password/i }));

      expect(screen.getByText("Passwords don't match.")).toBeInTheDocument();
      expect(fetchJson).not.toHaveBeenCalled();
    });

    it('success: shows success banner then navigates to /login after 2s', async () => {
      fetchJson.mockResolvedValueOnce({ ok: true });

      const Wrapper = makeWrapper({ initialPath: '/reset-password?token=validtoken' });
      render(<ResetPasswordPage />, { wrapper: Wrapper });

      fireEvent.change(screen.getByLabelText('New password'), {
        target: { value: 'MyStrongPassphrase2024!' },
      });
      fireEvent.change(screen.getByLabelText('Confirm password'), {
        target: { value: 'MyStrongPassphrase2024!' },
      });
      fireEvent.click(screen.getByRole('button', { name: /set new password/i }));

      await waitFor(() => {
        expect(screen.getByText(/your password has been reset/i)).toBeInTheDocument();
      });

      // Advance fake timer by 2s to trigger navigation
      act(() => {
        vi.advanceTimersByTime(2000);
      });

      await waitFor(() => {
        expect(screen.getByTestId('login-page')).toBeInTheDocument();
      });
    });

    it('400 invalid token: renders token-invalid card with "Request a new link"', async () => {
      const err = new Error('This reset link has expired or has already been used.');
      err.status = 400;
      fetchJson.mockRejectedValueOnce(err);

      const Wrapper = makeWrapper({ initialPath: '/reset-password?token=usedtoken' });
      render(<ResetPasswordPage />, { wrapper: Wrapper });

      fireEvent.change(screen.getByLabelText('New password'), {
        target: { value: 'MyStrongPassphrase2024!' },
      });
      fireEvent.change(screen.getByLabelText('Confirm password'), {
        target: { value: 'MyStrongPassphrase2024!' },
      });
      fireEvent.click(screen.getByRole('button', { name: /set new password/i }));

      await waitFor(() => {
        expect(screen.getByText(/expired or has already been used/i)).toBeInTheDocument();
      });
      expect(screen.getByText('Request a new link')).toBeInTheDocument();
    });
  });
});
