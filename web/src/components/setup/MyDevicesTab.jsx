import { useCallback, useMemo, useState } from 'react';
import { Bell, BellOff, Check, CheckCircle, Trash2, ChevronDown, MapPin, FileText, AlertCircle, Pencil } from 'lucide-react';
import clsx from 'clsx';
import { CATEGORY_LABELS } from './constants.js';
import BridgeChildrenRow from './BridgeChildrenRow.jsx';

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
    deletePairingMutation,
    deleteMatterPairingMutation,
    matterRuntime,
    retentionConfig,
    saveRetentionMutation,
  } = setup;

  const [confirmDelete, setConfirmDelete] = useState(null);
  const [confirmDeleteMatter, setConfirmDeleteMatter] = useState(null);
  const [matterDeleteError, setMatterDeleteError] = useState({});
  const [expandedBridges, setExpandedBridges] = useState(new Set());
  const [expandedMatterEndpoints, setExpandedMatterEndpoints] = useState(new Set());
  const [expandedMatterErrors, setExpandedMatterErrors] = useState(new Set());
  const [savedFlash, setSavedFlash] = useState({});

  const flashSave = useCallback((key) => {
    setSavedFlash((prev) => ({ ...prev, [key]: true }));
    setTimeout(() => setSavedFlash((prev) => { const next = { ...prev }; delete next[key]; return next; }), 1200);
  }, []);

  const onRoomBlurWithFlash = useCallback((id) => {
    handleRoomBlur(id);
    flashSave(`room-${id}`);
  }, [handleRoomBlur, flashSave]);

  const onNoteBlurWithFlash = useCallback((id) => {
    handleNoteBlur(id);
    flashSave(`note-${id}`);
  }, [handleNoteBlur, flashSave]);

  const onDisplayNameBlurWithFlash = useCallback((id) => {
    handleDisplayNameBlur(id);
    flashSave(`name-${id}`);
  }, [handleDisplayNameBlur, flashSave]);

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

  const devicesWithoutRoom = [
    ...paired.filter((acc) => acc.category !== 2 && !savedRooms[acc.id]?.trim()),
    ...matterPairings.filter((p) => !savedRooms[p.nodeId ?? p.id]?.trim()),
  ];

  if (totalCount === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-gray-400 text-center">
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
      <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">
        {totalCount} accessor{totalCount !== 1 ? 'ies' : 'y'}
      </p>

      {devicesWithoutRoom.length > 0 && (
        <div className="flex items-start gap-2 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 px-3 py-2.5">
          <AlertCircle size={15} className="text-amber-500 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-amber-800 dark:text-amber-300">
            {devicesWithoutRoom.length === 1
              ? '1 accessory doesn\u2019t have a room assigned yet.'
              : `${devicesWithoutRoom.length} accessories don\u2019t have rooms assigned yet.`}{' '}
            Set a room name below so events are grouped correctly.
          </p>
        </div>
      )}

      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm divide-y divide-gray-100 dark:divide-gray-700">

        {/* HomeKit paired accessories */}
        {paired.map((acc) => {
          const isConfirming = confirmDelete === acc.id;
          const isDeleting = deletePairingMutation.isPending && confirmDelete === acc.id;
          const roomVal = roomInputs[acc.id] ?? savedRooms[acc.id] ?? '';
          return (
            <div key={acc.id} className="px-4 py-3">
              <div className="flex items-center gap-3">
                <CheckCircle size={18} className="text-green-500 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1 min-w-0">
                      <Pencil size={10} className="text-gray-300 dark:text-gray-500 flex-shrink-0" />
                      <input
                        type="text"
                        placeholder={acc.name}
                        value={displayNameInputs[acc.id] ?? savedDisplayNames[acc.id] ?? ''}
                        onChange={(e) => setDisplayNameInputs((d) => ({ ...d, [acc.id]: e.target.value }))}
                        onBlur={() => onDisplayNameBlurWithFlash(acc.id)}
                        onKeyDown={(e) => e.key === 'Enter' && onDisplayNameBlurWithFlash(acc.id)}
                        className="font-medium text-gray-900 dark:text-gray-100 text-sm bg-transparent border-0 border-b border-transparent hover:border-gray-300 dark:hover:border-gray-600 focus:border-blue-400 focus:outline-none px-0 py-0 w-full truncate placeholder-gray-400 dark:placeholder-gray-500"
                      />
                      {savedFlash[`name-${acc.id}`] && <Check size={12} className="text-green-500 animate-save-flash flex-shrink-0" />}
                    </div>
                    <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 border border-blue-100 dark:border-blue-800 flex-shrink-0">
                      HomeKit
                    </span>
                  </div>
                  <div className="text-xs text-gray-400">
                    {CATEGORY_LABELS[acc.category] ?? 'Unknown'} &middot; {acc.address}
                  </div>
                  <div className="flex items-center gap-1 mt-1.5">
                    <MapPin size={10} className="text-gray-300 flex-shrink-0" />
                    <input
                      type="text"
                      placeholder="Add room name..."
                      value={roomVal}
                      list="hc-room-list"
                      onChange={(e) => setRoomInputs((r) => ({ ...r, [acc.id]: e.target.value }))}
                      onBlur={() => onRoomBlurWithFlash(acc.id)}
                      onKeyDown={(e) => e.key === 'Enter' && onRoomBlurWithFlash(acc.id)}
                      className="text-xs border border-gray-200 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded px-2 py-0.5 w-36 focus:outline-none focus:ring-1 focus:ring-blue-400 placeholder-gray-400"
                 />
                    {savedFlash[`room-${acc.id}`] && <Check size={12} className="text-green-500 animate-save-flash flex-shrink-0" />}
                  </div>
                  {acc.category !== 2 && (
                    <div className="flex items-center gap-1 mt-1">
                      <FileText size={10} className="text-gray-300 flex-shrink-0" />
                      <input
                        type="text"
                        placeholder="Add note..."
                        value={noteInputs[acc.id] ?? savedNotes[acc.id] ?? ''}
                        onChange={(e) => setNoteInputs((n) => ({ ...n, [acc.id]: e.target.value }))}
                        onBlur={() => onNoteBlurWithFlash(acc.id)}
                        onKeyDown={(e) => e.key === 'Enter' && onNoteBlurWithFlash(acc.id)}
                        className="text-xs border border-gray-200 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded px-2 py-0.5 w-48 focus:outline-none focus:ring-1 focus:ring-blue-400 placeholder-gray-400"
                   />
                      {savedFlash[`note-${acc.id}`] && <Check size={12} className="text-green-500 animate-save-flash flex-shrink-0" />}
                    </div>
                  )}
                  {acc.category === 2 && roomVal && (
                    <p className="text-[10px] text-gray-400 mt-0.5 ml-3.5">
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

                {isConfirming ? (
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className="text-xs text-gray-500">Remove pairing?</span>
                    <button
                      onClick={() => deletePairingMutation.mutate(acc.id, {
                        onSuccess: () => setConfirmDelete(null),
                        onError: () => setConfirmDelete(null),
                      })}
                      disabled={isDeleting}
                      className="text-xs px-2 py-1 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors"
                    >
                      {isDeleting ? 'Removing\u2026' : 'Yes, remove'}
                    </button>
                    <button
                      onClick={() => setConfirmDelete(null)}
                      disabled={isDeleting}
                      className="text-xs px-2 py-1 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-50 transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className="text-xs bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-400 px-2 py-0.5 rounded-full">Logging</span>
                    {retentionConfig?.liveEventToastsEnabled && (
                      <button
                        type="button"
                        onClick={() => toggleToastAccessory(acc.id)}
                        className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                        title={
                          (retentionConfig?.toastAccessories ?? []).includes(acc.id)
                            ? 'Disable live event toasts'
                            : 'Enable live event toasts'
                        }
                      >
                        {(retentionConfig?.toastAccessories ?? []).includes(acc.id)
                          ? <Bell size={16} className="text-blue-500" />
                          : <BellOff size={16} className="text-gray-400 dark:text-gray-500" />
                        }
                      </button>
                    )}
                    <button
                      onClick={() => setConfirmDelete(acc.id)}
                      title="Remove pairing"
                      className="p-1.5 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                )}
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
          const isConfirming = confirmDeleteMatter === nodeId;
          const isDeleting = deleteMatterPairingMutation.isPending && isConfirming;
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
                <CheckCircle size={18} className="text-green-500 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1 min-w-0">
                      <Pencil size={10} className="text-gray-300 dark:text-gray-500 flex-shrink-0" />
                      <input
                        type="text"
                        placeholder={pairing.name ?? nodeId}
                        value={displayNameInputs[nodeId] ?? savedDisplayNames[nodeId] ?? ''}
                        onChange={(e) => setDisplayNameInputs((d) => ({ ...d, [nodeId]: e.target.value }))}
                        onBlur={() => onDisplayNameBlurWithFlash(nodeId)}
                        onKeyDown={(e) => e.key === 'Enter' && onDisplayNameBlurWithFlash(nodeId)}
                        className="font-medium text-gray-900 dark:text-gray-100 text-sm bg-transparent border-0 border-b border-transparent hover:border-gray-300 dark:hover:border-gray-600 focus:border-blue-400 focus:outline-none px-0 py-0 w-full truncate placeholder-gray-400 dark:placeholder-gray-500"
                      />
                      {savedFlash[`name-${nodeId}`] && <Check size={12} className="text-green-500 animate-save-flash flex-shrink-0" />}
                    </div>
                    <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800 flex-shrink-0">
                      Matter
                    </span>
                  </div>
                  <div className="text-xs text-gray-400">
                    {nodeId}
                    {pairing.address ? ` \u00b7 ${pairing.address}` : ''}
                    {pairing.port ? `:${pairing.port}` : ''}
                  </div>
                  <div className="flex items-center gap-1 mt-1.5">
                    <MapPin size={10} className="text-gray-300 flex-shrink-0" />
                    <input
                      type="text"
                      placeholder="Add room name..."
                      value={roomVal}
                      list="hc-room-list"
                      onChange={(e) => setRoomInputs((r) => ({ ...r, [nodeId]: e.target.value }))}
                      onBlur={() => onRoomBlurWithFlash(nodeId)}
                      onKeyDown={(e) => e.key === 'Enter' && onRoomBlurWithFlash(nodeId)}
                      className="text-xs border border-gray-200 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded px-2 py-0.5 w-36 focus:outline-none focus:ring-1 focus:ring-blue-400 placeholder-gray-400"
                 />
                    {savedFlash[`room-${nodeId}`] && <Check size={12} className="text-green-500 animate-save-flash flex-shrink-0" />}
                  </div>
                  {endpointCount === 0 && (
                    <div className="flex items-center gap-1 mt-1">
                      <FileText size={10} className="text-gray-300 flex-shrink-0" />
                      <input
                        type="text"
                        placeholder="Add note..."
                        value={noteInputs[nodeId] ?? savedNotes[nodeId] ?? ''}
                        onChange={(e) => setNoteInputs((n) => ({ ...n, [nodeId]: e.target.value }))}
                        onBlur={() => onNoteBlurWithFlash(nodeId)}
                        onKeyDown={(e) => e.key === 'Enter' && onNoteBlurWithFlash(nodeId)}
                        className="text-xs border border-gray-200 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded px-2 py-0.5 w-48 focus:outline-none focus:ring-1 focus:ring-blue-400 placeholder-gray-400"
                   />
                      {savedFlash[`note-${nodeId}`] && <Check size={12} className="text-green-500 animate-save-flash flex-shrink-0" />}
                    </div>
                  )}
                  {nodeStatus && (
                    <div className="text-xs text-gray-400 mt-0.5">
                      {nodeStatus.active
                        ? <span className="text-green-600">Polling active</span>
                        : <span className="text-gray-400">Polling inactive</span>}
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
                        <pre className="mt-1.5 p-2 rounded bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800 text-[11px] text-red-700 dark:text-red-400 whitespace-pre-wrap break-all max-h-40 overflow-auto">
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

                {isConfirming ? (
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button
                      onClick={() => {
                        setMatterDeleteError((s) => ({ ...s, [nodeId]: null }));
                        deleteMatterPairingMutation.mutate(nodeId, {
                          onSuccess: () => setConfirmDeleteMatter(null),
                          onError: (err) => {
                            setConfirmDeleteMatter(null);
                            setMatterDeleteError((s) => ({ ...s, [nodeId]: err.message ?? 'Could not remove accessory.' }));
                          },
                        });
                      }}
                      disabled={isDeleting}
                      className="text-xs px-2 py-1 bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50 transition-colors"
                    >
                      {isDeleting ? 'Removing\u2026' : 'Confirm'}
                    </button>
                    <button
                      onClick={() => setConfirmDeleteMatter(null)}
                      disabled={isDeleting}
                      className="text-xs px-2 py-1 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className="text-xs bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-400 px-2 py-0.5 rounded-full">Logging</span>
                    {retentionConfig?.liveEventToastsEnabled && (
                      <button
                        type="button"
                        onClick={() => toggleToastAccessory(nodeId)}
                        className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                        title={
                          (retentionConfig?.toastAccessories ?? []).includes(nodeId)
                            ? 'Disable live event toasts'
                            : 'Enable live event toasts'
                        }
                      >
                        {(retentionConfig?.toastAccessories ?? []).includes(nodeId)
                          ? <Bell size={16} className="text-blue-500" />
                          : <BellOff size={16} className="text-gray-400 dark:text-gray-500" />
                        }
                      </button>
                    )}
                    <button
                      onClick={() => setConfirmDeleteMatter(nodeId)}
                      title="Remove pairing"
                      className="p-1.5 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                )}
              </div>
              {matterDeleteError[nodeId] && (
                <div className="mt-1.5 ml-6 bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800 rounded px-2 py-1">
                  <p className="text-xs text-red-700 dark:text-red-400">{matterDeleteError[nodeId]}</p>
                </div>
              )}
              {isEndpointsExpanded && endpointRows.length > 0 && (
                <div className="mt-2 pl-8 space-y-2">
                  {endpointRows.map((row) => {
                    const endpointId = row.accessory_id;
                    const endpointRoom = roomInputs[endpointId] ?? savedRooms[endpointId] ?? '';
                    return (
                      <div key={endpointId} className="space-y-0.5">
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-gray-500 w-28 truncate">
                            {endpointId.split(':').slice(-1)[0]} {row.accessory_name ? `· ${row.accessory_name}` : ''}
                          </span>
                          <div className="flex items-center gap-1">
                            <MapPin size={10} className="text-gray-300 flex-shrink-0" />
                            <input
                              type="text"
                              placeholder="Add room name..."
                              value={endpointRoom}
                              list="hc-room-list"
                              onChange={(e) => setRoomInputs((r) => ({ ...r, [endpointId]: e.target.value }))}
                              onBlur={() => onRoomBlurWithFlash(endpointId)}
                              onKeyDown={(e) => e.key === 'Enter' && onRoomBlurWithFlash(endpointId)}
                              className="text-xs border border-gray-200 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded px-2 py-0.5 w-40 focus:outline-none focus:ring-1 focus:ring-blue-400 placeholder-gray-400"
                         />
                          </div>
                        </div>
                        <div className="flex items-center gap-1 ml-[7.5rem]">
                          <FileText size={9} className="text-gray-300 flex-shrink-0" />
                          <input
                            type="text"
                            placeholder="Add note..."
                            value={noteInputs[endpointId] ?? savedNotes[endpointId] ?? ''}
                            onChange={(e) => setNoteInputs((n) => ({ ...n, [endpointId]: e.target.value }))}
                            onBlur={() => onNoteBlurWithFlash(endpointId)}
                            onKeyDown={(e) => e.key === 'Enter' && onNoteBlurWithFlash(endpointId)}
                            className="text-xs border border-gray-200 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded px-2 py-0.5 w-44 focus:outline-none focus:ring-1 focus:ring-blue-400 placeholder-gray-400"
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

      <datalist id="hc-room-list">
        {uniqueRooms.map((room) => (
          <option key={room} value={room} />
        ))}
      </datalist>
    </div>
  );
}
