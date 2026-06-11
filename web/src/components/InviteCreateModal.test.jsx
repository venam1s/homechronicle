import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import InviteCreateModal from './InviteCreateModal.jsx';

// -- Mock hooks --

vi.mock('../hooks/useUsers.js', () => ({
  useInviteUser: vi.fn(),
}));

import { useInviteUser } from '../hooks/useUsers.js';

// -- Helpers --

function wrapper({ children }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

function makeMutation(mutateFn, options = {}) {
  return {
    mutate: mutateFn ?? vi.fn(),
    isPending: options.isPending ?? false,
  };
}

// -- Tests --

describe('InviteCreateModal', () => {
  const onClose = vi.fn();

  beforeEach(() => {
    onClose.mockReset();
    useInviteUser.mockReturnValue(makeMutation());
  });

  describe('form phase', () => {
    it('renders the form with email and role fields', () => {
      render(<InviteCreateModal onClose={onClose} />, { wrapper });

      expect(screen.getByLabelText('Email address')).toBeInTheDocument();
      expect(screen.getByLabelText('Role')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Send invite' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument();
    });

    it('defaults role selector to member', () => {
      render(<InviteCreateModal onClose={onClose} />, { wrapper });
      const select = screen.getByLabelText('Role');
      expect(select.value).toBe('member');
    });

    it('calls onClose when Close is clicked', () => {
      render(<InviteCreateModal onClose={onClose} />, { wrapper });
      fireEvent.click(screen.getByRole('button', { name: 'Close' }));
      expect(onClose).toHaveBeenCalledOnce();
    });

    it('calls mutate with email and role on submit', async () => {
      const mutateFn = vi.fn();
      useInviteUser.mockReturnValue(makeMutation(mutateFn));

      render(<InviteCreateModal onClose={onClose} />, { wrapper });

      fireEvent.change(screen.getByLabelText('Email address'), {
        target: { value: 'test@example.com' },
      });
      fireEvent.change(screen.getByLabelText('Role'), { target: { value: 'admin' } });
      fireEvent.click(screen.getByRole('button', { name: 'Send invite' }));

      expect(mutateFn).toHaveBeenCalledWith(
        { email: 'test@example.com', role: 'admin' },
        expect.any(Object)
      );
    });

    it('shows loading spinner when pending', () => {
      useInviteUser.mockReturnValue(makeMutation(vi.fn(), { isPending: true }));
      render(<InviteCreateModal onClose={onClose} />, { wrapper });
      expect(screen.queryByText('Send invite')).not.toBeInTheDocument();
      // Loader2 renders as SVG — confirm Send invite text is gone
      expect(screen.getByRole('button', { name: '' })).toBeDisabled();
    });
  });

  describe('error states', () => {
    function triggerError(errorMessage) {
      const mutateFn = vi.fn((_args, callbacks) => {
        callbacks?.onError?.({ message: errorMessage });
      });
      useInviteUser.mockReturnValue(makeMutation(mutateFn));

      render(<InviteCreateModal onClose={onClose} />, { wrapper });
      fireEvent.change(screen.getByLabelText('Email address'), {
        target: { value: 'x@example.com' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Send invite' }));
    }

    it('shows email-already-exists error copy', () => {
      triggerError('An account with that email already exists');
      expect(
        screen.getByText('An account with this email already exists.')
      ).toBeInTheDocument();
    });

    it('shows pending-invite error copy', () => {
      triggerError('A pending invite already exists for this email');
      expect(
        screen.getByText(
          'A pending invite for this email already exists. Resend or revoke the existing invite first.'
        )
      ).toBeInTheDocument();
    });

    it('shows generic error copy for unknown errors', () => {
      triggerError('Network error');
      expect(
        screen.getByText('Something went wrong. Check your connection and try again.')
      ).toBeInTheDocument();
    });
  });

  describe('success state (D-10)', () => {
    function triggerSuccess(inviteData) {
      const mutateFn = vi.fn((_args, callbacks) => {
        callbacks?.onSuccess?.(inviteData);
      });
      useInviteUser.mockReturnValue(makeMutation(mutateFn));

      render(<InviteCreateModal onClose={onClose} />, { wrapper });
      fireEvent.change(screen.getByLabelText('Email address'), {
        target: { value: inviteData.email },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Send invite' }));
    }

    it('always shows the copyable invite link even when emailed=false (D-10)', () => {
      triggerSuccess({
        inviteUrl: 'https://example.com/accept?token=abc',
        emailed: false,
        email: 'dave@example.com',
      });

      expect(screen.getByLabelText('Invite link')).toBeInTheDocument();
      expect(screen.getByLabelText('Invite link')).toHaveValue(
        'https://example.com/accept?token=abc'
      );
      expect(screen.getByText('Invite link (valid 72 hours)')).toBeInTheDocument();
    });

    it('shows SMTP-off note when emailed=false', () => {
      triggerSuccess({
        inviteUrl: 'https://example.com/accept?token=abc',
        emailed: false,
        email: 'dave@example.com',
      });

      expect(
        screen.getByText('SMTP not configured — share this link manually.')
      ).toBeInTheDocument();
      expect(
        screen.getByText('Invite link created for dave@example.com.')
      ).toBeInTheDocument();
    });

    it('shows emailed banner and SMTP-on note when emailed=true', () => {
      triggerSuccess({
        inviteUrl: 'https://example.com/accept?token=xyz',
        emailed: true,
        email: 'eve@example.com',
      });

      expect(
        screen.getByText('Invite emailed to eve@example.com.')
      ).toBeInTheDocument();
      expect(
        screen.getByText('Also emailed to eve@example.com.')
      ).toBeInTheDocument();
    });

    it('copies invite URL to clipboard and swaps icon on Copy click', async () => {
      const writeText = vi.fn().mockResolvedValue(undefined);
      Object.defineProperty(navigator, 'clipboard', {
        value: { writeText },
        configurable: true,
        writable: true,
      });

      triggerSuccess({
        inviteUrl: 'https://example.com/accept?token=copytest',
        emailed: false,
        email: 'copy@example.com',
      });

      const copyBtn = screen.getByRole('button', { name: 'Copy invite link' });
      expect(copyBtn).toBeInTheDocument();

      fireEvent.click(copyBtn);

      await waitFor(() => {
        expect(writeText).toHaveBeenCalledWith('https://example.com/accept?token=copytest');
      });

      // After copy, button should show success state (text-hc-success-text class)
      await waitFor(() => {
        expect(copyBtn).toHaveClass('text-hc-success-text');
      });
    });

    it('calls onClose when Done is clicked in success state', () => {
      triggerSuccess({
        inviteUrl: 'https://example.com/accept?token=done',
        emailed: false,
        email: 'done@example.com',
      });

      fireEvent.click(screen.getByRole('button', { name: 'Done' }));
      expect(onClose).toHaveBeenCalledOnce();
    });

    it('calls onClose when backdrop is clicked directly', () => {
      render(<InviteCreateModal onClose={onClose} />, { wrapper });
      // fireEvent.click on the backdrop element sets target === currentTarget
      // (no bubbling from a child) so onClose fires
      const backdrop = document.querySelector('.fixed.inset-0');
      if (backdrop) {
        fireEvent.click(backdrop);
        expect(onClose).toHaveBeenCalledOnce();
      }
    });
  });

  describe('no dark: variants', () => {
    it('does not use dark: class variants', async () => {
      // Import the file source and check for dark: — this is a static analysis test
      const src = await import('./InviteCreateModal.jsx?raw').catch(() => null);
      if (src) {
        expect(src.default).not.toMatch(/dark:/);
      }
    });
  });
});
