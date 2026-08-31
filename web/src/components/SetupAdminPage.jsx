import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { fetchJson, API_BASE } from '../lib/api.js';
import BrandLogo from './BrandLogo.jsx';
import { useToast } from './Toast.jsx';

export default function SetupAdminPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [confirmError, setConfirmError] = useState('');

  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { addToast } = useToast();

  const claimAdminMutation = useMutation({
    mutationFn: ({ email, password }) =>
      fetchJson(`${API_BASE}/auth/claim-admin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['auth', 'me'] });
      navigate('/');
    },
    onError: (err) => {
      if (err.status === 409) {
        navigate('/login');
      } else {
        addToast('Could not create admin account', 'error');
      }
    },
  });

  function handleSubmit(e) {
    e.preventDefault();
    // Mirror the server-side minimum (WR-01); the server check in claim-admin is authoritative.
    if (password.length < 12) {
      setConfirmError('Password must be at least 12 characters.');
      return;
    }
    if (password !== confirm) {
      setConfirmError('Passwords do not match.');
      return;
    }
    setConfirmError('');
    claimAdminMutation.mutate({ email, password });
  }

  const inputClass =
    'w-full px-4 py-2 rounded-lg border border-hc-panel-border bg-hc-panel text-hc-body text-hc-fg placeholder:text-hc-muted focus:outline-none focus:ring-2 focus:ring-[var(--hc-focus-ring)] focus:border-hc-accent-strong transition-colors';

  return (
    <div className="min-h-screen flex items-center justify-center bg-hc-bg px-4">
      <div className="bg-hc-panel border border-hc-panel-border rounded-xl w-full max-w-sm p-6 space-y-6">
        <div className="flex justify-center">
          <BrandLogo className="h-10" />
        </div>

        <div>
          <h1 className="text-hc-page-title font-semibold text-hc-fg text-center">
            Create admin account
          </h1>
          <p className="text-hc-body text-hc-muted text-center mt-1">
            {"You're the first user. Set up your admin credentials to get started."}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="setup-email" className="block text-hc-label text-hc-fg mb-1">
              Email address
            </label>
            <input
              id="setup-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="you@example.com"
              className={inputClass}
            />
          </div>

          <div>
            <label htmlFor="setup-password" className="block text-hc-label text-hc-fg mb-1">
              Password
            </label>
            <input
              id="setup-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              placeholder="••••••••"
              className={inputClass}
            />
          </div>

          <div>
            <label htmlFor="setup-confirm" className="block text-hc-label text-hc-fg mb-1">
              Confirm password
            </label>
            <input
              id="setup-confirm"
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
              placeholder="••••••••"
              className={inputClass}
            />
            {confirmError && (
              <p className="text-hc-caption text-hc-danger-text mt-1">{confirmError}</p>
            )}
          </div>

          <button
            type="submit"
            disabled={claimAdminMutation.isPending}
            className="w-full py-2 px-4 rounded-lg bg-hc-accent-strong text-white text-hc-body font-semibold hover:bg-hc-accent-stronger disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center justify-center"
          >
            {claimAdminMutation.isPending
              ? <Loader2 size={16} className="animate-spin" />
              : 'Create account'}
          </button>
        </form>
      </div>
    </div>
  );
}
