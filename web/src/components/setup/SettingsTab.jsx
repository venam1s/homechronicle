import { useState, useEffect } from 'react';
import { AlertTriangle, CheckCircle2, ChevronDown, Download, Loader, X } from 'lucide-react';
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
  const [saveFeedback, setSaveFeedback] = useState(null);
  const [toastsEnabledInput, setToastsEnabledInput] = useState(true);
  const [liveEventToastsEnabledInput, setLiveEventToastsEnabledInput] = useState(false);
  const [toastPositionInput, setToastPositionInput] = useState('bottom-right');
  const [toastDurationInput, setToastDurationInput] = useState(3);
  const [toastMaxVisibleInput, setToastMaxVisibleInput] = useState(3);

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
  const savePending = saveRetentionMutation.isPending || saveLogLevelMutation.isPending;
  const isDirty = retentionDaysValid
    && staleThresholdValid
    && episodeWindowValid
    && sceneWindowValid
    && episodeMinEventValid
    && (
      parsedRetentionDays !== retentionDaysCurrent
      || parsedStaleThresholdHours !== staleThresholdHoursCurrent
      || archiveBeforeDeleteInput !== archiveBeforeDeleteCurrent
      || autoScanHomeKitInput !== autoScanHomeKit
      || quietHoursEnabledInput !== quietHoursEnabledCurrent
      || quietHoursStartInput !== quietHoursStartCurrent
      || quietHoursEndInput !== quietHoursEndCurrent
      || parsedEpisodeWindow !== episodeWindowCurrent
      || parsedSceneWindow !== sceneWindowCurrent
      || parsedEpisodeMinEvent !== episodeMinEventCurrent
      || logLevelInput !== logLevelCurrent
      || toastsEnabledInput !== (retentionConfig?.toastsEnabled ?? true)
      || liveEventToastsEnabledInput !== (retentionConfig?.liveEventToastsEnabled ?? false)
      || toastPositionInput !== (retentionConfig?.toastPosition ?? 'bottom-right')
      || toastDurationInput !== (retentionConfig?.toastDuration ?? 3)
      || toastMaxVisibleInput !== (retentionConfig?.toastMaxVisible ?? 3)
    );

  async function handleSaveSettings() {
    if (!isDirty || !retentionDaysValid || !staleThresholdValid) return;
    setSaveFeedback(null);
    try {
      const [nextRetention] = await Promise.all([
        saveRetentionMutation.mutateAsync({
          retentionDays: parsedRetentionDays,
          staleThresholdHours: parsedStaleThresholdHours,
          archiveBeforeDelete: archiveBeforeDeleteInput,
          autoScanHomeKit: autoScanHomeKitInput,
          quietHoursEnabled: quietHoursEnabledInput,
          quietHoursStart: localHourToUtc(quietHoursStartInput),
          quietHoursEnd: localHourToUtc(quietHoursEndInput),
          episodeWindowMinutes: parsedEpisodeWindow,
          sceneWindowSeconds: parsedSceneWindow,
          episodeMinEventCount: parsedEpisodeMinEvent,
          toastsEnabled: toastsEnabledInput,
          liveEventToastsEnabled: liveEventToastsEnabledInput,
          toastPosition: toastPositionInput,
          toastDuration: toastDurationInput,
          toastMaxVisible: toastMaxVisibleInput,
        }),
        saveLogLevelMutation.mutateAsync(logLevelInput),
      ]);
      setRetentionDaysInput(String(nextRetention.retentionDays));
      setStaleThresholdHoursInput(String(nextRetention.staleThresholdHours));
      setArchiveBeforeDeleteInput(Boolean(nextRetention.archiveBeforeDelete ?? true));
      setAutoScanHomeKitInput(Boolean(nextRetention.autoScanHomeKit ?? true));
      setQuietHoursEnabledInput(Boolean(nextRetention.quietHoursEnabled ?? false));
      if (nextRetention.quietHoursStart != null) setQuietHoursStartInput(utcHourToLocal(nextRetention.quietHoursStart));
      if (nextRetention.quietHoursEnd != null) setQuietHoursEndInput(utcHourToLocal(nextRetention.quietHoursEnd));
      if (nextRetention.episodeWindowMinutes != null) setEpisodeWindowInput(String(nextRetention.episodeWindowMinutes));
      if (nextRetention.sceneWindowSeconds != null) setSceneWindowInput(String(nextRetention.sceneWindowSeconds));
      if (nextRetention.episodeMinEventCount != null) setEpisodeMinEventInput(String(nextRetention.episodeMinEventCount));
      setSaveFeedback('saved');
      configureToasts({
        position: nextRetention.toastPosition,
        duration: nextRetention.toastDuration,
        maxVisible: nextRetention.toastMaxVisible,
      });
      if (nextRetention.toastsEnabled !== false) {
        addToast('Settings saved', 'success');
      }
    } catch {
      setSaveFeedback('error');
    }
  }

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

      {/* — Data — */}
      <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500 pt-1">Data</h3>

      {/* Retention cutoff */}
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-4 py-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <p className="text-sm font-medium text-gray-800 dark:text-gray-100">Retention cutoff</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
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
              className="w-24 text-sm border border-gray-300 dark:border-gray-600 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
            />
            <span className="text-xs text-gray-500 dark:text-gray-400">days</span>
          </div>
        </div>
        <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-2">
          Changes apply without restart. Sweep interval is every 24 hours by default.
        </p>
      </div>

      {/* Archive before delete */}
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-4 py-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <p className="text-sm font-medium text-gray-800 dark:text-gray-100">Archive before delete</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              Copy expired events to the archive table before removing them from the main table.
            </p>
          </div>
          <label className="inline-flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
            <input
              type="checkbox"
              checked={archiveBeforeDeleteInput}
              onChange={(e) => { setArchiveBeforeDeleteInput(e.target.checked); setSaveFeedback(null); }}
              disabled={savePending}
            />
            <span>{archiveBeforeDeleteInput ? 'On' : 'Off'}</span>
          </label>
        </div>
        <div className="flex items-center justify-between mt-2">
          <p className="text-[11px] text-gray-400 dark:text-gray-500">
            When off, expired events are permanently deleted during retention sweep.
          </p>
          {archiveCount > 0 && (
            <button
              onClick={handleDownloadArchive}
              disabled={archiveDownloading}
              className="inline-flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 disabled:opacity-50 transition-colors flex-shrink-0 ml-3"
            >
              <Download size={12} />
              {archiveDownloading ? 'Downloading\u2026' : `Download archive (${archiveCount.toLocaleString()} events)`}
            </button>
          )}
        </div>
      </div>

      {/* Stale accessory threshold */}
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-4 py-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <p className="text-sm font-medium text-gray-800 dark:text-gray-100">Stale accessory threshold</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
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
              className="w-24 text-sm border border-gray-300 dark:border-gray-600 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
            />
            <span className="text-xs text-gray-500 dark:text-gray-400">hours</span>
          </div>
        </div>
      </div>

      {/* HomeKit auto-scan */}
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-4 py-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <p className="text-sm font-medium text-gray-800 dark:text-gray-100">HomeKit auto-scan</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              Automatically scan for HomeKit accessories every hour in the background.
            </p>
          </div>
          <label className="inline-flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
            <input
              type="checkbox"
              checked={autoScanHomeKitInput}
              onChange={(e) => { setAutoScanHomeKitInput(e.target.checked); setSaveFeedback(null); }}
              disabled={savePending}
            />
            <span>{autoScanHomeKitInput ? 'On' : 'Off'}</span>
          </label>
        </div>
        <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-2">
          Manual scans from Add Accessories still work when this is off.
        </p>
      </div>

      {/* — Alerts — */}
      <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500 pt-3">Alerts</h3>

      {/* Quiet hours */}
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-4 py-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <p className="text-sm font-medium text-gray-800 dark:text-gray-100">Quiet hours</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              Flag accessory activity during this window as unexpected on the dashboard.
            </p>
          </div>
          <label className="inline-flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
            <input
              type="checkbox"
              checked={quietHoursEnabledInput}
              onChange={(e) => { setQuietHoursEnabledInput(e.target.checked); setSaveFeedback(null); }}
              disabled={savePending}
            />
            <span>{quietHoursEnabledInput ? 'On' : 'Off'}</span>
          </label>
        </div>
        <div className="flex items-center gap-3 mt-3 flex-wrap">
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500 dark:text-gray-400">From</span>
            <select
              value={quietHoursStartInput}
              onChange={(e) => { setQuietHoursStartInput(Number(e.target.value)); setSaveFeedback(null); }}
              disabled={savePending || !quietHoursEnabledInput}
              className="text-sm border border-gray-300 dark:border-gray-600 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white dark:bg-gray-700 dark:text-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {HOURS_OPTIONS.map(({ value, label }) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500 dark:text-gray-400">to</span>
            <select
              value={quietHoursEndInput}
              onChange={(e) => { setQuietHoursEndInput(Number(e.target.value)); setSaveFeedback(null); }}
              disabled={savePending || !quietHoursEnabledInput}
              className="text-sm border border-gray-300 dark:border-gray-600 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white dark:bg-gray-700 dark:text-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {HOURS_OPTIONS.map(({ value, label }) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </div>
        </div>
        {/* Excluded accessories */}
        {(retentionConfig?.quietHoursExcludedAccessories ?? []).length > 0 && (
          <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-700">
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">Excluded from quiet hours:</p>
            <div className="flex flex-wrap gap-1.5">
              {retentionConfig.quietHoursExcludedAccessories.map((id) => (
                <span key={id} className="inline-flex items-center gap-1 text-xs bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded-full px-2.5 py-1">
                  <span className="truncate max-w-[180px]">{id}</span>
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
                    className="p-0.5 rounded-full hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                    title={`Restore ${id} to quiet hours`}
                  >
                    <X size={10} />
                  </button>
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* — Timeline — */}
      <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500 pt-3">Timeline</h3>

      {/* Episode capture interval */}
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-4 py-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <p className="text-sm font-medium text-gray-800 dark:text-gray-100">Episode capture interval</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
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
              className="w-24 text-sm border border-gray-300 dark:border-gray-600 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
            />
            <span className="text-xs text-gray-500 dark:text-gray-400">min</span>
          </div>
        </div>
      </div>

      {/* Scene grouping window */}
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-4 py-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <p className="text-sm font-medium text-gray-800 dark:text-gray-100">Scene grouping window</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
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
              className="w-24 text-sm border border-gray-300 dark:border-gray-600 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
            />
            <span className="text-xs text-gray-500 dark:text-gray-400">sec</span>
          </div>
        </div>
      </div>

      {/* Episode minimum events */}
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-4 py-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <p className="text-sm font-medium text-gray-800 dark:text-gray-100">Episode minimum events</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
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
              className="w-24 text-sm border border-gray-300 dark:border-gray-600 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
            />
            <span className="text-xs text-gray-500 dark:text-gray-400">events</span>
          </div>
        </div>
      </div>

      {/* ── Notifications ── */}
      <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500 pt-3">
        Notifications
      </h3>
      {/* Toast notifications */}
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-4 py-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <p className="text-sm font-medium text-gray-800 dark:text-gray-100">Toast notifications</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              Show brief popup messages for saves, deletes, and other actions.
            </p>
          </div>
          <label className="inline-flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
            <input
              type="checkbox"
              checked={toastsEnabledInput}
              onChange={(e) => { setToastsEnabledInput(e.target.checked); setSaveFeedback(null); }}
              disabled={savePending}
            />
            <span>{toastsEnabledInput ? 'On' : 'Off'}</span>
          </label>
        </div>
      </div>

      {/* Live event toasts */}
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-4 py-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <p className="text-sm font-medium text-gray-800 dark:text-gray-100">Live event toasts</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              Show a popup when selected accessories report events. Only appears when you're not on the Timeline tab.
            </p>
          </div>
          <label className={clsx('inline-flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300', !toastsEnabledInput && 'opacity-50 cursor-not-allowed')}>
            <input
              type="checkbox"
              checked={liveEventToastsEnabledInput}
              onChange={(e) => { setLiveEventToastsEnabledInput(e.target.checked); setSaveFeedback(null); }}
              disabled={!toastsEnabledInput || savePending}
            />
            <span>{liveEventToastsEnabledInput ? 'On' : 'Off'}</span>
          </label>
        </div>
        {liveEventToastsEnabledInput && !(retentionConfig?.toastAccessories?.length > 0) && (
          <p className="text-xs text-amber-600 dark:text-amber-400 mt-2">
            Select accessories to watch on the My Devices tab.
          </p>
        )}
      </div>

      {/* Toast position */}
      <div className={clsx('bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-4 py-3', !toastsEnabledInput && 'opacity-50 pointer-events-none')}>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <p className="text-sm font-medium text-gray-800 dark:text-gray-100">Toast position</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              Which corner of the screen to show toast popups.
            </p>
          </div>
          <select
            value={toastPositionInput}
            onChange={(e) => { setToastPositionInput(e.target.value); setSaveFeedback(null); }}
            className="text-sm rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-200 px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="bottom-right">Bottom Right</option>
            <option value="top-right">Top Right</option>
            <option value="bottom-left">Bottom Left</option>
            <option value="top-left">Top Left</option>
          </select>
        </div>
      </div>

      {/* Toast duration */}
      <div className={clsx('bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-4 py-3', !toastsEnabledInput && 'opacity-50 pointer-events-none')}>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <p className="text-sm font-medium text-gray-800 dark:text-gray-100">Toast duration</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              How long each toast stays visible before auto-dismissing.
            </p>
          </div>
          <select
            value={toastDurationInput}
            onChange={(e) => { setToastDurationInput(Number(e.target.value)); setSaveFeedback(null); }}
            className="text-sm rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-200 px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value={2}>2 seconds</option>
            <option value={3}>3 seconds</option>
            <option value={5}>5 seconds</option>
            <option value={7}>7 seconds</option>
          </select>
        </div>
      </div>

      {/* Toast max visible */}
      <div className={clsx('bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-4 py-3', !toastsEnabledInput && 'opacity-50 pointer-events-none')}>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <p className="text-sm font-medium text-gray-800 dark:text-gray-100">Max visible toasts</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              Maximum number of toasts that can stack on screen at once.
            </p>
          </div>
          <select
            value={toastMaxVisibleInput}
            onChange={(e) => { setToastMaxVisibleInput(Number(e.target.value)); setSaveFeedback(null); }}
            className="text-sm rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-200 px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value={1}>1</option>
            <option value={2}>2</option>
            <option value={3}>3</option>
            <option value={5}>5</option>
          </select>
        </div>
      </div>

      {/* — Advanced — */}
      <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500 pt-3">Advanced</h3>

      {/* Log level */}
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-4 py-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <p className="text-sm font-medium text-gray-800 dark:text-gray-100">Log level</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              Controls how much the listener logs to Docker output. Changes apply instantly — no restart needed.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={logLevelInput}
              onChange={(e) => { setLogLevelInput(e.target.value); setSaveFeedback(null); }}
              disabled={savePending}
              className="text-sm border border-gray-300 dark:border-gray-600 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
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
          <p className="text-xs text-red-600 dark:text-red-400 mt-2">
            Could not update log level: {saveLogLevelMutation.error?.message}
          </p>
        )}
      </div>

      {saveRetentionMutation.isError && (
        <p className="text-xs text-red-600 dark:text-red-400">
          Could not save settings: {saveRetentionMutation.error?.message}
        </p>
      )}

      {/* Sticky save bar */}
      <div
        className={clsx(
          'sticky bottom-0 z-30 transition-all duration-300 -mx-4 px-4 hc-standalone:bottom-16',
          isDirty ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2 pointer-events-none',
        )}
      >
        <div className="bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm border border-gray-200 dark:border-gray-700 rounded-lg px-4 py-2.5 shadow-lg flex items-center justify-between gap-3">
          <span className="text-xs text-gray-500 dark:text-gray-400">
            {saveFeedback === 'saved'
              ? <span className="inline-flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400"><CheckCircle2 size={14} /> Saved</span>
              : 'You have unsaved changes'}
          </span>
          <button
            onClick={handleSaveSettings}
            disabled={savePending || !inputsReady || !isDirty}
            className="px-4 py-1.5 text-xs font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {savePending ? 'Saving\u2026' : 'Save settings'}
          </button>
        </div>
      </div>

      {/* Danger Zone */}
      <section className="border border-red-200 dark:border-red-800 rounded-xl overflow-hidden">
        <button
          onClick={() => setDangerOpen((o) => !o)}
          className="w-full flex items-center justify-between px-4 py-3 bg-red-50 dark:bg-red-900/20 text-sm font-medium text-red-700 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors"
        >
          <span className="flex items-center gap-2">
            <AlertTriangle size={14} />
            Danger Zone — delete accessory data
          </span>
          <ChevronDown
            size={14}
            className={clsx('transition-transform duration-200', dangerOpen && 'rotate-180')}
          />
        </button>

        {dangerOpen && (
          <div className="bg-white dark:bg-gray-800">
            <p className="px-4 py-3 text-xs text-gray-500 dark:text-gray-400 border-b border-gray-100 dark:border-gray-700">
              Delete stored event history for individual accessories, or wipe everything.
              This only removes logged data — it does not unpair accessories.
            </p>

            {dbAccessories.length > 0 && (
              <div className="px-4 py-2 border-b border-gray-100 dark:border-gray-700">
                <div className="inline-flex items-center gap-1 rounded-lg bg-gray-50 dark:bg-gray-800/50 p-1">
                  {[
                    { key: 'all', label: `All (${dbAccessories.length})`, color: 'text-gray-700 dark:text-gray-300' },
                    { key: 'paired', label: `Paired (${dangerPairedCount})`, color: 'text-emerald-700 dark:text-emerald-400' },
                    { key: 'unpaired', label: `No longer paired (${dangerUnpairedCount})`, color: 'text-red-700 dark:text-red-400' },
                  ].map(({ key, label, color }) => (
                    <button
                      key={key}
                      onClick={() => { setDangerPairFilter(key); setConfirmDeleteAccessory(null); }}
                      className={clsx(
                        'px-2 py-1 text-xs rounded transition-colors',
                        dangerPairFilter === key
                          ? `bg-white dark:bg-gray-700 ${color} shadow-sm`
                          : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300',
                      )}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {dbAccessories.length === 0 ? (
              <p className="px-4 py-4 text-xs text-gray-400 dark:text-gray-500 italic">No accessory data in the database.</p>
            ) : visibleDangerAccessories.length === 0 ? (
              <p className="px-4 py-4 text-xs text-gray-400 dark:text-gray-500 italic">No accessories match this filter.</p>
            ) : (
              <div className="divide-y divide-gray-100 dark:divide-gray-700">
                {visibleDangerAccessories.map((acc) => {
                  const isConfirming = confirmDeleteAccessory === acc.accessory_id;
                  const isDeleting = deleteAccessoryMutation.isPending && isConfirming;
                  const isCurrentlyPaired = Boolean(acc.paired_at);
                  return (
                    <div key={acc.accessory_id} className="flex items-center gap-3 px-4 py-2.5">
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-gray-800 dark:text-gray-100 truncate">{acc.accessory_name}</div>
                        <div className="text-xs text-gray-400 dark:text-gray-500 flex items-center gap-1.5 flex-wrap">
                          {acc.service_type ?? 'No events yet'}
                          {acc.room_name && <span className="ml-1">&middot; {acc.room_name}</span>}
                          <span
                            className={clsx(
                              'ml-1 inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium border',
                              isCurrentlyPaired
                                ? 'text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 border-emerald-100 dark:border-emerald-800'
                                : 'text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border-red-100 dark:border-red-800',
                            )}
                          >
                            {isCurrentlyPaired ? 'Currently paired' : 'No longer paired'}
                          </span>
                        </div>
                      </div>
                      {isConfirming ? (
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <span className="text-xs text-gray-500 dark:text-gray-400">Delete history? This cannot be undone.</span>
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
                            className="text-xs px-2 py-1 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setConfirmDeleteAccessory(acc.accessory_id)}
                          className="flex-shrink-0 text-xs text-red-400 hover:text-red-600 dark:hover:text-red-300 hover:bg-red-50 dark:hover:bg-red-900/20 px-2 py-1 rounded transition-colors"
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
            <div className="border-t border-red-100 dark:border-red-800 bg-red-50/50 dark:bg-red-900/20 px-4 py-4">
              <p className="text-xs font-medium text-red-700 dark:text-red-400 mb-2">
                Wipe all event data — type <code className="bg-red-100 dark:bg-red-900/30 px-1 rounded">DELETE</code> to confirm
              </p>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Type DELETE to confirm"
                  value={wipeConfirmText}
                  onChange={(e) => setWipeConfirmText(e.target.value)}
                  className="flex-1 text-xs border border-red-200 dark:border-red-700 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-red-400 bg-white dark:bg-gray-700 dark:text-gray-100 placeholder-red-200 dark:placeholder-red-600"
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
    </div>
  );
}
