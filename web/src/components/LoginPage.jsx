import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate, Link } from 'react-router-dom';
import { Eye, EyeOff, Loader2 } from 'lucide-react';
import { fetchJson, API_BASE } from '../lib/api.js';
import BrandLogo from './BrandLogo.jsx';
import { useToast } from './Toast.jsx';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { addToast } = useToast();

  const loginMutation = useMutation({
    mutationFn: ({ email, password, rememberMe }) =>
      fetchJson(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, rememberMe }),
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
      // Only a real 401 means bad credentials. Any other failure (5xx gateway
      // error, network failure, no status) is a backend/connectivity problem —
      // show a distinct message so an outage isn't mistaken for a wrong password.
      // Keep the 401 copy non-enumerating (no user-found vs wrong-password hint).
      if (err?.status === 401) {
        addToast('Incorrect email or password.', 'error');
      } else {
        addToast('HomeChronicle is temporarily unavailable. Please try again in a moment.', 'error');
      }
    },
  });

  function handleSubmit(e) {
    e.preventDefault();
    loginMutation.mutate({ email, password, rememberMe });
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-hc-bg px-4">
      <div className="bg-hc-panel border border-hc-panel-border rounded-xl shadow-sm w-full max-w-sm p-6 space-y-6">
        <div className="flex justify-center">
          <BrandLogo className="h-10" />
        </div>

        <div>
          <h1 className="text-hc-page-title font-semibold text-hc-fg text-center">Welcome back</h1>
          <p className="text-hc-body text-hc-muted text-center mt-1">Sign in to HomeChronicle</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="email" className="block text-hc-label text-hc-fg mb-1">
              Email address
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoFocus
              required
              placeholder="you@example.com"
              className="w-full px-4 py-2 rounded-lg border border-hc-panel-border bg-hc-panel text-hc-body text-hc-fg placeholder:text-hc-muted focus:outline-none focus:ring-2 focus:ring-[var(--hc-focus-ring)] focus:border-hc-accent-strong transition-colors"
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-hc-label text-hc-fg mb-1">
              Password
            </label>
            <div className="relative">
              <input
                id="password"
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
                {showPassword
                  ? <EyeOff size={16} />
                  : <Eye size={16} />}
              </button>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <input
              id="remember-me"
              type="checkbox"
              checked={rememberMe}
              onChange={(e) => setRememberMe(e.target.checked)}
              style={{ accentColor: 'rgb(var(--hc-accent-rgb))' }}
            />
            <label htmlFor="remember-me" className="text-hc-caption text-hc-muted-light">
              Keep me signed in for 30 days
            </label>
          </div>

          <button
            type="submit"
            disabled={loginMutation.isPending}
            className="w-full py-2 px-4 rounded-lg bg-hc-accent-strong text-white text-hc-body font-semibold hover:bg-hc-accent-stronger disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center justify-center"
          >
            {loginMutation.isPending
              ? <Loader2 size={16} className="animate-spin" />
              : 'Sign in'}
          </button>
        </form>

        <div className="text-center">
          <Link
            to="/reset-password"
            className="text-hc-caption text-hc-muted hover:text-hc-fg underline-offset-2 hover:underline"
          >
            Forgot password?
          </Link>
        </div>
      </div>
    </div>
  );
}
