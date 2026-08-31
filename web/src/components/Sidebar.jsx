import { useState } from 'react';
import {
  BarChart2, Monitor, LayoutList, Bell, Settings,
  ChevronLeft, ChevronRight, Paintbrush2, Sun, Moon, SunMoon,
  Sparkles, ArrowUpCircle, LogOut,
} from 'lucide-react';
import clsx from 'clsx';
import BrandLogo from './BrandLogo.jsx';
import { useTheme } from '../hooks/useTheme.js';
import { usePalette } from '../hooks/usePalette.js';
import { PALETTE_IDS, PALETTES } from '../lib/palettes.js';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth.js';
import { useAuthConfig } from '../hooks/useAuthConfig.js';

// -- Constants --

const NAV_ITEMS = [
  { id: 'dashboard', label: 'Dashboard', icon: BarChart2 },
  { id: 'devices',   label: 'Devices',   icon: Monitor },
  { id: 'timeline',  label: 'Timeline',  icon: LayoutList },
  { id: 'alerts',    label: 'Alerts',    icon: Bell },
  { id: 'settings',  label: 'Settings',  icon: Settings },
];

// Twelve palettes, in picker order, rendered as a two-tone chip: the palette's
// page background against its accent. Derived from the palette registry so the
// picker can never drift from what the CSS actually paints.
const PALETTE_OPTIONS = PALETTE_IDS.map((id) => ({ id, label: PALETTES[id].name }));

function paletteSwatch(id, mode) {
  const { bg, accent } = PALETTES[id][mode];
  return `linear-gradient(135deg, ${bg} 0 50%, ${accent} 50% 100%)`;
}

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
}) {
  const visibleNavItems = NAV_ITEMS;
  const { preference, resolvedTheme, setPreference } = useTheme();
  const { palette, setPalette } = usePalette();
  const { user, logoutMutation } = useAuth();
  const { authEnabled } = useAuthConfig();
  const navigate = useNavigate();
  const [accentOpen, setAccentOpen] = useState(false);

  const isDark = resolvedTheme === 'dark';
  const swatchMode = isDark ? 'dark' : 'light';

  const accountLabel = user?.email
    ?? (user?.role
      ? user.role.charAt(0).toUpperCase() + user.role.slice(1)
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
              aria-label="Open theme and palette settings"
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
                  {PALETTE_OPTIONS.map(({ id, label }) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setPalette(id)}
                      aria-label={`${label} palette`}
                      aria-pressed={palette === id}
                      title={label}
                      style={{
                        background: paletteSwatch(id, swatchMode),
                        outline: palette === id ? `2px solid var(--hc-accent-strong)` : undefined,
                        outlineOffset: palette === id ? '2px' : undefined,
                        opacity: palette === id ? 1 : 0.7,
                      }}
                      className={clsx('w-5 h-5 rounded-full border border-hc-panel-border', FOCUS_RING)}
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
                  aria-label={accentOpen ? 'Hide palettes' : 'Show palettes'}
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
                {PALETTE_OPTIONS.map(({ id, label }) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setPalette(id)}
                    aria-label={`${label} palette`}
                    aria-pressed={palette === id}
                    title={label}
                    style={{
                      background: paletteSwatch(id, swatchMode),
                      outline: palette === id ? `2px solid var(--hc-accent-strong)` : undefined,
                      outlineOffset: palette === id ? '2px' : undefined,
                      opacity: palette === id ? 1 : 0.7,
                    }}
                    className={clsx('w-5 h-5 rounded-full border border-hc-panel-border', FOCUS_RING)}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* User/account + Sign out — hidden in auth-off (no session to end) */}
        {authEnabled !== false && (collapsed ? (
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
        ))}

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
