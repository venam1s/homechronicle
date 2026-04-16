import { useEffect, useState } from 'react';
import { useTopDevices } from '../hooks/useEvents.js';
import { SkeletonList } from './Skeleton.jsx';
import { getServiceIcon } from '../lib/icons.js';
import { getRoomColor } from '../lib/roomColors.js';
import clsx from 'clsx';

const WINDOWS = [
  { label: '7d', days: 7 },
  { label: '30d', days: 30 },
  { label: '90d', days: 90 },
];
const STORAGE_KEY = 'hc_dashboard_top_devices_days';
const VALID_DAYS = new Set(WINDOWS.map((w) => w.days));

export default function TopDevices({ forcedDays = null, onDaysChange = null }) {
  const [days, setDays] = useState(() => {
    if (typeof window === 'undefined') return 7;
    try {
      const stored = Number.parseInt(window.localStorage.getItem(STORAGE_KEY) ?? '', 10);
      return VALID_DAYS.has(stored) ? stored : 7;
    } catch {
      return 7;
    }
  });
  const { data, isLoading, isError } = useTopDevices(days);

  useEffect(() => {
    if (!VALID_DAYS.has(forcedDays) || forcedDays === days) return;
    setDays(forcedDays);
  }, [forcedDays, days]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(STORAGE_KEY, String(days));
    } catch {
      // Ignore storage write failures.
    }
  }, [days]);

  function handleSetDays(next) {
    setDays(next);
    onDaysChange?.(next);
  }

  if (isLoading) {
    return <SkeletonList rows={4} />;
  }
  if (isError) {
    return <div className="h-24 flex items-center justify-center text-red-500 text-sm">Failed to load device stats.</div>;
  }
  if (!data?.length) {
    return <p className="text-sm text-hc-muted">No activity in the last {days} days.</p>;
  }

  const max = Number.parseInt(data[0].event_count, 10);

  return (
    <div>
      <div className="flex items-baseline justify-between mb-3">
        <h3 className="text-sm font-semibold text-hc-fg">Most Active Devices</h3>
        <div className="flex items-center gap-2">
          <span className="text-xs text-hc-muted">last {days} days</span>
          <div className="flex gap-1">
            {WINDOWS.map(({ label, days: d }) => (
              <button
                key={d}
                onClick={() => handleSetDays(d)}
                className={clsx(
                  'text-xs px-2 py-0.5 rounded-md transition-colors',
                  days === d
                    ? 'bg-[rgba(var(--hc-accent-rgb),0.13)] text-[rgb(var(--hc-accent-rgb))] font-medium'
                    : 'text-hc-muted hover:text-hc-fg hover:bg-hc-panel-mid'
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="space-y-2.5">
        {data.map((device) => {
          const count     = Number.parseInt(device.event_count, 10);
          const pct       = Math.round((count / max) * 100);
          const Icon      = getServiceIcon(device.service_type);
          const roomColor = getRoomColor(device.room_name);

          return (
            <div key={device.accessory_name} className="flex items-center gap-2.5">
              {/* Service icon */}
              <div className="flex-shrink-0 w-6 h-6 rounded-md bg-[rgba(var(--hc-accent-rgb),0.1)] flex items-center justify-center">
                <Icon size={13} className="text-[rgb(var(--hc-accent-rgb))]" />
              </div>

              {/* Name + room */}
              <div className="w-32 flex-shrink-0 min-w-0">
                <div className="text-sm text-hc-fg truncate leading-tight">{device.accessory_name}</div>
                {device.room_name && (
                  <span
                    className="text-[10px] px-1 py-px rounded-full font-medium"
                    style={roomColor
                      ? { backgroundColor: roomColor.bg, color: roomColor.text }
                      : { color: 'var(--hc-room-fallback)' }}
                  >
                    {device.room_name}
                  </span>
                )}
              </div>

              {/* Bar */}
              <div className="flex-1 bg-hc-panel-mid rounded-full h-1.5">
                <div
                  className="h-1.5 rounded-full transition-all"
                  style={{ width: `${pct}%`, backgroundColor: `rgb(var(--hc-accent-rgb))` }}
                />
              </div>

              {/* Count */}
              <div className="text-xs text-hc-muted w-8 text-right tabular-nums flex-shrink-0">
                {count}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
