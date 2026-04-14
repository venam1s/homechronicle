import { useState, useEffect, useCallback, useRef } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { AlertTriangle, BookOpen, Check, CheckCircle2, ChevronDown, Download, ExternalLink, Loader, Loader2, MessageSquare, Save, Trash2, X } from 'lucide-react';
import { useQueryClient, useQuery } from '@tanstack/react-query';
import { fetchJson, API_BASE, withApiAuthHeaders } from '../../lib/api.js';
import clsx from 'clsx';
import { useToast } from '../Toast.jsx';

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

const LOG_LEVELS = [
  { value: 'error', label: 'Error', desc: 'Only errors' },
  { value: 'warn', label: 'Warn', desc: 'Errors + warnings' },
  { value: 'info', label: 'Info', desc: 'Operational logs (default)' },
  { value: 'debug', label: 'Debug', desc: 'Everything, including skipped events' },
];

export default function SettingsTab({ setup }) {
  const {
    retentionConfig,
    saveRetentionMutation,
    logLevelConfig,
    saveLogLevelMutation,
    dbAccessories,
    deleteAccessoryMutation,
    paired,
    matterPairings,
    deletePairingMutation,
    deleteMatterPairingMutation,
    repairConfig,
    saveRepairMutation,
    alertsConfig,
    saveAlertsMutation,
  } = setup;

  const { addToast, configure: configureToasts } = useToast();
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
      const res = await fetch(`${API_BASE}/archive/export`, { headers: withApiAuthHeaders() });
      if (!res.ok) throw new Error('Download failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'homechronicle-archive.csv';
      a.click();
      URL.revokeObjectURL(url);
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
  const [logLevelInput, setLogLevelInput] = useState('info');
  const [dangerOpen, setDangerOpen] = useState(false);
  const [dangerPairFilter, setDangerPairFilter] = useState('all');
  const [confirmDeleteAccessory, setConfirmDeleteAccessory] = useState(null);
  const [wipeConfirmText, setWipeConfirmText] = useState('');
  const [wipePending, setWipePending] = useState(false);
  const [confirmDeletePairing, setConfirmDeletePairing] = useState(null);
  const [removeAllState, setRemoveAllState] = useState({ phase: 'idle' });
  const [removeAllConfirmText, setRemoveAllConfirmText] = useState('');
  const [matterDeleteError, setMatterDeleteError] = useState({});
  const [saveFeedback, setSaveFeedback] = useState(null);
  const [toastsEnabledInput, setToastsEnabledInput] = useState(true);
  const [liveEventToastsEnabledInput, setLiveEventToastsEnabledInput] = useState(false);
  const [toastPositionInput, setToastPositionInput] = useState('bottom-right');
  const [toastDurationInput, setToastDurationInput] = useState(3);
  const [toastMaxVisibleInput, setToastMaxVisibleInput] = useState(3);
  const [repairEnabledInput, setRepairEnabledInput] = useState(false);
  const [repairHourInput, setRepairHourInput] = useState(3);
  const [alertsEnabledInput, setAlertsEnabledInput] = useState(false);
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
      if (kind === 'logLevel') {
        await saveLogLevelMutation.mutateAsync(payload.level);
      } else {
        const result = await saveRetentionMutation.mutateAsync(payload);
        // Apply toast config immediately so the confirmation toast respects new settings
        if (payload.toastsEnabled !== undefined || payload.toastPosition || payload.toastDuration || payload.toastMaxVisible) {
          configureToasts({
            position: result.toastPosition,
            duration: result.toastDuration,
            maxVisible: result.toastMaxVisible,
          });
        }
      }
      // Show toast (respects whether toasts are now enabled)
      const toastsOn = kind === 'logLevel'
        ? (retentionConfig?.toastsEnabled ?? true)
        : (payload.toastsEnabled ?? retentionConfig?.toastsEnabled ?? true);
      if (toastsOn) addToast('Setting saved', 'success');
    } catch {
      addToast('Failed to save setting', 'error');
      // Revert: invalidate query cache to re-fetch server state
      queryClient.invalidateQueries({ queryKey: ['setup', 'retention'] });
      queryClient.invalidateQueries({ queryKey: ['setup', 'log-level'] });
    } finally {
      autoSaveInFlight.current = false;
      if (autoSaveQueued.current) {
        const next = autoSaveQueued.current;
        autoSaveQueued.current = null;
        flushAutoSave(next.payload, next.kind);
      }
    }
  }, [saveRetentionMutation, saveLogLevelMutation, configureToasts, addToast, retentionConfig?.toastsEnabled, queryClient]);

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
  const logLevelCurrent = logLevelConfig?.level ?? 'info';
  const repairEnabledCurrent = Boolean(repairConfig?.enabled ?? false);
  const repairHourCurrent = repairConfig?.hour != null ? utcHourToLocal(repairConfig.hour) : 3;
  const dangerPairedCount = dbAccessories.filter((a) => Boolean(a.paired_at)).length;
  const dangerUnpairedCount = dbAccessories.length - dangerPairedCount;
  const visibleDangerAccessories = dbAccessories.filter((a) => {
    if (dangerPairFilter === 'paired') return Boolean(a.paired_at);
    if (dangerPairFilter === 'unpaired') return !a.paired_at;
    return true;
  });

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
    setQuietHoursEnabledInput(quietHoursEnabledCurrent);
    setQuietHoursStartInput(quietHoursStartCurrent);
    setQuietHoursEndInput(quietHoursEndCurrent);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quietHoursEnabledCurrent, quietHoursStartCurrent, quietHoursEndCurrent]);

  useEffect(() => {
    setEpisodeWindowInput((prev) => (prev.trim() ? prev : String(episodeWindowCurrent)));
  }, [episodeWindowCurrent]);

  useEffect(() => {
    setSceneWindowInput((prev) => (prev.trim() ? prev : String(sceneWindowCurrent)));
  }, [sceneWindowCurrent]);

  useEffect(() => {
    setEpisodeMinEventInput((prev) => (prev.trim() ? prev : String(episodeMinEventCurrent)));
  }, [episodeMinEventCurrent]);

  useEffect(() => {
    setLogLevelInput(logLevelCurrent);
  }, [logLevelCurrent]);

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
    setAlertsEnabledInput(Boolean(alertsConfig?.enabled ?? false));
    setAlertsDefaultQuietInput(alertsConfig?.defaultQuietMinutes ?? 0);
    setAlertsWebhookTimeoutInput(alertsConfig?.webhookTimeoutMs ?? 5000);
  }, [alertsConfig?.enabled, alertsConfig?.defaultQuietMinutes, alertsConfig?.webhookTimeoutMs]);

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
      || parsedEpisodeWindow !== episodeWindowCurrent
      || parsedSceneWindow !== sceneWindowCurrent
      || parsedEpisodeMinEvent !== episodeMinEventCurrent
    );

  async function handleSaveSettings() {
    if (!isDirty || !retentionDaysValid || !staleThresholdValid) return;
    setSaveFeedback(null);
    try {
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
      setSaveFeedback('saved');
      if (retentionConfig?.toastsEnabled !== false) {
        addToast('Settings saved', 'success');
      }
    } catch {
      setSaveFeedback('error');
    }
  }

  const handleRemoveAll = useCallback(async () => {
    const hkDevices = [...paired];
    const matterDevices = [...matterPairings];
    const total = hkDevices.length + matterDevices.length;
    if (total === 0) return;

    setRemoveAllState({ phase: 'running', current: 0, total });

    let ok = 0;
    let failed = 0;

    for (let i = 0; i < hkDevices.length; i++) {
      setRemoveAllState((s) => ({ ...s, current: i + 1 }));
      try {
        await new Promise((resolve, reject) => {
          deletePairingMutation.mutate(hkDevices[i].id, {
            onSuccess: resolve,
            onError: reject,
          });
        });
        ok++;
      } catch {
        failed++;
      }
    }

    for (let i = 0; i < matterDevices.length; i++) {
      setRemoveAllState((s) => ({ ...s, current: hkDevices.length + i + 1 }));
      const nodeId = matterDevices[i].nodeId ?? matterDevices[i].id;
      try {
        await new Promise((resolve, reject) => {
          deleteMatterPairingMutation.mutate(nodeId, {
            onSuccess: resolve,
            onError: reject,
          });
        });
        ok++;
      } catch {
        failed++;
      }
    }

    addToast(
      failed ? `Removed ${ok}/${total} pairings (${failed} failed)` : `All ${ok} pairings removed`,
      failed ? 'error' : 'success',
    );

    setRemoveAllState({ phase: 'idle' });
    setRemoveAllConfirmText('');
  }, [paired, matterPairings, deletePairingMutation, deleteMatterPairingMutation, addToast]);

  async function handleWipeAll() {
    if (wipeConfirmText !== 'DELETE') return;
    setWipePending(true);
    try {
      const { fetchJson } = await import('../../lib/api.js');
      await fetchJson('/api/data/all', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirm: 'DELETE ALL' }),
      });
      const { useQueryClient } = await import('@tanstack/react-query');
      // invalidation already happens via mutation callbacks; force refetch
      window.location.reload();
    } finally {
      setWipePending(false);
    }
  }

  return (
    <div className="space-y-4">

      {/* — Help & Links — */}
      <h3 className="text-xs font-semibold uppercase tracking-wide text-hc-muted pt-1">Help & Links</h3>

      <div className="bg-hc-panel border border-hc-panel-border rounded-lg px-4 py-3 flex flex-col gap-2">
        <a
          href="https://homechronicle.net/guide/#/"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 text-sm text-hc-accent-strong hover:underline"
        >
          <BookOpen size={14} />
          Documentation
          <ExternalLink size={11} className="opacity-50" />
        </a>
        <a
          href="https://gitlab.com/havuq/homechronicle/-/issues"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 text-sm text-hc-accent-strong hover:underline"
        >
          <MessageSquare size={14} />
          Report an issue
          <ExternalLink size={11} className="opacity-50" />
        </a>
      </div>

      {/* — Device Management — */}
      <h3 className="text-xs font-semibold uppercase tracking-wide text-hc-muted pt-3">Device Management</h3>

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
                  className="text-sm border border-hc-border-strong rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-hc-panel text-hc-fg-strong"
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

      {/* — Data & Retention — */}
      <h3 className="text-xs font-semibold uppercase tracking-wide text-hc-muted pt-3">Data &amp; Retention</h3>

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
              className="w-24 text-sm border border-hc-border-strong rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-hc-panel text-hc-fg-strong"
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
              className="w-24 text-sm border border-hc-border-strong rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-hc-panel text-hc-fg-strong"
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

      {/* — Alerts & Quiet Hours — */}
      <h3 className="text-xs font-semibold uppercase tracking-wide text-hc-muted pt-3">Alerts &amp; Quiet Hours</h3>

      {/* Webhook Alerts */}
      <div className="bg-hc-panel border border-hc-panel-border rounded-lg px-4 py-3">
        <p className="text-xs text-hc-muted mb-3">
          Send webhook notifications when device events match your alert rules. Configure rules in the Alerts tab.
        </p>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <p className="text-sm font-medium text-hc-fg">Webhook Alerts</p>
          <label className="inline-flex items-center gap-2 text-sm text-hc-fg">
            <input
              type="checkbox"
              checked={alertsEnabledInput}
              onChange={(e) => {
                const v = e.target.checked;
                setAlertsEnabledInput(v);
                saveAlertsMutation.mutate({ enabled: v });
              }}
            />
            <span>{alertsEnabledInput ? 'On' : 'Off'}</span>
          </label>
        </div>
        {alertsEnabledInput && (
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
                  className="w-24 text-sm border border-hc-border-strong rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-hc-panel text-hc-fg-strong"
                />
                <span className="text-xs text-hc-muted">min</span>
              </div>
            </div>
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div>
                <p className="text-sm text-hc-fg">Webhook timeout</p>
                <p className="text-xs text-hc-muted mt-0.5">Max wait time for webhook delivery.</p>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min="1000"
                  max="30000"
                  step="500"
                  value={alertsWebhookTimeoutInput}
                  onChange={(e) => setAlertsWebhookTimeoutInput(Number(e.target.value))}
                  onBlur={() => {
                    const v = Number.parseInt(String(alertsWebhookTimeoutInput), 10);
                    if (Number.isFinite(v) && v >= 1000 && v <= 30000) {
                      saveAlertsMutation.mutate({ webhookTimeoutMs: v });
                    }
                  }}
                  className="w-24 text-sm border border-hc-border-strong rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-hc-panel text-hc-fg-strong"
                />
                <span className="text-xs text-hc-muted">ms</span>
              </div>
            </div>
          </div>
        )}
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
              onChange={(e) => { const v = e.target.checked; setQuietHoursEnabledInput(v); autoSave({ quietHoursEnabled: v }); }}
            />
            <span>{quietHoursEnabledInput ? 'On' : 'Off'}</span>
          </label>
        </div>
        <div className="flex items-center gap-3 mt-3 flex-wrap">
          <div className="flex items-center gap-2">
            <span className="text-xs text-hc-muted">From</span>
            <select
              value={quietHoursStartInput}
              onChange={(e) => { const v = Number(e.target.value); setQuietHoursStartInput(v); autoSave({ quietHoursStart: localHourToUtc(v) }); }}
              disabled={!quietHoursEnabledInput}
              className="text-sm border border-hc-border-strong rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-hc-panel text-hc-fg-strong disabled:opacity-50 disabled:cursor-not-allowed"
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
              onChange={(e) => { const v = Number(e.target.value); setQuietHoursEndInput(v); autoSave({ quietHoursEnd: localHourToUtc(v) }); }}
              disabled={!quietHoursEnabledInput}
              className="text-sm border border-hc-border-strong rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-hc-panel text-hc-fg-strong disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {HOURS_OPTIONS.map(({ value, label }) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </div>
        </div>
        {/* Excluded accessories */}
        {(retentionConfig?.quietHoursExcludedAccessories ?? []).length > 0 && (
          <div className="mt-3 pt-3 border-t border-gray-100 border-hc-panel-border">
            <p className="text-xs text-hc-muted mb-2">Excluded from quiet hours:</p>
            <div className="flex flex-wrap gap-1.5">
              {retentionConfig.quietHoursExcludedAccessories.map((id) => {
                const matchedAcc = paired.find((a) => a.id === id) ?? dbAccessories.find((a) => a.accessory_id === id);
                const label = matchedAcc?.name ?? matchedAcc?.accessory_name ?? id;
                return (
                <span key={id} className="inline-flex items-center gap-1 text-xs bg-hc-panel-mid text-hc-muted-light rounded-full px-2.5 py-1">
                  <span className="truncate max-w-[180px]">{label}</span>
                  <button
                    onClick={async () => {
                      const next = retentionConfig.quietHoursExcludedAccessories.filter((a) => a !== id);
                      try {
                        const result = await saveRetentionMutation.mutateAsync({ quietHoursExcludedAccessories: next });
                        queryClient.setQueryData(['setup', 'retention'], result);
                        queryClient.invalidateQueries({ queryKey: ['stats', 'quiet-hours'] });
                      } catch { /* handled by mutation */ }
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

      {/* — Timeline — */}
      <h3 className="text-xs font-semibold uppercase tracking-wide text-hc-muted pt-3">Timeline</h3>

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
              className="w-24 text-sm border border-hc-border-strong rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-hc-panel text-hc-fg-strong"
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
              className="w-24 text-sm border border-hc-border-strong rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-hc-panel text-hc-fg-strong"
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
              className="w-24 text-sm border border-hc-border-strong rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-hc-panel text-hc-fg-strong"
            />
            <span className="text-xs text-hc-muted">events</span>
          </div>
        </div>
      </div>

      {/* — Appearance — */}
      <h3 className="text-xs font-semibold uppercase tracking-wide text-hc-muted pt-3">Appearance</h3>
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
              checked={toastsEnabledInput}
              onChange={(e) => { const v = e.target.checked; setToastsEnabledInput(v); autoSave({ toastsEnabled: v }); }}
            />
            <span>{toastsEnabledInput ? 'On' : 'Off'}</span>
          </label>
        </div>
      </div>

      {/* Live event toasts */}
      <div className={clsx('bg-hc-panel border border-hc-panel-border rounded-lg px-4 py-3', !toastsEnabledInput && 'opacity-50 pointer-events-none')}>
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
              checked={liveEventToastsEnabledInput}
              onChange={(e) => { const v = e.target.checked; setLiveEventToastsEnabledInput(v); autoSave({ liveEventToastsEnabled: v }); }}
              disabled={!toastsEnabledInput}
            />
            <span>{liveEventToastsEnabledInput ? 'On' : 'Off'}</span>
          </label>
        </div>
        {liveEventToastsEnabledInput && !(retentionConfig?.toastAccessories?.length > 0) && (
          <p className="text-xs text-hc-warning-text mt-2">
            Select accessories to watch on the Manage Accessories tab.
          </p>
        )}
      </div>

      {/* Toast position */}
      <div className={clsx('bg-hc-panel border border-hc-panel-border rounded-lg px-4 py-3', !toastsEnabledInput && 'opacity-50 pointer-events-none')}>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <p className="text-sm font-medium text-hc-fg">Toast position</p>
            <p className="text-xs text-hc-muted mt-0.5">
              Where on screen to show toast popups.
            </p>
          </div>
          <select
            value={toastPositionInput}
            onChange={(e) => { const v = e.target.value; setToastPositionInput(v); autoSave({ toastPosition: v }); }}
            className="text-sm rounded border border-hc-border-strong bg-hc-panel text-gray-900 text-hc-fg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="bottom-right">Bottom Right</option>
            <option value="bottom-left">Bottom Left</option>
            <option value="bottom-center">Bottom Center</option>
            <option value="top-right">Top Right</option>
            <option value="top-left">Top Left</option>
            <option value="top-center">Top Center</option>
          </select>
        </div>
      </div>

      {/* Toast duration */}
      <div className={clsx('bg-hc-panel border border-hc-panel-border rounded-lg px-4 py-3', !toastsEnabledInput && 'opacity-50 pointer-events-none')}>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <p className="text-sm font-medium text-hc-fg">Toast duration</p>
            <p className="text-xs text-hc-muted mt-0.5">
              How long each toast stays visible before auto-dismissing.
            </p>
          </div>
          <select
            value={toastDurationInput}
            onChange={(e) => { const v = Number(e.target.value); setToastDurationInput(v); autoSave({ toastDuration: v }); }}
            className="text-sm rounded border border-hc-border-strong bg-hc-panel text-gray-900 text-hc-fg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value={2}>2 seconds</option>
            <option value={3}>3 seconds</option>
            <option value={5}>5 seconds</option>
            <option value={7}>7 seconds</option>
          </select>
        </div>
      </div>

      {/* Toast max visible */}
      <div className={clsx('bg-hc-panel border border-hc-panel-border rounded-lg px-4 py-3', !toastsEnabledInput && 'opacity-50 pointer-events-none')}>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <p className="text-sm font-medium text-hc-fg">Max visible toasts</p>
            <p className="text-xs text-hc-muted mt-0.5">
              Maximum number of toasts that can stack on screen at once.
            </p>
          </div>
          <select
            value={toastMaxVisibleInput}
            onChange={(e) => { const v = Number(e.target.value); setToastMaxVisibleInput(v); autoSave({ toastMaxVisible: v }); }}
            className="text-sm rounded border border-hc-border-strong bg-hc-panel text-gray-900 text-hc-fg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value={1}>1</option>
            <option value={2}>2</option>
            <option value={3}>3</option>
            <option value={5}>5</option>
          </select>
        </div>
      </div>

      {/* — Advanced — */}
      <h3 className="text-xs font-semibold uppercase tracking-wide text-hc-muted pt-3">Advanced</h3>

      {/* Log level */}
      <div className="bg-hc-panel border border-hc-panel-border rounded-lg px-4 py-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <p className="text-sm font-medium text-hc-fg">Log level</p>
            <p className="text-xs text-hc-muted mt-0.5">
              Controls how much the listener logs to Docker output. Changes apply instantly — no restart needed.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={logLevelInput}
              onChange={(e) => { const v = e.target.value; setLogLevelInput(v); autoSave({ level: v }, 'logLevel'); }}
              className="text-sm border border-hc-border-strong rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-hc-panel text-hc-fg-strong"
            >
              {LOG_LEVELS.map(({ value, label, desc }) => (
                <option key={value} value={value}>
                  {label} — {desc}
                </option>
              ))}
            </select>
          </div>
        </div>
        {saveLogLevelMutation.isError && (
          <p className="text-xs text-hc-danger-text mt-2">
            Could not update log level: {saveLogLevelMutation.error?.message}
          </p>
        )}
      </div>

      {/* Danger Zone */}
      <section className="border border-hc-danger-border rounded-xl overflow-hidden">
        <button
          onClick={() => setDangerOpen((o) => !o)}
          className="w-full flex items-center justify-between px-4 py-3 bg-hc-danger-bg text-sm font-medium text-hc-danger-text hover:bg-hc-danger-bg transition-colors"
        >
          <span className="flex items-center gap-2">
            <AlertTriangle size={14} />
            Danger Zone
          </span>
          <ChevronDown
            size={14}
            className={clsx('transition-transform duration-200', dangerOpen && 'rotate-180')}
          />
        </button>

        {dangerOpen && (
          <div className="bg-hc-panel">

            {/* ── Remove pairings ──────────────────────────────────── */}
            <div className="border-b border-gray-100 border-hc-panel-border">
              <p className="px-4 pt-3 pb-2 text-xs font-medium text-hc-danger-text">Remove pairings</p>
              <p className="px-4 pb-2 text-xs text-hc-muted">
                Unpair individual HomeKit or Matter accessories. Event data is <strong>not</strong> deleted.
              </p>

              {(paired.length + matterPairings.length) === 0 ? (
                <p className="px-4 py-3 text-xs text-hc-muted italic">No paired accessories.</p>
              ) : (
                <div className="divide-y divide-hc-panel-border">
                  {paired.map((acc) => {
                    const isConfirming = confirmDeletePairing === acc.id;
                    const isDeleting = deletePairingMutation.isPending && isConfirming;
                    return (
                      <div key={acc.id} className="flex items-center gap-3 px-4 py-2.5">
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-hc-fg truncate">{acc.name ?? acc.id}</div>
                          <div className="text-xs text-hc-muted">HomeKit</div>
                        </div>
                        {isConfirming ? (
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <span className="text-xs text-hc-muted">Remove pairing?</span>
                            <button
                              onClick={() => deletePairingMutation.mutate(acc.id, {
                                onSuccess: () => setConfirmDeletePairing(null),
                                onError: () => setConfirmDeletePairing(null),
                              })}
                              disabled={isDeleting}
                              className="text-xs px-2 py-1 bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50 transition-colors"
                            >
                              {isDeleting ? 'Removing\u2026' : 'Yes, remove'}
                            </button>
                            <button
                              onClick={() => setConfirmDeletePairing(null)}
                              disabled={isDeleting}
                              className="text-xs px-2 py-1 bg-hc-panel-mid text-hc-muted-light rounded hover:bg-hc-panel-mid transition-colors"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setConfirmDeletePairing(acc.id)}
                            className="flex-shrink-0 text-xs text-red-400 hover:text-red-600  hover:bg-red-50  px-2 py-1 rounded transition-colors"
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                    );
                  })}
                  {matterPairings.map((pairing) => {
                    const nodeId = pairing.nodeId ?? pairing.id;
                    const isConfirming = confirmDeletePairing === `matter-${nodeId}`;
                    const isDeleting = deleteMatterPairingMutation.isPending && isConfirming;
                    return (
                      <div key={`matter-${nodeId}`} className="flex items-center gap-3 px-4 py-2.5">
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-hc-fg truncate">{pairing.name ?? nodeId}</div>
                          <div className="text-xs text-hc-muted">Matter</div>
                        </div>
                        {isConfirming ? (
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <span className="text-xs text-hc-muted">Remove pairing?</span>
                            <button
                              onClick={() => {
                                setMatterDeleteError((s) => ({ ...s, [nodeId]: null }));
                                deleteMatterPairingMutation.mutate(nodeId, {
                                  onSuccess: () => setConfirmDeletePairing(null),
                                  onError: (err) => {
                                    setConfirmDeletePairing(null);
                                    setMatterDeleteError((s) => ({ ...s, [nodeId]: err.message ?? 'Could not remove accessory.' }));
                                  },
                                });
                              }}
                              disabled={isDeleting}
                              className="text-xs px-2 py-1 bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50 transition-colors"
                            >
                              {isDeleting ? 'Removing\u2026' : 'Yes, remove'}
                            </button>
                            <button
                              onClick={() => setConfirmDeletePairing(null)}
                              disabled={isDeleting}
                              className="text-xs px-2 py-1 bg-hc-panel-mid text-hc-muted-light rounded hover:bg-hc-panel-mid transition-colors"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setConfirmDeletePairing(`matter-${nodeId}`)}
                            className="flex-shrink-0 text-xs text-red-400 hover:text-red-600  hover:bg-red-50  px-2 py-1 rounded transition-colors"
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                        {matterDeleteError[nodeId] && (
                          <p className="text-xs text-red-500 mt-1">{matterDeleteError[nodeId]}</p>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Remove all pairings */}
              {(paired.length + matterPairings.length) > 0 && (
                <div className="border-t border-hc-danger-border bg-hc-danger-bg px-4 py-4">
                  {removeAllState.phase === 'idle' && (
                    <>
                      <p className="text-xs font-medium text-hc-danger-text mb-2">
                        Remove all pairings ({paired.length + matterPairings.length}) — type <code className="bg-hc-danger-bg px-1 rounded">DELETE</code> to confirm
                      </p>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          placeholder="Type DELETE to confirm"
                          value={removeAllConfirmText === '_' ? '' : removeAllConfirmText}
                          onChange={(e) => setRemoveAllConfirmText(e.target.value || '_')}
                          className="flex-1 text-xs border border-hc-danger-border rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-red-400 bg-hc-panel text-hc-fg-strong placeholder-red-200 "
                        />
                        <button
                          onClick={handleRemoveAll}
                          disabled={removeAllConfirmText !== 'DELETE'}
                          className="flex items-center gap-1.5 px-3 py-2 bg-red-600 text-white text-xs font-medium rounded-lg hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
                        >
                          Remove all
                        </button>
                      </div>
                    </>
                  )}
                  {removeAllState.phase === 'running' && (
                    <span className="flex items-center gap-1.5 text-xs text-hc-danger-text">
                      <Loader2 size={13} className="animate-spin" />
                      Removing {removeAllState.current}/{removeAllState.total}...
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* ── Delete accessory data ────────────────────────────── */}
            <p className="px-4 pt-3 pb-2 text-xs font-medium text-hc-danger-text">Delete accessory data</p>
            <p className="px-4 pb-2 text-xs text-hc-muted border-b border-gray-100 border-hc-panel-border">
              Delete stored event history for individual accessories, or wipe everything.
              This only removes logged data — it does not unpair accessories.
            </p>

            {dbAccessories.length > 0 && (
              <div className="px-4 py-2 border-b border-gray-100 border-hc-panel-border">
                <div className="inline-flex items-center gap-1 rounded-lg bg-hc-panel-soft/50 p-1">
                  {[
                    { key: 'all', label: `All (${dbAccessories.length})`, color: 'text-hc-fg' },
                    { key: 'paired', label: `Paired (${dangerPairedCount})`, color: 'text-hc-success-text' },
                    { key: 'unpaired', label: `No longer paired (${dangerUnpairedCount})`, color: 'text-hc-danger-text' },
                  ].map(({ key, label, color }) => (
                    <button
                      key={key}
                      onClick={() => { setDangerPairFilter(key); setConfirmDeleteAccessory(null); }}
                      className={clsx(
                        'px-2 py-1 text-xs rounded transition-colors',
                        dangerPairFilter === key
                          ? `bg-hc-panel ${color} shadow-sm`
                          : 'text-hc-muted hover:text-hc-fg',
                      )}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {dbAccessories.length === 0 ? (
              <p className="px-4 py-4 text-xs text-hc-muted italic">No accessory data in the database.</p>
            ) : visibleDangerAccessories.length === 0 ? (
              <p className="px-4 py-4 text-xs text-hc-muted italic">No accessories match this filter.</p>
            ) : (
              <div className="divide-y divide-hc-panel-border">
                {visibleDangerAccessories.map((acc) => {
                  const isConfirming = confirmDeleteAccessory === acc.accessory_id;
                  const isDeleting = deleteAccessoryMutation.isPending && isConfirming;
                  const isCurrentlyPaired = Boolean(acc.paired_at);
                  return (
                    <div key={acc.accessory_id} className="flex items-center gap-3 px-4 py-2.5">
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-hc-fg truncate">{acc.accessory_name}</div>
                        <div className="text-xs text-hc-muted flex items-center gap-1.5 flex-wrap">
                          {acc.service_type ?? 'No events yet'}
                          {acc.room_name && <span className="ml-1">&middot; {acc.room_name}</span>}
                          <span
                            className={clsx(
                              'ml-1 inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium border',
                              isCurrentlyPaired
                                ? 'text-hc-success-text bg-hc-success-bg border-hc-success-border'
                                : 'text-hc-danger-text bg-hc-danger-bg border-hc-danger-border',
                            )}
                          >
                            {isCurrentlyPaired ? 'Currently paired' : 'No longer paired'}
                          </span>
                        </div>
                      </div>
                      {isConfirming ? (
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <span className="text-xs text-hc-muted">Delete history? This cannot be undone.</span>
                          <button
                            onClick={() => deleteAccessoryMutation.mutate(acc.accessory_id, {
                              onSuccess: () => {
                                setConfirmDeleteAccessory(null);
                                if (retentionConfig?.toastsEnabled !== false) {
                                  addToast('Accessory deleted', 'success');
                                }
                              },
                            })}
                            disabled={isDeleting}
                            className="text-xs px-2 py-1 bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50 transition-colors"
                          >
                            {isDeleting ? 'Deleting\u2026' : 'Yes, delete'}
                          </button>
                          <button
                            onClick={() => setConfirmDeleteAccessory(null)}
                            disabled={isDeleting}
                            className="text-xs px-2 py-1 bg-hc-panel-mid text-hc-muted-light rounded hover:bg-hc-panel-mid transition-colors"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setConfirmDeleteAccessory(acc.accessory_id)}
                          className="flex-shrink-0 text-xs text-red-400 hover:text-red-600  hover:bg-red-50  px-2 py-1 rounded transition-colors"
                        >
                          Delete history
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Wipe all */}
            <div className="border-t border-hc-danger-border bg-hc-danger-bg px-4 py-4">
              <p className="text-xs font-medium text-hc-danger-text mb-2">
                Wipe all event data — type <code className="bg-hc-danger-bg px-1 rounded">DELETE</code> to confirm
              </p>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Type DELETE to confirm"
                  value={wipeConfirmText}
                  onChange={(e) => setWipeConfirmText(e.target.value)}
                  className="flex-1 text-xs border border-hc-danger-border rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-red-400 bg-hc-panel text-hc-fg-strong placeholder-red-200 "
                />
                <button
                  onClick={handleWipeAll}
                  disabled={wipeConfirmText !== 'DELETE' || wipePending}
                  className="flex items-center gap-1.5 px-3 py-2 bg-red-600 text-white text-xs font-medium rounded-lg hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
                >
                  {wipePending ? <><Loader size={12} className="animate-spin" /> Wiping&hellip;</> : 'Wipe all data'}
                </button>
              </div>
            </div>
          </div>
        )}
      </section>

      {/* Floating save button */}
      <div
        className={clsx(
          'fixed bottom-6 right-6 z-30 transition-all duration-300 hc-standalone:bottom-20',
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
                ? 'bg-emerald-500 hover:bg-emerald-600 text-white shadow-emerald-200 '
                : 'bg-blue-600 hover:bg-blue-700 hover:shadow-xl hover:scale-105 text-white shadow-blue-200 ',
            )}
          >
            {savePending
              ? <Loader2 size={22} className="animate-spin" />
              : saveFeedback === 'saved'
                ? <Check size={22} />
                : <Save size={22} />}
          </button>
          <span className="absolute right-full mr-3 top-1/2 -translate-y-1/2 px-2.5 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap bg-gray-900 bg-hc-panel-mid text-white opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none">
            {savePending ? 'Saving\u2026' : saveFeedback === 'saved' ? 'Saved!' : 'Save settings'}
          </span>
        </div>
      </div>
    </div>
  );
}
