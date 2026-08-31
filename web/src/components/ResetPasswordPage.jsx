import { useState, useRef, useEffect } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { Eye, EyeOff, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react';
import { fetchJson, API_BASE } from '../lib/api.js';
import BrandLogo from './BrandLogo.jsx';
import PasswordStrengthMeter from './PasswordStrengthMeter.jsx';

// Enumeration-safe confirmation copy (identical for all emails — PWD-02/PWD-03)
const RESET_CONFIRMATION = "If that email address is registered, you'll receive a reset link shortly. The link expires after 1 hour.";

export default function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') ?? '';

  return token ? <ViewB token={token} /> : <ViewA />;
}

// -- View A: Request form (no token) --

function ViewA() {
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const emailRef = useRef(null);

  // Focus email field on mount (UI-SPEC: View A focuses email)
  useEffect(() => {
    if (emailRef.current) {
      emailRef.current.focus();
    }
  }, []);

  const forgotMutation = useMutation({
    mutationFn: ({ email }) =>
      fetchJson(`${API_BASE}/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      }),
    onSuccess: () => {
      setSubmitted(true);
    },
    onError: () => {
      // Server always returns 200 — any network/config error still shows
      // the enumeration-safe copy (do NOT branch on error existence)
      setSubmitted(true);
    },
  });

  function handleSubmit(e) {
    e.preventDefault();
    forgotMutation.mutate({ email });
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-hc-bg px-4">
      <div className="bg-hc-panel border border-hc-panel-border rounded-xl w-full max-w-sm p-6 space-y-6">
        <div className="flex justify-center">
          <BrandLogo className="h-10" />
        </div>

        {submitted ? (
          // Post-submit confirmation — same copy regardless of email existence (PWD-02/03)
          <div className="space-y-4">
            <p className="text-hc-body text-hc-muted text-center">
              {RESET_CONFIRMATION}
            </p>
          </div>
        ) : (
          <>
            <div>
              <h1 className="text-hc-page-title font-semibold text-hc-fg-strong text-center">
                Forgot your password?
              </h1>
              <p className="text-hc-body text-hc-muted text-center mt-1">
                Enter your email address and we'll send you a reset link.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="email" className="block text-hc-label text-hc-fg mb-1">
                  Email address
                </label>
                <input
                  id="email"
                  ref={emailRef}
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  placeholder="you@example.com"
                  className="w-full px-4 py-2 rounded-lg border border-hc-panel-border bg-hc-panel text-hc-body text-hc-fg placeholder:text-hc-muted focus:outline-none focus:ring-2 focus:ring-[var(--hc-focus-ring)] focus:border-hc-accent-strong transition-colors"
                />
              </div>

              <button
                type="submit"
                disabled={forgotMutation.isPending}
                className="w-full py-2 px-4 rounded-lg bg-hc-accent-strong text-hc-on-accent text-hc-body font-semibold hover:bg-hc-accent-stronger disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center justify-center"
              >
                {forgotMutation.isPending
                  ? <Loader2 size={16} className="animate-spin" />
                  : 'Send reset link'}
              </button>
            </form>
          </>
        )}

        <div className="text-center">
          <Link
            to="/login"
            className="text-hc-caption text-hc-muted hover:text-hc-fg underline-offset-2 hover:underline"
          >
            Back to sign in
          </Link>
        </div>
      </div>
    </div>
  );
}

// -- View B: Set new password form (token present) --

function ViewB({ token }) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [matchError, setMatchError] = useState('');
  const [tokenInvalid, setTokenInvalid] = useState(false);
  const [success, setSuccess] = useState(false);

  const navigate = useNavigate();
  const passwordRef = useRef(null);

  // Focus password field on mount (UI-SPEC: View B focuses password)
  useEffect(() => {
    if (passwordRef.current) {
      passwordRef.current.focus();
    }
  }, []);

  const resetMutation = useMutation({
    mutationFn: ({ token, password }) =>
      fetchJson(`${API_BASE}/auth/reset-confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      }),
    onSuccess: () => {
      setSuccess(true);
      setTimeout(() => navigate('/login'), 2000);
    },
    onError: () => {
      // 400 or any error → show token-invalid card (no leakage)
      setTokenInvalid(true);
    },
  });

  function handleSubmit(e) {
    e.preventDefault();
    setMatchError('');

    if (password !== confirm) {
      setMatchError("Passwords don't match.");
      return;
    }

    resetMutation.mutate({ token, password });
  }

  // Token-invalid full-card replacement
  if (tokenInvalid) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-hc-bg px-4">
        <div className="bg-hc-panel border border-hc-panel-border rounded-xl w-full max-w-sm p-6 space-y-6">
          <div className="flex justify-center">
            <BrandLogo className="h-10" />
          </div>

          <div>
            <h1 className="text-hc-page-title font-semibold text-hc-fg-strong text-center">
              This reset link has expired
            </h1>
            <p className="text-hc-body text-hc-muted text-center mt-2">
              This reset link has expired or has already been used. Request a new one.
            </p>
          </div>

          <div className="text-center">
            <Link
              to="/reset-password"
              className="text-hc-caption text-hc-muted hover:text-hc-fg underline-offset-2 hover:underline"
            >
              Request a new link
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-hc-bg px-4">
      <div className="bg-hc-panel border border-hc-panel-border rounded-xl w-full max-w-sm p-6 space-y-6">
        <div className="flex justify-center">
          <BrandLogo className="h-10" />
        </div>

        {success ? (
          // Success banner before auto-navigate (2s)
          <div className="space-y-4">
            <div className="flex items-start gap-3 p-3 bg-hc-success-bg border border-hc-success-border rounded-lg">
              <CheckCircle2 size={16} className="text-hc-success-text shrink-0 mt-0.5" />
              <p className="text-hc-caption text-hc-success-text">
                Your password has been reset. Redirecting you to sign in…
              </p>
            </div>
          </div>
        ) : (
          <>
            <div>
              <h1 className="text-hc-page-title font-semibold text-hc-fg-strong text-center">
                Reset your password
              </h1>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Inline error banner */}
              {matchError && (
                <div className="flex items-start gap-2 p-3 bg-hc-danger-bg border border-hc-danger-border rounded-lg">
                  <AlertCircle size={16} className="text-hc-danger-text shrink-0 mt-0.5" />
                  <p className="text-hc-caption text-hc-danger-text">{matchError}</p>
                </div>
              )}

              {/* New password field */}
              <div>
                <label htmlFor="password" className="block text-hc-label text-hc-fg mb-1">
                  New password
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
                disabled={resetMutation.isPending}
                className="w-full py-2 px-4 rounded-lg bg-hc-accent-strong text-hc-on-accent text-hc-body font-semibold hover:bg-hc-accent-stronger disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center justify-center"
              >
                {resetMutation.isPending
                  ? <Loader2 size={16} className="animate-spin" />
                  : 'Set new password'}
              </button>
            </form>
          </>
        )}

        <div className="text-center">
          <Link
            to="/login"
            className="text-hc-caption text-hc-muted hover:text-hc-fg underline-offset-2 hover:underline"
          >
            Back to sign in
          </Link>
        </div>
      </div>
    </div>
  );
}
