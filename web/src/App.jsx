import { useCallback, useEffect, useState } from 'react';
import { LayoutList, BarChart2, Home, Settings, Monitor, Sun, Moon, Paintbrush2, Link2, Unlink2 } from 'lucide-react';
import clsx from 'clsx';
import Timeline from './components/Timeline.jsx';
import StatsCards from './components/StatsCards.jsx';
import ActivityChart from './components/ActivityChart.jsx';
import TrendChart from './components/TrendChart.jsx';
import TopDevices from './components/TopDevices.jsx';
import RoomChart from './components/RoomChart.jsx';
import WeekdayHeatmap from './components/WeekdayHeatmap.jsx';
import MonthlyHeatmap from './components/MonthlyHeatmap.jsx';
import AnomalyPanel from './components/AnomalyPanel.jsx';
import StaleDevicesPanel from './components/StaleDevicesPanel.jsx';
import QuietHoursPanel from './components/QuietHoursPanel.jsx';
import AccessoryList from './components/AccessoryList.jsx';
import AccessoryDetail from './components/AccessoryDetail.jsx';
import Setup from './components/Setup.jsx';
import BrandLogo from './components/BrandLogo.jsx';
import ChangelogModal from './components/ChangelogModal.jsx';
import ErrorBoundary from './components/ErrorBoundary.jsx';
import PairingHealthBanner from './components/PairingHealthBanner.jsx';
import { useQuery } from '@tanstack/react-query';
import { fetchJson } from './lib/api.js';
import { useTheme } from './hooks/useTheme.js';
import { useAccent } from './hooks/useAccent.js';
import { useUpdateCheck } from './hooks/useUpdateCheck.js';
import { useLiveEventToasts } from './hooks/useLiveEventToasts.js';
import { useToast } from './components/Toast.jsx';
import { ExternalLink, Sparkles, ArrowUpCircle } from 'lucide-react';

const CHANGELOG_VERSION_KEY = 'hc_last_seen_version';

const TABS = [
  { id: 'dashboard',  label: 'Dashboard',   icon: BarChart2 },
  { id: 'timeline',    label: 'Timeline',    icon: LayoutList },
  { id: 'accessories',label: 'Accessories', icon: Home },
  { id: 'setup',      label: 'Manage',      icon: Settings },
];
const DASHBOARD_WINDOWS = [
  { label: '7d', days: 7 },
  { label: '30d', days: 30 },
  { label: '90d', days: 90 },
];
const DASHBOARD_RANGE_STORAGE_KEY = 'hc_dashboard_global_days';
const DASHBOARD_SYNC_STORAGE_KEY = 'hc_dashboard_sync_ranges';

const STYLES = [
  { id: 'ocean', label: 'Ocean' },
  { id: 'graphite', label: 'Graphite' },
  { id: 'sunrise', label: 'Sunrise' },
  { id: 'red', label: 'Red' },
  { id: 'yellow', label: 'Yellow' },
  { id: 'purple', label: 'Purple' },
  { id: 'slate', label: 'Slate' },
  { id: 'pink', label: 'Pink' },
];

// Inline gradients avoid Tailwind purge issues with dynamic class names
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

export default function App() {
  const [tab, setTab]               = useState('dashboard');
  const [scrolled, setScrolled]     = useState(false);

  useEffect(() => {
    const onScroll = () => {
      const y = window.scrollY;
      setScrolled(prev => {
        if (prev) return y > 20;   // collapse → expand only when near top
        return y > 50;              // expand → collapse at original threshold
      });
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const { data: retentionConfig } = useQuery({
    queryKey: ['setup', 'retention'],
    queryFn: () => fetchJson('/api/setup/retention'),
    staleTime: 30_000,
  });

  const { configure: configureToasts } = useToast();

  const handleToastNavigateToAccessory = useCallback((accessoryName) => {
    setTimelineInitialFilters({ accessory: accessoryName });
    setTab('timeline');
  }, []);

  useLiveEventToasts({ activeTab: tab, retentionConfig, onNavigateToAccessory: handleToastNavigateToAccessory });

  useEffect(() => {
    if (retentionConfig) {
      configureToasts({
        position: retentionConfig.toastPosition,
        duration: retentionConfig.toastDuration,
        maxVisible: retentionConfig.toastMaxVisible,
      });
    }
  }, [retentionConfig?.toastPosition, retentionConfig?.toastDuration, retentionConfig?.toastMaxVisible, configureToasts]);

  const [selectedAccessoryId, setSelectedAccessoryId] = useState(null);
  const [isAccentPickerOpen, setIsAccentPickerOpen] = useState(false);
  const [isStandalonePwa, setIsStandalonePwa] = useState(false);
  const [isMobileViewport, setIsMobileViewport] = useState(() =>
    typeof window !== 'undefined' && window.innerWidth < 768
  );
  const [dashboardDays, setDashboardDays] = useState(() => {
    if (typeof window === 'undefined') return 30;
    try {
      const stored = Number.parseInt(window.localStorage.getItem(DASHBOARD_RANGE_STORAGE_KEY) ?? '', 10);
      return DASHBOARD_WINDOWS.some((w) => w.days === stored) ? stored : 30;
    } catch {
      return 30;
    }
  });
  const [syncDashboardRanges, setSyncDashboardRanges] = useState(() => {
    if (typeof window === 'undefined') return true;
    try {
      const stored = window.localStorage.getItem(DASHBOARD_SYNC_STORAGE_KEY);
      return stored == null ? true : stored !== 'false';
    } catch {
      return true;
    }
  });
  const [showChangelog, setShowChangelog] = useState(false);
  const [hasNewVersion, setHasNewVersion] = useState(false);
  const { preference, resolvedTheme, setPreference } = useTheme();
  const { accent, setAccent } = useAccent();
  const { update: availableUpdate, dismiss: dismissUpdate } = useUpdateCheck(__BUILD_VERSION__);
  const isDarkTheme = resolvedTheme === 'dark';
  const nextPreference =
    preference === 'system' ? 'light' :
    preference === 'light' ? 'dark' :
    'system';
  const [timelineInitialFilters, setTimelineInitialFilters] = useState(null);
  const handleSelectRoom = useCallback((roomName) => {
    setTimelineInitialFilters({ room: roomName });
    setTab('timeline');
  }, []);
  const handleSelectAccessory = useCallback((accessoryId) => {
    if (!accessoryId) return;
    if (typeof window !== 'undefined') {
      const url = `${window.location.pathname}${window.location.search}${window.location.hash}`;
      window.history.pushState({ hcView: 'accessory-detail', accessoryId }, '', url);
    }
    setSelectedAccessoryId(accessoryId);
  }, []);
  const handleAccessoryBack = useCallback(() => {
    if (typeof window !== 'undefined' && window.history.state?.hcView === 'accessory-detail') {
      window.history.back();
      return;
    }
    setSelectedAccessoryId(null);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const onPopState = (event) => {
      const { state } = event;
      if (state?.hcView === 'accessory-detail' && typeof state.accessoryId === 'string' && state.accessoryId.length > 0) {
        setTab('accessories');
        setSelectedAccessoryId(state.accessoryId);
        return;
      }
      setSelectedAccessoryId(null);
    };

    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const media = window.matchMedia?.('(display-mode: standalone)');
    const applyStandaloneState = () => {
      const standalone =
        Boolean(media?.matches) || Boolean(window.navigator?.standalone);
      setIsStandalonePwa(standalone);
      document.documentElement.classList.toggle('hc-standalone', standalone);
    };

    applyStandaloneState();
    if (!media) return undefined;
    media.addEventListener?.('change', applyStandaloneState);
    return () => {
      media.removeEventListener?.('change', applyStandaloneState);
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const mobileQuery = window.matchMedia('(max-width: 767px)');
    const onResize = () => setIsMobileViewport(mobileQuery.matches);
    mobileQuery.addEventListener('change', onResize);
    return () => mobileQuery.removeEventListener('change', onResize);
  }, []);

  const isBottomNav = isStandalonePwa || isMobileViewport;

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(DASHBOARD_RANGE_STORAGE_KEY, String(dashboardDays));
    } catch {
      // Ignore storage write failures.
    }
  }, [dashboardDays]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(DASHBOARD_SYNC_STORAGE_KEY, String(syncDashboardRanges));
    } catch {
      // Ignore storage write failures.
    }
  }, [syncDashboardRanges]);

  // Auto-show changelog when the build version changes
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const lastSeen = window.localStorage.getItem(CHANGELOG_VERSION_KEY);
      if (lastSeen !== __BUILD_VERSION__) {
        setHasNewVersion(true);
        // Only auto-show if user has visited before (not first ever load)
        if (lastSeen) setShowChangelog(true);
      }
    } catch {
      // Ignore storage read failures.
    }
  }, []);

  function handleOpenChangelog() {
    setShowChangelog(true);
  }

  function handleCloseChangelog() {
    setShowChangelog(false);
    setHasNewVersion(false);
    try {
      window.localStorage.setItem(CHANGELOG_VERSION_KEY, __BUILD_VERSION__);
    } catch {
      // Ignore storage write failures.
    }
  }

  return (
    <div className={clsx('min-h-screen bg-gray-50 flex flex-col', isStandalonePwa && 'hc-pwa-shell')}>
      {/* Header */}
      <header className={clsx(
        'hc-app-header sticky top-0 z-50 transition-all duration-200 border-b px-3 sm:px-4 flex items-center gap-3 bg-[var(--hc-panel)] border-[var(--hc-panel-border)]',
        scrolled ? 'py-1.5 shadow-sm' : 'py-3 flex-wrap',
      )}>
        {!isBottomNav && (
          <button type="button" onClick={() => setTab('dashboard')} className="flex-shrink-0 cursor-pointer">
            <BrandLogo className={clsx('w-auto transition-all duration-200', scrolled ? 'h-8 max-w-[200px]' : 'h-12 sm:h-14 max-w-[260px] sm:max-w-[300px]')} />
          </button>
        )}
        {!isBottomNav && <span className="flex-1 hidden md:block" />}

        <nav className={clsx('hc-tab-nav flex gap-1 overflow-x-auto pb-1 -mb-1', scrolled ? 'md:order-none md:w-auto' : 'order-3 md:order-none w-full md:w-auto')}>
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => { if (tab === 'timeline' && id !== 'timeline') setTimelineInitialFilters(null); setTab(id); }}
              className={clsx(
                'hc-tab-btn flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap',
                tab === id
                  ? 'bg-blue-50 text-blue-600'
                  : 'text-gray-500 hover:text-gray-800 hover:bg-gray-100'
              )}
            >
              <Icon size={isBottomNav ? 20 : 15} />
              <span className="hc-tab-label">{label}</span>
            </button>
          ))}
        </nav>
      </header>

      {/* Content */}
      <main className={clsx('flex-1 overflow-hidden', isBottomNav && 'hc-pwa-main')}>
        <div key={tab} className="animate-tab-enter">
        {tab === 'timeline' && <ErrorBoundary key="timeline"><Timeline initialFilters={timelineInitialFilters} onSelectAccessory={(id) => { setTab('accessories'); handleSelectAccessory(id); }} /></ErrorBoundary>}

        {tab === 'dashboard' && (<ErrorBoundary key="dashboard">
          <div className="max-w-5xl mx-auto py-4 sm:py-6 px-3 sm:px-4 space-y-4">

            <PairingHealthBanner onViewDetails={() => setTab('setup')} />

            {/* KPI cards row */}
            <StatsCards />

            <div className="flex items-center justify-between px-1">
              <div className="flex items-center gap-1 bg-white border border-gray-200 rounded-lg p-0.5 shadow-sm">
                {DASHBOARD_WINDOWS.map(({ label, days }) => (
                  <button
                    key={days}
                    onClick={() => setDashboardDays(days)}
                    className={clsx(
                      'text-xs px-2.5 py-1 rounded-md transition-colors',
                      dashboardDays === days
                        ? 'bg-blue-100 text-blue-700 font-medium'
                        : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <button
                onClick={() => setSyncDashboardRanges((v) => !v)}
                title={syncDashboardRanges ? 'Charts synced — click to unsync' : 'Charts independent — click to sync'}
                className={clsx(
                  'flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border transition-colors',
                  syncDashboardRanges
                    ? 'bg-blue-50 border-blue-200 text-blue-600'
                    : 'bg-white border-gray-200 text-gray-400 hover:text-gray-600'
                )}
              >
                {syncDashboardRanges ? <Link2 size={12} /> : <Unlink2 size={12} />}
                <span className="hidden sm:inline">{syncDashboardRanges ? 'Synced' : 'Sync'}</span>
              </button>
            </div>

            {/* Full-width trend chart */}
            <div className="bg-white rounded-xl shadow-sm p-4 sm:p-5">
              <TrendChart
                forcedDays={syncDashboardRanges ? dashboardDays : null}
                onDaysChange={syncDashboardRanges ? setDashboardDays : null}
              />
            </div>

            {/* 2-col: hourly activity + room breakdown */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-white rounded-xl shadow-sm p-4 sm:p-5">
                <ActivityChart />
              </div>
              <div className="bg-white rounded-xl shadow-sm p-4 sm:p-5">
                <RoomChart
                  forcedDays={syncDashboardRanges ? dashboardDays : null}
                  onDaysChange={syncDashboardRanges ? setDashboardDays : null}
                />
              </div>
            </div>

            {/* 2-col: top devices + heatmaps */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-white rounded-xl shadow-sm p-4 sm:p-5">
                <TopDevices
                  forcedDays={syncDashboardRanges ? dashboardDays : null}
                  onDaysChange={syncDashboardRanges ? setDashboardDays : null}
                />
              </div>
              <div className="bg-white rounded-xl shadow-sm p-4 sm:p-5">
                <WeekdayHeatmap
                  forcedDays={syncDashboardRanges ? dashboardDays : null}
                  onDaysChange={syncDashboardRanges ? setDashboardDays : null}
                />
                <div className="mt-4 pt-4 border-t border-gray-100">
                  <MonthlyHeatmap />
                </div>
              </div>
            </div>

            {/* Quiet hours */}
            <QuietHoursPanel onNavigateToAccessory={handleToastNavigateToAccessory} />

            {/* 2-col: active outliers + stale devices */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-4 sm:p-5">
                <AnomalyPanel onSelectAccessory={(id) => { setTab('accessories'); handleSelectAccessory(id); }} onSelectRoom={handleSelectRoom} />
              </div>
              <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-4 sm:p-5">
                <StaleDevicesPanel onSelectAccessory={(id) => { setTab('accessories'); handleSelectAccessory(id); }} />
              </div>
            </div>

          </div>
        </ErrorBoundary>)}

        {tab === 'accessories' && (<ErrorBoundary key="accessories">
          {selectedAccessoryId
            ? <AccessoryDetail accessoryId={selectedAccessoryId} onBack={handleAccessoryBack} />
            : <AccessoryList onSelectAccessory={handleSelectAccessory} />
          }
        </ErrorBoundary>)}
        {tab === 'setup' && <ErrorBoundary key="setup"><Setup /></ErrorBoundary>}
        </div>
      </main>

      {/* Footer */}
      <footer className="hc-footer border-t border-gray-200 px-4 py-2 text-center text-xs text-gray-400 flex items-center justify-center gap-3">
        <button
          onClick={handleOpenChangelog}
          title={__BUILD_VERSION__}
          className="inline-flex items-center gap-1.5 text-gray-400 hover:text-gray-600 transition-colors"
        >
          {hasNewVersion && <Sparkles size={11} className="text-blue-500" />}
          <span>{__BUILD_VERSION__}</span>
          {hasNewVersion && <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />}
        </button>
        {availableUpdate && (
          <>
            <span className="text-gray-300">·</span>
            <a
              href={availableUpdate.url}
              target="_blank"
              rel="noopener noreferrer"
              className="hc-update-badge inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-50 dark:bg-green-500/10 border border-green-200 dark:border-green-500/20 text-green-700 dark:text-green-300 hover:bg-green-100 dark:hover:bg-green-500/20 transition-colors"
            >
              <ArrowUpCircle size={11} />
              <span>{availableUpdate.tag} available</span>
            </a>
            <button
              onClick={dismissUpdate}
              title="Dismiss update notice"
              className="text-gray-300 hover:text-gray-500 transition-colors"
            >
              &times;
            </button>
          </>
        )}
        <span className="text-gray-300">·</span>
        <a
          href="https://gitlab.com/havuq/homechronicle/-/issues"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-gray-400 hover:text-gray-600 transition-colors"
        >
          <ExternalLink size={11} />
          Report an issue
        </a>
      </footer>

      {showChangelog && <ChangelogModal onClose={handleCloseChangelog} />}

      <div className="hc-fab fixed bottom-4 right-4 z-20">
        <div className="relative flex flex-col items-end gap-2">
          <div
            className={clsx(
              'absolute right-11 bottom-0 z-10 flex items-center gap-1 rounded-full border border-gray-200 bg-white/95 px-2 py-1.5 shadow-sm backdrop-blur transition-all duration-300 ease-out',
              isAccentPickerOpen
                ? 'translate-x-0 opacity-100 pointer-events-auto'
                : 'translate-x-8 opacity-0 pointer-events-none'
            )}
            style={isDarkTheme ? { backgroundColor: 'rgba(30,41,59,0.95)', borderColor: 'rgba(71,85,105,0.7)' } : undefined}
            aria-hidden={!isAccentPickerOpen}
          >
            {STYLES.map((style) => (
              <button
                key={style.id}
                type="button"
                onClick={() => setAccent(style.id)}
                className={clsx(
                  'h-6 w-6 rounded-full p-0.5 transition-all',
                  accent === style.id
                    ? 'ring-2 ring-blue-500'
                    : isDarkTheme
                      ? 'ring-1 ring-slate-300 hover:ring-slate-400'
                      : 'ring-1 ring-gray-300 hover:ring-gray-400'
                )}
                style={isDarkTheme ? { backgroundColor: 'rgba(30,41,59,0.8)' } : undefined}
                aria-label={`Use ${style.label} color theme`}
                title={style.label}
              >
                <span
                  className="block h-full w-full rounded-full"
                  style={{
                    background: isDarkTheme ? ACCENT_SWATCH_DARK[style.id] : ACCENT_SWATCH[style.id],
                    ...(isDarkTheme ? { boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.15)' } : {}),
                  }}
                />
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setPreference(nextPreference)}
            className={clsx(
              'z-30 inline-flex h-9 w-9 items-center justify-center rounded-full border shadow-sm backdrop-blur transition-all duration-200',
              isDarkTheme
                ? 'border-gray-600 bg-gray-800/90 text-gray-300 hover:text-gray-100 hover:bg-gray-700/90'
                : 'border-gray-200 bg-white/95 text-gray-500 hover:text-gray-700 hover:bg-gray-50'
            )}
            aria-label={`Theme mode: ${preference}. Click to switch to ${nextPreference}.`}
            title={`Theme mode: ${preference}`}
          >
            {preference === 'system' && <Monitor size={15} />}
            {preference === 'light' && <Sun size={15} />}
            {preference === 'dark' && <Moon size={15} />}
          </button>
          <button
            type="button"
            onClick={() => setIsAccentPickerOpen((current) => !current)}
            className={clsx(
              'relative z-20 inline-flex h-9 w-9 items-center justify-center rounded-full border shadow-sm backdrop-blur transition-all duration-200',
              isDarkTheme
                ? 'border-gray-600 bg-gray-800/90 text-gray-300'
                : 'border-gray-200 bg-white/95 text-gray-500',
              isAccentPickerOpen
                ? isDarkTheme ? 'text-blue-400 border-blue-500' : 'text-blue-600 border-blue-300'
                : isDarkTheme ? 'hover:text-gray-100 hover:bg-gray-700/90' : 'hover:text-gray-700 hover:bg-gray-50'
            )}
            aria-label={isAccentPickerOpen ? 'Hide accent colors' : 'Show accent colors'}
            aria-expanded={isAccentPickerOpen}
            title="Color themes"
          >
            <Paintbrush2 size={15} />
          </button>
        </div>
      </div>
    </div>
  );
}
