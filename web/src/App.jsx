import { useCallback, useEffect, useRef, useState } from 'react';
import { usePreference } from './hooks/usePreference.js';
import { useUserPreferences } from './hooks/useUserPreferences.js';
import { useAuth } from './hooks/useAuth.js';
import { useSignOut } from './hooks/useSignOut.js';
import { useQuery } from '@tanstack/react-query';
import { fetchJson } from './lib/api.js';
import { useMediaQuery } from './hooks/useMediaQuery.js';
import { useUpdateCheck } from './hooks/useUpdateCheck.js';
import { useLiveEventToasts } from './hooks/useLiveEventToasts.js';
import { useToast } from './components/Toast.jsx';
import Masthead from './components/Masthead.jsx';
import FloatingNav, { FLOATING_NAV_CLEARANCE } from './components/FloatingNav.jsx';
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
const PAGE_LABELS = { dashboard: 'Dashboard', devices: 'Devices', timeline: 'Timeline', alerts: 'Alerts', settings: 'Settings' };

export default function App() {
  const [activePage, setActivePage] = useState('dashboard');
  // Which Settings section to show. Owned here rather than inside SettingsPage
  // so navigation can address it — see the account menu's Appearance shortcut.
  const [settingsSection, setSettingsSection] = useState('configuration');
  const [selectedAccessoryId, setSelectedAccessoryId] = useState(null);
  const [timelineFilters, setTimelineFilters] = useState(null);
  const [showChangelog, setShowChangelog] = useState(false);
  const [hasNewVersion, setHasNewVersion] = useState(false);
  const isMobile = useMediaQuery('(max-width: 767px)');
  const isTablet = useMediaQuery('(min-width: 768px) and (max-width: 1023px)');
  // Floating nav replaces the masthead below 1024px (mobile + tablet).
  const isFloatingNav = isMobile || isTablet;
  const mainRef = useRef(null);

  const { data: retentionConfig } = useQuery({ queryKey: ['setup', 'retention'], queryFn: () => fetchJson('/api/setup/retention'), staleTime: 30_000 });
  const { configure: configureToasts } = useToast();
  const { update: availableUpdate, latest: latestRelease, status: updateStatus } = useUpdateCheck(__BUILD_VERSION__);
  const { user } = useAuth();
  const { signOut, isPending: signingOut, available: canSignOut } = useSignOut();
  const { prefs, seedIfEmpty } = useUserPreferences();

  // PREF-10: per-user toast config (authed path reads from blob; anon path reads from retentionConfig below).
  // Unique localStorage keys prevent cross-contamination between the 5 usePreference instances.
  const [blobToastsEnabled] = usePreference('toastsEnabled', true, { localStorageKey: 'hc_pref_toastsEnabled' });
  const [blobLiveEventToastsEnabled] = usePreference('liveEventToastsEnabled', false, { localStorageKey: 'hc_pref_liveEventToastsEnabled' });
  const [blobToastPosition] = usePreference('toastPosition', 'bottom-right', { localStorageKey: 'hc_pref_toastPosition' });
  const [blobToastDuration] = usePreference('toastDuration', 3, { localStorageKey: 'hc_pref_toastDuration' });
  const [blobToastMaxVisible] = usePreference('toastMaxVisible', 3, { localStorageKey: 'hc_pref_toastMaxVisible' });

  // Effective toast config: when authed, use blob; when anon, use retentionConfig.
  const effectiveToastsEnabled = user ? blobToastsEnabled : (retentionConfig?.toastsEnabled ?? true);
  const effectiveLiveEventToastsEnabled = user ? blobLiveEventToastsEnabled : (retentionConfig?.liveEventToastsEnabled ?? false);
  const effectiveToastPosition = user ? blobToastPosition : (retentionConfig?.toastPosition ?? 'bottom-right');
  const effectiveToastDuration = user ? blobToastDuration : (retentionConfig?.toastDuration ?? 3);
  const effectiveToastMaxVisible = user ? blobToastMaxVisible : (retentionConfig?.toastMaxVisible ?? 3);

  const handleToastNav = useCallback((name) => { setTimelineFilters({ accessory: name }); setActivePage('timeline'); }, []);
  // useLiveEventToasts reads from effective (blob-when-authed) config.
  useLiveEventToasts({
    activeTab: activePage,
    retentionConfig: user
      ? { ...retentionConfig, toastsEnabled: effectiveToastsEnabled, liveEventToastsEnabled: effectiveLiveEventToastsEnabled }
      : retentionConfig,
    onNavigateToAccessory: handleToastNav,
  });

  useEffect(() => {
    configureToasts({ position: effectiveToastPosition, duration: effectiveToastDuration, maxVisible: effectiveToastMaxVisible });
  }, [effectiveToastPosition, effectiveToastDuration, effectiveToastMaxVisible, configureToasts]);

  // PREF-11/D-13: once-only seeding — invoked when authenticated, retentionConfig loaded, AND prefs resolved.
  // Including `prefs` in deps ensures the effect re-runs after prefs resolves from the server (PREF-11
  // timing fix: retentionConfig may resolve first while prefs is still undefined; without prefs in deps,
  // seedIfEmpty would bail and never retry when prefs becomes {} — losing grouping migration).
  // seedIfEmpty assembles the full D-12 localStorage snapshot; caller passes only shared toast/grouping values.
  useEffect(() => {
    if (!user || !retentionConfig || prefs === undefined) return;
    seedIfEmpty({
      toastsEnabled: retentionConfig.toastsEnabled ?? true,
      liveEventToastsEnabled: retentionConfig.liveEventToastsEnabled ?? false,
      toastPosition: retentionConfig.toastPosition ?? 'bottom-right',
      toastDuration: retentionConfig.toastDuration ?? 3,
      toastMaxVisible: retentionConfig.toastMaxVisible ?? 3,
      episodeWindowMinutes: retentionConfig.episodeWindowMinutes ?? 3,
      sceneWindowSeconds: retentionConfig.sceneWindowSeconds ?? 5,
      episodeMinEventCount: retentionConfig.episodeMinEventCount ?? 3,
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, retentionConfig, prefs]);

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
  const navigate = (page, options) => {
    if (activePage === 'timeline' && page !== 'timeline') setTimelineFilters(null);
    setSelectedAccessoryId(null);
    // Optional deep link into a Settings section, e.g. navigate('settings', { section: 'appearance' }).
    if (page === 'settings' && options?.section) setSettingsSection(options.section);
    setActivePage(page);
  };

  return (
    <>
      {/* Masthead above, scrolling content below */}
      <div className="app-layout">
        {!isFloatingNav && (
          <Masthead
            activePage={activePage}
            onNavigate={navigate}
            hasNewVersion={hasNewVersion}
            availableUpdate={availableUpdate}
          />
        )}
        <main
          ref={mainRef}
          className="flex-1 min-h-0 overflow-y-auto"
          style={isFloatingNav ? { paddingBottom: FLOATING_NAV_CLEARANCE } : undefined}
          aria-label={selectedAccessoryId ? 'Accessory detail' : (PAGE_LABELS[activePage] ?? 'Content')}
        >
          {selectedAccessoryId ? (
            <ErrorBoundary key={selectedAccessoryId}><AccessoryDetail accessoryId={selectedAccessoryId} onBack={handleAccessoryBack} /></ErrorBoundary>
          ) : (
            <ErrorBoundary key={activePage}>
              {activePage === 'dashboard' && <DashboardPage onSelectAccessory={handleSelectAccessory} onSelectRoom={handleSelectRoom} onNavigateToAccessory={handleToastNav} onViewDeviceRepair={() => setActivePage('devices')} />}
              {activePage === 'devices' && <DevicesPage onSelectAccessory={handleSelectAccessory} />}
              {activePage === 'timeline' && <TimelinePage initialFilters={timelineFilters} onSelectAccessory={handleSelectAccessory} />}
              {activePage === 'alerts' && <AlertsPage />}
              {activePage === 'settings' && (
                <SettingsPage
                  buildVersion={__BUILD_VERSION__}
                  hasNewVersion={hasNewVersion}
                  onOpenChangelog={openChangelog}
                  availableUpdate={latestRelease}
                  updateStatus={updateStatus}
                  section={settingsSection}
                  onSectionChange={setSettingsSection}
                />
              )}
            </ErrorBoundary>
          )}
        </main>
      </div>
      {isFloatingNav && (
        <FloatingNav
          activePage={activePage}
          onNavigate={navigate}
          scrollRef={mainRef}
          onSignOut={canSignOut ? signOut : undefined}
          signingOut={signingOut}
        />
      )}
      {showChangelog && <ChangelogModal onClose={closeChangelog} />}
    </>
  );
}
