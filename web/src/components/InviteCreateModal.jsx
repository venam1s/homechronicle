import { useState, useRef, useEffect } from 'react';
import { CheckCircle2, Copy, CheckCheck, Loader2 } from 'lucide-react';
import { useInviteUser } from '../hooks/useUsers.js';

const FIELD_CLASS =
  'w-full px-4 py-2 rounded-lg border border-hc-panel-border bg-hc-panel text-hc-body text-hc-fg placeholder:text-hc-muted focus:outline-none focus:ring-2 focus:ring-[var(--hc-focus-ring)] focus:border-hc-accent-strong transition-colors';

const SELECT_CLASS =
  'w-full px-4 py-2 rounded-lg border border-hc-panel-border bg-hc-panel text-hc-body text-hc-fg focus:outline-none focus:ring-2 focus:ring-[var(--hc-focus-ring)]';

function mapErrorMessage(err) {
  const msg = err?.message ?? '';
  // Check pending-invite first (message contains both "pending" and "invite")
  if (/pending.*invite/i.test(msg) || /invite.*already/i.test(msg) || /invite.*exist/i.test(msg)) {
    return 'A pending invite for this email already exists. Resend or revoke the existing invite first.';
  }
  if (/already exists/i.test(msg) || /account.*email/i.test(msg)) {
    return 'An account with this email already exists.';
  }
  return 'Something went wrong. Check your connection and try again.';
}

/**
 * Modal for creating a user invite.
 * Phase 1: email + role form.
 * Phase 2 (success): always-visible copyable invite link + emailed/SMTP-off note.
 * D-08: role selector defaults to member.
 * D-10: invite link always shown, even when SMTP emailed it.
 */
export default function InviteCreateModal({ onClose }) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('member');
  const [serverError, setServerError] = useState('');
  const [successData, setSuccessData] = useState(null); // { inviteUrl, emailed, email }
  const [copied, setCopied] = useState(false);

  const emailRef = useRef(null);
  const copyTimerRef = useRef(null);

  const inviteUser = useInviteUser();

  // Focus email input on open
  useEffect(() => {
    if (emailRef.current) emailRef.current.focus();
  }, []);

  // Cleanup copy timer on unmount
  useEffect(() => {
    return () => {
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    };
  }, []);

  function handleSubmit(e) {
    e.preventDefault();
    setServerError('');
    inviteUser.mutate(
      { email, role },
      {
        onSuccess: (data) => {
          setSuccessData({ inviteUrl: data.inviteUrl, emailed: data.emailed, email: data.email ?? email });
        },
        onError: (err) => {
          setServerError(mapErrorMessage(err));
        },
      }
    );
  }

  function handleCopy() {
    if (!successData?.inviteUrl) return;
    navigator.clipboard.writeText(successData.inviteUrl).then(() => {
      setCopied(true);
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
      copyTimerRef.current = setTimeout(() => setCopied(false), 2000);
    });
  }

  function handleBackdropClick(e) {
    if (e.target === e.currentTarget) onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm px-4"
      onClick={handleBackdropClick}
    >
      <div className="bg-hc-panel border border-hc-panel-border rounded-xl shadow-lg w-full max-w-sm p-6 space-y-4">
        <h2 className="text-hc-section font-semibold text-hc-fg-strong">Invite a user</h2>

        {successData ? (
          /* Phase 2: success state */
          <div className="space-y-4">
            {/* Success banner */}
            <div className="flex items-start gap-3 p-3 bg-hc-success-bg border border-hc-success-border rounded-lg">
              <CheckCircle2 size={16} className="text-hc-success-text shrink-0 mt-0.5" />
              <p className="text-hc-caption text-hc-success-text">
                {successData.emailed
                  ? `Invite emailed to ${successData.email}.`
                  : `Invite link created for ${successData.email}.`}
              </p>
            </div>

            {/* Copyable invite link — always shown (D-10) */}
            <div>
              <p className="text-hc-caption text-hc-muted mb-1">Invite link (valid 72 hours)</p>
              <div className="flex items-center gap-2">
                <input
                  readOnly
                  value={successData.inviteUrl}
                  aria-label="Invite link"
                  className="flex-1 text-hc-caption text-hc-muted-light bg-hc-panel-mid border border-hc-panel-border rounded-lg px-3 py-2 truncate cursor-default"
                />
                <button
                  aria-label="Copy invite link"
                  onClick={handleCopy}
                  className={`p-2 rounded-lg border border-hc-panel-border bg-hc-panel hover:bg-hc-panel-hover transition-colors ${
                    copied ? 'text-hc-success-text' : 'text-hc-muted hover:text-hc-accent-strong'
                  }`}
                >
                  {copied ? <CheckCheck size={14} /> : <Copy size={14} />}
                </button>
              </div>
              <p className="text-hc-caption text-hc-muted mt-1">
                {successData.emailed
                  ? `Also emailed to ${successData.email}.`
                  : 'SMTP not configured — share this link manually.'}
              </p>
            </div>

            <button
              onClick={onClose}
              className="w-full px-4 py-2 rounded-lg bg-hc-panel-mid text-hc-body text-hc-muted-light hover:bg-hc-panel-hover transition-colors"
            >
              Done
            </button>
          </div>
        ) : (
          /* Phase 1: form */
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Email field */}
            <div>
              <label htmlFor="invite-email" className="block text-hc-label text-hc-fg mb-1">
                Email address
              </label>
              <input
                id="invite-email"
                ref={emailRef}
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="user@example.com"
                className={FIELD_CLASS}
                autoComplete="off"
              />
            </div>

            {/* Role selector (D-08: default member) */}
            <div>
              <label htmlFor="invite-role" className="block text-hc-label text-hc-fg mb-1">
                Role
              </label>
              <select
                id="invite-role"
                value={role}
                onChange={(e) => setRole(e.target.value)}
                className={SELECT_CLASS}
              >
                <option value="member">Member (default)</option>
                <option value="admin">Admin</option>
              </select>
            </div>

            {/* Error banner */}
            {serverError && (
              <div className="flex items-start gap-2 p-3 bg-hc-danger-bg border border-hc-danger-border rounded-lg">
                <p className="text-hc-caption text-hc-danger-text">{serverError}</p>
              </div>
            )}

            {/* Buttons */}
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={inviteUser.isPending}
                className="flex-1 py-2 px-4 rounded-lg bg-hc-accent-strong text-hc-on-accent text-hc-body font-semibold hover:bg-hc-accent-stronger disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center justify-center"
              >
                {inviteUser.isPending
                  ? <Loader2 size={16} className="animate-spin" />
                  : 'Send invite'}
              </button>
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-lg bg-hc-panel-mid text-hc-body text-hc-muted-light hover:bg-hc-panel-hover transition-colors"
              >
                Close
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
