import { useCallback, useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchJson } from './lib/api.js';
import { useMediaQuery } from './hooks/useMediaQuery.js';
import { useUpdateCheck } from './hooks/useUpdateCheck.js';
import { useLiveEventToasts } from './hooks/useLiveEventToasts.js';
import { useToast } from './components/Toast.jsx';
import Sidebar from './components/Sidebar.jsx';
import { Menu } from 'lucide-react';
import clsx from 'clsx';
import ErrorBoundary from './components/ErrorBoundary.jsx';
import ChangelogModal from './components/ChangelogModal.jsx';
import AccessoryDetail from './components/AccessoryDetail.jsx';
import DashboardPage from './pages/DashboardPage.jsx';
import TimelinePage from './pages/TimelinePage.jsx';
import DevicesPage from './pages/DevicesPage.jsx';
import AlertsPage from './pages/AlertsPage.jsx';
import SettingsPage from './pages/SettingsPage.jsx';

const CHANGELOG_KEY = 'hc_last_seen_version';
const SIDEBAR_KEY = 'hc_sidebar_collapsed';

const PAGE_TITLES = {
  dashboard: 'Dashboard',
  devices: 'Devices',
  timeline: 'Timeline',
  alerts: 'Alerts',
  settings: 'Settings',
};

export default function App() {
  const [activePage, setActivePage] = useState('dashboard');
  const [selectedAccessoryId, setSelectedAccessoryId] = useState(null);
  const [timelineFilters, setTimelineFilters] = useState(null);
  const [showChangelog, setShowChangelog] = useState(false);
  const [hasNewVersion, setHasNewVersion] = useState(false);
  const [collapsed, setCollapsed] = useState(() => {
    try { return window.localStorage.getItem(SIDEBAR_KEY) === 'true'; } catch { return false; }
  });

  const isMobile = useMediaQuery('(max-width: 767px)');
  const isTablet = useMediaQuery('(min-width: 768px) and (max-width: 1023px)');
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Derived -- never mutate collapsed based on breakpoint; preserve user preference
  const effectiveCollapsed = isMobile ? false : (isTablet ? true : collapsed);

  // Grid column -- 3 zones
  const gridCols = isMobile ? '1fr' : (effectiveCollapsed ? '56px 1fr' : '240px 1fr');

  const { data: retentionConfig } = useQuery({ queryKey: ['setup', 'retention'], queryFn: () => fetchJson('/api/setup/retention'), staleTime: 30_000 });
  const { data: alertsConfig } = useQuery({ queryKey: ['setup', 'alerts'], queryFn: () => fetchJson('/api/setup/alerts'), staleTime: 30_000 });
  const alertsEnabled = Boolean(alertsConfig?.enabled);
  const { configure: configureToasts } = useToast();
  const { update: availableUpdate, dismiss: dismissUpdate } = useUpdateCheck(__BUILD_VERSION__);

  const handleToastNav = useCallback((name) => { setTimelineFilters({ accessory: name }); setActivePage('timeline'); }, []);
  useLiveEventToasts({ activeTab: activePage, retentionConfig, onNavigateToAccessory: handleToastNav });

  useEffect(() => {
    if (retentionConfig) configureToasts({ position: retentionConfig.toastPosition, duration: retentionConfig.toastDuration, maxVisible: retentionConfig.toastMaxVisible });
  }, [retentionConfig?.toastPosition, retentionConfig?.toastDuration, retentionConfig?.toastMaxVisible, configureToasts]);

  useEffect(() => { try { window.localStorage.setItem(SIDEBAR_KEY, String(collapsed)); } catch {} }, [collapsed]);

  // Close drawer when viewport leaves mobile (prevents inconsistent state on resize)
  useEffect(() => {
    if (!isMobile) setDrawerOpen(false);
  }, [isMobile]);

  // Bounce off the alerts page if webhook alerts get disabled
  useEffect(() => {
    if (alertsConfig && !alertsEnabled && activePage === 'alerts') setActivePage('dashboard');
  }, [alertsConfig, alertsEnabled, activePage]);

  const handleSelectAccessory = useCallback((id) => {
    if (!id) return;
    window.history.pushState({ hcView: 'accessory-detail', accessoryId: id }, '', `${window.location.pathname}${window.location.search}${window.location.hash}`);
    setSelectedAccessoryId(id);
  }, []);
  const handleAccessoryBack = useCallback(() => {
    if (window.history.state?.hcView === 'accessory-detail') { window.history.back(); return; }
    setSelectedAccessoryId(null);
  }, []);
  const handleSelectRoom = useCallback((room) => { setTimelineFilters({ room }); setActivePage('timeline'); }, []);

  useEffect(() => {
    const onPop = (e) => {
      if (e.state?.hcView === 'accessory-detail' && e.state.accessoryId) { setSelectedAccessoryId(e.state.accessoryId); return; }
      setSelectedAccessoryId(null);
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  useEffect(() => {
    try {
      const lastSeen = window.localStorage.getItem(CHANGELOG_KEY);
      if (lastSeen !== __BUILD_VERSION__) { setHasNewVersion(true); if (lastSeen) setShowChangelog(true); }
    } catch {}
  }, []);

  const openChangelog = () => setShowChangelog(true);
  const closeChangelog = () => { setShowChangelog(false); setHasNewVersion(false); try { window.localStorage.setItem(CHANGELOG_KEY, __BUILD_VERSION__); } catch {} };
  const navigate = (page) => { if (activePage === 'timeline' && page !== 'timeline') setTimelineFilters(null); setSelectedAccessoryId(null); setActivePage(page); };

  return (
    <>
      {/* Fixed mobile top bar -- outside grid flow, z-30 per UI-SPEC */}
      {isMobile && (
        <div
          className="fixed top-0 left-0 right-0 z-30 flex items-center gap-3 px-3 bg-hc-panel border-b border-hc-panel-border"
          style={{ height: '48px', paddingTop: 'env(safe-area-inset-top)' }}
        >
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            aria-label="Open navigation"
            className="flex items-center justify-center w-12 h-12 -ml-2 text-hc-fg"
          >
            <Menu size={20} />
          </button>
          <span className="font-semibold text-hc-fg-strong" style={{ fontSize: 'var(--hc-text-section)' }}>
            {PAGE_TITLES[activePage] ?? ''}
          </span>
        </div>
      )}

      {/* Always-mounted sheet drawer (when mobile) -- stays mounted for close animation */}
      {isMobile && (
        <>
          <div
            className={clsx(
              'fixed inset-0 bg-black/50 transition-opacity duration-250',
              drawerOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none',
            )}
            style={{ zIndex: 39 }}
            onClick={() => setDrawerOpen(false)}
            aria-label="Close navigation"
          />
          <div className={clsx('hc-drawer', drawerOpen && 'hc-drawer--open')} aria-modal="true">
            <Sidebar
              collapsed={false}
              onToggle={undefined}
              inDrawer={true}
              activePage={activePage}
              onNavigate={(page) => { setDrawerOpen(false); navigate(page); }}
              hasNewVersion={hasNewVersion}
              onOpenChangelog={openChangelog}
              buildVersion={__BUILD_VERSION__}
              availableUpdate={availableUpdate}
              onDismissUpdate={dismissUpdate}
              alertsEnabled={alertsEnabled}
            />
          </div>
        </>
      )}

      {/* Main grid layout */}
      <div className="app-layout" style={{ gridTemplateColumns: gridCols }}>
        {!isMobile && (
          <Sidebar
            collapsed={effectiveCollapsed}
            onToggle={isTablet ? undefined : () => setCollapsed(c => !c)}
            inDrawer={isTablet}
            activePage={activePage}
            onNavigate={navigate}
            hasNewVersion={hasNewVersion}
            onOpenChangelog={openChangelog}
            buildVersion={__BUILD_VERSION__}
            availableUpdate={availableUpdate}
            onDismissUpdate={dismissUpdate}
            alertsEnabled={alertsEnabled}
          />
        )}
        <main className={clsx('overflow-y-auto', isMobile && 'pt-12')}>
          {selectedAccessoryId ? (
            <ErrorBoundary key="detail"><AccessoryDetail accessoryId={selectedAccessoryId} onBack={handleAccessoryBack} /></ErrorBoundary>
          ) : (
            <ErrorBoundary key={activePage}>
              {activePage === 'dashboard' && <DashboardPage onSelectAccessory={handleSelectAccessory} onSelectRoom={handleSelectRoom} onNavigateToAccessory={handleToastNav} onViewDeviceRepair={() => setActivePage('devices')} />}
              {activePage === 'devices' && <DevicesPage onSelectAccessory={handleSelectAccessory} />}
              {activePage === 'timeline' && <TimelinePage initialFilters={timelineFilters} onSelectAccessory={handleSelectAccessory} />}
              {activePage === 'alerts' && <AlertsPage />}
              {activePage === 'settings' && <SettingsPage />}
            </ErrorBoundary>
          )}
        </main>
      </div>
      {showChangelog && <ChangelogModal onClose={closeChangelog} />}
    </>
  );
}
