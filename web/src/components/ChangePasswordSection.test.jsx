import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import ChangePasswordSection from './ChangePasswordSection.jsx';

vi.mock('../lib/api.js', () => ({
  API_BASE: 'http://localhost:3001/api',
  fetchJson: vi.fn(),
}));

import { fetchJson } from '../lib/api.js';

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity }, mutations: { retry: false } },
  });
  return function Wrapper({ children }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

describe('ChangePasswordSection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the section heading and three password fields', () => {
    render(<ChangePasswordSection />, { wrapper: makeWrapper() });

    expect(screen.getByText('Change password')).toBeInTheDocument();
    expect(screen.getByLabelText('Current password')).toBeInTheDocument();
    expect(screen.getByLabelText('New password')).toBeInTheDocument();
    expect(screen.getByLabelText('Confirm new password')).toBeInTheDocument();
  });

  describe('password mismatch prevents submission', () => {
    it('shows mismatch error and does NOT call fetchJson when passwords differ', async () => {
      render(<ChangePasswordSection />, { wrapper: makeWrapper() });

      await userEvent.type(screen.getByLabelText('Current password'), 'oldpass');
      await userEvent.type(screen.getByLabelText('New password'), 'newPassw0rd123!');
      await userEvent.type(screen.getByLabelText('Confirm new password'), 'differentPass!');

      await userEvent.click(screen.getByRole('button', { name: /update password/i }));

      expect(screen.getByText("Passwords don't match.")).toBeInTheDocument();
      // fetchJson should NOT have been called (no PATCH)
      expect(fetchJson).not.toHaveBeenCalled();
    });
  });

  describe('successful PATCH shows success banner', () => {
    it('renders success banner on successful PATCH', async () => {
      fetchJson.mockResolvedValueOnce({ ok: true });

      render(<ChangePasswordSection />, { wrapper: makeWrapper() });

      await userEvent.type(screen.getByLabelText('Current password'), 'oldpass');
      await userEvent.type(screen.getByLabelText('New password'), 'newPassw0rd123!');
      await userEvent.type(screen.getByLabelText('Confirm new password'), 'newPassw0rd123!');

      await userEvent.click(screen.getByRole('button', { name: /update password/i }));

      await waitFor(() =>
        expect(screen.getByText('Password updated successfully.')).toBeInTheDocument(),
      );
    });

    it('calls PATCH /api/auth/password with currentPassword and newPassword', async () => {
      fetchJson.mockResolvedValueOnce({ ok: true });

      render(<ChangePasswordSection />, { wrapper: makeWrapper() });

      await userEvent.type(screen.getByLabelText('Current password'), 'oldpass');
      await userEvent.type(screen.getByLabelText('New password'), 'newPassw0rd123!');
      await userEvent.type(screen.getByLabelText('Confirm new password'), 'newPassw0rd123!');

      await userEvent.click(screen.getByRole('button', { name: /update password/i }));

      await waitFor(() => {
        expect(fetchJson).toHaveBeenCalledWith(
          'http://localhost:3001/api/auth/password',
          expect.objectContaining({
            method: 'PATCH',
            body: JSON.stringify({ currentPassword: 'oldpass', newPassword: 'newPassw0rd123!' }),
          }),
        );
      });
    });
  });

  describe('400 error shows inline error', () => {
    it('shows "Current password is incorrect." for 400 wrong-current error', async () => {
      const err = new Error('Current password is incorrect.');
      err.status = 400;
      fetchJson.mockRejectedValueOnce(err);

      render(<ChangePasswordSection />, { wrapper: makeWrapper() });

      await userEvent.type(screen.getByLabelText('Current password'), 'wrongold');
      await userEvent.type(screen.getByLabelText('New password'), 'newPassw0rd123!');
      await userEvent.type(screen.getByLabelText('Confirm new password'), 'newPassw0rd123!');

      await userEvent.click(screen.getByRole('button', { name: /update password/i }));

      await waitFor(() =>
        expect(screen.getByText('Current password is incorrect.')).toBeInTheDocument(),
      );
    });

    it('shows generic error for unexpected server error', async () => {
      const err = new Error('Something went wrong');
      err.status = 500;
      fetchJson.mockRejectedValueOnce(err);

      render(<ChangePasswordSection />, { wrapper: makeWrapper() });

      await userEvent.type(screen.getByLabelText('Current password'), 'oldpass');
      await userEvent.type(screen.getByLabelText('New password'), 'newPassw0rd123!');
      await userEvent.type(screen.getByLabelText('Confirm new password'), 'newPassw0rd123!');

      await userEvent.click(screen.getByRole('button', { name: /update password/i }));

      await waitFor(() =>
        expect(
          screen.getByText('Something went wrong. Check your connection and try again.'),
        ).toBeInTheDocument(),
      );
    });
  });

  describe('strength meter renders under new password field', () => {
    it('renders the strength meter segments below the new password field', async () => {
      render(<ChangePasswordSection />, { wrapper: makeWrapper() });

      const segments = document.querySelectorAll('[data-testid="strength-segment"]');
      expect(segments.length).toBe(3);
    });
  });
});
