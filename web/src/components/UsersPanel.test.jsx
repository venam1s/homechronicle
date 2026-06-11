import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import UsersPanel from './UsersPanel.jsx';

// -- Mock hooks --

vi.mock('../hooks/useUsers.js', () => ({
  useUsers: vi.fn(),
  useInvites: vi.fn(),
  useSetUserRole: vi.fn(),
  useDisableUser: vi.fn(),
  useEnableUser: vi.fn(),
  useRemoveUser: vi.fn(),
  useRevokeInvite: vi.fn(),
  useResendInvite: vi.fn(),
}));

vi.mock('../hooks/useAuth.js', () => ({
  useAuth: vi.fn(),
}));

vi.mock('./Toast.jsx', () => ({
  useToast: () => ({ addToast: vi.fn() }),
}));

vi.mock('./InviteCreateModal.jsx', () => ({
  default: ({ onClose }) => (
    <div data-testid="invite-modal">
      <button onClick={onClose}>close-modal</button>
    </div>
  ),
}));

import {
  useUsers,
  useInvites,
  useSetUserRole,
  useDisableUser,
  useEnableUser,
  useRemoveUser,
  useRevokeInvite,
  useResendInvite,
} from '../hooks/useUsers.js';
import { useAuth } from '../hooks/useAuth.js';

// -- Helpers --

function makeMutation(mutateFn) {
  return { mutate: mutateFn ?? vi.fn(), isPending: false };
}

function wrapper({ children }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

// -- Sample data --

const ADMIN_USER = { id: 'u1', email: 'admin@example.com', name: 'Alice', role: 'admin', status: 'active' };
const MEMBER_USER = { id: 'u2', email: 'bob@example.com', name: 'Bob', role: 'member', status: 'active' };
const DISABLED_USER = { id: 'u3', email: 'carol@example.com', name: 'Carol', role: 'member', status: 'disabled' };

const PENDING_INVITE = {
  id: 'inv1',
  email: 'dave@example.com',
  role: 'member',
  expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 48).toISOString(), // 48h from now
};

beforeEach(() => {
  useSetUserRole.mockReturnValue(makeMutation());
  useDisableUser.mockReturnValue(makeMutation());
  useEnableUser.mockReturnValue(makeMutation());
  useRemoveUser.mockReturnValue(makeMutation());
  useRevokeInvite.mockReturnValue(makeMutation());
  useResendInvite.mockReturnValue(makeMutation());
});

// -- Tests --

describe('UsersPanel', () => {
  describe('user table rendering', () => {
    it('renders user rows for all users', () => {
      useAuth.mockReturnValue({ user: ADMIN_USER });
      useUsers.mockReturnValue({ data: [ADMIN_USER, MEMBER_USER], isLoading: false });
      useInvites.mockReturnValue({ data: [], isLoading: false });

      render(<UsersPanel />, { wrapper });

      expect(screen.getByText('Alice')).toBeInTheDocument();
      expect(screen.getByText('Bob')).toBeInTheDocument();
    });

    it('renders empty state when no users', () => {
      useAuth.mockReturnValue({ user: ADMIN_USER });
      useUsers.mockReturnValue({ data: [], isLoading: false });
      useInvites.mockReturnValue({ data: [], isLoading: false });

      render(<UsersPanel />, { wrapper });

      expect(screen.getByText(/No other users yet/)).toBeInTheDocument();
    });

    it('shows role badges with correct text', () => {
      useAuth.mockReturnValue({ user: ADMIN_USER });
      useUsers.mockReturnValue({ data: [ADMIN_USER, MEMBER_USER], isLoading: false });
      useInvites.mockReturnValue({ data: [], isLoading: false });

      render(<UsersPanel />, { wrapper });

      expect(screen.getByText('Admin')).toBeInTheDocument();
      expect(screen.getByText('Member')).toBeInTheDocument();
    });

    it('shows status badges for active and disabled users', () => {
      useAuth.mockReturnValue({ user: ADMIN_USER });
      useUsers.mockReturnValue({ data: [MEMBER_USER, DISABLED_USER], isLoading: false });
      useInvites.mockReturnValue({ data: [], isLoading: false });

      render(<UsersPanel />, { wrapper });

      expect(screen.getByText('Active')).toBeInTheDocument();
      expect(screen.getByText('Disabled')).toBeInTheDocument();
    });
  });

  describe('last-admin guard', () => {
    it('disables Disable and Remove buttons for the only admin', async () => {
      // Only one admin — ADMIN_USER is both the current user and the only admin
      // We need another admin row to test the guard without self-guard interfering.
      // Use a second admin who is also the only admin (two admins but one is this user).
      // Actually: to isolate last-admin guard from self-guard, use a second user as currentUser.
      const otherAdmin = { id: 'u99', email: 'other@example.com', name: 'Other', role: 'admin', status: 'active' };
      useAuth.mockReturnValue({ user: otherAdmin }); // current user is a different admin
      useUsers.mockReturnValue({ data: [ADMIN_USER], isLoading: false }); // only one active admin
      useInvites.mockReturnValue({ data: [], isLoading: false });

      render(<UsersPanel />, { wrapper });

      // Expand the actions row for ADMIN_USER
      fireEvent.click(screen.getByLabelText('User actions'));

      const disableBtn = screen.getByRole('button', { name: 'Disable' });
      const removeBtn = screen.getByRole('button', { name: 'Remove' });

      expect(disableBtn).toBeDisabled();
      expect(removeBtn).toBeDisabled();
      expect(disableBtn).toHaveAttribute(
        'title',
        'Cannot disable the only admin. Promote another user first.'
      );
      expect(removeBtn).toHaveAttribute(
        'title',
        'Cannot remove the only admin. Promote another user first.'
      );
    });

    it('disables role-change button for the only admin', async () => {
      const otherAdmin = { id: 'u99', email: 'other@example.com', name: 'Other', role: 'admin', status: 'active' };
      useAuth.mockReturnValue({ user: otherAdmin });
      useUsers.mockReturnValue({ data: [ADMIN_USER], isLoading: false });
      useInvites.mockReturnValue({ data: [], isLoading: false });

      render(<UsersPanel />, { wrapper });
      fireEvent.click(screen.getByLabelText('User actions'));

      const makeMemberBtn = screen.getByRole('button', { name: 'Make member' });
      expect(makeMemberBtn).toBeDisabled();
      expect(makeMemberBtn).toHaveAttribute(
        'title',
        'Cannot demote the only admin. Promote another user first.'
      );
    });
  });

  describe('self guard', () => {
    it('disables Disable and Remove buttons for the current user row', async () => {
      // Two admins so last-admin guard does not fire; current user is ADMIN_USER
      const secondAdmin = { id: 'u5', email: 'second@example.com', name: 'Second', role: 'admin', status: 'active' };
      useAuth.mockReturnValue({ user: ADMIN_USER });
      useUsers.mockReturnValue({ data: [ADMIN_USER, secondAdmin], isLoading: false });
      useInvites.mockReturnValue({ data: [], isLoading: false });

      render(<UsersPanel />, { wrapper });

      // Expand ADMIN_USER's row (the first "User actions" button)
      const actionButtons = screen.getAllByLabelText('User actions');
      fireEvent.click(actionButtons[0]);

      const disableBtn = screen.getByRole('button', { name: 'Disable' });
      const removeBtn = screen.getByRole('button', { name: 'Remove' });

      expect(disableBtn).toBeDisabled();
      expect(removeBtn).toBeDisabled();
      expect(disableBtn).toHaveAttribute('title', 'You cannot disable your own account.');
      expect(removeBtn).toHaveAttribute('title', 'You cannot remove your own account.');
    });
  });

  describe('destructive actions — inline confirm', () => {
    it('shows inline confirm before calling disable mutation', async () => {
      const disableMutate = vi.fn();
      useDisableUser.mockReturnValue(makeMutation(disableMutate));
      useAuth.mockReturnValue({ user: ADMIN_USER });
      // Two active admins so no guards block
      const secondAdmin = { id: 'u5', email: 'second@example.com', name: 'Second', role: 'admin', status: 'active' };
      useUsers.mockReturnValue({ data: [secondAdmin, MEMBER_USER], isLoading: false });
      useInvites.mockReturnValue({ data: [], isLoading: false });

      render(<UsersPanel />, { wrapper });

      // Expand MEMBER_USER actions
      const actionButtons = screen.getAllByLabelText('User actions');
      fireEvent.click(actionButtons[1]); // second row = MEMBER_USER

      // Click Disable — should show confirm, NOT call mutate yet
      fireEvent.click(screen.getByRole('button', { name: 'Disable' }));
      expect(disableMutate).not.toHaveBeenCalled();
      expect(screen.getByText(/Disable this user\?/)).toBeInTheDocument();

      // Confirm
      fireEvent.click(screen.getByRole('button', { name: 'Yes, disable' }));
      expect(disableMutate).toHaveBeenCalledWith(MEMBER_USER.id);
    });

    it('cancels disable with Keep user', async () => {
      const disableMutate = vi.fn();
      useDisableUser.mockReturnValue(makeMutation(disableMutate));
      useAuth.mockReturnValue({ user: ADMIN_USER });
      const secondAdmin = { id: 'u5', email: 'second@example.com', name: 'Second', role: 'admin', status: 'active' };
      useUsers.mockReturnValue({ data: [secondAdmin, MEMBER_USER], isLoading: false });
      useInvites.mockReturnValue({ data: [], isLoading: false });

      render(<UsersPanel />, { wrapper });
      const actionButtons = screen.getAllByLabelText('User actions');
      fireEvent.click(actionButtons[1]);
      fireEvent.click(screen.getByRole('button', { name: 'Disable' }));

      // Cancel
      fireEvent.click(screen.getByRole('button', { name: 'Keep user' }));
      expect(disableMutate).not.toHaveBeenCalled();
      expect(screen.queryByText(/Disable this user\?/)).not.toBeInTheDocument();
    });
  });

  describe('pending invites', () => {
    it('renders pending invite rows', () => {
      useAuth.mockReturnValue({ user: ADMIN_USER });
      useUsers.mockReturnValue({ data: [ADMIN_USER], isLoading: false });
      useInvites.mockReturnValue({ data: [PENDING_INVITE], isLoading: false });

      render(<UsersPanel />, { wrapper });

      expect(screen.getByText('dave@example.com')).toBeInTheDocument();
      expect(screen.getByText(/Expires in/)).toBeInTheDocument();
    });

    it('shows empty state when no pending invites', () => {
      useAuth.mockReturnValue({ user: ADMIN_USER });
      useUsers.mockReturnValue({ data: [ADMIN_USER], isLoading: false });
      useInvites.mockReturnValue({ data: [], isLoading: false });

      render(<UsersPanel />, { wrapper });

      expect(screen.getByText('No pending invites.')).toBeInTheDocument();
    });

    it('shows inline confirm before calling revoke mutation', async () => {
      const revokeMutate = vi.fn();
      useRevokeInvite.mockReturnValue(makeMutation(revokeMutate));
      useAuth.mockReturnValue({ user: ADMIN_USER });
      useUsers.mockReturnValue({ data: [ADMIN_USER], isLoading: false });
      useInvites.mockReturnValue({ data: [PENDING_INVITE], isLoading: false });

      render(<UsersPanel />, { wrapper });

      // Click Revoke — should show confirm
      fireEvent.click(screen.getByRole('button', { name: 'Revoke' }));
      expect(revokeMutate).not.toHaveBeenCalled();
      expect(screen.getByText('Revoke this invite?')).toBeInTheDocument();

      // Confirm
      fireEvent.click(screen.getByRole('button', { name: 'Yes, revoke' }));
      expect(revokeMutate).toHaveBeenCalledWith(PENDING_INVITE.id);
    });

    it('cancels revoke with Keep invite', async () => {
      const revokeMutate = vi.fn();
      useRevokeInvite.mockReturnValue(makeMutation(revokeMutate));
      useAuth.mockReturnValue({ user: ADMIN_USER });
      useUsers.mockReturnValue({ data: [ADMIN_USER], isLoading: false });
      useInvites.mockReturnValue({ data: [PENDING_INVITE], isLoading: false });

      render(<UsersPanel />, { wrapper });

      fireEvent.click(screen.getByRole('button', { name: 'Revoke' }));
      fireEvent.click(screen.getByRole('button', { name: 'Keep invite' }));

      expect(revokeMutate).not.toHaveBeenCalled();
      expect(screen.queryByText('Revoke this invite?')).not.toBeInTheDocument();
    });

    it('marks expired invite expiry in warning color', () => {
      const expiredInvite = {
        ...PENDING_INVITE,
        id: 'inv2',
        expiresAt: new Date(Date.now() - 1000).toISOString(), // already expired
      };
      useAuth.mockReturnValue({ user: ADMIN_USER });
      useUsers.mockReturnValue({ data: [ADMIN_USER], isLoading: false });
      useInvites.mockReturnValue({ data: [expiredInvite], isLoading: false });

      render(<UsersPanel />, { wrapper });

      const expiredEl = screen.getByText('Expired');
      expect(expiredEl).toHaveClass('text-hc-warning-text');
    });
  });

  describe('invite modal', () => {
    it('opens InviteCreateModal on Invite user button click', () => {
      useAuth.mockReturnValue({ user: ADMIN_USER });
      useUsers.mockReturnValue({ data: [ADMIN_USER], isLoading: false });
      useInvites.mockReturnValue({ data: [], isLoading: false });

      render(<UsersPanel />, { wrapper });

      expect(screen.queryByTestId('invite-modal')).not.toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: /Invite user/ }));
      expect(screen.getByTestId('invite-modal')).toBeInTheDocument();
    });

    it('closes InviteCreateModal on onClose', () => {
      useAuth.mockReturnValue({ user: ADMIN_USER });
      useUsers.mockReturnValue({ data: [ADMIN_USER], isLoading: false });
      useInvites.mockReturnValue({ data: [], isLoading: false });

      render(<UsersPanel />, { wrapper });

      fireEvent.click(screen.getByRole('button', { name: /Invite user/ }));
      expect(screen.getByTestId('invite-modal')).toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: 'close-modal' }));
      expect(screen.queryByTestId('invite-modal')).not.toBeInTheDocument();
    });
  });
});
