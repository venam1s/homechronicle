import { useCallback, useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchJson } from './lib/api.js';
import { useUpdateCheck } from './hooks/useUpdateCheck.js';
import { useLiveEventToasts } from './hooks/useLiveEventToasts.js';
import { useToast } from './components/Toast.jsx';
import Sidebar from './components/Sidebar.jsx';
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

export default function App() {
  const [activePage, setActivePage] = useState('dashboard');
  const [selectedAccessoryId, setSelectedAccessoryId] = useState(null);
  const [timelineFilters, setTimelineFilters] = useState(null);
  const [showChangelog, setShowChangelog] = useState(false);
  const [hasNewVersion, setHasNewVersion] = useState(false);
  const [collapsed, setCollapsed] = useState(() => {
    try { return window.localStorage.getItem(SIDEBAR_KEY) === 'true'; } catch { return false; }
  });
  const { data: retentionConfig } = useQuery({ queryKey: ['setup', 'retention'], queryFn: () => fetchJson('/api/setup/retention'), staleTime: 30_000 });
  const { configure: configureToasts } = useToast();
  const { update: availableUpdate, dismiss: dismissUpdate } = useUpdateCheck(__BUILD_VERSION__);

  const handleToastNav = useCallback((name) => { setTimelineFilters({ accessory: name }); setActivePage('timeline'); }, []);
  useLiveEventToasts({ activeTab: activePage, retentionConfig, onNavigateToAccessory: handleToastNav });

  useEffect(() => {
    if (retentionConfig) configureToasts({ position: retentionConfig.toastPosition, duration: retentionConfig.toastDuration, maxVisible: retentionConfig.toastMaxVisible });
  }, [retentionConfig?.toastPosition, retentionConfig?.toastDuration, retentionConfig?.toastMaxVisible, configureToasts]);

  useEffect(() => { try { window.localStorage.setItem(SIDEBAR_KEY, String(collapsed)); } catch {} }, [collapsed]);

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
      <div className="app-layout" style={{ gridTemplateColumns: collapsed ? '56px 1fr' : '240px 1fr' }}>
        <Sidebar collapsed={collapsed} onToggle={() => setCollapsed(c => !c)} activePage={activePage} onNavigate={navigate}
          hasNewVersion={hasNewVersion} onOpenChangelog={openChangelog} buildVersion={__BUILD_VERSION__} availableUpdate={availableUpdate} onDismissUpdate={dismissUpdate} />
        <main className="overflow-y-auto">
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
