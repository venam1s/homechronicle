import { useState } from 'react';
import {
  BarChart2, Monitor, LayoutList, Bell, Settings,
  ChevronLeft, ChevronRight, Paintbrush2, Sun, Moon, SunMoon,
  Sparkles, ArrowUpCircle, LogOut,
} from 'lucide-react';
import clsx from 'clsx';
import BrandLogo from './BrandLogo.jsx';
import { useTheme } from '../hooks/useTheme.js';
import { useAccent } from '../hooks/useAccent.js';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth.js';

// -- Constants --

const NAV_ITEMS = [
  { id: 'dashboard', label: 'Dashboard', icon: BarChart2 },
  { id: 'devices',   label: 'Devices',   icon: Monitor },
  { id: 'timeline',  label: 'Timeline',  icon: LayoutList },
  { id: 'alerts',    label: 'Alerts',    icon: Bell, featureFlag: 'alerts' },
  { id: 'settings',  label: 'Settings',  icon: Settings },
];

const STYLES = [
  { id: 'ocean',    label: 'Ocean' },
  { id: 'graphite', label: 'Graphite' },
  { id: 'sunrise',  label: 'Sunrise' },
  { id: 'red',      label: 'Red' },
  { id: 'yellow',   label: 'Yellow' },
  { id: 'purple',   label: 'Purple' },
  { id: 'slate',    label: 'Slate' },
  { id: 'pink',     label: 'Pink' },
];

const ACCENT_SWATCH = {
  ocean:    'linear-gradient(135deg, #0ea5e9, #0891b2)',
  graphite: 'linear-gradient(135deg, #14b8a6, #64748b)',
  sunrise:  'linear-gradient(135deg, #fb923c, #ec4899)',
  red:      'linear-gradient(135deg, #ef4444, #e11d48)',
  yellow:   'linear-gradient(135deg, #facc15, #f59e0b)',
  purple:   'linear-gradient(135deg, #8b5cf6, #9333ea)',
  slate:    'linear-gradient(135deg, #475569, #64748b)',
  pink:     'linear-gradient(135deg, #ec4899, #f472b6)',
};

const ACCENT_SWATCH_DARK = {
  ocean:    'linear-gradient(135deg, #38bdf8, #67e8f9)',
  graphite: 'linear-gradient(135deg, #5eead4, #94a3b8)',
  sunrise:  'linear-gradient(135deg, #fdba74, #f472b6)',
  red:      'linear-gradient(135deg, #f87171, #fb7185)',
  yellow:   'linear-gradient(135deg, #fde047, #fbbf24)',
  purple:   'linear-gradient(135deg, #a78bfa, #c084fc)',
  slate:    'linear-gradient(135deg, #94a3b8, #cbd5e1)',
  pink:     'linear-gradient(135deg, #f472b6, #fbcfe8)',
};

const FOCUS_RING = 'focus-visible:outline-2 focus-visible:outline-hc-focus-ring focus-visible:outline-offset-2';

// -- Theme cycle helpers --

function getNextPreference(preference) {
  if (preference === 'system') return 'light';
  if (preference === 'light') return 'dark';
  return 'system';
}

function getThemeToggleLabel(preference) {
  if (preference === 'system') return 'Switch to light mode';
  if (preference === 'light') return 'Switch to dark mode';
  return 'Switch to system mode';
}

function ThemeIcon({ preference, size = 20 }) {
  if (preference === 'light') return <Sun size={size} />;
  if (preference === 'dark') return <Moon size={size} />;
  return <SunMoon size={size} />;
}

// -- Sidebar component --

export default function Sidebar({
  collapsed,
  onToggle,
  inDrawer = false,
  activePage,
  onNavigate,
  showChangelog,
  hasNewVersion,
  onOpenChangelog,
  buildVersion,
  availableUpdate,
  onDismissUpdate,
  alertsEnabled = true,
}) {
  const visibleNavItems = NAV_ITEMS.filter((item) => item.featureFlag !== 'alerts' || alertsEnabled);
  const { preference, resolvedTheme, setPreference } = useTheme();
  const { accent, setAccent } = useAccent();
  const { user, logoutMutation } = useAuth();
  const navigate = useNavigate();
  const [accentOpen, setAccentOpen] = useState(false);

  const isDark = resolvedTheme === 'dark';
  const swatchMap = isDark ? ACCENT_SWATCH_DARK : ACCENT_SWATCH;

  const accountLabel = user?.user?.email
    ?? (user?.user?.role
      ? user.user.role.charAt(0).toUpperCase() + user.user.role.slice(1)
      : 'Account');
  const accountInitials =
    (accountLabel.split('@')[0].match(/[a-zA-Z0-9]/g)?.slice(0, 2).join('') || 'AC').toUpperCase();

  function handleThemeToggle() {
    setPreference(getNextPreference(preference));
  }

  function handleLogout() {
    logoutMutation.mutate(undefined, {
      onSuccess: () => {
        if (typeof sessionStorage !== 'undefined') {
          sessionStorage.removeItem('csrfToken');
        }
        navigate('/login', { replace: true });
      },
    });
  }

  return (
    <aside
      role="navigation"
      aria-label="Main navigation"
      className="group relative flex flex-col h-full bg-hc-panel border-r border-hc-panel-border"
    >
      {/* Header */}
      <div className={clsx('flex py-6', collapsed ? 'justify-center px-2' : 'px-4')}>
        <BrandLogo collapsed={collapsed} className="h-10" />
      </div>

      {/* Nav list */}
      <nav className="flex flex-col gap-1 px-2">
        {visibleNavItems.map(({ id, label, icon: Icon }) => {
          const isActive = activePage === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => onNavigate(id)}
              aria-current={isActive ? 'page' : undefined}
              title={collapsed ? label : undefined}
              className={clsx(
                'flex items-center w-full rounded-lg px-3 h-[40px] text-sm transition-colors duration-150',
                FOCUS_RING,
                collapsed ? 'justify-center gap-0' : 'gap-3',
                isActive
                  ? 'bg-hc-interactive-hover text-hc-accent-strong font-semibold'
                  : 'text-hc-fg hover:bg-hc-interactive',
              )}
            >
              <Icon
                size={20}
                className={clsx(
                  isActive ? 'text-hc-accent-strong' : 'text-hc-muted',
                )}
              />
              {!collapsed && <span>{label}</span>}
            </button>
          );
        })}
      </nav>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Footer */}
      <div className="flex flex-col gap-2 py-4">
        {/* Theme controls */}
        {collapsed ? (
          <div className="relative flex justify-center px-2">
            <button
              type="button"
              onClick={() => setAccentOpen((o) => !o)}
              aria-label="Open theme and accent settings"
              className={clsx(
                'flex items-center justify-center w-10 h-10 rounded-lg text-hc-muted hover:bg-hc-interactive transition-colors',
                FOCUS_RING,
              )}
            >
              <Paintbrush2 size={20} />
            </button>
            {accentOpen && (
              <div className="absolute left-full bottom-0 ml-2 z-20 bg-hc-panel border border-hc-panel-border rounded-lg p-3 shadow-lg flex flex-col gap-2 min-w-[160px]">
                <div className="flex flex-wrap gap-1">
                  {STYLES.map(({ id, label }) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setAccent(id)}
                      aria-label={`${label} accent`}
                      style={{
                        background: swatchMap[id],
                        outline: accent === id ? `2px solid var(--hc-accent-strong)` : undefined,
                        outlineOffset: accent === id ? '2px' : undefined,
                        opacity: accent === id ? 1 : 0.7,
                      }}
                      className={clsx('w-5 h-5 rounded-full', FOCUS_RING)}
                    />
                  ))}
                </div>
                <button
                  type="button"
                  onClick={handleThemeToggle}
                  aria-label={getThemeToggleLabel(preference)}
                  className={clsx(
                    'flex items-center gap-2 text-sm text-hc-muted hover:text-hc-fg transition-colors',
                    FOCUS_RING,
                  )}
                >
                  <ThemeIcon preference={preference} />
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-2 px-4">
            <div className="flex items-center justify-between gap-1">
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={handleThemeToggle}
                  aria-label={getThemeToggleLabel(preference)}
                  className={clsx(
                    'flex items-center justify-center w-8 h-8 rounded-lg text-hc-muted hover:bg-hc-interactive transition-colors',
                    FOCUS_RING,
                  )}
                >
                  <ThemeIcon preference={preference} />
                </button>
                <button
                  type="button"
                  onClick={() => setAccentOpen((o) => !o)}
                  aria-label={accentOpen ? 'Hide accent colors' : 'Show accent colors'}
                  aria-expanded={accentOpen}
                  className={clsx(
                    'flex items-center justify-center w-8 h-8 rounded-lg text-hc-muted hover:bg-hc-interactive transition-colors',
                    FOCUS_RING,
                  )}
                >
                  <Paintbrush2 size={18} />
                </button>
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={onOpenChangelog}
                  className={clsx(
                    'text-xs text-hc-muted hover:text-hc-fg transition-colors',
                    FOCUS_RING,
                  )}
                >
                  {buildVersion}
                </button>
                {hasNewVersion && (
                  <Sparkles size={12} className="text-amber-500" />
                )}
              </div>
            </div>
            {accentOpen && (
              <div className="flex items-center gap-1 transition-all">
                {STYLES.map(({ id, label }) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setAccent(id)}
                    aria-label={`${label} accent`}
                    style={{
                      background: swatchMap[id],
                      outline: accent === id ? `2px solid var(--hc-accent-strong)` : undefined,
                      outlineOffset: accent === id ? '2px' : undefined,
                      opacity: accent === id ? 1 : 0.7,
                    }}
                    className={clsx('w-5 h-5 rounded-full', FOCUS_RING)}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* User/account + Sign out */}
        {collapsed ? (
          <div className="flex justify-center px-2">
            <button
              type="button"
              onClick={handleLogout}
              disabled={logoutMutation.isPending}
              aria-label="Sign out"
              title="Sign out"
              className={clsx(
                'flex items-center justify-center w-10 h-10 rounded-lg text-hc-muted hover:bg-hc-interactive transition-colors',
                FOCUS_RING,
              )}
            >
              <LogOut size={20} />
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-2 px-4">
            {availableUpdate && (
              <a
                href={availableUpdate.url}
                target="_blank"
                rel="noopener noreferrer"
                className={clsx(
                  'flex items-center gap-1 text-xs text-green-600 hover:text-green-700 transition-colors',
                  FOCUS_RING,
                )}
              >
                <ArrowUpCircle size={14} />
                <span>{availableUpdate.tag} available</span>
              </a>
            )}
            <div className="flex items-center gap-2 rounded-xl bg-hc-panel-mid px-2.5 py-2">
              <div
                aria-hidden="true"
                className="flex items-center justify-center w-8 h-8 rounded-full bg-hc-interactive text-hc-fg text-xs font-semibold shrink-0"
              >
                {accountInitials}
              </div>
              <span className="flex-1 min-w-0 text-xs text-hc-muted truncate">{accountLabel}</span>
              <button
                type="button"
                onClick={handleLogout}
                disabled={logoutMutation.isPending}
                aria-label="Sign out"
                title="Sign out"
                className={clsx(
                  'flex items-center justify-center w-8 h-8 rounded-lg text-hc-muted hover:bg-hc-interactive hover:text-hc-fg transition-colors shrink-0',
                  FOCUS_RING,
                )}
              >
                <LogOut size={18} />
              </button>
            </div>
          </div>
        )}

        {collapsed && availableUpdate && (
          <div className="flex justify-center px-2">
            <span className="w-2 h-2 rounded-full bg-amber-500" />
          </div>
        )}
      </div>

      {/* Edge handle */}
      {!inDrawer && onToggle && (
        <button
          type="button"
          onClick={onToggle}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className={clsx(
            'absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/2',
            'flex items-center justify-center w-5 h-8 rounded-full',
            'bg-hc-panel border border-hc-panel-border',
            'opacity-0 group-hover:opacity-100 transition-opacity duration-150',
            'z-10 cursor-pointer',
            FOCUS_RING,
          )}
        >
          {collapsed ? <ChevronRight size={12} /> : <ChevronLeft size={12} />}
        </button>
      )}
    </aside>
  );
}
