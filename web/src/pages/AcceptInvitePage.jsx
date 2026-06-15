import { useState, useRef, useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Eye, EyeOff, Loader2, AlertCircle } from 'lucide-react';
import { fetchJson, API_BASE } from '../lib/api.js';
import BrandLogo from '../components/BrandLogo.jsx';
import PasswordStrengthMeter from '../components/PasswordStrengthMeter.jsx';

// -- Reason-aware copy map --
const INVITE_REASON_COPY = {
  revoked: {
    title: 'Invitation revoked',
    body: 'This invitation has been revoked. Contact your administrator to request a new invitation.',
  },
  expired: {
    title: 'Invitation expired',
    body: 'This invitation has expired. Contact your administrator to request a new invitation.',
  },
  used: {
    title: 'Invitation already used',
    body: "This invitation has already been used. If this wasn't you, contact your administrator.",
  },
  invalid: {
    title: 'Invitation not valid',
    body: 'This invitation link is invalid. Contact your administrator to request a new invitation.',
  },
};

function getReasonCopy(reason) {
  return INVITE_REASON_COPY[reason] ?? INVITE_REASON_COPY.invalid;
}

// -- Shared card shell (theme-correct in light + dark via --hc-* tokens) --
function InviteCardShell({ children }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-hc-bg px-4">
      <div className="bg-hc-panel border border-hc-panel-border rounded-xl shadow-sm w-full max-w-sm p-6 space-y-6">
        <div className="flex justify-center">
          <BrandLogo className="h-10" />
        </div>
        {children}
      </div>
    </div>
  );
}

// -- Invalid/revoked/expired/used card --
function InvalidInviteCard({ reason }) {
  const { title, body } = getReasonCopy(reason);
  return (
    <InviteCardShell>
      <div>
        <h1 className="text-hc-page-title font-semibold text-hc-fg-strong text-center">
          {title}
        </h1>
        <p className="text-hc-body text-hc-muted text-center mt-2">
          {body}
        </p>
      </div>

      <div className="text-center">
        <span className="text-hc-caption text-hc-muted">
          Request a new invite
        </span>
      </div>
    </InviteCardShell>
  );
}

// -- Spinner card (shown while validating the token) --
function LoadingCard() {
  return (
    <InviteCardShell>
      <div className="flex justify-center py-4">
        <Loader2 size={24} className="animate-spin text-hc-muted" />
      </div>
    </InviteCardShell>
  );
}

export default function AcceptInvitePage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') ?? '';

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [matchError, setMatchError] = useState('');
  const [serverError, setServerError] = useState('');

  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const passwordRef = useRef(null);

  // Pre-validate the invite token on mount (non-destructive read).
  // enabled:!!token skips the query when there is no token; in that case
  // isLoading stays false and valid stays undefined — we fall through to
  // the invalid card via the !token branch below.
  const {
    data: inviteStatus,
    isLoading: inviteLoading,
    isError: inviteError,
  } = useQuery({
    queryKey: ['auth', 'invite-status', token],
    queryFn: () => fetchJson(`${API_BASE}/auth/invite-status?token=${encodeURIComponent(token)}`),
    enabled: !!token,
    retry: false,
    staleTime: Infinity,
  });

  // Focus password field once the form becomes visible
  useEffect(() => {
    if (token && inviteStatus?.valid && passwordRef.current) {
      passwordRef.current.focus();
    }
  }, [token, inviteStatus?.valid]);

  const acceptMutation = useMutation({
    mutationFn: ({ token, password }) =>
      fetchJson(`${API_BASE}/auth/accept-invite`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      }),
    onSuccess: async () => {
      try {
        const data = await fetchJson(`${API_BASE}/auth/csrf-token`);
        if (data?.csrfToken) {
          sessionStorage.setItem('csrfToken', data.csrfToken);
        }
      } catch {
        // Non-fatal: CSRF token fetch failure should not block navigation
      }
      queryClient.invalidateQueries({ queryKey: ['auth', 'me'] });
      navigate('/');
    },
    onError: (err) => {
      setServerError(err.message || 'Something went wrong. Check your connection and try again.');
    },
  });

  function handleSubmit(e) {
    e.preventDefault();
    setMatchError('');
    setServerError('');

    if (password !== confirm) {
      setMatchError("Passwords don't match.");
      return;
    }

    acceptMutation.mutate({ token, password });
  }

  // No token in URL — show invalid card without querying the server
  if (!token) {
    return <InvalidInviteCard reason="invalid" />;
  }

  // Token present but query still in flight — show spinner (do NOT flash the form)
  if (inviteLoading) {
    return <LoadingCard />;
  }

  // Query errored (DB failure / network error) or server returned valid:false —
  // fail toward showing the invalid card so a broken token never presents the form.
  if (inviteError || !inviteStatus?.valid) {
    const reason = inviteStatus?.reason ?? 'invalid';
    return <InvalidInviteCard reason={reason} />;
  }

  // valid === true — show the account-creation form (unchanged behavior)
  return (
    <div className="min-h-screen flex items-center justify-center bg-hc-bg px-4">
      <div className="bg-hc-panel border border-hc-panel-border rounded-xl shadow-sm w-full max-w-sm p-6 space-y-6">
        <div className="flex justify-center">
          <BrandLogo className="h-10" />
        </div>

        <div>
          <h1 className="text-hc-page-title font-semibold text-hc-fg-strong text-center">
            Create your account
          </h1>
          <p className="text-hc-body text-hc-muted text-center mt-1">
            You've been invited to HomeChronicle.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Inline error banner */}
          {(serverError || matchError) && (
            <div className="flex items-start gap-2 p-3 bg-hc-danger-bg border border-hc-danger-border rounded-lg">
              <AlertCircle size={16} className="text-hc-danger-text shrink-0 mt-0.5" />
              <p className="text-hc-caption text-hc-danger-text">
                {serverError || matchError}
              </p>
            </div>
          )}

          {/* Password field */}
          <div>
            <label htmlFor="password" className="block text-hc-label text-hc-fg mb-1">
              Password
            </label>
            <div className="relative">
              <input
                id="password"
                ref={passwordRef}
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                placeholder="••••••••"
                className="w-full px-4 py-2 rounded-lg border border-hc-panel-border bg-hc-panel text-hc-body text-hc-fg placeholder:text-hc-muted focus:outline-none focus:ring-2 focus:ring-[var(--hc-focus-ring)] focus:border-hc-accent-strong transition-colors pr-10"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                className="absolute inset-y-0 right-0 flex items-center pr-3 p-2 text-hc-muted hover:text-hc-fg"
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            {/* Strength meter below password field, above confirm */}
            <div className="mt-2">
              <PasswordStrengthMeter password={password} />
            </div>
          </div>

          {/* Confirm password field */}
          <div>
            <label htmlFor="confirm-password" className="block text-hc-label text-hc-fg mb-1">
              Confirm password
            </label>
            <div className="relative">
              <input
                id="confirm-password"
                type={showConfirm ? 'text' : 'password'}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
                placeholder="••••••••"
                className="w-full px-4 py-2 rounded-lg border border-hc-panel-border bg-hc-panel text-hc-body text-hc-fg placeholder:text-hc-muted focus:outline-none focus:ring-2 focus:ring-[var(--hc-focus-ring)] focus:border-hc-accent-strong transition-colors pr-10"
              />
              <button
                type="button"
                onClick={() => setShowConfirm((v) => !v)}
                aria-label={showConfirm ? 'Hide password' : 'Show password'}
                className="absolute inset-y-0 right-0 flex items-center pr-3 p-2 text-hc-muted hover:text-hc-fg"
              >
                {showConfirm ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={acceptMutation.isPending}
            className="w-full py-2 px-4 rounded-lg bg-hc-accent-strong text-white text-hc-body font-semibold hover:bg-hc-accent-stronger disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center justify-center"
          >
            {acceptMutation.isPending
              ? <Loader2 size={16} className="animate-spin" />
              : 'Create account'}
          </button>
        </form>
      </div>
    </div>
  );
}
