import { Sun, Moon, SunMoon, Sparkles, ArrowUpCircle, LogOut } from 'lucide-react';
import clsx from 'clsx';
import BrandLogo from './BrandLogo.jsx';
import { useTheme } from '../hooks/useTheme.js';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth.js';
import { useAuthConfig } from '../hooks/useAuthConfig.js';

// -- Constants --

// Mirrors FloatingNav.jsx NAV_ITEMS so the two navigations stay in sync.
// The masthead is text-only: at desktop widths labels read faster than icons,
// and dropping the icons is what lets five sections sit on one line.
const NAV_ITEMS = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'devices', label: 'Devices' },
  { id: 'timeline', label: 'Timeline' },
  { id: 'alerts', label: 'Alerts' },
  { id: 'settings', label: 'Settings' },
];

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

function ThemeIcon({ preference, size = 18 }) {
  if (preference === 'light') return <Sun size={size} />;
  if (preference === 'dark') return <Moon size={size} />;
  return <SunMoon size={size} />;
}

/**
 * Today's date, in the masthead's editorial register.
 *
 * Deliberately date-only, no clock: a time that does not tick reads as a broken
 * clock, and a ticking one is a timer for no real benefit — "last synced" on the
 * dashboard is the live signal that actually matters.
 */
function formatToday(now = new Date()) {
  try {
    return now.toLocaleDateString(undefined, {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    });
  } catch {
    return now.toDateString();
  }
}

/**
 * Masthead — desktop navigation (>=1024px).
 *
 * Replaces the collapsible left sidebar with a top masthead: wordmark left,
 * sections centre, date and account right, over the Almanac double rule. Below
 * 1024px App renders FloatingNav instead, unchanged (NAV-02).
 *
 * The palette picker that used to live in the sidebar is NOT reproduced here —
 * it now has a proper home in Settings -> Appearance. The quick theme toggle
 * stays, because switching to dark is a several-times-a-day action and a trip
 * to Settings for it would be a regression.
 */
export default function Masthead({
  activePage,
  onNavigate,
  hasNewVersion,
  onOpenChangelog,
  buildVersion,
  availableUpdate,
}) {
  const { preference, setPreference } = useTheme();
  const { user, logoutMutation } = useAuth();
  const { authEnabled } = useAuthConfig();
  const navigate = useNavigate();

  const accountLabel = user?.email
    ?? (user?.role
      ? user.role.charAt(0).toUpperCase() + user.role.slice(1)
      : 'Account');
  const accountInitials =
    (accountLabel.split('@')[0].match(/[a-zA-Z0-9]/g)?.slice(0, 2).join('') || 'AC').toUpperCase();

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
    <header className="shrink-0 bg-hc-bg">
      <div className="flex items-center gap-6 px-6 lg:px-10 py-3">
        {/* Wordmark — renders in the active palette, accent on "chronicle" */}
        <div className="shrink-0">
          <BrandLogo className="h-8 w-auto" />
        </div>

        {/* Sections */}
        <nav
          role="navigation"
          aria-label="Main navigation"
          className="flex-1 flex items-center justify-center gap-1 sm:gap-2"
        >
          {NAV_ITEMS.map(({ id, label }) => {
            const isActive = activePage === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => onNavigate(id)}
                aria-current={isActive ? 'page' : undefined}
                className={clsx(
                  'px-3 py-1.5 text-hc-label font-medium transition-colors border-b-2 -mb-px',
                  FOCUS_RING,
                  isActive
                    ? 'text-hc-fg-strong font-semibold border-hc-fg-strong'
                    : 'text-hc-muted hover:text-hc-fg border-transparent',
                )}
              >
                {label}
              </button>
            );
          })}
        </nav>

        {/* Date, build, account */}
        <div className="shrink-0 flex items-center gap-3">
          <span className="hidden xl:inline text-hc-caption uppercase tracking-[0.14em] text-hc-muted">
            {formatToday()}
          </span>

          {availableUpdate && (
            <a
              href={availableUpdate.url}
              target="_blank"
              rel="noopener noreferrer"
              className={clsx(
                'hidden lg:flex items-center gap-1 text-hc-caption text-hc-success-text hover:underline',
                FOCUS_RING,
              )}
            >
              <ArrowUpCircle size={14} aria-hidden="true" />
              <span>{availableUpdate.tag} available</span>
            </a>
          )}

          <button
            type="button"
            onClick={onOpenChangelog}
            className={clsx(
              'flex items-center gap-1 text-hc-caption text-hc-muted hover:text-hc-fg transition-colors',
              FOCUS_RING,
            )}
          >
            {buildVersion}
            {hasNewVersion && <Sparkles size={12} className="text-hc-warning-text" aria-hidden="true" />}
          </button>

          <button
            type="button"
            onClick={() => setPreference(getNextPreference(preference))}
            aria-label={getThemeToggleLabel(preference)}
            className={clsx(
              'flex items-center justify-center w-8 h-8 rounded-lg text-hc-muted hover:bg-hc-interactive hover:text-hc-fg transition-colors',
              FOCUS_RING,
            )}
          >
            <ThemeIcon preference={preference} />
          </button>

          {/* Account — hidden in auth-off (no session to end) */}
          {authEnabled !== false && (
            <div className="flex items-center gap-2">
              <span
                aria-hidden="true"
                className="flex items-center justify-center w-8 h-8 rounded-full bg-hc-interactive text-hc-fg text-hc-caption font-semibold shrink-0"
              >
                {accountInitials}
              </span>
              <span className="hidden 2xl:inline max-w-[160px] truncate text-hc-caption text-hc-muted">
                {accountLabel}
              </span>
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
          )}
        </div>
      </div>

      {/* Almanac double rule: a heavy line over a hairline. */}
      <div
        aria-hidden="true"
        className="mx-6 lg:mx-10 h-[3px] border-t-2 border-b border-hc-fg-strong"
      />
    </header>
  );
}
