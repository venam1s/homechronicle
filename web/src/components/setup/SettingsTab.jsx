import { useState, useEffect } from 'react';
import { AlertTriangle, CheckCircle2, ChevronDown, Loader, X } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';

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

  const queryClient = useQueryClient();
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
    } catch {
      setSaveFeedback('error');
    }
  }

  async function handleWipeAll() {
    if (wipeConfirmText !== 'DELETE') return;
    setWipePending(true);
    try {
      const { fetchJson } = await import('../../lib/api.js');
      await fetchJson('/api/data/all', { method: 'DELETE' });
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
      <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-400 pt-1">Data</h3>

      {/* Retention cutoff */}
      <div className="bg-white border border-gray-200 rounded-lg px-4 py-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <p className="text-sm font-medium text-gray-800">Retention cutoff</p>
            <p className="text-xs text-gray-500 mt-0.5">
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
              className="w-24 text-sm border border-gray-300 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <span className="text-xs text-gray-500">days</span>
          </div>
        </div>
        <p className="text-[11px] text-gray-400 mt-2">
          Changes apply without restart. Sweep interval is every 24 hours by default.
        </p>
      </div>

      {/* Archive before delete */}
      <div className="bg-white border border-gray-200 rounded-lg px-4 py-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <p className="text-sm font-medium text-gray-800">Archive before delete</p>
            <p className="text-xs text-gray-500 mt-0.5">
              Copy expired events to the archive table before removing them from the main table.
            </p>
          </div>
          <label className="inline-flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={archiveBeforeDeleteInput}
              onChange={(e) => { setArchiveBeforeDeleteInput(e.target.checked); setSaveFeedback(null); }}
              disabled={savePending}
            />
            <span>{archiveBeforeDeleteInput ? 'On' : 'Off'}</span>
          </label>
        </div>
        <p className="text-[11px] text-gray-400 mt-2">
          When off, expired events are permanently deleted during retention sweep.
        </p>
      </div>

      {/* Stale accessory threshold */}
      <div className="bg-white border border-gray-200 rounded-lg px-4 py-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <p className="text-sm font-medium text-gray-800">Stale accessory threshold</p>
            <p className="text-xs text-gray-500 mt-0.5">
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
              className="w-24 text-sm border border-gray-300 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <span className="text-xs text-gray-500">hours</span>
          </div>
        </div>
      </div>

      {/* HomeKit auto-scan */}
      <div className="bg-white border border-gray-200 rounded-lg px-4 py-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <p className="text-sm font-medium text-gray-800">HomeKit auto-scan</p>
            <p className="text-xs text-gray-500 mt-0.5">
              Automatically scan for HomeKit accessories every hour in the background.
            </p>
          </div>
          <label className="inline-flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={autoScanHomeKitInput}
              onChange={(e) => { setAutoScanHomeKitInput(e.target.checked); setSaveFeedback(null); }}
              disabled={savePending}
            />
            <span>{autoScanHomeKitInput ? 'On' : 'Off'}</span>
          </label>
        </div>
        <p className="text-[11px] text-gray-400 mt-2">
          Manual scans from Add Accessories still work when this is off.
        </p>
      </div>

      {/* — Alerts — */}
      <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-400 pt-3">Alerts</h3>

      {/* Quiet hours */}
      <div className="bg-white border border-gray-200 rounded-lg px-4 py-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <p className="text-sm font-medium text-gray-800">Quiet hours</p>
            <p className="text-xs text-gray-500 mt-0.5">
              Flag accessory activity during this window as unexpected on the dashboard.
            </p>
          </div>
          <label className="inline-flex items-center gap-2 text-sm text-gray-700">
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
            <span className="text-xs text-gray-500">From</span>
            <select
              value={quietHoursStartInput}
              onChange={(e) => { setQuietHoursStartInput(Number(e.target.value)); setSaveFeedback(null); }}
              disabled={savePending || !quietHoursEnabledInput}
              className="text-sm border border-gray-300 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {HOURS_OPTIONS.map(({ value, label }) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500">to</span>
            <select
              value={quietHoursEndInput}
              onChange={(e) => { setQuietHoursEndInput(Number(e.target.value)); setSaveFeedback(null); }}
              disabled={savePending || !quietHoursEnabledInput}
              className="text-sm border border-gray-300 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {HOURS_OPTIONS.map(({ value, label }) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </div>
        </div>
        {/* Excluded accessories */}
        {(retentionConfig?.quietHoursExcludedAccessories ?? []).length > 0 && (
          <div className="mt-3 pt-3 border-t border-gray-100">
            <p className="text-xs text-gray-500 mb-2">Excluded from quiet hours:</p>
            <div className="flex flex-wrap gap-1.5">
              {retentionConfig.quietHoursExcludedAccessories.map((id) => (
                <span key={id} className="inline-flex items-center gap-1 text-xs bg-gray-100 text-gray-600 rounded-full px-2.5 py-1">
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
                    className="p-0.5 rounded-full hover:bg-gray-200 transition-colors"
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
      <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-400 pt-3">Timeline</h3>

      {/* Episode capture interval */}
      <div className="bg-white border border-gray-200 rounded-lg px-4 py-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <p className="text-sm font-medium text-gray-800">Episode capture interval</p>
            <p className="text-xs text-gray-500 mt-0.5">
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
              className="w-24 text-sm border border-gray-300 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <span className="text-xs text-gray-500">min</span>
          </div>
        </div>
      </div>

      {/* Scene grouping window */}
      <div className="bg-white border border-gray-200 rounded-lg px-4 py-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <p className="text-sm font-medium text-gray-800">Scene grouping window</p>
            <p className="text-xs text-gray-500 mt-0.5">
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
              className="w-24 text-sm border border-gray-300 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <span className="text-xs text-gray-500">sec</span>
          </div>
        </div>
      </div>

      {/* Episode minimum events */}
      <div className="bg-white border border-gray-200 rounded-lg px-4 py-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <p className="text-sm font-medium text-gray-800">Episode minimum events</p>
            <p className="text-xs text-gray-500 mt-0.5">
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
              className="w-24 text-sm border border-gray-300 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <span className="text-xs text-gray-500">events</span>
          </div>
        </div>
      </div>

      {/* — Advanced — */}
      <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-400 pt-3">Advanced</h3>

      {/* Log level */}
      <div className="bg-white border border-gray-200 rounded-lg px-4 py-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <p className="text-sm font-medium text-gray-800">Log level</p>
            <p className="text-xs text-gray-500 mt-0.5">
              Controls how much the listener logs to Docker output. Changes apply instantly — no restart needed.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={logLevelInput}
              onChange={(e) => { setLogLevelInput(e.target.value); setSaveFeedback(null); }}
              disabled={savePending}
              className="text-sm border border-gray-300 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
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
          <p className="text-xs text-red-600 mt-2">
            Could not update log level: {saveLogLevelMutation.error?.message}
          </p>
        )}
      </div>

      <div className="bg-white border border-gray-200 rounded-lg px-4 py-3">
        <div className="flex items-center justify-end gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            {saveFeedback === 'saved' && (
              <span className="inline-flex items-center gap-1.5 text-xs text-emerald-700">
                <CheckCircle2 size={14} />
                Settings saved
              </span>
            )}
            <button
              onClick={handleSaveSettings}
              disabled={savePending || !inputsReady || !isDirty}
              className="px-3 py-1.5 text-xs font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {savePending ? 'Saving\u2026' : 'Save settings'}
            </button>
          </div>
        </div>
      </div>

      {saveRetentionMutation.isError && (
        <p className="text-xs text-red-600">
          Could not save settings: {saveRetentionMutation.error?.message}
        </p>
      )}

      {/* Danger Zone */}
      <section className="border border-red-200 rounded-xl overflow-hidden">
        <button
          onClick={() => setDangerOpen((o) => !o)}
          className="w-full flex items-center justify-between px-4 py-3 bg-red-50 text-sm font-medium text-red-700 hover:bg-red-100 transition-colors"
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
          <div className="bg-white">
            <p className="px-4 py-3 text-xs text-gray-500 border-b border-gray-100">
              Delete stored event history for individual accessories, or wipe everything.
              This only removes logged data — it does not unpair accessories.
            </p>

            {dbAccessories.length > 0 && (
              <div className="px-4 py-2 border-b border-gray-100">
                <div className="inline-flex items-center gap-1 rounded-lg bg-gray-50 p-1">
                  {[
                    { key: 'all', label: `All (${dbAccessories.length})`, color: 'text-gray-700' },
                    { key: 'paired', label: `Paired (${dangerPairedCount})`, color: 'text-emerald-700' },
                    { key: 'unpaired', label: `No longer paired (${dangerUnpairedCount})`, color: 'text-red-700' },
                  ].map(({ key, label, color }) => (
                    <button
                      key={key}
                      onClick={() => { setDangerPairFilter(key); setConfirmDeleteAccessory(null); }}
                      className={clsx(
                        'px-2 py-1 text-xs rounded transition-colors',
                        dangerPairFilter === key
                          ? `bg-white ${color} shadow-sm`
                          : 'text-gray-500 hover:text-gray-700',
                      )}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {dbAccessories.length === 0 ? (
              <p className="px-4 py-4 text-xs text-gray-400 italic">No accessory data in the database.</p>
            ) : visibleDangerAccessories.length === 0 ? (
              <p className="px-4 py-4 text-xs text-gray-400 italic">No accessories match this filter.</p>
            ) : (
              <div className="divide-y divide-gray-100">
                {visibleDangerAccessories.map((acc) => {
                  const isConfirming = confirmDeleteAccessory === acc.accessory_id;
                  const isDeleting = deleteAccessoryMutation.isPending && isConfirming;
                  const isCurrentlyPaired = Boolean(acc.paired_at);
                  return (
                    <div key={acc.accessory_id} className="flex items-center gap-3 px-4 py-2.5">
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-gray-800 truncate">{acc.accessory_name}</div>
                        <div className="text-xs text-gray-400 flex items-center gap-1.5 flex-wrap">
                          {acc.service_type ?? 'No events yet'}
                          {acc.room_name && <span className="ml-1">&middot; {acc.room_name}</span>}
                          <span
                            className={clsx(
                              'ml-1 inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium border',
                              isCurrentlyPaired
                                ? 'text-emerald-700 bg-emerald-50 border-emerald-100'
                                : 'text-red-700 bg-red-50 border-red-100',
                            )}
                          >
                            {isCurrentlyPaired ? 'Currently paired' : 'No longer paired'}
                          </span>
                        </div>
                      </div>
                      {isConfirming ? (
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <span className="text-xs text-gray-500">Delete history? This cannot be undone.</span>
                          <button
                            onClick={() => deleteAccessoryMutation.mutate(acc.accessory_id, {
                              onSuccess: () => setConfirmDeleteAccessory(null),
                            })}
                            disabled={isDeleting}
                            className="text-xs px-2 py-1 bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50 transition-colors"
                          >
                            {isDeleting ? 'Deleting\u2026' : 'Yes, delete'}
                          </button>
                          <button
                            onClick={() => setConfirmDeleteAccessory(null)}
                            disabled={isDeleting}
                            className="text-xs px-2 py-1 bg-gray-100 text-gray-600 rounded hover:bg-gray-200 transition-colors"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setConfirmDeleteAccessory(acc.accessory_id)}
                          className="flex-shrink-0 text-xs text-red-400 hover:text-red-600 hover:bg-red-50 px-2 py-1 rounded transition-colors"
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
            <div className="border-t border-red-100 bg-red-50/50 px-4 py-4">
              <p className="text-xs font-medium text-red-700 mb-2">
                Wipe all event data — type <code className="bg-red-100 px-1 rounded">DELETE</code> to confirm
              </p>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Type DELETE to confirm"
                  value={wipeConfirmText}
                  onChange={(e) => setWipeConfirmText(e.target.value)}
                  className="flex-1 text-xs border border-red-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-red-400 bg-white placeholder-red-200"
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
