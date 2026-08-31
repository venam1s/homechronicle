import { useMemo, useState } from 'react';
import { format, formatDistanceToNow, subDays } from 'date-fns';
import {
  ResponsiveContainer, AreaChart, Area, CartesianGrid, XAxis, YAxis, Tooltip,
  LineChart, Line, PieChart, Pie, Cell, Legend,
} from 'recharts';
import {
  ArrowLeft, Activity, Clock3, ShieldCheck, AlertTriangle,
  Info, Wifi, WifiOff, ChevronDown, ChevronUp, BarChart3, PieChartIcon, Grid3x3,
  TrendingUp, Layers, ScrollText,
} from 'lucide-react';
import clsx from 'clsx';
import { useAccessoryDetail, useAccessoryAnomalies, useCharacteristicTrend, useAccessoryHeatmap, useAccessoryStateDuration, useAccessoryCharSummary } from '../hooks/useEvents.js';
import { describeChange, getServiceIcon } from '../lib/icons.js';
import Card from './Card.jsx';

const WINDOWS = [
  { label: '7d', days: 7 },
  { label: '30d', days: 30 },
  { label: '90d', days: 90 },
];
const TOOLTIP_STYLE = { fontSize: 12, borderRadius: 8, border: '1px solid var(--hc-tooltip-border)', backgroundColor: 'var(--hc-tooltip-bg)', color: 'var(--hc-tooltip-text)' };

function formatSeconds(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return 'n/a';
  const d = Math.floor(seconds / 86_400);
  const h = Math.floor((seconds % 86_400) / 3_600);
  const m = Math.floor((seconds % 3_600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function formatRatio(value) {
  if (!Number.isFinite(value)) return 'n/a';
  return `${Math.round(value * 100)}%`;
}

function formatNumber(value, digits = 1) {
  if (!Number.isFinite(value)) return 'n/a';
  return Number(value).toLocaleString(undefined, { maximumFractionDigits: digits });
}

// ---------------------------------------------------------------------------
// Characteristic Trend sub-component
// ---------------------------------------------------------------------------
function CharacteristicTrend({ accessoryId, characteristic, days }) {
  const { data, isLoading } = useCharacteristicTrend(accessoryId, characteristic, days);

  const chartData = useMemo(() => {
    const points = data?.points ?? [];
    if (!points.length) return { values: [], isNumeric: false };

    const numericCount = points.filter((p) => {
      const n = Number(p.new_value);
      return Number.isFinite(n);
    }).length;
    const isNumeric = numericCount / points.length > 0.8;

    const values = points.map((p) => ({
      time: format(new Date(p.timestamp), 'MMM d HH:mm'),
      ts: new Date(p.timestamp).getTime(),
      value: isNumeric ? Number(p.new_value) : (p.new_value === 'true' || p.new_value === '1' ? 1 : 0),
      raw: p.new_value,
    }));

    return { values, isNumeric };
  }, [data?.points]);

  if (isLoading) {
    return <div className="text-xs text-hc-muted py-3">Loading trend…</div>;
  }
  if (!chartData.values.length) {
    return <div className="text-xs text-hc-muted py-3">No trend data available.</div>;
  }

  return (
    <div className="mt-3">
      <ResponsiveContainer width="100%" height={130}>
        <LineChart data={chartData.values} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--hc-chart-grid)" vertical={false} />
          <XAxis
            dataKey="time"
            tick={{ fontSize: 9, fill: 'var(--hc-chart-tick)' }}
            interval="preserveStartEnd"
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            tick={{ fontSize: 9, fill: 'var(--hc-chart-tick)' }}
            tickLine={false}
            axisLine={false}
            domain={chartData.isNumeric ? ['auto', 'auto'] : [0, 1]}
          />
          <Tooltip
            contentStyle={TOOLTIP_STYLE}
            formatter={(value, _name, props) => [props.payload.raw, characteristic]}
            labelStyle={{ fontWeight: 600, marginBottom: 2, color: 'var(--hc-tooltip-text)' }}
            itemStyle={{ color: 'var(--hc-tooltip-text)' }}
          />
          <Line
            type={chartData.isNumeric ? 'monotone' : 'stepAfter'}
            dataKey="value"
            stroke="rgb(var(--hc-accent-rgb))"
            strokeWidth={1.5}
            dot={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Donut colors for state duration
// ---------------------------------------------------------------------------
const DONUT_COLORS = [
  '#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981',
  '#06b6d4', '#f97316', '#6366f1', '#84cc16', '#ef4444',
];
const MAX_SLICES = 6;

function stateLabel(characteristic, value) {
  const v = String(value ?? '').toLowerCase();
  if (v === 'true' || v === '1') return 'On';
  if (v === 'false' || v === '0') return 'Off';
  return String(value);
}

// ---------------------------------------------------------------------------
// State Duration Donut
// ---------------------------------------------------------------------------
function StateDurationDonut({ accessoryId, days }) {
  const { data, isLoading } = useAccessoryStateDuration(accessoryId, days);

  const grouped = useMemo(() => {
    const durations = data?.durations ?? [];
    if (!durations.length) return [];

    // Group by characteristic, pick the one with most distinct states (binary preferred)
    const byChar = new Map();
    for (const d of durations) {
      if (!byChar.has(d.characteristic)) byChar.set(d.characteristic, []);
      byChar.get(d.characteristic).push(d);
    }

    // Rank: prefer binary (2 states), then fewer states, then by total duration
    return Array.from(byChar.entries())
      .map(([char, states]) => {
        const mapped = states.map((s) => ({
          name: stateLabel(char, s.new_value),
          value: Math.round(s.duration_seconds),
          raw: s.new_value,
        }));
        const total = states.reduce((sum, s) => sum + s.duration_seconds, 0);

        let finalStates = mapped;
        if (mapped.length > MAX_SLICES) {
          const sorted = [...mapped].sort((a, b) => b.value - a.value);
          const kept = sorted.slice(0, MAX_SLICES - 1);
          const rest = sorted.slice(MAX_SLICES - 1);
          const otherValue = rest.reduce((sum, s) => sum + s.value, 0);
          finalStates = [...kept, { name: 'Other', value: otherValue, raw: '__other__' }];
        }

        return {
          characteristic: char,
          states: finalStates,
          total,
        };
      })
      .sort((a, b) => {
        // prefer 2-state characteristics (binary on/off)
        const aDist = Math.abs(a.states.length - 2);
        const bDist = Math.abs(b.states.length - 2);
        if (aDist !== bDist) return aDist - bDist;
        return b.total - a.total;
      });
  }, [data?.durations]);

  if (isLoading) return <div className="text-xs text-hc-muted py-3">Loading…</div>;
  if (!grouped.length) return null;

  // Show up to 2 donuts
  const show = grouped.slice(0, 2);

  return (
    <Card>
      <Card.Header title={<span className="flex items-center gap-2"><PieChartIcon size={14} className="text-hc-muted" /> State Duration</span>} />
      <Card.Body>
        <div className={clsx('grid gap-4', show.length > 1 ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1')}>
          {show.map((group) => {
            const totalSec = group.total;
            return (
              <div key={group.characteristic}>
                <p className="text-xs text-hc-muted text-center mb-1">{group.characteristic}</p>
                <ResponsiveContainer width="100%" height={160}>
                  <PieChart>
                    <Pie
                      data={group.states}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={40}
                      outerRadius={65}
                      paddingAngle={2}
                      strokeWidth={0}
                    >
                      {group.states.map((state, i) => (
                        <Cell key={state.name} fill={state.raw === '__other__' ? '#9CA3AF' : DONUT_COLORS[i % DONUT_COLORS.length]} />
                      ))}
                    </Pie>
                    <Legend
                      iconSize={8}
                      wrapperStyle={{ fontSize: 11, color: 'var(--hc-fg)' }}
                      formatter={(value, entry) => {
                        const pct = totalSec > 0 ? Math.round((entry.payload.value / totalSec) * 100) : 0;
                        return `${value} (${pct}%)`;
                      }}
                    />
                    <Tooltip
                      contentStyle={TOOLTIP_STYLE}
                      formatter={(value) => {
                        const h = Math.floor(value / 3600);
                        const m = Math.floor((value % 3600) / 60);
                        return [h > 0 ? `${h}h ${m}m` : `${m}m`, 'Duration'];
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            );
          })}
        </div>
      </Card.Body>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Hourly Activity Heatmap
// ---------------------------------------------------------------------------
const DOW_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function ActivityHeatmap({ accessoryId, days }) {
  const { data, isLoading } = useAccessoryHeatmap(accessoryId, days);

  const { grid, maxCount } = useMemo(() => {
    const cells = data?.cells ?? [];
    // 7 rows (dow) × 24 cols (hour)
    const grid = Array.from({ length: 7 }, () => Array(24).fill(0));
    let maxCount = 0;
    for (const c of cells) {
      grid[c.dow][c.hour] = c.count;
      if (c.count > maxCount) maxCount = c.count;
    }
    return { grid, maxCount };
  }, [data?.cells]);

  if (isLoading) return <div className="text-xs text-hc-muted py-3">Loading…</div>;
  if (maxCount === 0) return null;

  function cellColor(count) {
    if (count === 0) return 'var(--hc-panel-mid)';
    const ratio = count / maxCount;
    // 4-stop accent scale
    if (ratio < 0.25) return `rgba(var(--hc-accent-rgb), 0.2)`;
    if (ratio < 0.5) return `rgba(var(--hc-accent-rgb), 0.45)`;
    if (ratio < 0.75) return `rgba(var(--hc-accent-rgb), 0.7)`;
    return `rgba(var(--hc-accent-rgb), 0.95)`;
  }

  return (
    <Card>
      <Card.Header title={<span className="flex items-center gap-2"><Grid3x3 size={14} className="text-hc-muted" /> Activity Heatmap</span>} />
      <Card.Body>
        <div className="overflow-x-auto">
          <div className="min-w-[420px]">
            {/* Hour labels */}
            <div className="flex ml-10 mb-1">
              {Array.from({ length: 24 }, (_, h) => (
                <div key={h} className="flex-1 text-center text-[9px] text-hc-muted">
                  {h % 3 === 0 ? `${h}` : ''}
                </div>
              ))}
            </div>
            {/* Grid rows */}
            {grid.map((row, dow) => (
              <div key={dow} className="flex items-center gap-1 mb-0.5">
                <span className="w-9 text-right text-[10px] text-hc-muted pr-1">{DOW_LABELS[dow]}</span>
                <div className="flex flex-1 gap-px">
                  {row.map((count, hour) => (
                    <div
                      key={hour}
                      className="flex-1 aspect-square rounded-sm"
                      style={{ backgroundColor: cellColor(count), minHeight: 12 }}
                      title={`${DOW_LABELS[dow]} ${hour}:00 — ${count} events`}
                    />
                  ))}
                </div>
              </div>
            ))}
            {/* Legend */}
            <div className="flex items-center justify-end gap-1 mt-2">
              <span className="text-[9px] text-hc-muted">Less</span>
              <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: 'var(--hc-panel-mid)' }} />
              {[0.2, 0.45, 0.7, 0.95].map((a) => (
                <div key={a} className="w-3 h-3 rounded-sm" style={{ backgroundColor: `rgba(var(--hc-accent-rgb), ${a})` }} />
              ))}
              <span className="text-[9px] text-hc-muted">More</span>
            </div>
          </div>
        </div>
      </Card.Body>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Characteristic Change Summary Table
// ---------------------------------------------------------------------------
function CharSummaryTable({ accessoryId, days }) {
  const { data, isLoading } = useAccessoryCharSummary(accessoryId, days);

  const chars = data?.characteristics ?? [];

  if (isLoading) return <div className="text-xs text-hc-muted py-3">Loading…</div>;
  if (!chars.length) return null;

  return (
    <Card>
      <Card.Header title={<span className="flex items-center gap-2"><BarChart3 size={14} className="text-hc-muted" /> Characteristic Summary</span>} />
      <Card.Body>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-hc-muted" style={{ borderBottom: '1px solid var(--hc-chart-grid)' }}>
                <th className="text-left font-medium py-1.5 pr-3">Characteristic</th>
                <th className="text-right font-medium py-1.5 px-2">Changes</th>
                <th className="text-right font-medium py-1.5 px-2">Min</th>
                <th className="text-right font-medium py-1.5 px-2">Avg</th>
                <th className="text-right font-medium py-1.5 px-2">Max</th>
                <th className="text-right font-medium py-1.5 px-2">Values</th>
              </tr>
            </thead>
            <tbody>
              {chars.map((c) => {
                const isNumeric = c.numeric_count > 0;
                return (
                  <tr key={c.characteristic} className="hover:bg-hc-panel-mid/50" style={{ borderBottom: '1px solid var(--hc-chart-grid)' }}>
                    <td className="py-1.5 pr-3 text-hc-fg font-medium">{c.characteristic}</td>
                    <td className="py-1.5 px-2 text-right text-hc-fg">{c.change_count}</td>
                    <td className="py-1.5 px-2 text-right text-hc-muted">
                      {isNumeric ? formatNumber(c.min_val, 1) : '—'}
                    </td>
                    <td className="py-1.5 px-2 text-right text-hc-muted">
                      {isNumeric ? formatNumber(c.avg_val, 1) : '—'}
                    </td>
                    <td className="py-1.5 px-2 text-right text-hc-muted">
                      {isNumeric ? formatNumber(c.max_val, 1) : '—'}
                    </td>
                    <td className="py-1.5 px-2 text-right text-hc-muted">{c.distinct_values}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card.Body>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
export default function AccessoryDetail({ accessoryId, onBack }) {
  const [days, setDays] = useState(30);
  const [page, setPage] = useState(1);
  const [selectedChar, setSelectedChar] = useState(null);
  const { data, isLoading, isError } = useAccessoryDetail(accessoryId, { days, page, limit: 100 });
  const { data: anomalyData } = useAccessoryAnomalies(accessoryId);

  const accessory = data?.accessory ?? null;
  const history = data?.history ?? null;
  const uptime = data?.uptime ?? null;
  const currentState = data?.current_state ?? [];
  const Icon = getServiceIcon(accessory?.service_type);
  const health = accessory?.health ?? {};
  const reliability = accessory?.reliability ?? null;
  const outliers = anomalyData?.outliers ?? [];
  const firmwareEvents = history?.events?.filter((e) => e.characteristic === 'FirmwareRevision') ?? [];

  const chartData = useMemo(() => {
    const dailyMap = new Map((data?.activity?.daily ?? []).map((d) => [String(d.day).slice(0, 10), Number.parseInt(d.count, 10)]));
    return Array.from({ length: days }, (_, i) => {
      const day = subDays(new Date(), days - i - 1);
      const key = format(day, 'yyyy-MM-dd');
      return {
        day: days <= 14 ? format(day, 'MMM d') : i % 7 === 0 ? format(day, 'MMM d') : format(day, 'd'),
        count: dailyMap.get(key) ?? 0,
      };
    });
  }, [data?.activity?.daily, days]);

  // Metadata fields to display
  const metadataFields = accessory ? [
    { label: 'Manufacturer', value: accessory.manufacturer },
    { label: 'Model', value: accessory.model },
    { label: 'Serial Number', value: accessory.serial_number },
    { label: 'Firmware', value: accessory.firmware_revision },
    { label: 'Hardware Rev', value: accessory.hardware_revision },
    { label: 'Protocol', value: accessory.protocol },
    { label: 'Transport', value: accessory.transport },
  ].filter((f) => f.value != null && f.value !== '') : [];

  function handleSetDays(nextDays) {
    setDays(nextDays);
    setPage(1);
  }

  return (
    <div className="max-w-5xl mx-auto py-4 sm:py-6 px-3 sm:px-4 space-y-4">
      <div className="flex items-center gap-2">
        <button
          onClick={onBack}
          aria-label="Back to accessories list"
          className="inline-flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg border border-hc-panel-border text-hc-muted hover:text-hc-fg hover:bg-hc-panel-mid"
        >
          <ArrowLeft size={13} />
          Back
        </button>
      </div>

      {isLoading && (
        <Card>
          <Card.Body>
            <p className="text-sm text-hc-muted">Loading accessory details…</p>
          </Card.Body>
        </Card>
      )}
      {isError && (
        <Card>
          <Card.Body>
            <p className="text-sm text-hc-danger-text">Failed to load accessory details.</p>
          </Card.Body>
        </Card>
      )}

      {!isLoading && !isError && accessory && (
        <>
          {/* Header */}
          <Card>
            <Card.Body>
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-full bg-hc-interactive flex items-center justify-center">
                  <Icon size={20} className="text-hc-accent-strong" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h2 className="text-lg font-semibold text-hc-fg-strong truncate">{accessory.accessory_name}</h2>
                    {accessory.protocol && (
                      <span className="inline-block text-[10px] font-semibold uppercase tracking-wide rounded px-1.5 py-0.5 bg-hc-panel-mid text-hc-muted border border-hc-panel-border whitespace-nowrap">
                        {accessory.protocol === 'matter' ? 'Matter' : 'HomeKit'}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-hc-muted mt-0.5 break-all">{accessory.accessory_id}</p>
                  {accessory.device_note && (
                    <p className="text-xs text-hc-muted mt-1 italic">{accessory.device_note}</p>
                  )}
                  <p className="text-xs text-hc-muted mt-1">
                    {accessory.room_name ?? 'No room'} · {accessory.model ?? 'Unknown model'}
                    {accessory.last_seen && ` · last seen ${formatDistanceToNow(new Date(accessory.last_seen), { addSuffix: true })}`}
                  </p>
                </div>
              </div>
            </Card.Body>
          </Card>

          {/* Feature 3: Stale reason banner */}
          {health.isStale && health.staleReason && (
            <section className="rounded-xl border border-hc-warning-border bg-hc-warning-bg px-4 py-3 flex items-start gap-2.5">
              <AlertTriangle size={16} className="text-hc-warning-text shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-hc-warning-text">Device is stale</p>
                <p className="text-xs text-hc-warning-text mt-0.5">{health.staleReason}</p>
              </div>
            </section>
          )}

          {/* Stats grid */}
          <section className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Card>
              <Card.Body compact>
                <div className="flex items-center gap-2 text-hc-muted text-xs">
                  <Activity size={13} />
                  Event history
                </div>
                <div className="text-xl font-semibold text-hc-fg-strong mt-1">{(history?.total ?? 0).toLocaleString()}</div>
                <div className="text-xs text-hc-muted mt-0.5">
                  {accessory.first_seen ? `since ${format(new Date(accessory.first_seen), 'PP')}` : 'No events yet'}
                </div>
              </Card.Body>
            </Card>
            <Card>
              <Card.Body compact>
                <div className="flex items-center gap-2 text-hc-muted text-xs">
                  <ShieldCheck size={13} />
                  Uptime
                </div>
                <div className="text-xl font-semibold text-hc-fg-strong mt-1">{formatRatio(uptime?.active_day_ratio)}</div>
                <div className="text-xs text-hc-muted mt-0.5">
                  {uptime?.active_days ?? 0}/{uptime?.observed_days ?? 0} active days
                </div>
              </Card.Body>
            </Card>
            <Card>
              <Card.Body compact>
                <div className="flex items-center gap-2 text-hc-muted text-xs">
                  <Clock3 size={13} />
                  Heartbeat
                </div>
                <div className="text-xl font-semibold text-hc-fg-strong mt-1">
                  ~{formatSeconds(health.heartbeatSeconds)}
                </div>
                <div className="text-xs text-hc-muted mt-0.5">
                  {health.status ?? 'unknown'} · {formatNumber(uptime?.events_per_active_day)} events/day
                </div>
              </Card.Body>
            </Card>
          </section>

          {/* Feature 2: Device Metadata */}
          {metadataFields.length > 0 && (
            <Card>
              <Card.Header title={<span className="flex items-center gap-2"><Info size={14} className="text-hc-muted" /> Device Info</span>} />
              <Card.Body>
                <dl className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-4 gap-y-2">
                  {metadataFields.map((field) => (
                    <div key={field.label}>
                      <dt className="text-[11px] text-hc-muted">{field.label}</dt>
                      <dd className="text-sm text-hc-fg mt-0.5 break-all">{field.value}</dd>
                    </div>
                  ))}
                </dl>
                {accessory.metadata_updated_at && (
                  <p className="text-[10px] text-hc-muted mt-3">
                    Metadata updated {formatDistanceToNow(new Date(accessory.metadata_updated_at), { addSuffix: true })}
                  </p>
                )}
              </Card.Body>
            </Card>
          )}

          {/* Firmware History */}
          {firmwareEvents.length > 0 && (
            <Card>
              <Card.Header title={<span className="flex items-center gap-2"><Info size={14} className="text-hc-muted" /> Firmware History</span>} />
              <Card.Body>
                <div className="space-y-1">
                  {firmwareEvents.map((event) => (
                    <div key={event.id} className="flex items-center justify-between text-sm">
                      <span className="text-hc-fg">
                        {event.old_value} &rarr; {event.new_value}
                      </span>
                      <span className="text-xs text-hc-muted">
                        {new Date(event.timestamp).toLocaleDateString()}
                      </span>
                    </div>
                  ))}
                </div>
              </Card.Body>
            </Card>
          )}

          {/* Feature 1: Reliability */}
          {reliability && (
            <Card className={clsx(
              (reliability.disconnects > 0 || reliability.resubscribe_failures > 0) && 'border border-hc-warning-border'
            )}>
              <Card.Header title={
                <span className="flex items-center gap-2">
                  {reliability.disconnects > 0 || reliability.resubscribe_failures > 0
                    ? <WifiOff size={14} className="text-hc-warning-text" />
                    : <Wifi size={14} className="text-hc-success-text" />
                  }
                  Connection Reliability
                </span>
              } />
              <Card.Body>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  <div>
                    <p className="text-[11px] text-hc-muted">Disconnects</p>
                    <p className={clsx('text-lg font-semibold mt-0.5', reliability.disconnects > 0 ? 'text-hc-warning-text' : 'text-hc-fg-strong')}>
                      {reliability.disconnects ?? 0}
                    </p>
                  </div>
                  <div>
                    <p className="text-[11px] text-hc-muted">Reconnect Attempts</p>
                    <p className="text-lg font-semibold text-hc-fg-strong mt-0.5">{reliability.reconnect_attempts ?? 0}</p>
                  </div>
                  <div>
                    <p className="text-[11px] text-hc-muted">Resubscribe Failures</p>
                    <p className={clsx('text-lg font-semibold mt-0.5', reliability.resubscribe_failures > 0 ? 'text-hc-danger-text' : 'text-hc-fg-strong')}>
                      {reliability.resubscribe_failures ?? 0}
                    </p>
                  </div>
                  {reliability.last_connected_at && (
                    <div>
                      <p className="text-[11px] text-hc-muted">Last Connected</p>
                      <p className="text-sm text-hc-fg mt-0.5">
                        {formatDistanceToNow(new Date(reliability.last_connected_at), { addSuffix: true })}
                      </p>
                    </div>
                  )}
                  {reliability.last_subscribed_at && (
                    <div>
                      <p className="text-[11px] text-hc-muted">Last Subscribed</p>
                      <p className="text-sm text-hc-fg mt-0.5">
                        {formatDistanceToNow(new Date(reliability.last_subscribed_at), { addSuffix: true })}
                      </p>
                    </div>
                  )}
                  {Number.isFinite(reliability.subscribe_failures) && reliability.subscribe_failures > 0 && (
                    <div>
                      <p className="text-[11px] text-hc-muted">Subscribe Failures</p>
                      <p className="text-lg font-semibold text-hc-danger-text mt-0.5">{reliability.subscribe_failures}</p>
                    </div>
                  )}
                </div>
                {reliability.last_error && (
                  <div className="mt-3 rounded-lg bg-hc-danger-bg border border-hc-danger-border px-3 py-2">
                    <p className="text-[11px] text-hc-danger-text">Last Error</p>
                    <p className="text-xs text-hc-danger-text mt-0.5 break-all">{reliability.last_error}</p>
                    {reliability.last_error_at && (
                      <p className="text-[10px] text-hc-danger-text  mt-1">
                        {formatDistanceToNow(new Date(reliability.last_error_at), { addSuffix: true })}
                      </p>
                    )}
                  </div>
                )}
              </Card.Body>
            </Card>
          )}

          {/* Feature 4: Anomaly Indicators */}
          {outliers.length > 0 && (
            <Card>
              <Card.Header title={<span className="flex items-center gap-2"><AlertTriangle size={14} className="text-hc-warning-text" /> Anomalies (last 24h)</span>} />
              <Card.Body>
                <div className="space-y-2">
                  {outliers.slice(0, 5).map((o) => (
                    <div
                      key={`${o.hour}:${o.kind}`}
                      className={clsx(
                        'rounded-lg border px-3 py-2',
                        o.severity === 'critical' ? 'border-hc-danger-border bg-hc-danger-bg' :
                        o.severity === 'high' ? 'border-hc-warning-border bg-hc-warning-bg' :
                        'border-hc-warning-border bg-hc-warning-bg'
                      )}
                    >
                      <div className="flex items-center gap-2 text-xs">
                        <span className={clsx(
                          'uppercase tracking-wide font-semibold',
                          o.severity === 'critical' ? 'text-hc-danger-text' : 'text-hc-warning-text'
                        )}>
                          {o.severity}
                        </span>
                        <span className={o.severity === 'critical' ? 'text-hc-danger-text' : 'text-hc-warning-text'}>
                          {o.kind}
                        </span>
                        <span className="ml-auto text-hc-muted">score {o.score}</span>
                      </div>
                      <p className={clsx(
                        'text-sm mt-1',
                        o.severity === 'critical' ? 'text-hc-danger-text' : 'text-hc-warning-text'
                      )}>
                        {o.message}
                      </p>
                      <p className="text-xs text-hc-muted mt-0.5">
                        observed {o.eventCount} events, baseline {o.baselineAvg} avg
                      </p>
                    </div>
                  ))}
                </div>
              </Card.Body>
            </Card>
          )}

          {/* Activity Over Time chart */}
          <Card>
            <Card.Header
              title={<span className="flex items-center gap-2"><TrendingUp size={14} className="text-hc-muted" /> Activity Over Time</span>}
              actions={
                <div className="flex gap-1">
                  {WINDOWS.map((window) => (
                    <button
                      key={window.days}
                      onClick={() => handleSetDays(window.days)}
                      className={clsx(
                        'text-xs px-2 py-0.5 rounded-md transition-colors',
                        days === window.days
                          ? 'bg-hc-accent-soft text-hc-accent-stronger font-medium'
                          : 'text-hc-muted hover:text-hc-fg hover:bg-hc-panel-mid'
                      )}
                    >
                      {window.label}
                    </button>
                  ))}
                </div>
              }
            />
            <Card.Body>
              <ResponsiveContainer width="100%" height={170}>
                <AreaChart data={chartData} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
                  <defs>
                    <linearGradient id="accessoryActivityGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="rgb(var(--hc-accent-rgb))" stopOpacity={0.15} />
                      <stop offset="95%" stopColor="rgb(var(--hc-accent-rgb))" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--hc-chart-grid)" vertical={false} />
                  <XAxis
                    dataKey="day"
                    tick={{ fontSize: 10, fill: 'var(--hc-chart-tick)' }}
                    interval={days <= 14 ? 0 : days <= 30 ? 6 : 13}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis tick={{ fontSize: 10, fill: 'var(--hc-chart-tick)' }} tickLine={false} axisLine={false} />
                  <Tooltip
                    contentStyle={TOOLTIP_STYLE}
                    formatter={(value) => [value, 'events']}
                    labelStyle={{ fontWeight: 600, marginBottom: 2, color: 'var(--hc-tooltip-text)' }}
              itemStyle={{ color: 'var(--hc-tooltip-text)' }}
                  />
                  <Area
                    type="monotone"
                    dataKey="count"
                    stroke="rgb(var(--hc-accent-rgb))"
                    strokeWidth={2}
                    fill="url(#accessoryActivityGradient)"
                    dot={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </Card.Body>
          </Card>

          {/* State Duration Donut */}
          <StateDurationDonut accessoryId={accessoryId} days={days} />

          {/* Hourly Activity Heatmap */}
          <ActivityHeatmap accessoryId={accessoryId} days={days} />

          {/* Characteristic Change Summary */}
          <CharSummaryTable accessoryId={accessoryId} days={days} />

          {/* Current State with Features 6 (protocol details) and 5 (characteristic trends) */}
          <Card>
            <Card.Header title={<span className="flex items-center gap-2"><Layers size={14} className="text-hc-muted" /> Current State</span>} />
            <Card.Body>
              {!currentState.length && <p className="text-sm text-hc-muted">No current state yet.</p>}
              {currentState.length > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                  {currentState.map((state) => {
                    const isSelected = selectedChar === state.characteristic;
                    const hasMatterIds = state.endpoint_id != null || state.cluster_id != null || state.attribute_id != null;
                    const hasHomeKitId = state.raw_iid != null;
                    const isMatter = String(state.protocol ?? '').toLowerCase() === 'matter';

                    return (
                      <div key={state.characteristic} className="flex flex-col">
                        <button
                          type="button"
                          onClick={() => setSelectedChar(isSelected ? null : state.characteristic)}
                          aria-label={`${isSelected ? 'Hide' : 'Show'} trend for ${state.characteristic}`}
                          aria-expanded={isSelected}
                          className={clsx(
                            'rounded-lg border px-3 py-2 text-left transition-colors',
                            isSelected
                              ? 'border-hc-panel-border bg-hc-panel-mid'
                              : 'border-hc-panel-border bg-hc-panel-mid hover:border-hc-panel-border'
                          )}
                          style={isSelected ? { borderColor: 'rgba(var(--hc-accent-rgb), 0.3)', backgroundColor: 'rgba(var(--hc-accent-rgb), 0.08)' } : undefined}
                        >
                          <div className="flex items-center justify-between">
                            <p className="text-[11px] text-hc-muted">{state.characteristic}</p>
                            {isSelected ? <ChevronUp size={11} className="text-[var(--hc-room-5)]" /> : <ChevronDown size={11} className="text-hc-muted" />}
                          </div>
                          <p className="text-sm text-hc-fg mt-0.5">{describeChange(state.characteristic, state.new_value)}</p>
                          <p className="text-[11px] text-hc-muted mt-1">
                            {formatDistanceToNow(new Date(state.timestamp), { addSuffix: true })}
                          </p>
                          {/* Feature 9: Protocol details */}
                          {isMatter && hasMatterIds && (
                            <p className="text-[10px] text-hc-muted font-mono mt-0.5">
                              EP {state.endpoint_id} · Cluster {state.cluster_id} · Attr {state.attribute_id}
                            </p>
                          )}
                          {!isMatter && hasHomeKitId && (
                            <p className="text-[10px] text-hc-muted font-mono mt-0.5">
                              IID {state.raw_iid}
                            </p>
                          )}
                        </button>
                        {/* Feature 6: Characteristic trend chart */}
                        {isSelected && (
                          <div className="border border-t-0 border-hc-panel-border rounded-b-lg px-3 py-2 -mt-px" style={{ borderColor: 'rgba(var(--hc-accent-rgb), 0.3)', backgroundColor: 'var(--hc-panel)' }}>
                            <CharacteristicTrend
                              accessoryId={accessoryId}
                              characteristic={state.characteristic}
                              days={days}
                            />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </Card.Body>
          </Card>

          {/* Full History */}
          <Card>
            <Card.Header
              title={<span className="flex items-center gap-2"><ScrollText size={14} className="text-hc-muted" /> Full History</span>}
              actions={
                <p className="text-xs text-hc-muted">
                  Page {history?.page ?? 1} of {Math.max(history?.pages ?? 1, 1)}
                </p>
              }
            />
            <Card.Body>
              {!history?.events?.length && <p className="text-sm text-hc-muted">No events recorded.</p>}
              {!!history?.events?.length && (
                <div className="divide-y divide-hc-panel-border border border-hc-panel-border rounded-lg overflow-hidden">
                  {history.events.map((event) => (
                    <div key={event.id} className="px-3 py-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm text-hc-fg">{describeChange(event.characteristic, event.new_value)}</p>
                        <p className="text-xs text-hc-muted whitespace-nowrap" title={format(new Date(event.timestamp), 'PPpp')}>
                          {formatDistanceToNow(new Date(event.timestamp), { addSuffix: true })}
                        </p>
                      </div>
                      <p className="text-xs text-hc-muted mt-1">
                        {event.characteristic}
                        {event.old_value != null && (
                          <span>
                            {' '}· {event.old_value} → {event.new_value}
                          </span>
                        )}
                      </p>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex items-center justify-end gap-2 mt-3">
                <button
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                  disabled={(history?.page ?? 1) <= 1}
                  aria-label="Previous page"
                  className="text-xs px-2.5 py-1 rounded-md border border-hc-panel-border text-hc-muted disabled:opacity-40"
                >
                  Previous
                </button>
                <button
                  onClick={() => setPage((current) => current + 1)}
                  disabled={(history?.page ?? 1) >= (history?.pages ?? 1)}
                  aria-label="Next page"
                  className="text-xs px-2.5 py-1 rounded-md border border-hc-panel-border text-hc-muted disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            </Card.Body>
          </Card>
        </>
      )}
    </div>
  );
}
