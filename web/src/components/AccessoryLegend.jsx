import { useEffect, useId, useRef, useState } from 'react';
import { Info } from 'lucide-react';
import clsx from 'clsx';

const FOCUS_RING = 'focus-visible:outline-2 focus-visible:outline-hc-focus-ring focus-visible:outline-offset-2';

// Legend for the Browse list: a right-anchored popover launched from the tab
// bar, so it costs no vertical space above the accessory list.
export default function AccessoryLegend() {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);
  const buttonRef = useRef(null);
  const panelId = useId();

  // Close on an outside click or Escape; Escape returns focus to the button.
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="relative" ref={wrapRef}>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        aria-label="Legend"
        className={clsx(
          'flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-medium transition-colors',
          open ? 'bg-hc-interactive text-hc-fg' : 'text-hc-muted hover:text-hc-fg hover:bg-hc-interactive',
          FOCUS_RING,
        )}
      >
        <Info size={16} aria-hidden="true" />
        <span className="hidden sm:inline">Legend</span>
      </button>

      {open && (
        <div
          id={panelId}
          role="dialog"
          aria-label="Legend"
          className="absolute right-0 top-full mt-2 z-30 w-72 max-w-[calc(100vw-2rem)] rounded-xl border border-hc-panel-border bg-hc-panel p-4 shadow-lg space-y-3"
        >
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-hc-muted mb-2">Icons</p>
            <div className="flex items-center gap-2 text-xs text-hc-fg">
              <span className="w-7 h-7 shrink-0 rounded-full flex items-center justify-center bg-hc-interactive">
                <span className="w-3.5 h-3.5 rounded-full bg-hc-accent-soft" />
              </span>
              <span>Service icon: accessory type (light, switch, sensor, lock, and others)</span>
            </div>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-hc-muted mb-2">Activity Dots</p>
            <div className="flex flex-col gap-2 text-xs text-hc-fg">
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 shrink-0 rounded-full bg-hc-success-text" />
                <span>Active within the last hour</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 shrink-0 rounded-full bg-hc-warning-text" />
                <span>Active within the last 24 hours</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 shrink-0 rounded-full bg-hc-border-strong" />
                <span>Last active over 24 hours ago</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 shrink-0 rounded-full bg-hc-muted" />
                <span>No activity recorded yet</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
