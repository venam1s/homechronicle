import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import SMTPConfigSection from './SMTPConfigSection.jsx';

vi.mock('../lib/api.js', () => ({
  API_BASE: 'http://localhost:3001/api',
  fetchJson: vi.fn(),
}));

vi.mock('./Toast.jsx', () => ({
  useToast: () => ({ addToast: vi.fn() }),
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

describe('SMTPConfigSection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('EMAIL-04: password is never pre-filled', () => {
    it('does not render a pre-filled password input when passwordConfigured is true', async () => {
      fetchJson.mockResolvedValueOnce({
        host: 'smtp.example.com',
        port: 587,
        user: 'user@example.com',
        from: 'noreply@example.com',
        secure: false,
        passwordConfigured: true,
        envFields: [],
      });

      render(<SMTPConfigSection />, { wrapper: makeWrapper() });

      await waitFor(() =>
        expect(screen.getByText('•••• configured')).toBeInTheDocument(),
      );

      // No password input visible (still masked)
      const passwordInputs = screen.queryAllByDisplayValue(/./);
      const passwordTextInput = passwordInputs.find(
        (el) => el.type === 'password' || el.type === 'text',
      );
      // There should be no password INPUT pre-filled with any secret value
      // The only inputs visible are non-password fields (host, port, user, from)
      // The password field shows the "•••• configured" text, not an input
      expect(screen.queryByLabelText(/password/i)).not.toBeInTheDocument();
    });

    it('shows "Change" button when passwordConfigured is true', async () => {
      fetchJson.mockResolvedValueOnce({
        host: 'smtp.example.com',
        port: 587,
        user: 'user@example.com',
        from: 'noreply@example.com',
        secure: false,
        passwordConfigured: true,
        envFields: [],
      });

      render(<SMTPConfigSection />, { wrapper: makeWrapper() });

      await waitFor(() =>
        expect(screen.getByRole('button', { name: /change/i })).toBeInTheDocument(),
      );
    });

    it('reveals password input when Change is clicked (but still not pre-filled)', async () => {
      fetchJson.mockResolvedValueOnce({
        host: 'smtp.example.com',
        port: 587,
        user: 'user@example.com',
        from: 'noreply@example.com',
        secure: false,
        passwordConfigured: true,
        envFields: [],
      });

      render(<SMTPConfigSection />, { wrapper: makeWrapper() });

      await waitFor(() =>
        expect(screen.getByRole('button', { name: /change/i })).toBeInTheDocument(),
      );

      await userEvent.click(screen.getByRole('button', { name: /change/i }));

      const passwordInput = screen.getByLabelText(/password/i);
      expect(passwordInput).toBeInTheDocument();
      expect(passwordInput.value).toBe('');
    });
  });

  describe('D-02: env-override notice', () => {
    it('renders "Set via environment variable" for env-pinned fields', async () => {
      fetchJson.mockResolvedValueOnce({
        host: 'smtp.example.com',
        port: 587,
        user: 'user@example.com',
        from: 'noreply@example.com',
        secure: false,
        passwordConfigured: false,
        envFields: ['host', 'user'],
      });

      render(<SMTPConfigSection />, { wrapper: makeWrapper() });

      await waitFor(() => {
        const notices = screen.getAllByText('Set via environment variable');
        expect(notices.length).toBeGreaterThanOrEqual(2);
      });
    });

    it('does not render input for env-pinned host field', async () => {
      fetchJson.mockResolvedValueOnce({
        host: 'smtp.example.com',
        port: 587,
        user: '',
        from: '',
        secure: false,
        passwordConfigured: false,
        envFields: ['host'],
      });

      render(<SMTPConfigSection />, { wrapper: makeWrapper() });

      await waitFor(() =>
        expect(screen.getByText('Set via environment variable')).toBeInTheDocument(),
      );

      // Host input should NOT be present (replaced by env notice)
      expect(screen.queryByLabelText(/host/i)).not.toBeInTheDocument();
    });
  });

  describe('D-01: saving without new password omits password key', () => {
    it('does not include password in PUT body when passwordConfigured and no new password entered', async () => {
      fetchJson
        .mockResolvedValueOnce({
          host: 'smtp.example.com',
          port: 587,
          user: 'user@example.com',
          from: 'noreply@example.com',
          secure: false,
          passwordConfigured: true,
          envFields: [],
        })
        .mockResolvedValueOnce({}); // PUT response

      render(<SMTPConfigSection />, { wrapper: makeWrapper() });

      await waitFor(() =>
        expect(screen.getByRole('button', { name: /save settings/i })).toBeInTheDocument(),
      );

      await userEvent.click(screen.getByRole('button', { name: /save settings/i }));

      await waitFor(() => {
        const putCall = fetchJson.mock.calls.find(
          ([url, opts]) => url.includes('/setup/smtp') && opts?.method === 'PUT',
        );
        expect(putCall).toBeTruthy();
        const body = JSON.parse(putCall[1].body);
        expect(body).not.toHaveProperty('password');
      });
    });

    it('includes password in PUT body when user enters a new one', async () => {
      fetchJson
        .mockResolvedValueOnce({
          host: 'smtp.example.com',
          port: 587,
          user: 'user@example.com',
          from: 'noreply@example.com',
          secure: false,
          passwordConfigured: true,
          envFields: [],
        })
        .mockResolvedValueOnce({}); // PUT response

      render(<SMTPConfigSection />, { wrapper: makeWrapper() });

      // Click Change to reveal password input
      await waitFor(() =>
        expect(screen.getByRole('button', { name: /change/i })).toBeInTheDocument(),
      );
      await userEvent.click(screen.getByRole('button', { name: /change/i }));

      // Type a new password
      const pwInput = screen.getByLabelText(/password/i);
      await userEvent.type(pwInput, 'newSecret123!');

      await userEvent.click(screen.getByRole('button', { name: /save settings/i }));

      await waitFor(() => {
        const putCall = fetchJson.mock.calls.find(
          ([url, opts]) => url.includes('/setup/smtp') && opts?.method === 'PUT',
        );
        expect(putCall).toBeTruthy();
        const body = JSON.parse(putCall[1].body);
        expect(body.password).toBe('newSecret123!');
      });
    });
  });

  describe('SMTP not configured notice', () => {
    it('shows warning banner when SMTP is not configured', async () => {
      fetchJson.mockResolvedValueOnce({
        host: '',
        port: 587,
        user: '',
        from: '',
        secure: false,
        passwordConfigured: false,
        envFields: [],
      });

      render(<SMTPConfigSection />, { wrapper: makeWrapper() });

      await waitFor(() =>
        expect(
          screen.getByText(/SMTP is not configured/i),
        ).toBeInTheDocument(),
      );
    });

    it('disables Send test email button when SMTP is not configured', async () => {
      fetchJson.mockResolvedValueOnce({
        host: '',
        port: 587,
        user: '',
        from: '',
        secure: false,
        passwordConfigured: false,
        envFields: [],
      });

      render(<SMTPConfigSection />, { wrapper: makeWrapper() });

      await waitFor(() =>
        expect(screen.getByRole('button', { name: /send test email/i })).toBeInTheDocument(),
      );

      expect(screen.getByRole('button', { name: /send test email/i })).toBeDisabled();
    });
  });
});
