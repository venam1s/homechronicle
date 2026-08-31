import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { AlertCircle, Mail, Pencil, Plus, Save, Trash2, Webhook } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { fetchJson } from '../lib/api.js';
import Card from './Card.jsx';
import { useAlertRules, useAlertDeliveries } from '../hooks/useAlerts.js';
import { useAuth } from '../hooks/useAuth.js';

const EMPTY_FORM = {
  name: '',
  enabled: true,
  scopeType: 'all',
  scopeValue: '',
  characteristic: '',
  operator: 'equals',
  matchValue: '',
  channel: 'webhook',
  targetUrl: '',
  targetEmail: '',
  quietMinutes: 0,
};

function statusClass(status) {
  if (status === 'sent') return 'text-hc-success-text bg-hc-success-bg border-hc-success-border';
  if (status === 'suppressed') return 'text-hc-warning-text bg-hc-warning-bg border-hc-warning-border';
  return 'text-hc-danger-text bg-hc-danger-bg border-hc-danger-border';
}

export default function Alerts() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState(null);
  const [error, setError] = useState('');
  const [deliveryPage, setDeliveryPage] = useState(1);

  const { user } = useAuth();
  const { data: smtpStatus } = useQuery({
    queryKey: ['setup', 'smtp'],
    queryFn: () => fetchJson('/api/setup/smtp'),
    staleTime: 60_000,
  });
  const smtpUnconfigured = !Boolean(smtpStatus?.host && smtpStatus?.passwordConfigured);

  const { data: rules = [], isLoading: rulesLoading } = useAlertRules();
  const { data: deliveriesData, isLoading: deliveriesLoading } = useAlertDeliveries(deliveryPage, 15);
  const deliveries = deliveriesData?.deliveries ?? [];

  const sortedRules = useMemo(
    () => [...rules].sort((a, b) => Number(b.enabled) - Number(a.enabled) || b.id - a.id),
    [rules]
  );

  const saveRuleMutation = useMutation({
    mutationFn: async (payload) => {
      if (editingId) {
        return fetchJson(`/api/alerts/rules/${editingId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      }
      return fetchJson('/api/alerts/rules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    },
    onSuccess: () => {
      setForm(EMPTY_FORM);
      setEditingId(null);
      setError('');
      queryClient.invalidateQueries({ queryKey: ['alerts', 'rules'] });
      queryClient.invalidateQueries({ queryKey: ['alerts', 'deliveries'] });
    },
    onError: (err) => {
      setError(err.message || 'Failed to save alert rule');
    },
  });

  const toggleRuleMutation = useMutation({
    mutationFn: ({ id, enabled }) => fetchJson(`/api/alerts/rules/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled }),
    }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['alerts', 'rules'] }),
  });

  const deleteRuleMutation = useMutation({
    mutationFn: (id) => fetchJson(`/api/alerts/rules/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['alerts', 'rules'] });
      queryClient.invalidateQueries({ queryKey: ['alerts', 'deliveries'] });
      if (editingId) {
        setEditingId(null);
        setForm(EMPTY_FORM);
      }
    },
  });

  function onSubmit(event) {
    event.preventDefault();
    const payload = {
      ...form,
      quietMinutes: Number.parseInt(String(form.quietMinutes ?? 0), 10) || 0,
    };
    // GET /api/alerts/rules redacts targetUrl (secret webhook URLs aren't sent
    // over unauthenticated reads), so it is never prefilled when editing. Omit
    // an empty targetUrl on edit so the backend (`if ('targetUrl' in body)`)
    // preserves the existing URL; only send a replacement the user typed.
    if (payload.channel === 'webhook' && editingId && !String(payload.targetUrl ?? '').trim()) {
      delete payload.targetUrl;
    }
    // Email rules: omit targetUrl entirely (not applicable for this channel)
    if (payload.channel === 'email') {
      delete payload.targetUrl;
    }
    // Webhook rules: omit targetEmail entirely (not applicable for this channel)
    if (payload.channel === 'webhook') {
      delete payload.targetEmail;
    }
    setError('');
    saveRuleMutation.mutate(payload);
  }

  function startEdit(rule) {
    setEditingId(rule.id);
    setForm({
      name: rule.name,
      enabled: rule.enabled,
      scopeType: rule.scopeType,
      scopeValue: rule.scopeValue ?? '',
      characteristic: rule.characteristic ?? '',
      operator: rule.operator,
      matchValue: rule.matchValue,
      channel: rule.channel ?? 'webhook',
      // targetUrl is redacted from the rules list response; leave blank and let
      // the user optionally enter a replacement (blank = keep existing URL).
      targetUrl: '',
      targetEmail: rule.targetEmail ?? '',
      quietMinutes: rule.quietMinutes ?? 0,
    });
    setError('');
  }

  return (
    <div className="max-w-6xl mx-auto w-full py-4 sm:py-6 px-3 sm:px-4 space-y-4">
      <Card>
        <Card.Header title="Alert Rules" />
        <Card.Body>
          <form onSubmit={onSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
              placeholder="Rule name"
              aria-label="Rule name"
              className="border border-hc-panel-border rounded-lg px-3 py-2 text-sm bg-hc-panel text-hc-fg"
              required
            />
            <div className="space-y-2">
              <fieldset>
                <legend className="sr-only">Delivery channel</legend>
                <div className="flex items-center gap-4">
                  <label className="inline-flex items-center gap-2 text-sm text-hc-fg cursor-pointer">
                    <input
                      type="radio"
                      name="channel"
                      value="webhook"
                      checked={form.channel === 'webhook'}
                      onChange={(e) => {
                        const newChannel = e.target.value;
                        setForm((prev) => ({
                          ...prev,
                          channel: newChannel,
                          targetEmail: newChannel === 'email' && !prev.targetEmail
                            ? (user?.email ?? '')
                            : prev.targetEmail,
                        }));
                      }}
                      style={{ accentColor: 'rgb(var(--hc-accent-rgb))' }}
                      className="cursor-pointer"
                    />
                    <Webhook size={14} className="text-hc-muted" />
                    Webhook
                  </label>
                  <label className={clsx('inline-flex items-center gap-2 text-sm cursor-pointer', smtpUnconfigured ? 'text-hc-muted opacity-50' : 'text-hc-fg')}>
                    <input
                      type="radio"
                      name="channel"
                      value="email"
                      checked={form.channel === 'email'}
                      disabled={smtpUnconfigured}
                      onChange={(e) => {
                        const newChannel = e.target.value;
                        setForm((prev) => ({
                          ...prev,
                          channel: newChannel,
                          targetEmail: newChannel === 'email' && !prev.targetEmail
                            ? (user?.email ?? '')
                            : prev.targetEmail,
                        }));
                      }}
                      style={{ accentColor: 'rgb(var(--hc-accent-rgb))' }}
                      className={clsx('cursor-pointer', smtpUnconfigured && 'cursor-not-allowed')}
                    />
                    <Mail size={14} className="text-hc-muted" />
                    Email
                  </label>
                </div>
                {smtpUnconfigured && (
                  <p className="text-xs text-hc-muted mt-1">Email not configured — ask an admin to set up SMTP</p>
                )}
              </fieldset>
              {form.channel === 'webhook' ? (
                <input
                  type="url"
                  value={form.targetUrl}
                  onChange={(e) => setForm((prev) => ({ ...prev, targetUrl: e.target.value }))}
                  placeholder={editingId ? 'Leave blank to keep current webhook URL' : 'Webhook URL (https://...)'}
                  aria-label="Webhook URL"
                  className="w-full border border-hc-panel-border rounded-lg px-3 py-2 text-sm bg-hc-panel text-hc-fg"
                  required={!editingId}
                />
              ) : (
                <div className="space-y-1">
                  <input
                    type="email"
                    value={user?.role === 'member' ? (user?.email ?? form.targetEmail) : form.targetEmail}
                    onChange={(e) => {
                      if (user?.role !== 'member') setForm((prev) => ({ ...prev, targetEmail: e.target.value }));
                    }}
                    placeholder="recipient@example.com"
                    aria-label="Recipient email address"
                    readOnly={user?.role === 'member'}
                    disabled={user?.role === 'member'}
                    className={clsx(
                      'w-full border border-hc-panel-border rounded-lg px-3 py-2 text-sm bg-hc-panel text-hc-fg',
                      user?.role === 'member' && 'opacity-75 cursor-not-allowed',
                    )}
                    required
                    autoComplete="email"
                  />
                  {smtpUnconfigured && (
                    <div
                      role="status"
                      aria-live="polite"
                      className="flex items-start gap-2 p-2 bg-hc-warning-bg border border-hc-warning-border rounded-lg"
                    >
                      <AlertCircle size={13} className="text-hc-warning-text shrink-0 mt-1" />
                      <p className="text-xs text-hc-warning-text leading-snug">
                        Email delivery is inactive until SMTP is configured in Settings.
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
            <select
              value={form.scopeType}
              onChange={(e) => setForm((prev) => ({ ...prev, scopeType: e.target.value }))}
              aria-label="Scope type"
              className="border border-hc-panel-border rounded-lg px-3 py-2 text-sm bg-hc-panel text-hc-fg"
            >
              <option value="all">All events</option>
              <option value="room">Room</option>
              <option value="accessory">Accessory</option>
              <option value="characteristic">Characteristic</option>
            </select>
            <input
              type="text"
              value={form.scopeValue}
              onChange={(e) => setForm((prev) => ({ ...prev, scopeValue: e.target.value }))}
              placeholder="Scope value (optional for All)"
              aria-label="Scope value"
              className="border border-hc-panel-border rounded-lg px-3 py-2 text-sm bg-hc-panel text-hc-fg"
            />
            <input
              type="text"
              value={form.characteristic}
              onChange={(e) => setForm((prev) => ({ ...prev, characteristic: e.target.value }))}
              placeholder="Characteristic filter (optional)"
              aria-label="Characteristic filter"
              className="border border-hc-panel-border rounded-lg px-3 py-2 text-sm bg-hc-panel text-hc-fg"
            />
            <select
              value={form.operator}
              onChange={(e) => setForm((prev) => ({ ...prev, operator: e.target.value }))}
              aria-label="Match operator"
              className="border border-hc-panel-border rounded-lg px-3 py-2 text-sm bg-hc-panel text-hc-fg"
            >
              <option value="equals">Equals</option>
              <option value="not_equals">Not equals</option>
              <option value="contains">Contains</option>
            </select>
            <input
              type="text"
              value={form.matchValue}
              onChange={(e) => setForm((prev) => ({ ...prev, matchValue: e.target.value }))}
              placeholder="Match value"
              aria-label="Match value"
              className="border border-hc-panel-border rounded-lg px-3 py-2 text-sm bg-hc-panel text-hc-fg"
              required
            />
            <input
              type="number"
              min="0"
              max="10080"
              value={form.quietMinutes}
              onChange={(e) => setForm((prev) => ({ ...prev, quietMinutes: e.target.value }))}
              placeholder="Quiet period (minutes)"
              aria-label="Quiet period in minutes"
              className="border border-hc-panel-border rounded-lg px-3 py-2 text-sm bg-hc-panel text-hc-fg"
            />
            <label className="inline-flex items-center gap-2 text-sm text-hc-fg">
              <input
                type="checkbox"
                checked={form.enabled}
                onChange={(e) => setForm((prev) => ({ ...prev, enabled: e.target.checked }))}
                className="rounded border-hc-panel-border"
              />
              Enabled
            </label>
            <div className="flex items-center gap-2">
              <button
                type="submit"
                className="inline-flex items-center gap-1 rounded-lg px-3 py-2 bg-hc-accent-strong text-hc-on-accent text-sm hover:bg-hc-accent-stronger disabled:opacity-60"
                disabled={saveRuleMutation.isPending}
              >
                {editingId ? <Save size={14} /> : <Plus size={14} />}
                {editingId ? 'Update Rule' : 'Create Rule'}
              </button>
              {editingId && (
                <button
                  type="button"
                  onClick={() => {
                    setEditingId(null);
                    setForm(EMPTY_FORM);
                    setError('');
                  }}
                  className="rounded-lg px-3 py-2 border border-hc-panel-border text-sm text-hc-muted hover:bg-hc-panel-hover"
                >
                  Cancel
                </button>
              )}
            </div>
          </form>
          {error && <p className="text-sm text-hc-danger-text mt-2">{error}</p>}
        </Card.Body>
      </Card>

      <Card>
        <Card.Header title="Active Rules" />
        <Card.Body>
          <div className="space-y-2">
            {rulesLoading && <p className="text-sm text-hc-muted">Loading rules...</p>}
            {!rulesLoading && sortedRules.length === 0 && (
              <p className="text-sm text-hc-muted">No alert rules yet.</p>
            )}
            {sortedRules.map((rule) => (
              <div key={rule.id} className="rounded-lg border border-hc-panel-border p-3 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  className={clsx(
                    'text-xs px-2 py-1 rounded border',
                    rule.enabled ? 'bg-hc-success-bg text-hc-success-text border-hc-success-border' : 'bg-hc-panel-soft text-hc-muted border-hc-panel-border'
                  )}
                  onClick={() => toggleRuleMutation.mutate({ id: rule.id, enabled: !rule.enabled })}
                >
                  {rule.enabled ? 'Enabled' : 'Disabled'}
                </button>
                <button
                  type="button"
                  className="text-sm font-medium text-hc-fg-strong hover:text-hc-accent-stronger cursor-pointer"
                  onClick={() => startEdit(rule)}
                >
                  {rule.name}
                </button>
                {rule.channel === 'email' && (
                  <span className="text-xs px-2 py-1 rounded bg-hc-panel-mid text-hc-muted border border-hc-panel-border">
                    email
                  </span>
                )}
                <span className="text-xs text-hc-muted">{rule.scopeType}{rule.scopeValue ? `: ${rule.scopeValue}` : ''}</span>
                <span className="text-xs text-hc-muted">{rule.operator} {rule.matchValue}</span>
                <span className="text-xs text-hc-muted">quiet {rule.quietMinutes}m</span>
                <div className="ml-auto flex items-center gap-1">
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 text-xs text-hc-muted hover:text-hc-fg-strong"
                    onClick={() => startEdit(rule)}
                  >
                    <Pencil size={12} />
                    Edit
                  </button>
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 text-xs text-hc-danger-text hover:text-hc-danger-text"
                    onClick={() => deleteRuleMutation.mutate(rule.id)}
                  >
                    <Trash2 size={12} />
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        </Card.Body>
      </Card>

      <Card>
        <Card.Header title="Recent Deliveries" />
        <Card.Body>
          <div className="space-y-2">
            {deliveriesLoading && <p className="text-sm text-hc-muted">Loading deliveries...</p>}
            {!deliveriesLoading && deliveries.length === 0 && (
              <p className="text-sm text-hc-muted">No deliveries yet.</p>
            )}
            {deliveries.map((delivery) => (
              <div key={delivery.id} className="rounded-lg border border-hc-panel-border p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={clsx('text-xs px-2 py-1 rounded border', statusClass(delivery.status))}>
                    {delivery.status}
                  </span>
                  <span className="text-sm text-hc-fg-strong">{delivery.ruleName || `Rule #${delivery.ruleId}`}</span>
                  <span className="text-xs text-hc-muted">{formatDistanceToNow(new Date(delivery.sentAt), { addSuffix: true })}</span>
                </div>
                <p className="text-xs text-hc-muted mt-1 truncate">
                  {delivery.channel === 'email'
                    ? (delivery.recipient ?? delivery.targetEmail ?? '')
                    : delivery.targetUrl}
                </p>
                {delivery.error && <p className="text-xs text-hc-danger-text mt-1">{delivery.error}</p>}
              </div>
            ))}
          </div>
          <div className="mt-3 flex items-center gap-2">
            <button
              type="button"
              onClick={() => setDeliveryPage((p) => Math.max(1, p - 1))}
              disabled={deliveryPage <= 1}
              className="text-xs rounded border border-hc-panel-border px-2 py-1 disabled:opacity-50"
            >
              Prev
            </button>
            <span className="text-xs text-hc-muted">Page {deliveriesData?.page ?? 1} of {deliveriesData?.pages ?? 1}</span>
            <button
              type="button"
              onClick={() => setDeliveryPage((p) => p + 1)}
              disabled={deliveryPage >= (deliveriesData?.pages ?? 1)}
              className="text-xs rounded border border-hc-panel-border px-2 py-1 disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </Card.Body>
      </Card>
    </div>
  );
}

