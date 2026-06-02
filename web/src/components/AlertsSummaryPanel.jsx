import { useMemo } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { Bell, CheckCircle2, XCircle } from 'lucide-react';
import { useAlertRules, useAlertDeliveries } from '../hooks/useAlerts.js';

function StatusBadge({ status }) {
  if (status === 'sent') {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-hc-success-text">
        <CheckCircle2 size={11} />
        sent
      </span>
    );
  }
  if (status === 'failed') {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-hc-danger-text">
        <XCircle size={11} />
        failed
      </span>
    );
  }
  return <span className="text-xs text-hc-muted">{status ?? '—'}</span>;
}

export default function AlertsSummaryPanel() {
  const { data: rules, isError: rulesError } = useAlertRules();
  const { data: deliveriesData, isError: deliveriesError } = useAlertDeliveries(1, 50);

  // The alerts router is conditionally mounted; 404 -> isError is expected and
  // treated as "not configured" — not an error state worth alarming the user.
  const notConfigured = rulesError || deliveriesError;

  const rows = useMemo(() => {
    if (!rules?.length) return [];
    const deliveries = deliveriesData?.deliveries ?? [];

    // Build a lookup from ruleId/ruleName -> most recent delivery.
    const latestByRule = new Map();
    for (const d of deliveries) {
      const key = d.ruleId ?? d.ruleName;
      if (!latestByRule.has(key)) latestByRule.set(key, d);
    }

    return rules
      .filter((r) => r.enabled)
      .slice(0, 6)
      .map((r) => ({
        id: r.id,
        name: r.name,
        delivery: latestByRule.get(r.id) ?? latestByRule.get(r.name) ?? null,
      }));
  }, [rules, deliveriesData]);

  const header = (
    <div className="flex items-baseline justify-between mb-3">
      <div className="flex items-center gap-2">
        <Bell size={14} className="text-hc-muted" />
        <h3 className="text-sm font-semibold text-hc-fg">Alerts Summary</h3>
      </div>
      <span className="text-xs text-hc-muted">enabled rules</span>
    </div>
  );

  if (notConfigured || (!rules && !rulesError)) {
    return (
      <div>
        {header}
        <p className="text-sm text-hc-muted">Alerts not configured.</p>
      </div>
    );
  }

  if (!rows.length) {
    return (
      <div>
        {header}
        <p className="text-sm text-hc-muted">No enabled alert rules.</p>
      </div>
    );
  }

  return (
    <div>
      {header}
      <div className="space-y-2">
        {rows.map((row) => (
          <div
            key={row.id}
            className="flex items-center justify-between gap-2 px-2 py-1.5 rounded-lg border border-hc-panel-border bg-hc-panel-soft"
          >
            <span className="text-sm text-hc-fg truncate flex-1 min-w-0">{row.name}</span>
            <div className="flex-shrink-0 flex flex-col items-end gap-0.5">
              {row.delivery ? (
                <>
                  <StatusBadge status={row.delivery.status} />
                  <span className="text-xs text-hc-muted">
                    {formatDistanceToNow(new Date(row.delivery.sentAt), { addSuffix: true })}
                  </span>
                </>
              ) : (
                <span className="text-xs text-hc-muted">no deliveries yet</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
