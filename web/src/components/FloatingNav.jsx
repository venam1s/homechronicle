import { useEffect, useRef, useState } from 'react';
import { BarChart2, Monitor, LayoutList, Bell, Settings, LayoutGrid, X, LogOut } from 'lucide-react';
import clsx from 'clsx';

// -- Constants --

// Mirror Sidebar.jsx NAV_ITEMS so the two navigations stay in sync.
const NAV_ITEMS = [
  { id: 'dashboard', label: 'Dashboard', icon: BarChart2 },
  { id: 'devices',   label: 'Devices',   icon: Monitor },
  { id: 'timeline',  label: 'Timeline',  icon: LayoutList },
  { id: 'alerts',    label: 'Alerts',    icon: Bell },
  { id: 'settings',  label: 'Settings',  icon: Settings },
];

const FOCUS_RING = 'focus-visible:outline-2 focus-visible:outline-hc-focus-ring focus-visible:outline-offset-2';

// -- FloatingNav component --
//
// Reddit-style floating navigation for mobile/tablet (<1024px). A single FAB
// sits bottom-left; tapping it expands a vertical stack of page links. The menu
// auto-collapses on navigation, backdrop tap, Escape, or when the main content
// scrolls. Expanded/collapsed is transient UI state (not persisted).
//
// The masthead's account menu doesn't exist below 1024px, so Sign out lives
// here too: pass `onSignOut` to show it under the page links.
/**
 * Bottom padding the scroll container needs so the FAB never permanently covers
 * the end of the page: 16px offset + 56px button (w-14) + 16px breathing room,
 * plus the safe-area inset the cluster itself is offset by.
 */
export const FLOATING_NAV_CLEARANCE = 'calc(env(safe-area-inset-bottom) + 88px)';

export default function FloatingNav({ activePage, onNavigate, scrollRef, onSignOut, signingOut = false }) {
  const [open, setOpen] = useState(false);
  const firstItemRef = useRef(null);
  const fabRef = useRef(null);

  const close = () => setOpen(false);

  // Collapse when the scroll container scrolls (only while open).
  useEffect(() => {
    if (!open) return undefined;
    const el = scrollRef?.current;
    if (!el) return undefined;
    const onScroll = () => setOpen(false);
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, [open, scrollRef]);

  // Escape closes and returns focus to the FAB.
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') {
        setOpen(false);
        fabRef.current?.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  // Move focus to the first item when the menu opens.
  useEffect(() => {
    if (open) firstItemRef.current?.focus();
  }, [open]);

  function handleSelect(id) {
    onNavigate(id);
    setOpen(false);
  }

  return (
    <>
      {/* Backdrop scrim — dismisses the menu */}
      {open && (
        <div
          data-testid="floatingnav-backdrop"
          onClick={close}
          aria-hidden="true"
          className="fixed inset-0 z-30 bg-black/40 transition-opacity duration-200"
        />
      )}

      {/* Floating cluster, bottom-left, safe-area aware */}
      <div
        className="fixed z-30 flex flex-col items-start gap-2"
        style={{
          left: 'calc(env(safe-area-inset-left) + 16px)',
          bottom: 'calc(env(safe-area-inset-bottom) + 16px)',
        }}
      >
        {/* Expanded page links (rendered above the FAB, reverse order so the
            first item sits closest to the FAB) */}
        {open && (
          <nav
            role="navigation"
            aria-label="Main navigation"
            className="flex flex-col gap-1 rounded-2xl bg-hc-panel border border-hc-panel-border shadow-xl p-2 min-w-[180px]"
          >
            {NAV_ITEMS.map(({ id, label, icon: Icon }, i) => {
              const isActive = activePage === id;
              return (
                <button
                  key={id}
                  ref={i === 0 ? firstItemRef : undefined}
                  type="button"
                  onClick={() => handleSelect(id)}
                  aria-current={isActive ? 'page' : undefined}
                  className={clsx(
                    'flex items-center gap-3 w-full rounded-lg px-3 h-[40px] text-sm transition-colors duration-150',
                    FOCUS_RING,
                    isActive
                      ? 'bg-hc-interactive-hover text-hc-accent-strong font-semibold'
                      : 'text-hc-fg hover:bg-hc-interactive',
                  )}
                >
                  <Icon
                    size={20}
                    className={clsx(isActive ? 'text-hc-accent-strong' : 'text-hc-muted')}
                  />
                  <span>{label}</span>
                </button>
              );
            })}
            {onSignOut && (
              <>
                <div className="my-1 border-t border-hc-panel-border" />
                <button
                  type="button"
                  onClick={() => { setOpen(false); onSignOut(); }}
                  disabled={signingOut}
                  className={clsx(
                    'flex items-center gap-3 w-full rounded-lg px-3 h-[40px] text-sm transition-colors duration-150 text-hc-fg hover:bg-hc-interactive disabled:opacity-50',
                    FOCUS_RING,
                  )}
                >
                  <LogOut size={20} className="text-hc-muted" />
                  <span>{signingOut ? 'Signing out…' : 'Sign out'}</span>
                </button>
              </>
            )}
          </nav>
        )}

        {/* The FAB */}
        <button
          ref={fabRef}
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-label={open ? 'Close navigation menu' : 'Open navigation menu'}
          className={clsx(
            'flex items-center justify-center w-14 h-14 rounded-full shadow-xl transition-colors duration-150',
            'bg-hc-panel border border-hc-panel-border text-hc-fg-strong',
            'hover:bg-hc-interactive',
            FOCUS_RING,
          )}
        >
          {open ? <X size={24} /> : <LayoutGrid size={24} />}
        </button>
      </div>
    </>
  );
}
