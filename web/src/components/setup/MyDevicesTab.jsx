import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Bell, BellOff, Check, CheckCircle, ChevronDown, MapPin, FileText, AlertCircle, Pencil, Wrench, Loader2 } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { fetchJson } from '../../lib/api.js';
import { CATEGORY_LABELS } from './constants.js';
import BridgeChildrenRow from './BridgeChildrenRow.jsx';
import { useToast } from '../Toast.jsx';
import PairingHealthBanner from '../PairingHealthBanner.jsx';
import RepairFlow from './RepairFlow.jsx';

function RoomAutocomplete({ value, onChange, onBlur, onKeyDown, rooms, placeholder, className }) {
  const [open, setOpen] = useState(false);
  const [focused, setFocused] = useState(false);
  const wrapperRef = useRef(null);
  const filtered = rooms.filter((r) => r.toLowerCase().includes((value ?? '').toLowerCase()) && r !== value);

  useEffect(() => {
    const handler = (e) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div ref={wrapperRef} className="relative">
      <input
        type="text"
        placeholder={placeholder}
        value={value}
        onChange={(e) => { onChange(e); setOpen(true); }}
        onFocus={() => { setFocused(true); setOpen(true); }}
        onBlur={(e) => { setFocused(false); setTimeout(() => setOpen(false), 150); onBlur?.(e); }}
        onKeyDown={onKeyDown}
        className={className}
      />
      {open && focused && filtered.length > 0 && (
        <ul className="absolute z-50 mt-0.5 left-0 w-40 max-h-40 overflow-y-auto rounded border border-hc-panel-border bg-hc-panel-mid shadow-lg text-xs">
          {filtered.map((room) => (
            <li
              key={room}
              className="px-2 py-1 cursor-pointer text-hc-fg hover:bg-blue-50 "
              onMouseDown={(e) => { e.preventDefault(); onChange({ target: { value: room } }); setOpen(false); }}
            >
              {room}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function summarizeMatterError(raw) {
  const text = String(raw ?? '').trim();
  if (!text) return '';
  const firstLine = text.split(/\r?\n/).find((line) => line.trim()) ?? text;
  return firstLine.length > 140 ? `${firstLine.slice(0, 140)}...` : firstLine;
}

export default function MyDevicesTab({ setup }) {
  const {
    paired,
    matterPairings,
    dbAccessories,
    savedRooms,
    roomInputs,
    setRoomInputs,
    handleRoomBlur,
    savedNotes,
    noteInputs,
    setNoteInputs,
    handleNoteBlur,
    savedDisplayNames,
    displayNameInputs,
    setDisplayNameInputs,
    handleDisplayNameBlur,
    matterRuntime,
    retentionConfig,
    saveRetentionMutation,
  } = setup;

  const { addToast } = useToast();
  const queryClient = useQueryClient();

  const [expandedBridges, setExpandedBridges] = useState(new Set());
  const [expandedMatterEndpoints, setExpandedMatterEndpoints] = useState(new Set());
  const [expandedMatterErrors, setExpandedMatterErrors] = useState(new Set());
  const [savedFlash, setSavedFlash] = useState({});
  const [repairingDevice, setRepairingDevice] = useState(null);
  const [repairAllState, setRepairAllState] = useState({ phase: 'idle' });
  const repairAllTimerRef = useRef(null);

  useEffect(() => () => clearTimeout(repairAllTimerRef.current), []);

  const flashSave = useCallback((key) => {
    setSavedFlash((prev) => ({ ...prev, [key]: true }));
    setTimeout(() => setSavedFlash((prev) => { const next = { ...prev }; delete next[key]; return next; }), 1200);
  }, []);

  const handleRepairAll = useCallback(async () => {
    const devices = [...paired];
    const total = devices.length;
    if (total === 0) return;

    setRepairAllState({ phase: 'running', current: 0, total, results: [] });

    const results = [];
    for (let i = 0; i < devices.length; i++) {
      setRepairAllState((s) => ({ ...s, current: i + 1 }));
      try {
        await fetchJson(`/api/setup/repair/${encodeURIComponent(devices[i].id)}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        });
        results.push({ id: devices[i].id, name: devices[i].name, status: 'ok' });
      } catch (err) {
        let code;
        try { code = JSON.parse(err.message)?.code; } catch {}
        const isSkip = code === 'NO_PIN' || code === 'WRONG_PIN';
        results.push({ id: devices[i].id, name: devices[i].name, status: isSkip ? 'skipped' : 'failed', error: err.message });
      }
    }

    queryClient.invalidateQueries({ queryKey: ['pairings'] });
    queryClient.invalidateQueries({ queryKey: ['accessories'] });
    queryClient.invalidateQueries({ queryKey: ['health'] });

    const ok = results.filter((r) => r.status === 'ok').length;
    const skipped = results.filter((r) => r.status === 'skipped').length;
    const failed = results.filter((r) => r.status === 'failed').length;

    setRepairAllState({ phase: 'done', ok, skipped, failed, results });

    const parts = [`${ok} OK`];
    if (skipped) parts.push(`${skipped} skipped`);
    if (failed) parts.push(`${failed} failed`);
    addToast(`Repair All: ${parts.join(', ')}`, failed ? 'error' : 'success');

    clearTimeout(repairAllTimerRef.current);
    repairAllTimerRef.current = setTimeout(() => setRepairAllState({ phase: 'idle' }), 5000);
  }, [paired, queryClient, addToast]);


  const onRoomBlurWithFlash = useCallback((id) => {
    handleRoomBlur(id);
    flashSave(`room-${id}`);
    if (retentionConfig?.toastsEnabled !== false) {
      addToast('Room saved', 'success');
    }
  }, [handleRoomBlur, flashSave, retentionConfig?.toastsEnabled, addToast]);

  const onNoteBlurWithFlash = useCallback((id) => {
    handleNoteBlur(id);
    flashSave(`note-${id}`);
  }, [handleNoteBlur, flashSave]);

  const onDisplayNameBlurWithFlash = useCallback((id) => {
    handleDisplayNameBlur(id);
    flashSave(`name-${id}`);
    if (retentionConfig?.toastsEnabled !== false) {
      addToast('Name saved', 'success');
    }
  }, [handleDisplayNameBlur, flashSave, retentionConfig?.toastsEnabled, addToast]);

  const toggleToastAccessory = useCallback((accessoryId) => {
    const current = retentionConfig?.toastAccessories ?? [];
    const next = current.includes(accessoryId)
      ? current.filter((id) => id !== accessoryId)
      : [...current, accessoryId];
    saveRetentionMutation.mutate({ toastAccessories: next });
  }, [retentionConfig?.toastAccessories, saveRetentionMutation]);

  const uniqueRooms = useMemo(
    () => [...new Set(Object.values(savedRooms).map((r) => r?.trim()).filter(Boolean))].sort(),
    [savedRooms],
  );

  const totalCount = paired.length + matterPairings.length;
  const matterNodes = Array.isArray(matterRuntime?.nodes) ? matterRuntime.nodes : [];
  const accessories = Array.isArray(dbAccessories) ? dbAccessories : [];

  // Build a lookup of reliability/health per bridge ID from dbAccessories
  const deviceStatus = useMemo(() => {
    const map = {};
    for (const acc of accessories) {
      const bridgeId = acc.bridge_id ?? acc.accessory_id;
      if (!map[bridgeId]) {
        map[bridgeId] = {
          needsRepair: acc.reliability?.needs_repair ?? false,
          healthStatus: acc.health?.status ?? 'unknown',
          isStale: acc.health?.isStale ?? false,
        };
      }
      // If any child signals needsRepair, propagate to bridge
      if (acc.reliability?.needs_repair) map[bridgeId].needsRepair = true;
      if (acc.health?.isStale) { map[bridgeId].isStale = true; map[bridgeId].healthStatus = 'stale'; }
    }
    return map;
  }, [accessories]);

  const devicesWithoutRoom = [
    ...paired.filter((acc) => acc.category !== 2 && !savedRooms[acc.id]?.trim()),
    ...matterPairings.filter((p) => !savedRooms[p.nodeId ?? p.id]?.trim()),
  ];

  const repairAllNonOk = repairAllState.results?.filter((r) => r.status !== 'ok') ?? [];
  const repairAllFailureDetails = repairAllNonOk.length > 0 ? (
    <div className="text-[11px] text-hc-muted pl-1">
      {repairAllNonOk.some((r) => r.status === 'skipped') && (
        <p>Skipped: {repairAllNonOk.filter((r) => r.status === 'skipped').map((r) => r.name).join(', ')} (use per-device repair)</p>
      )}
      {repairAllNonOk.some((r) => r.status === 'failed') && (
        <p>Failed: {repairAllNonOk.filter((r) => r.status === 'failed').map((r) => r.name).join(', ')}</p>
      )}
    </div>
  ) : null;

  if (totalCount === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-hc-muted text-center">
        <CheckCircle size={32} className="mb-3 opacity-40" />
        <p className="font-medium">No accessories yet</p>
        <p className="text-sm mt-1 max-w-xs">
          Go to the Add Accessories tab to scan for HomeKit accessories or add a Matter accessory.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <PairingHealthBanner />
      <p className="text-xs font-semibold uppercase tracking-wider text-hc-muted">
        {totalCount} accessor{totalCount !== 1 ? 'ies' : 'y'}
      </p>

      {devicesWithoutRoom.length > 0 && (
        <div className="flex items-start gap-2 rounded-lg bg-hc-warning-bg border border-hc-warning-border px-3 py-2.5">
          <AlertCircle size={15} className="text-amber-500 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-amber-800 ">
            {devicesWithoutRoom.length === 1
              ? '1 accessory doesn\u2019t have a room assigned yet.'
              : `${devicesWithoutRoom.length} accessories don\u2019t have rooms assigned yet.`}{' '}
            Set a room name below so events are grouped correctly.
          </p>
        </div>
      )}

      {/* ── Toolbar ──────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-3 justify-end">
        {paired.length > 0 && (
          <div className="flex flex-col gap-1">
            <button
              onClick={handleRepairAll}
              disabled={repairAllState.phase !== 'idle'}
              className={clsx(
                'flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border transition-colors',
                repairAllState.phase === 'done'
                  ? 'bg-hc-success-bg text-hc-success-text border-hc-success-border'
                  : 'bg-hc-warning-bg text-hc-warning-text border-hc-warning-border',
                repairAllState.phase === 'idle' && 'hover:bg-hc-warning-bg cursor-pointer',
                'disabled:opacity-40 disabled:cursor-not-allowed',
              )}
            >
              {repairAllState.phase === 'running' ? (
                <>
                  <Loader2 size={13} className="animate-spin" />
                  Repairing {repairAllState.current}/{repairAllState.total}...
                </>
              ) : repairAllState.phase === 'done' ? (
                <>
                  {repairAllState.ok} OK{repairAllState.skipped ? `, ${repairAllState.skipped} skipped` : ''}{repairAllState.failed ? `, ${repairAllState.failed} failed` : ''}
                </>
              ) : (
                <>
                  <Wrench size={13} />
                  Repair All
                </>
              )}
            </button>
            {repairAllState.phase === 'done' && repairAllState.results && repairAllFailureDetails}
          </div>
        )}

        {/* Live Toasts toggle */}
        <button
          onClick={() => {
            const next = !(retentionConfig?.liveEventToastsEnabled ?? false);
            saveRetentionMutation.mutate({ liveEventToastsEnabled: next });
            if (retentionConfig?.toastsEnabled !== false) {
              addToast(next ? 'Live toasts enabled' : 'Live toasts disabled', 'success');
            }
          }}
          className={clsx(
            'flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border transition-colors',
            retentionConfig?.liveEventToastsEnabled
              ? 'bg-hc-accent-soft text-blue-700  border-hc-panel-border hover:bg-blue-100 '
              : 'bg-hc-panel-soft text-hc-muted border-hc-panel-border hover:bg-hc-panel-mid',
          )}
        >
          {retentionConfig?.liveEventToastsEnabled ? <Bell size={13} /> : <BellOff size={13} />}
          Live Toasts {retentionConfig?.liveEventToastsEnabled ? 'On' : 'Off'}
        </button>
      </div>

      <div className="bg-hc-panel rounded-xl shadow-sm divide-y divide-hc-panel-border">

        {/* HomeKit paired accessories */}
        {paired.map((acc) => {
          const roomVal = roomInputs[acc.id] ?? savedRooms[acc.id] ?? '';
          return (
            <div key={acc.id} className="px-4 py-3">
              <div className="flex items-center gap-3">
                <CheckCircle size={18} className={clsx('flex-shrink-0', deviceStatus[acc.id]?.needsRepair ? 'text-red-500' : deviceStatus[acc.id]?.isStale ? 'text-amber-500' : 'text-green-500')} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1 min-w-0">
                      <Pencil size={10} className="text-hc-muted flex-shrink-0" />
                      <input
                        type="text"
                        placeholder={acc.name}
                        value={displayNameInputs[acc.id] ?? savedDisplayNames[acc.id] ?? ''}
                        onChange={(e) => setDisplayNameInputs((d) => ({ ...d, [acc.id]: e.target.value }))}
                        onBlur={() => onDisplayNameBlurWithFlash(acc.id)}
                        onKeyDown={(e) => e.key === 'Enter' && onDisplayNameBlurWithFlash(acc.id)}
                        className="font-medium text-hc-fg-strong text-sm bg-transparent border-0 border-b border-transparent hover:border-hc-panel-border focus:border-blue-400 focus:outline-none px-0 py-0 w-full truncate placeholder-hc-muted"
                      />
                      {savedFlash[`name-${acc.id}`] && <Check size={12} className="text-green-500 animate-save-flash flex-shrink-0" />}
                    </div>
                    <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-hc-accent-soft text-hc-accent-strong border border-hc-panel-border flex-shrink-0">
                      HomeKit
                    </span>
                  </div>
                  <div className="text-xs text-hc-muted">
                    {CATEGORY_LABELS[acc.category] ?? 'Unknown'} &middot; {acc.address}
                  </div>
                  <div className="flex items-center gap-1 mt-1.5">
                    <MapPin size={10} className="text-hc-muted flex-shrink-0" />
                    <RoomAutocomplete
                      placeholder="Add room name..."
                      value={roomVal}
                      rooms={uniqueRooms}
                      onChange={(e) => setRoomInputs((r) => ({ ...r, [acc.id]: e.target.value }))}
                      onBlur={() => onRoomBlurWithFlash(acc.id)}
                      onKeyDown={(e) => e.key === 'Enter' && onRoomBlurWithFlash(acc.id)}
                      className="text-xs border border-hc-panel-border bg-hc-panel-mid text-hc-fg-strong rounded px-2 py-0.5 w-36 focus:outline-none focus:ring-1 focus:ring-blue-400 placeholder-hc-muted"
                    />
                    {savedFlash[`room-${acc.id}`] && <Check size={12} className="text-green-500 animate-save-flash flex-shrink-0" />}
                  </div>
                  {acc.category !== 2 && (
                    <div className="flex items-center gap-1 mt-1">
                      <FileText size={10} className="text-hc-muted flex-shrink-0" />
                      <input
                        type="text"
                        placeholder="Add note..."
                        value={noteInputs[acc.id] ?? savedNotes[acc.id] ?? ''}
                        onChange={(e) => setNoteInputs((n) => ({ ...n, [acc.id]: e.target.value }))}
                        onBlur={() => onNoteBlurWithFlash(acc.id)}
                        onKeyDown={(e) => e.key === 'Enter' && onNoteBlurWithFlash(acc.id)}
                        className="text-xs border border-hc-panel-border bg-hc-panel-mid text-hc-fg-strong rounded px-2 py-0.5 w-48 focus:outline-none focus:ring-1 focus:ring-blue-400 placeholder-hc-muted"
                   />
                      {savedFlash[`note-${acc.id}`] && <Check size={12} className="text-green-500 animate-save-flash flex-shrink-0" />}
                    </div>
                  )}
                  {acc.category === 2 && roomVal && (
                    <p className="text-[10px] text-hc-muted mt-0.5 ml-3.5">
                      Child accessories without their own room inherit this.
                    </p>
                  )}
                  {acc.category === 2 && (
                    <button
                      onClick={() => setExpandedBridges((s) => {
                        const next = new Set(s);
                        next.has(acc.id) ? next.delete(acc.id) : next.add(acc.id);
                        return next;
                      })}
                      className="mt-1.5 flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 transition-colors"
                    >
                      <ChevronDown
                        size={11}
                        className={clsx('transition-transform duration-200', expandedBridges.has(acc.id) && 'rotate-180')}
                      />
                      {expandedBridges.has(acc.id) ? 'Hide' : 'Show'} child accessories
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-2 flex-shrink-0">
                    {(() => {
                      const ds = deviceStatus[acc.id];
                      if (ds?.needsRepair) return (
                        <span className="text-xs bg-hc-danger-bg text-hc-danger-text border border-hc-danger-border px-2 py-0.5 rounded-full">Needs Repair</span>
                      );
                      if (ds?.isStale) return (
                        <span className="text-xs bg-hc-warning-bg text-hc-warning-text border border-hc-warning-border px-2 py-0.5 rounded-full">Stale</span>
                      );
                      return (
                        <span className="text-xs bg-hc-success-bg text-hc-success-text border border-hc-success-border px-2 py-0.5 rounded-full">Logging</span>
                      );
                    })()}
                    <button
                      onClick={() => setRepairingDevice({ device: acc, bridgeId: acc.id })}
                      title="Repair pairing"
                      className="p-1.5 rounded-lg text-hc-muted hover:text-amber-500 hover:bg-amber-50 transition-colors"
                    >
                      <Wrench size={14} />
                    </button>
                    {retentionConfig?.liveEventToastsEnabled && (
                      <button
                        type="button"
                        onClick={() => toggleToastAccessory(acc.id)}
                        className="p-1 rounded hover:bg-hc-panel-mid transition-colors"
                        title={
                          (retentionConfig?.toastAccessories ?? []).includes(acc.id)
                            ? 'Disable live event toasts'
                            : 'Enable live event toasts'
                        }
                      >
                        {(retentionConfig?.toastAccessories ?? []).includes(acc.id)
                          ? <Bell size={14} className="text-blue-500" />
                          : <BellOff size={14} className="text-hc-muted" />
                        }
                      </button>
                    )}
                  </div>
              </div>
              {acc.category === 2 && (
                <BridgeChildrenRow
                  bridgeId={acc.id}
                  isExpanded={expandedBridges.has(acc.id)}
                  roomInputs={roomInputs}
                  savedRooms={savedRooms}
                  bridgeRoom={roomInputs[acc.id]?.trim() ?? savedRooms[acc.id]?.trim() ?? ''}
                  onRoomChange={(id, val) => setRoomInputs((r) => ({ ...r, [id]: val }))}
                  onRoomBlur={handleRoomBlur}
                  noteInputs={noteInputs}
                  savedNotes={savedNotes}
                  onNoteChange={(id, val) => setNoteInputs((n) => ({ ...n, [id]: val }))}
                  onNoteBlur={handleNoteBlur}
                />
              )}
            </div>
          );
        })}

        {/* Matter paired accessories */}
        {matterPairings.map((pairing) => {
          const nodeId = pairing.nodeId ?? pairing.id;
          const nodeStatus = matterNodes.find((n) => n.nodeId === nodeId);
          const roomVal = roomInputs[nodeId] ?? savedRooms[nodeId] ?? '';
          const endpointRows = accessories
            .filter((row) => row?.protocol === 'matter')
            .filter((row) => typeof row?.accessory_id === 'string')
            .filter((row) => row.accessory_id.startsWith(`${nodeId}:`))
            .sort((a, b) => a.accessory_id.localeCompare(b.accessory_id, undefined, { numeric: true }));
          const endpointCount = endpointRows.length;
          const isEndpointsExpanded = expandedMatterEndpoints.has(nodeId);
          const isErrorExpanded = expandedMatterErrors.has(nodeId);
          const errorSummary = summarizeMatterError(nodeStatus?.lastError);
          return (
            <div key={`matter-${nodeId}`} className="px-4 py-3">
              <div className="flex items-center gap-3">
                <CheckCircle size={18} className={clsx('flex-shrink-0', deviceStatus[nodeId]?.needsRepair ? 'text-red-500' : deviceStatus[nodeId]?.isStale ? 'text-amber-500' : 'text-green-500')} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1 min-w-0">
                      <Pencil size={10} className="text-hc-muted flex-shrink-0" />
                      <input
                        type="text"
                        placeholder={pairing.name ?? nodeId}
                        value={displayNameInputs[nodeId] ?? savedDisplayNames[nodeId] ?? ''}
                        onChange={(e) => setDisplayNameInputs((d) => ({ ...d, [nodeId]: e.target.value }))}
                        onBlur={() => onDisplayNameBlurWithFlash(nodeId)}
                        onKeyDown={(e) => e.key === 'Enter' && onDisplayNameBlurWithFlash(nodeId)}
                        className="font-medium text-hc-fg-strong text-sm bg-transparent border-0 border-b border-transparent hover:border-hc-panel-border focus:border-blue-400 focus:outline-none px-0 py-0 w-full truncate placeholder-hc-muted"
                      />
                      {savedFlash[`name-${nodeId}`] && <Check size={12} className="text-green-500 animate-save-flash flex-shrink-0" />}
                    </div>
                    <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-hc-success-bg text-hc-success-text border border-hc-success-border flex-shrink-0">
                      Matter
                    </span>
                  </div>
                  <div className="text-xs text-hc-muted">
                    {nodeId}
                    {pairing.address ? ` \u00b7 ${pairing.address}` : ''}
                    {pairing.port ? `:${pairing.port}` : ''}
                  </div>
                  <div className="flex items-center gap-1 mt-1.5">
                    <MapPin size={10} className="text-hc-muted flex-shrink-0" />
                    <RoomAutocomplete
                      placeholder="Add room name..."
                      value={roomVal}
                      rooms={uniqueRooms}
                      onChange={(e) => setRoomInputs((r) => ({ ...r, [nodeId]: e.target.value }))}
                      onBlur={() => onRoomBlurWithFlash(nodeId)}
                      onKeyDown={(e) => e.key === 'Enter' && onRoomBlurWithFlash(nodeId)}
                      className="text-xs border border-hc-panel-border bg-hc-panel-mid text-hc-fg-strong rounded px-2 py-0.5 w-36 focus:outline-none focus:ring-1 focus:ring-blue-400 placeholder-hc-muted"
                    />
                    {savedFlash[`room-${nodeId}`] && <Check size={12} className="text-green-500 animate-save-flash flex-shrink-0" />}
                  </div>
                  {endpointCount === 0 && (
                    <div className="flex items-center gap-1 mt-1">
                      <FileText size={10} className="text-hc-muted flex-shrink-0" />
                      <input
                        type="text"
                        placeholder="Add note..."
                        value={noteInputs[nodeId] ?? savedNotes[nodeId] ?? ''}
                        onChange={(e) => setNoteInputs((n) => ({ ...n, [nodeId]: e.target.value }))}
                        onBlur={() => onNoteBlurWithFlash(nodeId)}
                        onKeyDown={(e) => e.key === 'Enter' && onNoteBlurWithFlash(nodeId)}
                        className="text-xs border border-hc-panel-border bg-hc-panel-mid text-hc-fg-strong rounded px-2 py-0.5 w-48 focus:outline-none focus:ring-1 focus:ring-blue-400 placeholder-hc-muted"
                   />
                      {savedFlash[`note-${nodeId}`] && <Check size={12} className="text-green-500 animate-save-flash flex-shrink-0" />}
                    </div>
                  )}
                  {nodeStatus && (
                    <div className="text-xs text-hc-muted mt-0.5">
                      {nodeStatus.active
                        ? <span className="text-green-600">Polling active</span>
                        : <span className="text-hc-muted">Polling inactive</span>}
                    </div>
                  )}
                  {nodeStatus?.lastError && (
                    <div className="mt-1.5">
                      <p className="text-xs text-red-500">
                        Last error: {errorSummary}
                      </p>
                      <div className="mt-1 flex items-center gap-2">
                        <button
                          onClick={() => setExpandedMatterErrors((s) => {
                            const next = new Set(s);
                            next.has(nodeId) ? next.delete(nodeId) : next.add(nodeId);
                            return next;
                          })}
                          className="text-[11px] text-blue-600 hover:text-blue-800 transition-colors"
                        >
                          {isErrorExpanded ? 'Hide details' : 'Show details'}
                        </button>
                        <button
                          onClick={() => {
                            if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
                              void navigator.clipboard.writeText(String(nodeStatus.lastError));
                            }
                          }}
                          className="text-[11px] text-blue-600 hover:text-blue-800 transition-colors"
                        >
                          Copy diagnostics
                        </button>
                      </div>
                      {isErrorExpanded && (
                        <pre className="mt-1.5 p-2 rounded bg-hc-danger-bg border border-hc-danger-border text-[11px] text-hc-danger-text whitespace-pre-wrap break-all max-h-40 overflow-auto">
                          {nodeStatus.lastError}
                        </pre>
                      )}
                    </div>
                  )}
                  {endpointCount > 0 && (
                    <button
                      onClick={() => setExpandedMatterEndpoints((s) => {
                        const next = new Set(s);
                        next.has(nodeId) ? next.delete(nodeId) : next.add(nodeId);
                        return next;
                      })}
                      className="mt-1.5 flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 transition-colors"
                    >
                      <ChevronDown
                        size={11}
                        className={clsx('transition-transform duration-200', isEndpointsExpanded && 'rotate-180')}
                      />
                      {isEndpointsExpanded ? 'Hide' : 'Show'} endpoint rooms ({endpointCount})
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-2 flex-shrink-0">
                    {(() => {
                      const ds = deviceStatus[nodeId];
                      if (ds?.needsRepair) return (
                        <span className="text-xs bg-hc-danger-bg text-hc-danger-text border border-hc-danger-border px-2 py-0.5 rounded-full">Needs Repair</span>
                      );
                      if (ds?.isStale) return (
                        <span className="text-xs bg-hc-warning-bg text-hc-warning-text border border-hc-warning-border px-2 py-0.5 rounded-full">Stale</span>
                      );
                      return (
                        <span className="text-xs bg-hc-success-bg text-hc-success-text border border-hc-success-border px-2 py-0.5 rounded-full">Logging</span>
                      );
                    })()}
                    {retentionConfig?.liveEventToastsEnabled && (
                      <button
                        type="button"
                        onClick={() => toggleToastAccessory(nodeId)}
                        className="p-1 rounded hover:bg-hc-panel-mid transition-colors"
                        title={
                          (retentionConfig?.toastAccessories ?? []).includes(nodeId)
                            ? 'Disable live event toasts'
                            : 'Enable live event toasts'
                        }
                      >
                        {(retentionConfig?.toastAccessories ?? []).includes(nodeId)
                          ? <Bell size={14} className="text-blue-500" />
                          : <BellOff size={14} className="text-hc-muted" />
                        }
                      </button>
                    )}
                  </div>
              </div>
              {isEndpointsExpanded && endpointRows.length > 0 && (
                <div className="mt-2 pl-8 space-y-2">
                  {endpointRows.map((row) => {
                    const endpointId = row.accessory_id;
                    const endpointRoom = roomInputs[endpointId] ?? savedRooms[endpointId] ?? '';
                    return (
                      <div key={endpointId} className="space-y-0.5">
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-hc-muted w-28 truncate">
                            {endpointId.split(':').slice(-1)[0]} {row.accessory_name ? `· ${row.accessory_name}` : ''}
                          </span>
                          <div className="flex items-center gap-1">
                            <MapPin size={10} className="text-hc-muted flex-shrink-0" />
                            <RoomAutocomplete
                              placeholder="Add room name..."
                              value={endpointRoom}
                              rooms={uniqueRooms}
                              onChange={(e) => setRoomInputs((r) => ({ ...r, [endpointId]: e.target.value }))}
                              onBlur={() => onRoomBlurWithFlash(endpointId)}
                              onKeyDown={(e) => e.key === 'Enter' && onRoomBlurWithFlash(endpointId)}
                              className="text-xs border border-hc-panel-border bg-hc-panel-mid text-hc-fg-strong rounded px-2 py-0.5 w-40 focus:outline-none focus:ring-1 focus:ring-blue-400 placeholder-hc-muted"
                            />
                          </div>
                        </div>
                        <div className="flex items-center gap-1 ml-[7.5rem]">
                          <FileText size={9} className="text-hc-muted flex-shrink-0" />
                          <input
                            type="text"
                            placeholder="Add note..."
                            value={noteInputs[endpointId] ?? savedNotes[endpointId] ?? ''}
                            onChange={(e) => setNoteInputs((n) => ({ ...n, [endpointId]: e.target.value }))}
                            onBlur={() => onNoteBlurWithFlash(endpointId)}
                            onKeyDown={(e) => e.key === 'Enter' && onNoteBlurWithFlash(endpointId)}
                            className="text-xs border border-hc-panel-border bg-hc-panel-mid text-hc-fg-strong rounded px-2 py-0.5 w-44 focus:outline-none focus:ring-1 focus:ring-blue-400 placeholder-hc-muted"
                       />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>


      {repairingDevice && (
        <RepairFlow
          device={repairingDevice.device}
          deviceId={repairingDevice.bridgeId}
          repairMutation={setup.repairPairingMutation}
          onClose={() => setRepairingDevice(null)}
        />
      )}
    </div>
  );
}
