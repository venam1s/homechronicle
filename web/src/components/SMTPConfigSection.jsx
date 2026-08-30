import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, Eye, EyeOff, Loader2, Send } from 'lucide-react';
import { fetchJson, API_BASE } from '../lib/api.js';
import { useToast } from './Toast.jsx';
import Card from './Card.jsx';

const INPUT_CLASS =
  'text-sm border border-hc-border-strong rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[var(--hc-focus-ring)] bg-hc-panel text-hc-fg-strong';

/**
 * Admin-only SMTP configuration section.
 * EMAIL-04: password is never seeded from the GET response (server omits it).
 * D-01: saving a blank password preserves the existing secret — the key is omitted.
 * D-02: fields set via environment variable show a notice and are not editable.
 * D-03: Send test email button — disabled when SMTP is unconfigured.
 */
export default function SMTPConfigSection() {
  const { addToast } = useToast();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['setup', 'smtp'],
    queryFn: () => fetchJson(`${API_BASE}/setup/smtp`),
  });

  // Form state — seeded from GET response EXCEPT password (EMAIL-04)
  const [host, setHost] = useState('');
  const [port, setPort] = useState('');
  const [user, setUser] = useState('');
  const [from, setFrom] = useState('');
  const [secure, setSecure] = useState(false);

  // Password masking state (D-01)
  const [changingPassword, setChangingPassword] = useState(false);
  const [password, setPassword] = useState(''); // NEVER seeded from GET
  const [showPassword, setShowPassword] = useState(false);

  const [testEmailError, setTestEmailError] = useState('');

  // Seed form from GET response when data arrives (fields only — no password)
  useEffect(() => {
    if (data) {
      setHost(data.host ?? '');
      setPort(data.port != null ? String(data.port) : '');
      setUser(data.user ?? '');
      setFrom(data.from ?? '');
      setSecure(Boolean(data.secure));
    }
  }, [data]);

  const isConfigured = Boolean(data?.host && data?.passwordConfigured);
  const envFields = data?.envFields ?? [];

  const saveMutation = useMutation({
    mutationFn: (body) =>
      fetchJson(`${API_BASE}/setup/smtp`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }),
    onSuccess: (data) => {
      // L-3: the save itself succeeded, but the backend reports truthfully when
      // its post-save verify() failed and left email disabled — show a warning
      // instead of the success toast in that case.
      if (data?.emailEnabled === false) {
        addToast(data.warning ?? 'Settings saved, but the SMTP connection test failed — email is disabled.', 'error');
      } else {
        addToast('SMTP settings saved.', 'success');
      }
      // After save, return to masked state; clear the password field
      setChangingPassword(false);
      setPassword('');
      setShowPassword(false);
      // Refetch so isConfigured / passwordConfigured reflect the just-saved
      // config — otherwise the "Send test email" button stays disabled and the
      // "not configured" banner persists until a full page reload.
      queryClient.invalidateQueries({ queryKey: ['setup', 'smtp'] });
    },
    onError: () => {
      addToast('Could not save SMTP settings. Try again.', 'error');
    },
  });

  const testMutation = useMutation({
    mutationFn: () =>
      fetchJson(`${API_BASE}/setup/smtp/test`, { method: 'POST' }),
    onSuccess: () => {
      setTestEmailError('');
      addToast(`Test email sent.`, 'success');
    },
    onError: (err) => {
      setTestEmailError(`Test email failed: ${err.message}. Check your SMTP settings.`);
    },
  });

  function handleSubmit(e) {
    e.preventDefault();

    const body = {
      host,
      port: port ? Number(port) : undefined,
      user,
      from,
      secure,
    };

    // Include the password whenever the editable field is shown and the user
    // typed one: first-time setup (passwordConfigured === false) OR an explicit
    // Change of an existing secret. Without the first-time case the typed password
    // is silently dropped and SMTP never gets a password (passwordConfigured stays
    // false → "Email is not configured"). D-01: a blank password is never sent, so
    // it never clears the stored secret.
    if ((changingPassword || !data?.passwordConfigured) && password) {
      body.password = password;
    }

    saveMutation.mutate(body);
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 size={20} className="animate-spin text-hc-muted" />
      </div>
    );
  }

  return (
    <Card>
      <Card.Header title="Email (SMTP)" headingLevel={2} />
      <Card.Body>
      <div className="space-y-4">

      {/* SMTP not configured notice */}
      {!isConfigured && (
        <div className="flex items-start gap-2 p-3 bg-hc-warning-bg border border-hc-warning-border rounded-lg">
          <AlertCircle size={16} className="text-hc-warning-text shrink-0 mt-0.5" />
          <p className="text-hc-caption text-hc-warning-text">
            SMTP is not configured. Invites will only be available as copyable links.
            Password reset by email will not work until SMTP is set up.
          </p>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-3">
        {/* Host */}
        <div className="flex items-center justify-between gap-3">
          <label className="text-hc-body text-hc-fg shrink-0">Host</label>
          {envFields.includes('host') ? (
            <span className="text-hc-caption text-hc-muted italic">Set via environment variable</span>
          ) : (
            <input
              type="text"
              value={host}
              onChange={(e) => setHost(e.target.value)}
              className={`${INPUT_CLASS} w-48`}
              placeholder="smtp.example.com"
              autoComplete="off"
            />
          )}
        </div>

        {/* Port */}
        <div className="flex items-center justify-between gap-3">
          <label className="text-hc-body text-hc-fg shrink-0">Port</label>
          {envFields.includes('port') ? (
            <span className="text-hc-caption text-hc-muted italic">Set via environment variable</span>
          ) : (
            <input
              type="number"
              value={port}
              onChange={(e) => setPort(e.target.value)}
              className={`${INPUT_CLASS} w-24`}
              placeholder="587"
            />
          )}
        </div>

        {/* From */}
        <div className="flex items-center justify-between gap-3">
          <label className="text-hc-body text-hc-fg shrink-0">From</label>
          {envFields.includes('from') ? (
            <span className="text-hc-caption text-hc-muted italic">Set via environment variable</span>
          ) : (
            <input
              type="email"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className={`${INPUT_CLASS} w-48`}
              placeholder="noreply@example.com"
            />
          )}
        </div>

        {/* Username */}
        <div className="flex items-center justify-between gap-3">
          <label className="text-hc-body text-hc-fg shrink-0">Username</label>
          {envFields.includes('user') ? (
            <span className="text-hc-caption text-hc-muted italic">Set via environment variable</span>
          ) : (
            <input
              type="text"
              value={user}
              onChange={(e) => setUser(e.target.value)}
              className={`${INPUT_CLASS} w-48`}
              autoComplete="off"
            />
          )}
        </div>

        {/* Password — masked field (D-01, EMAIL-04) */}
        <div className="flex items-center justify-between gap-3">
          <label className="text-hc-body text-hc-fg shrink-0">Password</label>
          {envFields.includes('password') ? (
            <span className="text-hc-caption text-hc-muted italic">Set via environment variable</span>
          ) : data?.passwordConfigured && !changingPassword ? (
            <div className="flex items-center gap-2">
              <span className="text-hc-caption text-hc-muted font-mono">•••• configured</span>
              <button
                type="button"
                onClick={() => setChangingPassword(true)}
                className="text-hc-caption text-hc-accent-strong hover:underline px-3 py-1"
              >
                Change
              </button>
            </div>
          ) : (
            <div className="relative w-48">
              <input
                id="smtp-password"
                aria-label="Password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={`${INPUT_CLASS} w-full pr-10`}
                placeholder="••••••••"
                autoComplete="new-password"
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
          )}
        </div>

        {/* TLS/Secure toggle */}
        <div className="flex items-center justify-between gap-3">
          <label className="text-hc-body text-hc-fg shrink-0">Use TLS</label>
          {envFields.includes('secure') ? (
            <span className="text-hc-caption text-hc-muted italic">Set via environment variable</span>
          ) : (
            <input
              type="checkbox"
              checked={secure}
              onChange={(e) => setSecure(e.target.checked)}
              style={{ accentColor: 'rgb(var(--hc-accent-rgb))' }}
            />
          )}
        </div>

        <div className="flex items-center justify-between pt-1">
          {/* Send test email button (D-03) */}
          <div className="space-y-1">
            <button
              type="button"
              disabled={!isConfigured || testMutation.isPending}
              onClick={() => {
                setTestEmailError('');
                testMutation.mutate();
              }}
              className={`inline-flex items-center gap-2 px-3 py-1 rounded-lg border border-hc-panel-border bg-hc-panel text-hc-body text-hc-muted hover:bg-hc-panel-hover transition-colors${
                !isConfigured ? ' opacity-40 cursor-not-allowed' : ''
              }${testMutation.isPending ? ' opacity-80 cursor-not-allowed' : ''}`}
            >
              {testMutation.isPending
                ? <Loader2 size={14} className="animate-spin" />
                : <Send size={14} />}
              Send test email
            </button>
            {testEmailError && (
              <p className="text-hc-caption text-hc-danger-text">{testEmailError}</p>
            )}
          </div>

          {/* Save button */}
          <button
            type="submit"
            disabled={saveMutation.isPending}
            className="px-4 py-2 rounded-lg bg-hc-accent-strong text-white text-hc-body font-semibold hover:bg-hc-accent-stronger disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {saveMutation.isPending
              ? <Loader2 size={16} className="animate-spin" />
              : 'Save settings'}
          </button>
        </div>
      </form>
      </div>
      </Card.Body>
    </Card>
  );
}
