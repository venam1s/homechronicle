import { useState, useRef, useEffect } from 'react';
import { useMutation } from '@tanstack/react-query';
import { CheckCircle2, Eye, EyeOff, Loader2 } from 'lucide-react';
import { fetchJson, API_BASE } from '../lib/api.js';
import Card from './Card.jsx';
import PasswordStrengthMeter from './PasswordStrengthMeter.jsx';

const FIELD_CLASS =
  'w-full px-4 py-2 rounded-lg border border-hc-panel-border bg-hc-panel text-hc-body text-hc-fg placeholder:text-hc-muted focus:outline-none focus:ring-2 focus:ring-[var(--hc-focus-ring)] focus:border-hc-accent-strong transition-colors pr-10';

function mapErrorMessage(err) {
  const msg = err?.message ?? '';
  if (/incorrect/i.test(msg) || /wrong.*current/i.test(msg)) {
    return 'Current password is incorrect.';
  }
  if (/at least 10/i.test(msg) || /too short/i.test(msg)) {
    return 'Password must be at least 10 characters.';
  }
  if (/too common/i.test(msg) || /blocklist/i.test(msg)) {
    return 'That password is too common. Choose a less predictable passphrase.';
  }
  return 'Something went wrong. Check your connection and try again.';
}

/**
 * Change-own-password section for logged-in users (admin or member).
 * PWD-01 / D-07: available to every authenticated user — no role guard.
 */
export default function ChangePasswordSection() {
  const [current, setCurrent] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');

  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const [mismatchError, setMismatchError] = useState('');
  const [serverError, setServerError] = useState('');
  const [success, setSuccess] = useState(false);

  const successTimerRef = useRef(null);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (successTimerRef.current) clearTimeout(successTimerRef.current);
    };
  }, []);

  const mutation = useMutation({
    mutationFn: ({ currentPassword, newPw }) =>
      fetchJson(`${API_BASE}/auth/password`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword: newPw }),
      }),
    onSuccess: () => {
      setServerError('');
      setMismatchError('');
      setSuccess(true);
      // Reset form after ~3 seconds (UI-SPEC § ChangePasswordSection)
      successTimerRef.current = setTimeout(() => {
        setSuccess(false);
        setCurrent('');
        setNewPassword('');
        setConfirm('');
        setShowCurrent(false);
        setShowNew(false);
        setShowConfirm(false);
      }, 3000);
    },
    onError: (err) => {
      setServerError(mapErrorMessage(err));
    },
  });

  function handleSubmit(e) {
    e.preventDefault();
    setServerError('');
    setMismatchError('');

    if (newPassword !== confirm) {
      setMismatchError("Passwords don't match.");
      return;
    }

    mutation.mutate({ currentPassword: current, newPw: newPassword });
  }

  if (success) {
    return (
      <div className="space-y-4">
        <Card>
          <Card.Header title="Change password" headingLevel={2} />
          <Card.Body>
            <div className="flex items-start gap-3 p-3 bg-hc-success-bg border border-hc-success-border rounded-lg">
              <CheckCircle2 size={16} className="text-hc-success-text shrink-0 mt-0.5" />
              <p className="text-hc-caption text-hc-success-text">Password updated successfully.</p>
            </div>
          </Card.Body>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <Card.Header title="Change password" headingLevel={2} />
        <Card.Body>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Current password */}
        <div>
          <label htmlFor="current-password" className="block text-hc-label text-hc-fg mb-1">
            Current password
          </label>
          <div className="relative">
            <input
              id="current-password"
              aria-label="Current password"
              type={showCurrent ? 'text' : 'password'}
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              required
              className={FIELD_CLASS}
              placeholder="••••••••"
              autoComplete="current-password"
            />
            <button
              type="button"
              onClick={() => setShowCurrent((v) => !v)}
              aria-label={showCurrent ? 'Hide current password' : 'Show current password'}
              className="absolute inset-y-0 right-0 flex items-center pr-3 p-2 text-hc-muted hover:text-hc-fg"
            >
              {showCurrent ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </div>

        {/* New password + strength meter */}
        <div>
          <label htmlFor="new-password" className="block text-hc-label text-hc-fg mb-1">
            New password
          </label>
          <div className="relative">
            <input
              id="new-password"
              aria-label="New password"
              type={showNew ? 'text' : 'password'}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              className={FIELD_CLASS}
              placeholder="••••••••"
              autoComplete="new-password"
            />
            <button
              type="button"
              onClick={() => setShowNew((v) => !v)}
              aria-label={showNew ? 'Hide new password' : 'Show new password'}
              className="absolute inset-y-0 right-0 flex items-center pr-3 p-2 text-hc-muted hover:text-hc-fg"
            >
              {showNew ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
          <div className="mt-2">
            <PasswordStrengthMeter password={newPassword} />
          </div>
        </div>

        {/* Confirm new password */}
        <div>
          <label htmlFor="confirm-password" className="block text-hc-label text-hc-fg mb-1">
            Confirm new password
          </label>
          <div className="relative">
            <input
              id="confirm-password"
              aria-label="Confirm new password"
              type={showConfirm ? 'text' : 'password'}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
              className={FIELD_CLASS}
              placeholder="••••••••"
              autoComplete="new-password"
            />
            <button
              type="button"
              onClick={() => setShowConfirm((v) => !v)}
              aria-label={showConfirm ? 'Hide confirm password' : 'Show confirm password'}
              className="absolute inset-y-0 right-0 flex items-center pr-3 p-2 text-hc-muted hover:text-hc-fg"
            >
              {showConfirm ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </div>

        {/* Error banners */}
        {mismatchError && (
          <div className="flex items-start gap-2 p-3 bg-hc-danger-bg border border-hc-danger-border rounded-lg">
            <p className="text-hc-caption text-hc-danger-text">{mismatchError}</p>
          </div>
        )}

        {serverError && (
          <div className="flex items-start gap-2 p-3 bg-hc-danger-bg border border-hc-danger-border rounded-lg">
            <p className="text-hc-caption text-hc-danger-text">{serverError}</p>
          </div>
        )}

        {/* Submit button — w-auto (not full-width per UI-SPEC) */}
        <div className="flex justify-start">
          <button
            type="submit"
            disabled={mutation.isPending}
            className="w-auto py-2 px-4 rounded-lg bg-hc-accent-strong text-white text-hc-body font-semibold hover:bg-hc-accent-stronger disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center justify-center"
          >
            {mutation.isPending
              ? <Loader2 size={16} className="animate-spin" />
              : 'Update password'}
          </button>
        </div>
      </form>

        </Card.Body>
      </Card>
    </div>
  );
}
