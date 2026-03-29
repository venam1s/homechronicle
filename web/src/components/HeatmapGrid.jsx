import { useState } from 'react';

const CELL  = 16;
const GAP   = 2;
const LABEL = 128;

function cellBg(intensity, accent) {
  if (intensity === 0) return 'rgba(226,232,240,0.5)';
  return `rgba(${accent[0]},${accent[1]},${accent[2]},${0.15 + intensity * 0.85})`;
}

const DEFAULT_VISIBLE_ROWS = 20;

export default function HeatmapGrid({ data, accent, onHoverCell, onHoverEnd, onClickCell, lockedCell }) {
  const [expanded, setExpanded] = useState(false);

  const deviceMap = {};
  for (const row of data) {
    if (!deviceMap[row.accessory_name]) deviceMap[row.accessory_name] = new Array(24).fill(0);
    deviceMap[row.accessory_name][row.hour] = row.count;
  }

  const allDevices = Object.entries(deviceMap)
    .map(([name, hours]) => [name, hours, hours.reduce((s, v) => s + v, 0)])
    .sort(([, , a], [, , b]) => b - a);
  const devices = expanded ? allDevices : allDevices.slice(0, DEFAULT_VISIBLE_ROWS);
  const hasMore = allDevices.length > DEFAULT_VISIBLE_ROWS;
  const maxCount = Math.max(...allDevices.flatMap(([, h]) => h), 1);

  return (
    <div className="max-w-2xl mx-auto px-4 pb-3">
      <p className="text-[10px] text-gray-400 mb-2">
        Hover to highlight matching events · click to jump
      </p>
      <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
        <div style={{ minWidth: LABEL + 24 * (CELL + GAP) }}>

          {/* Device rows */}
          {devices.map(([name, hours, _total]) => (
            <div key={name} style={{ display: 'flex', alignItems: 'center', marginBottom: 2 }}>
              <div
                style={{ width: LABEL, flexShrink: 0, paddingRight: 8, textAlign: 'right', fontSize: 10, color: 'var(--hc-chart-label)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', lineHeight: `${CELL}px` }}
                title={name}
              >
                {name}
              </div>
              {hours.map((count, h) => {
                const isLocked = lockedCell?.accessoryName === name && lockedCell?.hour === h;
                return (
                  <div
                    key={h}
                    title={count > 0 ? `${name} — ${h}:00 — ${count} event${count !== 1 ? 's' : ''} · click to jump` : undefined}
                    style={{
                      width: CELL,
                      height: CELL,
                      marginRight: GAP,
                      flexShrink: 0,
                      borderRadius: 2,
                      backgroundColor: cellBg(count / maxCount, accent),
                      cursor: count > 0 ? 'pointer' : 'default',
                      transition: 'transform 0.1s, box-shadow 0.1s',
                      boxShadow: isLocked ? '0 0 0 2px #f97316' : undefined,
                      transform: isLocked ? 'scale(1.35)' : undefined,
                    }}
                    onMouseEnter={(e) => {
                      if (count > 0) {
                        if (!isLocked) {
                          e.currentTarget.style.transform = 'scale(1.35)';
                          e.currentTarget.style.boxShadow = '0 0 0 1.5px #3b82f6';
                        }
                        onHoverCell(name, h);
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!isLocked) {
                        e.currentTarget.style.transform = '';
                        e.currentTarget.style.boxShadow = '';
                      }
                      onHoverEnd();
                    }}
                    onClick={() => {
                      if (count > 0) onClickCell(name, h);
                    }}
                  />
                );
              })}
            </div>
          ))}

          {/* Time-of-day axis */}
          <div style={{ display: 'flex', marginLeft: LABEL, marginTop: 3 }}>
            {['midnight', '6 am', 'noon', '6 pm', ''].map((label) => (
              <div key={label || 'end'} style={{ width: 6 * (CELL + GAP), flexShrink: 0, fontSize: 9, color: 'var(--hc-chart-sublabel)' }}>
                {label}
              </div>
            ))}
          </div>

        </div>
      </div>
      {hasMore && (
        <button
          onClick={() => setExpanded((e) => !e)}
          className="text-[10px] mt-1 hover:underline"
          style={{ color: 'var(--hc-accent-strong)' }}
        >
          {expanded
            ? 'Show less'
            : `Show ${allDevices.length - DEFAULT_VISIBLE_ROWS} more accessories…`}
        </button>
      )}
    </div>
  );
}
