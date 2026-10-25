import { useState, useEffect, useCallback, useRef } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { Bell, Check, CheckCircle2, Download, Loader2, Save, X } from 'lucide-react';
import { useQueryClient, useQuery } from '@tanstack/react-query';
import { fetchJson, API_BASE, withApiAuthHeaders } from '../../lib/api.js';
import { saveBlob } from '../../lib/download.js';
import clsx from 'clsx';
import Card from '../Card.jsx';
import { useToast } from '../Toast.jsx';
import { useAuth } from '../../hooks/useAuth.js';
import { usePreference } from '../../hooks/usePreference.js';
import { useUserPreferences } from '../../hooks/useUserPreferences.js';
import AdminAdvancedSection from './AdminAdvancedSection.jsx';

const HOURS_OPTIONS = Array.from({ length: 24 }, (_, h) => {
  const period = h < 12 ? 'AM' : 'PM';
  const display = h % 12 === 0 ? 12 : h % 12;
  return { value: h, label: `${display} ${period}` };
});

function localHourToUtc(localHour) {
  const offsetHours = -new Date().getTimezoneOffset() / 60;
  return ((localHour - offsetHours) % 24 + 24) % 24;
}

function utcHourToLocal(utcHour) {
  const offsetHours = -new Date().getTimezoneOffset() / 60;
  return ((utcHour + offsetHours) % 24 + 24) % 24;
}

// About is NOT here: it is a top-level Settings section of its own
// (components/AboutSection.jsx). It used to be an inner tab of Configuration,
// which put the version and the help links two levels down, in the section
// you go to in order to change something.
const TABS = [
  { id: 'device', label: 'Device Management' },
  { id: 'data', label: 'Data management' },
  { id: 'toast', label: 'Toast' },
];

export default function SettingsTab({ setup, showAdvanced = false }) {
  const {
    retentionConfig,
    saveRetentionMutation,
    dbAccessories,
    paired,
    repairConfig,
    saveRepairMutation,
    alertsConfig,
    saveAlertsMutation,
  } = setup;

  const { addToast, configure: configureToasts } = useToast();
  const { user } = useAuth();
  const { prefs, setPrefsBlob } = useUserPreferences();

  // PREF-10: toast + grouping per-user blob fields (authed path only).
  // Default codec (JSON) is correct for bool/number/string-enum values.
  // Unique localStorage keys (hc_pref_*) prevent cross-contamination between instances.
  const [blobToastsEnabled, setBlobToastsEnabled] = usePreference('toastsEnabled', true, { localStorageKey: 'hc_pref_toastsEnabled' });
  const [blobLiveEventToastsEnabled, setBlobLiveEventToastsEnabled] = usePreference('liveEventToastsEnabled', false, { localStorageKey: 'hc_pref_liveEventToastsEnabled' });
  const [blobToastPosition, setBlobToastPosition] = usePreference('toastPosition', 'bottom-right', { localStorageKey: 'hc_pref_toastPosition' });
  const [blobToastDuration, setBlobToastDuration] = usePreference('toastDuration', 3, { localStorageKey: 'hc_pref_toastDuration' });
  const [blobToastMaxVisible, setBlobToastMaxVisible] = usePreference('toastMaxVisible', 3, { localStorageKey: 'hc_pref_toastMaxVisible' });
  const [blobEpisodeWindowMinutes, setBlobEpisodeWindowMinutes] = usePreference('episodeWindowMinutes', 3, { localStorageKey: 'hc_pref_episodeWindowMinutes' });
  const [blobSceneWindowSeconds, setBlobSceneWindowSeconds] = usePreference('sceneWindowSeconds', 5, { localStorageKey: 'hc_pref_sceneWindowSeconds' });
  const [blobEpisodeMinEventCount, setBlobEpisodeMinEventCount] = usePreference('episodeMinEventCount', 3, { localStorageKey: 'hc_pref_episodeMinEventCount' });

  // QH-06/QH-07/QH-08: per-user quiet-hours blob fields.
  // Value read path — hooks reconcile from blob when present (D-18 type guard in usePreference).
  // Write path — change handlers call setPrefsBlob with ALL FOUR keys to keep presence predicate
  // coherent (QH-08). Do NOT add these to D12_KEYS (D-25-03: no force-seed).
  const [blobQhEnabled] = usePreference('quietHoursEnabled', false, { localStorageKey: 'hc_pref_quietHoursEnabled' });
  const [blobQhStart] = usePreference('quietHoursStart', 23, { localStorageKey: 'hc_pref_quietHoursStart' });
  const [blobQhEnd] = usePreference('quietHoursEnd', 6, { localStorageKey: 'hc_pref_quietHoursEnd' });
  const [blobQhExcluded] = usePreference('quietHoursExcludedAccessories', [], {
    localStorageKey: 'hc_pref_quietHoursExcludedAccessories',
    serialize: JSON.stringify,
    deserialize: JSON.parse,
  });

  // Presence check (D-25-03): branch on whether the blob already has the QH key, NOT on user
  // truthiness. An authed Phase-24 user with a non-empty blob but no quietHoursEnabled key must
  // prefill from retentionConfig rather than the hook defaults (QH-07 — no write-on-mount).
  const blobHasQh = !!user && prefs != null && 'quietHoursEnabled' in prefs;

  const queryClient = useQueryClient();
  const archiveCountQuery = useQuery({
    queryKey: ['archive', 'count'],
    queryFn: () => fetchJson(`${API_BASE}/archive/count`),
    staleTime: 60_000,
  });
  const archiveCount = archiveCountQuery.data?.count ?? 0;
  const [archiveDownloading, setArchiveDownloading] = useState(false);

  async function handleDownloadArchive() {
    setArchiveDownloading(true);
    try {
      const res = await fetch(`${API_BASE}/archive/export`, { credentials: 'include', headers: withApiAuthHeaders() });
      if (!res.ok) throw new Error('Download failed');
      saveBlob(await res.blob(), 'homechronicle-archive.csv');
    } catch {
      // silently fail — user can retry
    } finally {
      setArchiveDownloading(false);
    }
  }

  const [retentionDaysInput, setRetentionDaysInput] = useState('');
  const [staleThresholdHoursInput, setStaleThresholdHoursInput] = useState('');
  const [archiveBeforeDeleteInput, setArchiveBeforeDeleteInput] = useState(true);
  const [autoScanHomeKitInput, setAutoScanHomeKitInput] = useState(true);
  const [quietHoursEnabledInput, setQuietHoursEnabledInput] = useState(false);
  const [quietHoursStartInput, setQuietHoursStartInput] = useState(22);
  const [quietHoursEndInput, setQuietHoursEndInput] = useState(6);
  const [episodeWindowInput, setEpisodeWindowInput] = useState('');
  const [sceneWindowInput, setSceneWindowInput] = useState('');
  const [episodeMinEventInput, setEpisodeMinEventInput] = useState('');
  const [tab, setTab] = useState('device');
  const [saveFeedback, setSaveFeedback] = useState(null);
  const [toastsEnabledInput, setToastsEnabledInput] = useState(true);
  const [liveEventToastsEnabledInput, setLiveEventToastsEnabledInput] = useState(false);
  const [toastPositionInput, setToastPositionInput] = useState('bottom-right');
  const [toastDurationInput, setToastDurationInput] = useState(3);
  const [toastMaxVisibleInput, setToastMaxVisibleInput] = useState(3);
  const [repairEnabledInput, setRepairEnabledInput] = useState(false);
  const [repairHourInput, setRepairHourInput] = useState(3);
  const [alertsDefaultQuietInput, setAlertsDefaultQuietInput] = useState(0);
  const [alertsWebhookTimeoutInput, setAlertsWebhookTimeoutInput] = useState(5000);

  // ── Auto-save helper (debounced, serialized) ───────────────────────────
  const autoSaveTimer = useRef(null);
  const autoSaveInFlight = useRef(false);
  const autoSaveQueued = useRef(null);

  const flushAutoSave = useCallback(async (payload, kind) => {
    if (autoSaveInFlight.current) {
      autoSaveQueued.current = { payload, kind };
      return;
    }
    autoSaveInFlight.current = true;
    try {
      const result = await saveRetentionMutation.mutateAsync(payload);
      // Apply toast config immediately so the confirmation toast respects new settings
      if (payload.toastsEnabled !== undefined || payload.toastPosition || payload.toastDuration || payload.toastMaxVisible) {
        configureToasts({
          position: result.toastPosition,
          duration: result.toastDuration,
          maxVisible: result.toastMaxVisible,
        });
      }
      // Show toast (respects whether toasts are now enabled)
      const toastsOn = payload.toastsEnabled ?? retentionConfig?.toastsEnabled ?? true;
      if (toastsOn) addToast('Setting saved', 'success');
    } catch {
      addToast('Failed to save setting', 'error');
      // Revert: invalidate query cache to re-fetch server state
      queryClient.invalidateQueries({ queryKey: ['setup', 'retention'] });
    } finally {
      autoSaveInFlight.current = false;
      if (autoSaveQueued.current) {
        const next = autoSaveQueued.current;
        autoSaveQueued.current = null;
        flushAutoSave(next.payload, next.kind);
      }
    }
  }, [saveRetentionMutation, configureToasts, addToast, retentionConfig?.toastsEnabled, queryClient]);

  const autoSave = useCallback((payload, kind = 'retention') => {
    clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(() => flushAutoSave(payload, kind), 300);
  }, [flushAutoSave]);

  useEffect(() => () => clearTimeout(autoSaveTimer.current), []);

  const retentionDaysCurrent = retentionConfig?.retentionDays ?? null;
  const staleThresholdHoursCurrent = retentionConfig?.staleThresholdHours ?? null;
  const archiveBeforeDeleteCurrent = Boolean(retentionConfig?.archiveBeforeDelete ?? true);
  const autoScanHomeKit = Boolean(retentionConfig?.autoScanHomeKit ?? true);
  const quietHoursEnabledCurrent = Boolean(retentionConfig?.quietHoursEnabled ?? false);
  const quietHoursStartCurrent = retentionConfig?.quietHoursStart != null ? utcHourToLocal(retentionConfig.quietHoursStart) : 22;
  const quietHoursEndCurrent = retentionConfig?.quietHoursEnd != null ? utcHourToLocal(retentionConfig.quietHoursEnd) : 6;
  const episodeWindowCurrent = retentionConfig?.episodeWindowMinutes ?? 3;
  const sceneWindowCurrent = retentionConfig?.sceneWindowSeconds ?? 5;
  const episodeMinEventCurrent = retentionConfig?.episodeMinEventCount ?? 3;
  const repairEnabledCurrent = Boolean(repairConfig?.enabled ?? false);

  // Effective values: authed reads from user blob (via usePreference), anon reads from retentionConfig.
  const effectiveToastsEnabled = user ? blobToastsEnabled : toastsEnabledInput;
  const effectiveLiveEventToastsEnabled = user ? blobLiveEventToastsEnabled : liveEventToastsEnabledInput;
  const effectiveToastPosition = user ? blobToastPosition : toastPositionInput;
  const effectiveToastDuration = user ? blobToastDuration : toastDurationInput;
  const effectiveToastMaxVisible = user ? blobToastMaxVisible : toastMaxVisibleInput;

  // Preview the current toast settings. Push them into the provider first:
  // the anon path only reconfigures after the debounced save round-trips.
  const showTestToast = () => {
    configureToasts({
      position: effectiveToastPosition,
      duration: effectiveToastDuration,
      maxVisible: effectiveToastMaxVisible,
    });
    addToast('Test notification \u2014 toasts will appear here', 'info', { duration: effectiveToastDuration * 1000 });
  };
  const effectiveEpisodeWindowMinutes = user ? blobEpisodeWindowMinutes : episodeWindowCurrent;
  const effectiveSceneWindowSeconds = user ? blobSceneWindowSeconds : sceneWindowCurrent;
  const effectiveEpisodeMinEventCount = user ? blobEpisodeMinEventCount : episodeMinEventCurrent;
  const repairHourCurrent = repairConfig?.hour != null ? utcHourToLocal(repairConfig.hour) : 3;

  // QH effective values: branch on blobHasQh (presence check), NOT on `user` truthiness (D-25-03).
  // When blobHasQh is false (anon OR authed Phase-24 user whose blob lacks quietHoursEnabled),
  // fall back to retentionConfig values so the controls prefill correctly without seeding (QH-07).
  const effectiveQhEnabled = blobHasQh ? blobQhEnabled : (retentionConfig?.quietHoursEnabled ?? false);
  const effectiveQhStart = blobHasQh ? utcHourToLocal(blobQhStart) : quietHoursStartCurrent;
  const effectiveQhEnd = blobHasQh ? utcHourToLocal(blobQhEnd) : quietHoursEndCurrent;
  const effectiveQhExcluded = blobHasQh ? blobQhExcluded : (retentionConfig?.quietHoursExcludedAccessories ?? []);

  useEffect(() => {
    if (retentionDaysCurrent === null) return;
    setRetentionDaysInput((prev) => (prev.trim() ? prev : String(retentionDaysCurrent)));
  }, [retentionDaysCurrent]);

  useEffect(() => {
    if (staleThresholdHoursCurrent === null) return;
    setStaleThresholdHoursInput((prev) => (prev.trim() ? prev : String(staleThresholdHoursCurrent)));
  }, [staleThresholdHoursCurrent]);

  useEffect(() => {
    setArchiveBeforeDeleteInput(archiveBeforeDeleteCurrent);
  }, [archiveBeforeDeleteCurrent]);

  useEffect(() => {
    setAutoScanHomeKitInput(autoScanHomeKit);
  }, [autoScanHomeKit]);

  useEffect(() => {
    setQuietHoursEnabledInput(effectiveQhEnabled);
    setQuietHoursStartInput(effectiveQhStart);
    setQuietHoursEndInput(effectiveQhEnd);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveQhEnabled, effectiveQhStart, effectiveQhEnd]);

  useEffect(() => {
    const src = user ? blobEpisodeWindowMinutes : episodeWindowCurrent;
    setEpisodeWindowInput((prev) => (prev.trim() ? prev : String(src)));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [episodeWindowCurrent, blobEpisodeWindowMinutes]);

  useEffect(() => {
    const src = user ? blobSceneWindowSeconds : sceneWindowCurrent;
    setSceneWindowInput((prev) => (prev.trim() ? prev : String(src)));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sceneWindowCurrent, blobSceneWindowSeconds]);

  useEffect(() => {
    const src = user ? blobEpisodeMinEventCount : episodeMinEventCurrent;
    setEpisodeMinEventInput((prev) => (prev.trim() ? prev : String(src)));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [episodeMinEventCurrent, blobEpisodeMinEventCount]);

  useEffect(() => {
    if (retentionConfig) {
      setToastsEnabledInput(retentionConfig.toastsEnabled ?? true);
      setLiveEventToastsEnabledInput(retentionConfig.liveEventToastsEnabled ?? false);
    }
  }, [retentionConfig?.toastsEnabled, retentionConfig?.liveEventToastsEnabled]);

  useEffect(() => {
    if (retentionConfig) {
      setToastPositionInput(retentionConfig.toastPosition ?? 'bottom-right');
      setToastDurationInput(retentionConfig.toastDuration ?? 3);
      setToastMaxVisibleInput(retentionConfig.toastMaxVisible ?? 3);
    }
  }, [retentionConfig?.toastPosition, retentionConfig?.toastDuration, retentionConfig?.toastMaxVisible]);

  useEffect(() => {
    setRepairEnabledInput(repairEnabledCurrent);
    setRepairHourInput(repairHourCurrent);
  }, [repairEnabledCurrent, repairHourCurrent]);

  useEffect(() => {
    setAlertsDefaultQuietInput(alertsConfig?.defaultQuietMinutes ?? 0);
    setAlertsWebhookTimeoutInput(alertsConfig?.webhookTimeoutMs ?? 5000);
  }, [alertsConfig?.defaultQuietMinutes, alertsConfig?.webhookTimeoutMs]);

  const parsedRetentionDays = Number.parseInt(retentionDaysInput, 10);
  const parsedStaleThresholdHours = Number.parseInt(staleThresholdHoursInput, 10);
  const parsedEpisodeWindow = Number.parseInt(episodeWindowInput, 10);
  const parsedSceneWindow = Number.parseInt(sceneWindowInput, 10);
  const parsedEpisodeMinEvent = Number.parseInt(episodeMinEventInput, 10);
  const retentionDaysValid = Number.isFinite(parsedRetentionDays) && parsedRetentionDays >= 1 && parsedRetentionDays <= 3650;
  const staleThresholdValid = Number.isFinite(parsedStaleThresholdHours) && parsedStaleThresholdHours >= 1 && parsedStaleThresholdHours <= 720;
  const episodeWindowValid = Number.isFinite(parsedEpisodeWindow) && parsedEpisodeWindow >= 1 && parsedEpisodeWindow <= 30;
  const sceneWindowValid = Number.isFinite(parsedSceneWindow) && parsedSceneWindow >= 1 && parsedSceneWindow <= 30;
  const episodeMinEventValid = Number.isFinite(parsedEpisodeMinEvent) && parsedEpisodeMinEvent >= 1 && parsedEpisodeMinEvent <= 20;
  const inputsReady = retentionDaysInput.trim() && staleThresholdHoursInput.trim() && episodeWindowInput.trim() && sceneWindowInput.trim() && episodeMinEventInput.trim();
  const savePending = saveRetentionMutation.isPending;
  const isDirty = retentionDaysValid
    && staleThresholdValid
    && episodeWindowValid
    && sceneWindowValid
    && episodeMinEventValid
    && (
      parsedRetentionDays !== retentionDaysCurrent
      || parsedStaleThresholdHours !== staleThresholdHoursCurrent
      || parsedEpisodeWindow !== effectiveEpisodeWindowMinutes
      || parsedSceneWindow !== effectiveSceneWindowSeconds
      || parsedEpisodeMinEvent !== effectiveEpisodeMinEventCount
    );

  async function handleSaveSettings() {
    if (!isDirty || !retentionDaysValid || !staleThresholdValid) return;
    setSaveFeedback(null);
    try {
      if (user) {
        // Authed: grouping fields go to per-user blob; shared admin fields go to saveRetentionMutation.
        setBlobEpisodeWindowMinutes(parsedEpisodeWindow);
        setBlobSceneWindowSeconds(parsedSceneWindow);
        setBlobEpisodeMinEventCount(parsedEpisodeMinEvent);
        const nextRetention = await saveRetentionMutation.mutateAsync({
          retentionDays: parsedRetentionDays,
          staleThresholdHours: parsedStaleThresholdHours,
        });
        setRetentionDaysInput(String(nextRetention.retentionDays));
        setStaleThresholdHoursInput(String(nextRetention.staleThresholdHours));
      } else {
        // Anon: all fields via saveRetentionMutation (unchanged path).
        const nextRetention = await saveRetentionMutation.mutateAsync({
          retentionDays: parsedRetentionDays,
          staleThresholdHours: parsedStaleThresholdHours,
          episodeWindowMinutes: parsedEpisodeWindow,
          sceneWindowSeconds: parsedSceneWindow,
          episodeMinEventCount: parsedEpisodeMinEvent,
        });
        setRetentionDaysInput(String(nextRetention.retentionDays));
        setStaleThresholdHoursInput(String(nextRetention.staleThresholdHours));
        if (nextRetention.episodeWindowMinutes != null) setEpisodeWindowInput(String(nextRetention.episodeWindowMinutes));
        if (nextRetention.sceneWindowSeconds != null) setSceneWindowInput(String(nextRetention.sceneWindowSeconds));
        if (nextRetention.episodeMinEventCount != null) setEpisodeMinEventInput(String(nextRetention.episodeMinEventCount));
      }
      setSaveFeedback('saved');
      if (effectiveToastsEnabled !== false) {
        addToast('Settings saved', 'success');
      }
    } catch {
      setSaveFeedback('error');
    }
  }

  const visibleTabs = showAdvanced ? [...TABS, { id: 'advanced', label: 'Advanced' }] : TABS;
  const activeTab = (tab === 'advanced' && !showAdvanced) ? 'device' : tab;

  return (
    <div className="space-y-4">

      {/* Tab bar */}
      <div role="tablist" className="flex items-center gap-4 border-b border-hc-panel-border">
        {visibleTabs.map(({ id, label }) => (
          <button
            key={id}
            role="tab"
            aria-selected={activeTab === id}
            tabIndex={0}
            onClick={() => setTab(id)}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setTab(id); } }}
            className={clsx(
              'px-4 py-2 text-sm -mb-px border-b-2 transition-colors',
              activeTab === id
                ? 'border-hc-accent-strong text-hc-fg-strong font-semibold'
                : 'border-transparent text-hc-muted hover:text-hc-fg',
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {/* — Device Management — */}
      {activeTab === 'device' && (
      <Card>
        <Card.Header title="Device Management" />
        <Card.Body>
        <div className="space-y-4">

      {/* HomeKit auto-scan */}
      <div className="bg-hc-panel border border-hc-panel-border rounded-lg px-4 py-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <p className="text-sm font-medium text-hc-fg">HomeKit auto-scan</p>
            <p className="text-xs text-hc-muted mt-0.5">
              Automatically scan for HomeKit accessories every hour in the background.
            </p>
          </div>
          <label className="inline-flex items-center gap-2 text-sm text-hc-fg">
            <input
              type="checkbox"
              checked={autoScanHomeKitInput}
              onChange={(e) => { const v = e.target.checked; setAutoScanHomeKitInput(v); autoSave({ autoScanHomeKit: v }); }}
            />
            <span>{autoScanHomeKitInput ? 'On' : 'Off'}</span>
          </label>
        </div>
        <p className="text-[11px] text-hc-muted mt-2">
          Manual scans from Add Accessories still work when this is off.
        </p>
      </div>

      {/* Scheduled Repair */}
      <div className="bg-hc-panel border border-hc-panel-border rounded-lg px-4 py-3">
        <p className="text-xs text-hc-muted mb-3">
          Automatically re-pairs HomeKit devices that lose their connection overnight.
          Enable this if you notice devices going offline and not reconnecting on their own.
        </p>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <p className="text-sm font-medium text-hc-fg">Scheduled Repair</p>
          <label className="inline-flex items-center gap-2 text-sm text-hc-fg">
            <input
              type="checkbox"
              checked={repairEnabledInput}
              onChange={(e) => {
                const v = e.target.checked;
                setRepairEnabledInput(v);
                saveRepairMutation.mutate({ enabled: v });
              }}
            />
            <span>{repairEnabledInput ? 'On' : 'Off'}</span>
          </label>
        </div>
        {repairEnabledInput && (
          <>
            <div className="flex items-center gap-3 mt-3 flex-wrap">
              <div className="flex items-center gap-2">
                <span className="text-xs text-hc-muted">Repair Hour</span>
                <select
                  value={repairHourInput}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    setRepairHourInput(v);
                    saveRepairMutation.mutate({ hour: localHourToUtc(v) });
                  }}
                  className="text-sm border border-hc-border-strong rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-hc-focus-ring bg-hc-panel text-hc-fg-strong"
                >
                  {HOURS_OPTIONS.map(({ value, label }) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="mt-3 text-xs text-hc-muted">
              {repairConfig?.lastRunAt ? (
                <span>Last run: {formatDistanceToNow(new Date(repairConfig.lastRunAt), { addSuffix: true })}</span>
              ) : (
                <span>No runs yet</span>
              )}
              {repairConfig?.lastRunResult && (
                <span className="ml-2">
                  &middot; {repairConfig.lastRunResult.repaired} repaired, {repairConfig.lastRunResult.failed} failed
                </span>
              )}
            </div>
          </>
        )}
      </div>

        </div>
        </Card.Body>
      </Card>
      )}

      {/* — Data Management — */}
      {activeTab === 'data' && (
      <div className="space-y-4">
      <Card>
        <Card.Header title="Data Management" />
        <Card.Body>

      {/* Retention cutoff */}
      <div className="bg-hc-panel border border-hc-panel-border rounded-lg px-4 py-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <p className="text-sm font-medium text-hc-fg">Retention cutoff</p>
            <p className="text-xs text-hc-muted mt-0.5">
              Keep timeline data in the main table for this many days.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min="1"
              max="3650"
              step="1"
              value={retentionDaysInput}
              onChange={(e) => { setRetentionDaysInput(e.target.value); setSaveFeedback(null); }}
              className="w-24 text-sm border border-hc-border-strong rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-hc-focus-ring bg-hc-panel text-hc-fg-strong"
            />
            <span className="text-xs text-hc-muted">days</span>
          </div>
        </div>
        <p className="text-[11px] text-hc-muted mt-2">
          Changes apply without restart. Sweep interval is every 24 hours by default.
        </p>
      </div>

      {/* Archive before delete */}
      <div className="bg-hc-panel border border-hc-panel-border rounded-lg px-4 py-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <p className="text-sm font-medium text-hc-fg">Archive before delete</p>
            <p className="text-xs text-hc-muted mt-0.5">
              Copy expired events to the archive table before removing them from the main table.
            </p>
          </div>
          <label className="inline-flex items-center gap-2 text-sm text-hc-fg">
            <input
              type="checkbox"
              checked={archiveBeforeDeleteInput}
              onChange={(e) => { const v = e.target.checked; setArchiveBeforeDeleteInput(v); autoSave({ archiveBeforeDelete: v }); }}
            />
            <span>{archiveBeforeDeleteInput ? 'On' : 'Off'}</span>
          </label>
        </div>
        <div className="flex items-center justify-between mt-2">
          <p className="text-[11px] text-hc-muted">
            When off, expired events are permanently deleted during retention sweep.
          </p>
          {archiveCount > 0 && (
            <button
              onClick={handleDownloadArchive}
              disabled={archiveDownloading}
              className="inline-flex items-center gap-1.5 text-xs text-hc-accent-strong hover:text-hc-accent-stronger disabled:opacity-50 transition-colors flex-shrink-0 ml-3"
            >
              <Download size={12} />
              {archiveDownloading ? 'Downloading\u2026' : `Download archive (${archiveCount.toLocaleString()} events)`}
            </button>
          )}
        </div>
      </div>

      {/* Stale accessory threshold */}
      <div className="bg-hc-panel border border-hc-panel-border rounded-lg px-4 py-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <p className="text-sm font-medium text-hc-fg">Stale accessory threshold</p>
            <p className="text-xs text-hc-muted mt-0.5">
              An accessory is marked stale after this many hours with no events.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min="1"
              max="720"
              step="1"
              value={staleThresholdHoursInput}
              onChange={(e) => { setStaleThresholdHoursInput(e.target.value); setSaveFeedback(null); }}
              className="w-24 text-sm border border-hc-border-strong rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-hc-focus-ring bg-hc-panel text-hc-fg-strong"
            />
            <span className="text-xs text-hc-muted">hours</span>
          </div>
        </div>
      </div>

      {saveRetentionMutation.isError && (
        <p className="text-xs text-hc-danger-text">
          Could not save settings: {saveRetentionMutation.error?.message}
        </p>
      )}

        </Card.Body>
      </Card>

      {/* — Alerts & Quiet Hours — */}
      <Card>
        <Card.Header title="Alerts &amp; Quiet Hours" />
        <Card.Body>

      {/* Webhook Alerts */}
      <div className="bg-hc-panel border border-hc-panel-border rounded-lg px-4 py-3">
        <p className="text-xs text-hc-muted mb-3">
          Send webhook notifications when device events match your alert rules. Configure rules in the Alerts tab.
        </p>
        <div className="mt-3 space-y-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <p className="text-sm text-hc-fg">Default quiet period</p>
              <p className="text-xs text-hc-muted mt-0.5">Applied to new rules. 0 = no quiet period.</p>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min="0"
                max="10080"
                step="1"
                value={alertsDefaultQuietInput}
                onChange={(e) => setAlertsDefaultQuietInput(Number(e.target.value))}
                onBlur={() => {
                  const v = Number.parseInt(String(alertsDefaultQuietInput), 10);
                  if (Number.isFinite(v) && v >= 0 && v <= 10080) {
                    saveAlertsMutation.mutate({ defaultQuietMinutes: v });
                  }
                }}
                className="w-24 text-sm border border-hc-border-strong rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-hc-focus-ring bg-hc-panel text-hc-fg-strong"
              />
              <span className="text-xs text-hc-muted">min</span>
            </div>
          </div>
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <p className="text-sm text-hc-fg">Webhook timeout</p>
              <p className="text-xs text-hc-muted mt-0.5">
                {alertsConfig?.webhookTimeoutFromEnv
                  ? 'Set by ALERTS_WEBHOOK_TIMEOUT_MS in .env.'
                  : 'Max wait time for webhook delivery.'}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min="1000"
                max="30000"
                step="500"
                aria-label="Webhook timeout"
                disabled={Boolean(alertsConfig?.webhookTimeoutFromEnv)}
                value={alertsWebhookTimeoutInput}
                onChange={(e) => setAlertsWebhookTimeoutInput(Number(e.target.value))}
                onBlur={() => {
                  const v = Number.parseInt(String(alertsWebhookTimeoutInput), 10);
                  if (!alertsConfig?.webhookTimeoutFromEnv && Number.isFinite(v) && v >= 1000 && v <= 30000) {
                    saveAlertsMutation.mutate({ webhookTimeoutMs: v });
                  }
                }}
                className="w-24 text-sm border border-hc-border-strong rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-hc-focus-ring bg-hc-panel text-hc-fg-strong disabled:opacity-60"
              />
              <span className="text-xs text-hc-muted">ms</span>
            </div>
          </div>
        </div>
      </div>

      {/* Quiet hours */}
      <div className="bg-hc-panel border border-hc-panel-border rounded-lg px-4 py-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <p className="text-sm font-medium text-hc-fg">Quiet hours</p>
            <p className="text-xs text-hc-muted mt-0.5">
              Flag accessory activity during this window as unexpected on the dashboard.
            </p>
          </div>
          <label className="inline-flex items-center gap-2 text-sm text-hc-fg">
            <input
              type="checkbox"
              checked={quietHoursEnabledInput}
              onChange={(e) => {
                const v = e.target.checked;
                setQuietHoursEnabledInput(v);
                if (user) {
                  // Authed: grouped four-key write to blob (QH-08 — keeps presence predicate coherent).
                  setPrefsBlob({
                    quietHoursEnabled: v,
                    quietHoursStart: localHourToUtc(quietHoursStartInput),
                    quietHoursEnd: localHourToUtc(quietHoursEndInput),
                    quietHoursExcludedAccessories: effectiveQhExcluded,
                  });
                } else {
                  autoSave({ quietHoursEnabled: v });
                }
              }}
            />
            <span>{quietHoursEnabledInput ? 'On' : 'Off'}</span>
          </label>
        </div>
        <div className="flex items-center gap-3 mt-3 flex-wrap">
          <div className="flex items-center gap-2">
            <span className="text-xs text-hc-muted">From</span>
            <select
              value={quietHoursStartInput}
              onChange={(e) => {
                const v = Number(e.target.value);
                setQuietHoursStartInput(v);
                if (user) {
                  setPrefsBlob({
                    quietHoursEnabled: quietHoursEnabledInput,
                    quietHoursStart: localHourToUtc(v),
                    quietHoursEnd: localHourToUtc(quietHoursEndInput),
                    quietHoursExcludedAccessories: effectiveQhExcluded,
                  });
                } else {
                  autoSave({ quietHoursStart: localHourToUtc(v) });
                }
              }}
              disabled={!quietHoursEnabledInput}
              className="text-sm border border-hc-border-strong rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-hc-focus-ring bg-hc-panel text-hc-fg-strong disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {HOURS_OPTIONS.map(({ value, label }) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-hc-muted">to</span>
            <select
              value={quietHoursEndInput}
              onChange={(e) => {
                const v = Number(e.target.value);
                setQuietHoursEndInput(v);
                if (user) {
                  setPrefsBlob({
                    quietHoursEnabled: quietHoursEnabledInput,
                    quietHoursStart: localHourToUtc(quietHoursStartInput),
                    quietHoursEnd: localHourToUtc(v),
                    quietHoursExcludedAccessories: effectiveQhExcluded,
                  });
                } else {
                  autoSave({ quietHoursEnd: localHourToUtc(v) });
                }
              }}
              disabled={!quietHoursEnabledInput}
              className="text-sm border border-hc-border-strong rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-hc-focus-ring bg-hc-panel text-hc-fg-strong disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {HOURS_OPTIONS.map(({ value, label }) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </div>
        </div>
        {/* Excluded accessories — rendered from effectiveQhExcluded (blob or retentionConfig) */}
        {effectiveQhExcluded.length > 0 && (
          <div className="mt-3 pt-3 border-t border-hc-panel-border">
            <p className="text-xs text-hc-muted mb-2">Excluded from quiet hours:</p>
            <div className="flex flex-wrap gap-1.5">
              {effectiveQhExcluded.map((id) => {
                const matchedAcc = paired.find((a) => a.id === id) ?? dbAccessories.find((a) => a.accessory_id === id);
                const label = matchedAcc?.name ?? matchedAcc?.accessory_name ?? id;
                return (
                <span key={id} className="inline-flex items-center gap-1 text-xs bg-hc-panel-mid text-hc-muted-light rounded-full px-2.5 py-1">
                  <span className="truncate max-w-[180px]">{label}</span>
                  <button
                    onClick={async () => {
                      const next = effectiveQhExcluded.filter((a) => a !== id);
                      if (user) {
                        setPrefsBlob({
                          quietHoursEnabled: quietHoursEnabledInput,
                          quietHoursStart: localHourToUtc(quietHoursStartInput),
                          quietHoursEnd: localHourToUtc(quietHoursEndInput),
                          quietHoursExcludedAccessories: next,
                        });
                        queryClient.invalidateQueries({ queryKey: ['stats', 'quiet-hours'] });
                      } else {
                        try {
                          const result = await saveRetentionMutation.mutateAsync({ quietHoursExcludedAccessories: next });
                          queryClient.setQueryData(['setup', 'retention'], result);
                          queryClient.invalidateQueries({ queryKey: ['stats', 'quiet-hours'] });
                        } catch { /* handled by mutation */ }
                      }
                    }}
                    disabled={savePending}
                    className="p-0.5 rounded-full hover:bg-hc-panel-mid transition-colors"
                    title={`Restore ${id} to quiet hours`}
                  >
                    <X size={10} />
                  </button>
                </span>
                );
              })}
            </div>
          </div>
        )}
      </div>

        </Card.Body>
      </Card>

      {/* — Timeline — */}
      <Card>
        <Card.Header title="Timeline" />
        <Card.Body>

      {/* Episode capture interval */}
      <div className="bg-hc-panel border border-hc-panel-border rounded-lg px-4 py-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <p className="text-sm font-medium text-hc-fg">Episode capture interval</p>
            <p className="text-xs text-hc-muted mt-0.5">
              Events within this window are grouped into timeline episodes.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min="1"
              max="30"
              step="1"
              value={episodeWindowInput}
              onChange={(e) => { setEpisodeWindowInput(e.target.value); setSaveFeedback(null); }}
              className="w-24 text-sm border border-hc-border-strong rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-hc-focus-ring bg-hc-panel text-hc-fg-strong"
            />
            <span className="text-xs text-hc-muted">min</span>
          </div>
        </div>
      </div>

      {/* Scene grouping window */}
      <div className="bg-hc-panel border border-hc-panel-border rounded-lg px-4 py-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <p className="text-sm font-medium text-hc-fg">Scene grouping window</p>
            <p className="text-xs text-hc-muted mt-0.5">
              Events within this many seconds are clustered into a single scene.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min="1"
              max="30"
              step="1"
              value={sceneWindowInput}
              onChange={(e) => { setSceneWindowInput(e.target.value); setSaveFeedback(null); }}
              className="w-24 text-sm border border-hc-border-strong rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-hc-focus-ring bg-hc-panel text-hc-fg-strong"
            />
            <span className="text-xs text-hc-muted">sec</span>
          </div>
        </div>
      </div>

      {/* Episode minimum events */}
      <div className="bg-hc-panel border border-hc-panel-border rounded-lg px-4 py-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <p className="text-sm font-medium text-hc-fg">Episode minimum events</p>
            <p className="text-xs text-hc-muted mt-0.5">
              A scene cluster needs at least this many events to be promoted to an episode.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min="1"
              max="20"
              step="1"
              value={episodeMinEventInput}
              onChange={(e) => { setEpisodeMinEventInput(e.target.value); setSaveFeedback(null); }}
              className="w-24 text-sm border border-hc-border-strong rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-hc-focus-ring bg-hc-panel text-hc-fg-strong"
            />
            <span className="text-xs text-hc-muted">events</span>
          </div>
        </div>
      </div>

        </Card.Body>
      </Card>
      </div>
      )}

      {/* — Toast Notifications — */}
      {activeTab === 'toast' && (
      <Card>
        <Card.Header title="Toast Notifications" />
        <Card.Body>
      {/* Toast notifications */}
      <div className="bg-hc-panel border border-hc-panel-border rounded-lg px-4 py-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <p className="text-sm font-medium text-hc-fg">Toast notifications</p>
            <p className="text-xs text-hc-muted mt-0.5">
              Show brief popup messages for saves, deletes, and other actions.
            </p>
          </div>
          <label className="inline-flex items-center gap-2 text-sm text-hc-fg">
            <input
              type="checkbox"
              checked={effectiveToastsEnabled}
              onChange={(e) => {
                const v = e.target.checked;
                if (user) { setBlobToastsEnabled(v); } else { setToastsEnabledInput(v); autoSave({ toastsEnabled: v }); }
              }}
            />
            <span>{effectiveToastsEnabled ? 'On' : 'Off'}</span>
          </label>
        </div>
      </div>

      {/* Live event toasts */}
      <div className={clsx('bg-hc-panel border border-hc-panel-border rounded-lg px-4 py-3', !effectiveToastsEnabled && 'opacity-50 pointer-events-none')}>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <p className="text-sm font-medium text-hc-fg">Live event toasts</p>
            <p className="text-xs text-hc-muted mt-0.5">
              Show a popup when selected accessories report events. Only appears when you're not on the Timeline tab.
            </p>
          </div>
          <label className="inline-flex items-center gap-2 text-sm text-hc-fg">
            <input
              type="checkbox"
              checked={effectiveLiveEventToastsEnabled}
              onChange={(e) => {
                const v = e.target.checked;
                if (user) { setBlobLiveEventToastsEnabled(v); } else { setLiveEventToastsEnabledInput(v); autoSave({ liveEventToastsEnabled: v }); }
              }}
              disabled={!effectiveToastsEnabled}
            />
            <span>{effectiveLiveEventToastsEnabled ? 'On' : 'Off'}</span>
          </label>
        </div>
        {effectiveLiveEventToastsEnabled && !(retentionConfig?.toastAccessories?.length > 0) && (
          <p className="text-xs text-hc-warning-text mt-2">
            Select accessories to watch on the Manage Accessories tab.
          </p>
        )}
      </div>

      {/* Toast position */}
      <div className={clsx('bg-hc-panel border border-hc-panel-border rounded-lg px-4 py-3', !effectiveToastsEnabled && 'opacity-50 pointer-events-none')}>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <p className="text-sm font-medium text-hc-fg">Toast position</p>
            <p className="text-xs text-hc-muted mt-0.5">
              Where on screen to show toast popups.
            </p>
          </div>
          <select
            value={effectiveToastPosition}
            onChange={(e) => {
              const v = e.target.value;
              if (user) { setBlobToastPosition(v); } else { setToastPositionInput(v); autoSave({ toastPosition: v }); }
            }}
            className="text-sm rounded border border-hc-border-strong bg-hc-panel text-hc-fg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-hc-focus-ring"
          >
            <option value="bottom-right">Bottom Right</option>
            <option value="bottom-left">Bottom Left</option>
            <option value="bottom-center">Bottom Center</option>
            <option value="top-right">Top Right</option>
            <option value="top-left">Top Left</option>
            <option value="top-center">Top Center</option>
          </select>
        </div>
        <div className="flex justify-end mt-2">
          <button
            type="button"
            onClick={showTestToast}
            disabled={!effectiveToastsEnabled}
            className="inline-flex items-center gap-1.5 text-xs text-hc-accent-strong hover:text-hc-accent-stronger disabled:opacity-50 transition-colors"
          >
            <Bell size={12} />
            Show test toast
          </button>
        </div>
      </div>

      {/* Toast duration */}
      <div className={clsx('bg-hc-panel border border-hc-panel-border rounded-lg px-4 py-3', !effectiveToastsEnabled && 'opacity-50 pointer-events-none')}>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <p className="text-sm font-medium text-hc-fg">Toast duration</p>
            <p className="text-xs text-hc-muted mt-0.5">
              How long each toast stays visible before auto-dismissing.
            </p>
          </div>
          <select
            value={effectiveToastDuration}
            onChange={(e) => {
              const v = Number(e.target.value);
              if (user) { setBlobToastDuration(v); } else { setToastDurationInput(v); autoSave({ toastDuration: v }); }
            }}
            className="text-sm rounded border border-hc-border-strong bg-hc-panel text-hc-fg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-hc-focus-ring"
          >
            <option value={2}>2 seconds</option>
            <option value={3}>3 seconds</option>
            <option value={5}>5 seconds</option>
            <option value={7}>7 seconds</option>
          </select>
        </div>
      </div>

      {/* Toast max visible */}
      <div className={clsx('bg-hc-panel border border-hc-panel-border rounded-lg px-4 py-3', !effectiveToastsEnabled && 'opacity-50 pointer-events-none')}>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <p className="text-sm font-medium text-hc-fg">Max visible toasts</p>
            <p className="text-xs text-hc-muted mt-0.5">
              Maximum number of toasts that can stack on screen at once.
            </p>
          </div>
          <select
            value={effectiveToastMaxVisible}
            onChange={(e) => {
              const v = Number(e.target.value);
              if (user) { setBlobToastMaxVisible(v); } else { setToastMaxVisibleInput(v); autoSave({ toastMaxVisible: v }); }
            }}
            className="text-sm rounded border border-hc-border-strong bg-hc-panel text-hc-fg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-hc-focus-ring"
          >
            <option value={1}>1</option>
            <option value={2}>2</option>
            <option value={3}>3</option>
            <option value={5}>5</option>
          </select>
        </div>
      </div>

        </Card.Body>
      </Card>
      )}

      {/* — Advanced — */}
      {activeTab === 'advanced' && (
        <AdminAdvancedSection setup={setup} />
      )}

      {/* Floating save button */}
      <div
        className={clsx(
          'fixed bottom-6 right-6 z-30 transition-all duration-300',
          isDirty ? 'opacity-100 scale-100' : 'opacity-0 scale-75 pointer-events-none',
        )}
      >
        <div className="group relative">
          <button
            onClick={handleSaveSettings}
            disabled={savePending || !inputsReady || !isDirty}
            className={clsx(
              'w-14 h-14 rounded-full shadow-lg flex items-center justify-center transition-all duration-200',
              'disabled:opacity-40 disabled:cursor-not-allowed',
              saveFeedback === 'saved'
                ? 'bg-hc-success-text hover:bg-hc-success-text text-hc-on-success shadow-none '
                : 'bg-hc-accent-strong hover:bg-hc-accent-stronger hover:shadow-xl hover:scale-105 text-hc-on-accent shadow-none ',
            )}
          >
            {savePending
              ? <Loader2 size={22} className="animate-spin" />
              : saveFeedback === 'saved'
                ? <Check size={22} />
                : <Save size={22} />}
          </button>
          <span className="absolute right-full mr-3 top-1/2 -translate-y-1/2 px-2.5 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap bg-hc-fg-strong text-hc-panel opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none">
            {savePending ? 'Saving\u2026' : saveFeedback === 'saved' ? 'Saved!' : 'Save settings'}
          </span>
        </div>
      </div>
    </div>
  );
}
