import { useState } from 'react';
import { MoreHorizontal, UserPlus } from 'lucide-react';
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
import { useToast } from './Toast.jsx';
import Card from './Card.jsx';
import InviteCreateModal from './InviteCreateModal.jsx';

// -- Helpers --

function formatExpiry(expiresAt) {
  if (!expiresAt) return '';
  const msLeft = new Date(expiresAt) - Date.now();
  if (msLeft <= 0) return 'Expired';
  const hoursLeft = Math.ceil(msLeft / (1000 * 60 * 60));
  return `Expires in ${hoursLeft}h`;
}

function RoleBadge({ role }) {
  const isAdmin = role === 'admin';
  return (
    <span
      className={`inline-flex items-center px-2 py-1 rounded-full text-hc-caption border bg-hc-panel-mid border-hc-panel-border ${
        isAdmin ? 'text-hc-fg-strong font-semibold' : 'text-hc-muted-light font-normal'
      }`}
    >
      {isAdmin ? 'Admin' : 'Member'}
    </span>
  );
}

function StatusBadge({ status }) {
  const isActive = status === 'active';
  return (
    <span
      className={`inline-flex items-center px-2 py-1 rounded-full text-hc-caption border ${
        isActive
          ? 'bg-hc-success-bg text-hc-success-text border-hc-success-border'
          : 'bg-hc-danger-bg text-hc-danger-text border-hc-danger-border'
      }`}
    >
      {isActive ? 'Active' : 'Disabled'}
    </span>
  );
}

// -- UserRow --

function UserRow({ user, currentUser, isLastAdmin, onExpand, expanded }) {
  const { addToast } = useToast();
  const setRoleMutation = useSetUserRole();
  const disableMutation = useDisableUser();
  const enableMutation = useEnableUser();
  const removeMutation = useRemoveUser();

  const isSelf = user.id === currentUser?.id;
  const isAdmin = user.role === 'admin';
  const isCurrent = isSelf;

  // Guard conditions
  const disableGuardSelf = isSelf;
  const disableGuardLastAdmin = isAdmin && isLastAdmin;
  const removeGuardSelf = isSelf;
  const removeGuardLastAdmin = isAdmin && isLastAdmin;
  const roleChangeGuardLastAdmin = isAdmin && isLastAdmin;

  const [confirmAction, setConfirmAction] = useState(null); // 'disable' | 'remove'

  const rowBg = isCurrent ? 'bg-hc-panel-mid/40' : '';

  function handleRoleChange() {
    const newRole = user.role === 'admin' ? 'member' : 'admin';
    setRoleMutation.mutate({ id: user.id, role: newRole });
    onExpand(null);
  }

  function handleEnable() {
    enableMutation.mutate(user.id);
    onExpand(null);
  }

  if (confirmAction === 'disable') {
    return (
      <div className={`px-4 py-3 flex items-center gap-4 border-b border-hc-panel-border last:border-b-0 ${rowBg}`}>
        <div className="flex-1 min-w-0">
          <p className="text-hc-body font-semibold text-hc-fg-strong truncate">{user.name || user.email}</p>
          <p className="text-hc-caption text-hc-muted truncate">{user.email}</p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="text-hc-caption text-hc-muted">
            Disable this user? They won&apos;t be able to sign in and their active sessions will end.
          </span>
          <button
            onClick={() => { disableMutation.mutate(user.id); setConfirmAction(null); onExpand(null); }}
            disabled={disableMutation.isPending}
            className="text-xs px-2 py-1 bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50 transition-colors"
          >
            Yes, disable
          </button>
          <button
            onClick={() => setConfirmAction(null)}
            className="text-xs px-2 py-1 bg-hc-panel-mid text-hc-muted-light rounded hover:bg-hc-panel-mid transition-colors"
          >
            Keep user
          </button>
        </div>
      </div>
    );
  }

  if (confirmAction === 'remove') {
    return (
      <div className={`px-4 py-3 flex items-center gap-4 border-b border-hc-panel-border last:border-b-0 ${rowBg}`}>
        <div className="flex-1 min-w-0">
          <p className="text-hc-body font-semibold text-hc-fg-strong truncate">{user.name || user.email}</p>
          <p className="text-hc-caption text-hc-muted truncate">{user.email}</p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="text-hc-caption text-hc-muted">
            Permanently remove this user? This cannot be undone.
          </span>
          <button
            onClick={() => { removeMutation.mutate(user.id); setConfirmAction(null); onExpand(null); }}
            disabled={removeMutation.isPending}
            className="text-xs px-2 py-1 bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50 transition-colors"
          >
            Yes, remove
          </button>
          <button
            onClick={() => setConfirmAction(null)}
            className="text-xs px-2 py-1 bg-hc-panel-mid text-hc-muted-light rounded hover:bg-hc-panel-mid transition-colors"
          >
            Keep user
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={`px-4 py-3 flex items-center gap-4 border-b border-hc-panel-border last:border-b-0 ${rowBg}`}>
      <div className="flex-1 min-w-0">
        <p className="text-hc-body font-semibold text-hc-fg-strong truncate">{user.name || user.email}</p>
        <p className="text-hc-caption text-hc-muted truncate">{user.email}</p>
      </div>
      <RoleBadge role={user.role} />
      <StatusBadge status={user.status} />
      <div className="flex-shrink-0">
        {!expanded ? (
          <button
            aria-label="User actions"
            onClick={() => onExpand(user.id)}
            className="p-1 rounded text-hc-muted hover:text-hc-fg hover:bg-hc-panel-hover transition-colors"
          >
            <MoreHorizontal size={16} />
          </button>
        ) : (
          <div className="flex items-center gap-2">
            {/* Change role */}
            {roleChangeGuardLastAdmin ? (
              <button
                disabled
                title="Cannot demote the only admin. Promote another user first."
                className="text-hc-caption text-hc-muted opacity-40 cursor-not-allowed"
              >
                {user.role === 'admin' ? 'Make member' : 'Make admin'}
              </button>
            ) : (
              <button
                onClick={handleRoleChange}
                disabled={setRoleMutation.isPending}
                className="text-hc-caption text-hc-muted hover:text-hc-fg disabled:opacity-50 transition-colors"
              >
                {user.role === 'admin' ? 'Make member' : 'Make admin'}
              </button>
            )}

            {/* Disable / Enable */}
            {user.status === 'active' ? (
              (disableGuardSelf || disableGuardLastAdmin) ? (
                <button
                  disabled
                  title={
                    disableGuardSelf
                      ? 'You cannot disable your own account.'
                      : 'Cannot disable the only admin. Promote another user first.'
                  }
                  className="text-hc-caption text-hc-warning-text opacity-40 cursor-not-allowed"
                >
                  Disable
                </button>
              ) : (
                <button
                  onClick={() => setConfirmAction('disable')}
                  className="text-hc-caption text-hc-warning-text hover:text-hc-warning-text transition-colors"
                >
                  Disable
                </button>
              )
            ) : (
              <button
                onClick={handleEnable}
                disabled={enableMutation.isPending}
                className="text-hc-caption text-hc-muted hover:text-hc-fg disabled:opacity-50 transition-colors"
              >
                Enable
              </button>
            )}

            {/* Remove */}
            {(removeGuardSelf || removeGuardLastAdmin) ? (
              <button
                disabled
                title={
                  removeGuardSelf
                    ? 'You cannot remove your own account.'
                    : 'Cannot remove the only admin. Promote another user first.'
                }
                className="text-hc-caption text-hc-danger-text opacity-40 cursor-not-allowed"
              >
                Remove
              </button>
            ) : (
              <button
                onClick={() => setConfirmAction('remove')}
                className="text-hc-caption text-hc-danger-text hover:text-hc-danger-text transition-colors"
              >
                Remove
              </button>
            )}

            {/* Collapse */}
            <button
              onClick={() => onExpand(null)}
              className="text-hc-caption text-hc-muted hover:text-hc-fg transition-colors"
            >
              ✕
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// -- InviteRow --

function InviteRow({ invite }) {
  const { addToast } = useToast();
  const revokeMutation = useRevokeInvite();
  const resendMutation = useResendInvite();
  const [confirmRevoke, setConfirmRevoke] = useState(false);

  const expiryText = formatExpiry(invite.expiresAt || invite.expires_at);
  const isExpired = expiryText === 'Expired';

  function handleResend() {
    resendMutation.mutate(invite.id, {
      onSuccess: () => addToast(`Invite resent to ${invite.email}.`, 'success'),
    });
  }

  if (confirmRevoke) {
    return (
      <div className="px-4 py-3 flex items-center gap-4 border-b border-hc-panel-border last:border-b-0">
        <span className="flex-1 text-hc-body text-hc-fg truncate">{invite.email}</span>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="text-hc-caption text-hc-muted">Revoke this invite?</span>
          <button
            onClick={() => { revokeMutation.mutate(invite.id); setConfirmRevoke(false); }}
            disabled={revokeMutation.isPending}
            className="text-xs px-2 py-1 bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50 transition-colors"
          >
            Yes, revoke
          </button>
          <button
            onClick={() => setConfirmRevoke(false)}
            className="text-xs px-2 py-1 bg-hc-panel-mid text-hc-muted-light rounded hover:bg-hc-panel-mid transition-colors"
          >
            Keep invite
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 py-3 flex items-center gap-4 border-b border-hc-panel-border last:border-b-0">
      <span className="flex-1 text-hc-body text-hc-fg truncate">{invite.email}</span>
      <RoleBadge role={invite.role} />
      <span className={`text-hc-caption ${isExpired ? 'text-hc-warning-text' : 'text-hc-muted'}`}>
        {expiryText}
      </span>
      <div className="flex items-center gap-2 flex-shrink-0">
        <button
          onClick={handleResend}
          disabled={resendMutation.isPending}
          className="text-hc-caption text-hc-muted hover:text-hc-fg disabled:opacity-50 transition-colors"
        >
          Resend
        </button>
        <button
          onClick={() => setConfirmRevoke(true)}
          className="text-hc-caption text-hc-danger-text hover:text-hc-danger-text transition-colors"
        >
          Revoke
        </button>
      </div>
    </div>
  );
}

// -- UsersPanel --

export default function UsersPanel() {
  const { user: currentUser } = useAuth();
  const { data: users = [], isLoading: usersLoading } = useUsers();
  const { data: invites = [], isLoading: invitesLoading } = useInvites();
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [expandedUserId, setExpandedUserId] = useState(null);

  const activeAdminCount = users.filter(
    (u) => u.role === 'admin' && u.status === 'active'
  ).length;

  function handleExpand(userId) {
    setExpandedUserId(userId);
  }

  return (
    <div className="space-y-4">
      {/* Users */}
      <Card>
        <Card.Header
          title="Users"
          headingLevel={2}
          actions={(
            <button
              onClick={() => setShowInviteModal(true)}
              className="inline-flex items-center gap-2 px-3 py-1 bg-hc-accent-strong text-white text-hc-caption font-semibold rounded-lg hover:bg-hc-accent-stronger transition-colors"
            >
              <UserPlus size={14} />
              Invite user
            </button>
          )}
        />
        <Card.Body>
          {/* Table header */}
          <div className="px-4 py-2 bg-hc-panel-mid border-b border-hc-panel-border flex items-center gap-4">
            <span className="flex-1 text-hc-caption font-semibold uppercase tracking-wide text-hc-muted">
              Name / Email
            </span>
            <span className="text-hc-caption font-semibold uppercase tracking-wide text-hc-muted">Role</span>
            <span className="text-hc-caption font-semibold uppercase tracking-wide text-hc-muted">Status</span>
            <span className="text-hc-caption font-semibold uppercase tracking-wide text-hc-muted">Actions</span>
          </div>

          {usersLoading ? (
            <div className="px-4 py-8 text-center text-hc-caption text-hc-muted">Loading...</div>
          ) : users.length === 0 ? (
            <div className="px-4 py-8 text-center text-hc-caption text-hc-muted italic">
              No other users yet. Use &apos;Invite user&apos; to add household members.
            </div>
          ) : (
            users.map((user) => {
              const isLastAdmin =
                user.role === 'admin' && user.status === 'active' && activeAdminCount <= 1;
              return (
                <UserRow
                  key={user.id}
                  user={user}
                  currentUser={currentUser}
                  isLastAdmin={isLastAdmin}
                  expanded={expandedUserId === user.id}
                  onExpand={handleExpand}
                />
              );
            })
          )}
        </Card.Body>
      </Card>

      {/* Pending invites */}
      <Card>
        <Card.Header title="Pending invites" />
        <Card.Body>
          {invitesLoading ? (
            <div className="px-4 py-6 text-center text-hc-caption text-hc-muted">Loading...</div>
          ) : invites.length === 0 ? (
            <div className="px-4 py-6 text-center text-hc-caption text-hc-muted italic">
              No pending invites.
            </div>
          ) : (
            invites.map((invite) => (
              <InviteRow key={invite.id} invite={invite} />
            ))
          )}
        </Card.Body>
      </Card>

      {/* Invite modal */}
      {showInviteModal && (
        <InviteCreateModal onClose={() => setShowInviteModal(false)} />
      )}
    </div>
  );
}
