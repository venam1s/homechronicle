import { formatDistanceToNowStrict } from 'date-fns';
import { useRetentionHealth } from '../hooks/useEvents.js';

const BYTE_UNITS = ['B', 'KB', 'MB', 'GB', 'TB'];

function formatBytes(bytes) {
  if (!bytes || bytes <= 0) return '0 B';
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < BYTE_UNITS.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const decimals = unit === 0 || value >= 100 ? 0 : 1;
  return `${value.toFixed(decimals)} ${BYTE_UNITS[unit]}`;
}

function formatCount(n) {
  return Number(n ?? 0).toLocaleString();
}

function StatTile({ label, value, hint }) {
  return (
    <div className="rounded-lg border border-hc-panel-border bg-hc-panel-soft px-3 py-2">
      <div className="text-hc-caption font-semibold uppercase tracking-wider text-hc-muted">{label}</div>
      <div className="text-base font-semibold text-hc-fg tabular-nums truncate">{value}</div>
      {hint && <div className="text-xs text-hc-muted truncate">{hint}</div>}
    </div>
  );
}

export default function RetentionHealthPanel() {
  const { data, isLoading, isError } = useRetentionHealth();

  const header = (
    <div className="flex items-baseline justify-between mb-3">
      <h3 className="text-sm font-semibold text-hc-fg">Retention Health</h3>
      <span className="text-xs text-hc-muted">database &amp; retention</span>
    </div>
  );

  if (isLoading) {
    return <div>{header}<p className="text-sm text-hc-muted">Loading database stats…</p></div>;
  }
  if (isError || !data) {
    return <div>{header}<p className="text-sm text-hc-muted">Could not load database stats.</p></div>;
  }

  const oldestAge = data.oldestEvent
    ? formatDistanceToNowStrict(new Date(data.oldestEvent))
    : '—';

  return (
    <div className="h-full flex flex-col min-h-0">
      {header}
      <div className="flex-1 min-h-0 overflow-auto grid grid-cols-2 gap-2">
        <StatTile label="Total events" value={formatCount(data.totalRows)} />
        <StatTile label="Avg / day (30d)" value={formatCount(data.avgEventsPerDay)} />
        <StatTile label="DB size" value={formatBytes(data.dbSizeBytes)} />
        <StatTile label="Events table" value={formatBytes(data.tableSizeBytes)} />
        <StatTile label="Retention" value={`${formatCount(data.retentionDays)} d`} />
        <StatTile
          label="Past retention"
          value={formatCount(data.eventsPastRetention)}
          hint={data.archivedRows != null ? `${formatCount(data.archivedRows)} archived` : undefined}
        />
        <StatTile label="Oldest event" value={oldestAge} hint="ago" />
      </div>
    </div>
  );
}
