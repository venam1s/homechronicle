import { useState, useEffect, useCallback } from 'react';
import { AlertTriangle, ChevronDown, Loader, Loader2, Trash2 } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { useToast } from '../Toast.jsx';

const LOG_LEVELS = [
  { value: 'error', label: 'Error', desc: 'Only errors' },
  { value: 'warn', label: 'Warn', desc: 'Errors + warnings' },
  { value: 'info', label: 'Info', desc: 'Operational logs (default)' },
  { value: 'debug', label: 'Debug', desc: 'Everything, including skipped events' },
];

export default function AdminAdvancedSection({ setup }) {
  const {
    logLevelConfig,
    saveLogLevelMutation,
    dbAccessories,
    deleteAccessoryMutation,
    paired,
    matterPairings,
    deletePairingMutation,
    deleteMatterPairingMutation,
    retentionConfig,
  } = setup;

  const { addToast } = useToast();
  const queryClient = useQueryClient();

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

  const logLevelCurrent = logLevelConfig?.level ?? 'info';
  const dangerPairedCount = dbAccessories.filter((a) => Boolean(a.paired_at)).length;
  const dangerUnpairedCount = dbAccessories.length - dangerPairedCount;
  const visibleDangerAccessories = dbAccessories.filter((a) => {
    if (dangerPairFilter === 'paired') return Boolean(a.paired_at);
    if (dangerPairFilter === 'unpaired') return !a.paired_at;
    return true;
  });

  useEffect(() => {
    setLogLevelInput(logLevelCurrent);
  }, [logLevelCurrent]);

  async function handleLogLevelChange(v) {
    setLogLevelInput(v);
    try {
      await saveLogLevelMutation.mutateAsync(v);
      if (retentionConfig?.toastsEnabled !== false) {
        addToast('Setting saved', 'success');
      }
    } catch {
      addToast('Failed to save setting', 'error');
      queryClient.invalidateQueries({ queryKey: ['setup', 'log-level'] });
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
              onChange={(e) => handleLogLevelChange(e.target.value)}
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
            <div className="border-b border-hc-panel-border">
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
                              {isDeleting ? 'Removing…' : 'Yes, remove'}
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
                              {isDeleting ? 'Removing…' : 'Yes, remove'}
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
            <p className="px-4 pb-2 text-xs text-hc-muted border-b border-hc-panel-border">
              Delete stored event history for individual accessories, or wipe everything.
              This only removes logged data — it does not unpair accessories.
            </p>

            {dbAccessories.length > 0 && (
              <div className="px-4 py-2 border-b border-hc-panel-border">
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
                            {isDeleting ? 'Deleting…' : 'Yes, delete'}
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
    </div>
  );
}
