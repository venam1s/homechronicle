import { useState } from 'react';
import {
  RefreshCw, CheckCircle, Circle, Loader, Lock, ChevronsRight,
  HelpCircle, Wifi, X, AlertTriangle,
} from 'lucide-react';
import clsx from 'clsx';
import { formatDistanceToNow } from 'date-fns';
import PinHelpModal from '../PinHelpModal.jsx';
import MatterHelpModal from '../MatterHelpModal.jsx';
import { CATEGORY_LABELS } from './constants.js';

export default function AddDevicesTab({ setup, onSwitchTab }) {
  const {
    discoveredData,
    discoveredLoading,
    accessories,
    scanMutation,
    savedPins,
    savePin,
    clearPin,
    resolvePin,
    pairOne,
    pairSelectedIds,
    commissionConfigured,
    pollingConfigured,
    pairMatterMutation,
    matterRuntime,
    matterDiscoveredData,
    matterDiscoveredLoading,
    matterScanMutation,
    addPairingMutation,
  } = setup;

  // HomeKit local state
  const [bulkPin, setBulkPin] = useState('');
  const [selected, setSelected] = useState(new Set());
  const [bulkProgress, setBulkProgress] = useState(null);
  const [pinOverrides, setPinOverrides] = useState({});
  const [pairingStatus, setPairingStatus] = useState({});
  const [helpDevice, setHelpDevice] = useState(null);
  const [matterHelpOpen, setMatterHelpOpen] = useState(false);
  const [addPairingExpanded, setAddPairingExpanded] = useState(false);
  const [sourcePairingsText, setSourcePairingsText] = useState('');
  const [addPairingResults, setAddPairingResults] = useState(null);

  // Matter local state
  const [matterForm, setMatterForm] = useState({
    nodeId: '',
    name: '',
    setupCode: '',
    transport: 'ip',
    address: '',
    port: '',
  });
  const [matterFeedback, setMatterFeedback] = useState(null);
  const [matterMode, setMatterMode] = useState('commission');
  const [matterAdvancedOpen, setMatterAdvancedOpen] = useState(false);

  // Derived
  const unpaired = accessories.filter((a) => !a.alreadyPaired && pairingStatus[a.id]?.state !== 'success');
  const pairedElsewhereCount = unpaired.filter((a) => a.pairedElsewhere).length;
  const scanning = scanMutation.isPending;
  const isBulkPairing = bulkProgress !== null && bulkProgress.done < bulkProgress.total;
  const allSelected = unpaired.length > 0 && selected.size === unpaired.length;

  function localResolvePin(id) {
    return pinOverrides[id]?.trim() || resolvePin(id) || bulkPin.trim();
  }

  function toggleSelect(id) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (selected.size === unpaired.length) setSelected(new Set());
    else setSelected(new Set(unpaired.map((a) => a.id)));
  }

  async function handleBulkPair() {
    await pairSelectedIds([...selected], localResolvePin, setPairingStatus, setBulkProgress);
    setSelected(new Set());
  }

  async function handlePairOne(id) {
    const pin = localResolvePin(id);
    if (!pin) {
      setPairingStatus((s) => ({
        ...s, [id]: { state: 'error', message: 'No PIN \u2014 enter a PIN above or set one for this accessory' },
      }));
      return;
    }
    await pairOne(id, pin, setPairingStatus);
  }

  async function handleAddPairing() {
    let parsed;
    try {
      parsed = JSON.parse(sourcePairingsText);
    } catch {
      setAddPairingResults({ error: 'Invalid JSON. Paste the contents of a pairings.json file.' });
      return;
    }
    setAddPairingResults({ loading: true });
    try {
      const data = await addPairingMutation.mutateAsync(parsed);
      setAddPairingResults(data);
    } catch (err) {
      setAddPairingResults({ error: err.message });
    }
  }

  function handleMatterSubmit(event) {
    event.preventDefault();
    const name = matterForm.name.trim();
    if (!name) {
      setMatterFeedback({ type: 'error', message: 'Accessory label is required.' });
      return;
    }
    const setupCode = matterForm.setupCode.trim();
    const nodeId = matterForm.nodeId.trim();
    if (matterMode === 'commission') {
      if (!setupCode) {
        setMatterFeedback({ type: 'error', message: 'Paste the Matter setup code from Apple Home.' });
        return;
      }
      if (!commissionConfigured) {
        setMatterFeedback({
          type: 'error',
          message: 'Matter commissioning is not available. Check listener logs for details.',
        });
        return;
      }
    }
    if (matterMode === 'import' && !nodeId) {
      setMatterFeedback({ type: 'error', message: 'Node ID is required for import mode.' });
      return;
    }

    const payload = { name, transport: matterForm.transport || 'ip' };
    if (matterMode === 'import') payload.nodeId = nodeId;
    if (matterMode === 'commission') payload.setupCode = setupCode;
    if (matterForm.address.trim()) payload.address = matterForm.address.trim();
    if (matterForm.port.trim()) {
      const parsedPort = Number.parseInt(matterForm.port, 10);
      if (!Number.isFinite(parsedPort)) {
        setMatterFeedback({ type: 'error', message: 'Port must be a number.' });
        return;
      }
      payload.port = parsedPort;
    }

    setMatterFeedback(null);
    pairMatterMutation.mutate(payload, {
      onSuccess: (result) => {
        const id = result?.pairing?.nodeId ?? result?.pairing?.id ?? 'device';
        const pollHint = '';
        setMatterFeedback({ type: 'success', message: `Matter accessory "${name}" added (${id}).${pollHint}` });
        setMatterForm((prev) => ({ ...prev, nodeId: '', name: '', setupCode: '', address: '', port: '' }));
      },
      onError: (err) => {
        setMatterFeedback({ type: 'error', message: err.message ?? 'Could not add Matter accessory.' });
      },
    });
  }

  return (
    <div className="space-y-4">

      {/* Help modals */}
      {helpDevice && (
        <PinHelpModal
          deviceName={helpDevice.name}
          category={helpDevice.category}
          onClose={() => setHelpDevice(null)}
        />
      )}
      {matterHelpOpen && (
        <MatterHelpModal
          initialSection={typeof matterHelpOpen === 'string' ? matterHelpOpen : undefined}
          onClose={() => setMatterHelpOpen(false)}
        />
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

        {/* ── HomeKit Card ──────────────────────────────────────────────── */}
        <div className="bg-hc-panel rounded-xl p-4 space-y-3 border border-hc-panel-border">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-hc-fg-strong">HomeKit</h3>
              <span className="text-[10px] font-medium text-hc-muted bg-hc-panel-mid border border-hc-panel-border rounded-full px-1.5 py-0.5">HAP</span>
            </div>
            <p className="text-xs text-hc-muted mt-0.5">
              Scan your network to find accessories and start logging their events.
            </p>
            <button
              onClick={() => setHelpDevice({ name: null, category: null })}
              className="flex items-center gap-1 mt-1.5 text-xs text-hc-accent-strong hover:text-hc-accent-stronger transition-colors"
            >
              <HelpCircle size={12} />
              How do I find my PIN?
            </button>
          </div>

          <button
            onClick={() => { scanMutation.mutate(); setSelected(new Set()); setBulkProgress(null); }}
            disabled={scanning || isBulkPairing}
            className={clsx(
              'w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors',
              scanning ? 'bg-hc-panel-mid text-hc-muted cursor-not-allowed'
                       : 'bg-hc-accent-strong text-hc-on-accent hover:bg-hc-accent-stronger',
            )}
          >
            <RefreshCw size={15} className={scanning ? 'animate-spin' : ''} />
            {scanning ? 'Scanning (10s)\u2026' : 'Scan Network'}
          </button>

          {discoveredData?.cachedAt && (
            <p className="text-xs text-hc-muted">
              Last Scan: {formatDistanceToNow(new Date(discoveredData.cachedAt), { addSuffix: true })}
            </p>
          )}

          {scanMutation.isError && (
            <div className="bg-hc-danger-bg border border-hc-danger-border text-hc-danger-text rounded-lg px-3 py-2 text-xs">
              Scan failed: {scanMutation.error?.message}
            </div>
          )}

          {discoveredLoading && (
            <div className="flex justify-center py-8 text-hc-muted gap-2 text-sm">
              <Loader size={16} className="animate-spin" /> Loading...
            </div>
          )}

          {/* Bulk pair panel */}
          {unpaired.length > 0 && (
            <div className="bg-hc-accent-soft border border-hc-panel-border rounded-lg p-3 space-y-2">
              <p className="text-xs text-hc-accent-strong">
                Select accessories and enter a shared PIN, or set PINs individually.
              </p>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Lock size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-hc-accent-strong" />
                  <input
                    type="text"
                    placeholder="Shared PIN (e.g. 111-22-333)"
                    value={bulkPin}
                    onChange={(e) => setBulkPin(e.target.value)}
                    disabled={isBulkPairing}
                    className="w-full pl-8 pr-3 py-1.5 border border-hc-panel-border bg-hc-panel text-hc-fg-strong rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-hc-focus-ring disabled:opacity-50"
                  />
                </div>
                <button
                  onClick={handleBulkPair}
                  disabled={isBulkPairing || selected.size === 0}
                  className="flex items-center gap-1 px-3 py-1.5 bg-hc-accent-strong text-hc-on-accent text-xs font-medium rounded-lg hover:bg-hc-accent-stronger disabled:opacity-40 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
                >
                  {isBulkPairing
                    ? <><Loader size={12} className="animate-spin" /> {bulkProgress.done}/{bulkProgress.total}</>
                    : <><ChevronsRight size={12} /> Pair ({selected.size})</>}
                </button>
              </div>
              {bulkProgress && (
                <div>
                  <div className="flex justify-between text-xs text-hc-accent-strong mb-1">
                    <span>{isBulkPairing ? 'Pairing\u2026' : 'Done'}</span>
                    <span>{bulkProgress.done} / {bulkProgress.total}</span>
                  </div>
                  <div className="bg-hc-accent-soft rounded-full h-1.5">
                    <div
                      className="bg-hc-accent-strong h-1.5 rounded-full transition-all"
                      style={{ width: `${(bulkProgress.done / bulkProgress.total) * 100}%` }}
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Unpaired device list */}
          {unpaired.length > 0 && (
            <div>
              {pairedElsewhereCount > 0 && (
                <>
                  <div className="mb-2 px-2.5 py-1.5 bg-hc-warning-bg border border-hc-warning-border rounded-lg text-xs text-hc-warning-text flex items-start gap-1.5">
                    <AlertTriangle size={12} className="flex-shrink-0 mt-0.5" />
                    <span>
                      {pairedElsewhereCount} device{pairedElsewhereCount > 1 ? 's are' : ' is'} already paired to another controller (e.g. Apple Home).
                      Enable Homebridge insecure mode (-I), use Add as Controller below, or pair with HomeChronicle before adding to Apple Home.
                    </span>
                  </div>
                  <div className="mb-2">
                    <button
                      onClick={() => setAddPairingExpanded((v) => !v)}
                      className="flex items-center gap-1 text-xs text-hc-accent-strong hover:underline"
                    >
                      <ChevronsRight size={12} className={clsx('transition-transform', addPairingExpanded && 'rotate-90')} />
                      Add as Controller (advanced)
                    </button>
                    {addPairingExpanded && (
                      <div className="mt-2 p-3 bg-hc-panel-soft border border-hc-panel-border rounded-lg space-y-2">
                        <p className="text-xs text-hc-muted">
                          Paste the <code className="text-[11px]">pairings.json</code> contents from another HomeChronicle instance
                          that is already paired as admin to these devices.
                        </p>
                        <textarea
                          rows={4}
                          value={sourcePairingsText}
                          onChange={(e) => setSourcePairingsText(e.target.value)}
                          placeholder='{"AA:BB:CC:DD:EE:FF": {"protocol":"homekit", ...}}'
                          className="w-full text-xs font-mono border border-hc-panel-border bg-hc-panel-mid text-hc-fg-strong rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-hc-focus-ring"
                        />
                        <button
                          onClick={handleAddPairing}
                          disabled={!sourcePairingsText.trim() || addPairingMutation.isPending}
                          className="text-xs px-3 py-1 rounded bg-hc-accent-strong text-hc-on-accent hover:bg-hc-accent-stronger disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                        >
                          {addPairingMutation.isPending ? 'Adding\u2026' : 'Add as Controller'}
                        </button>
                        {addPairingResults?.loading && (
                          <p className="text-xs text-hc-accent-strong flex items-center gap-1"><Loader size={12} className="animate-spin" /> Discovering and adding pairings\u2026</p>
                        )}
                        {addPairingResults?.error && (
                          <p className="text-xs text-hc-danger-text">{addPairingResults.error}</p>
                        )}
                        {addPairingResults?.summary && (
                          <div className="text-xs space-y-1">
                            <p className="text-hc-success-text">{addPairingResults.summary.succeeded} succeeded, {addPairingResults.summary.failed} failed</p>
                            {addPairingResults.results?.filter((r) => !r.ok).map((r) => (
                              <p key={r.deviceId} className="text-hc-danger-text ml-2">{r.name}: {r.reason}</p>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </>
              )}
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs text-hc-muted">{unpaired.length} available</span>
                <button onClick={toggleAll} className="text-xs text-hc-accent-strong hover:underline">
                  {allSelected ? 'Deselect all' : 'Select all'}
                </button>
              </div>
              <div className="divide-y divide-hc-panel-border border border-hc-panel-border rounded-lg">
                {unpaired.map((acc) => {
                  const status = pairingStatus[acc.id];
                  const isPairing = status?.state === 'loading';
                  const isSuccess = status?.state === 'success';
                  const isError = status?.state === 'error';
                  const isChecked = selected.has(acc.id);
                  const hasSavedPin = !!savedPins[acc.id] && !pinOverrides[acc.id];
                  return (
                    <div key={acc.id} className={clsx('px-3 py-2 add-device-row', isChecked && 'add-device-row-selected')}>
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggleSelect(acc.id)}
                          disabled={isPairing || isSuccess}
                          className="w-3.5 h-3.5 rounded border-hc-border-strong text-hc-accent-strong focus:ring-hc-focus-ring cursor-pointer"
                        />
                        {isPairing
                          ? <Loader size={14} className="text-hc-accent-strong animate-spin flex-shrink-0" />
                          : isSuccess
                            ? <CheckCircle size={14} className="text-hc-success-text flex-shrink-0" />
                            : <Circle size={14} className="text-hc-muted flex-shrink-0" />}
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-hc-fg-strong text-xs truncate">{acc.name}</div>
                          <div className="text-[11px] text-hc-muted">
                            {acc.category === 2
                              ? <span className="text-hc-accent-strong font-medium">Bridge</span>
                              : CATEGORY_LABELS[acc.category] ?? 'Unknown'}
                            {acc.pairedElsewhere && (
                              <span className="ml-1.5 inline-flex items-center gap-0.5 text-hc-warning-text font-medium" title="Already paired to another controller (e.g. Apple Home) — pair-setup will be rejected">
                                <AlertTriangle size={9} />
                                paired elsewhere
                              </span>
                            )}
                          </div>
                        </div>
                        {!isSuccess && (
                          <div className="flex flex-col items-end gap-1">
                            <div className="flex items-center gap-1">
                              <input
                                type="text"
                                placeholder={hasSavedPin ? '(saved)' : 'PIN'}
                                value={pinOverrides[acc.id] ?? ''}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  setPinOverrides((p) => ({ ...p, [acc.id]: val }));
                                  if (val.trim()) savePin(acc.id, val.trim());
                                  else clearPin(acc.id);
                                }}
                                disabled={isPairing}
                                className={clsx(
                                  'w-28 px-2 py-0.5 border rounded text-xs focus:outline-none focus:ring-1 focus:ring-hc-focus-ring disabled:opacity-50 placeholder-hc-muted',
                                  hasSavedPin ? 'border-hc-success-border bg-hc-success-bg placeholder-hc-muted' : 'border-hc-panel-border bg-hc-panel-mid text-hc-fg-strong',
                                )}
                              />
                              {hasSavedPin && !isPairing && (
                                <button
                                  onClick={() => {
                                    clearPin(acc.id);
                                    setPinOverrides((p) => ({ ...p, [acc.id]: '' }));
                                  }}
                                  title="Clear saved PIN"
                                  className="p-0.5 text-hc-muted hover:text-hc-danger-text transition-colors"
                                >
                                  <X size={12} />
                                </button>
                              )}
                            </div>
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => setHelpDevice({ name: acc.name, category: acc.category })}
                                className="flex items-center gap-0.5 text-[10px] text-hc-muted hover:text-hc-accent-strong transition-colors"
                              >
                                <HelpCircle size={9} />
                                PIN help
                              </button>
                              <button
                                onClick={() => handlePairOne(acc.id)}
                                disabled={isPairing || isBulkPairing}
                                className="text-[10px] px-2 py-0.5 rounded bg-hc-accent-strong text-hc-on-accent hover:bg-hc-accent-stronger disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                              >
                                Pair
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                      {isSuccess && (
                        <div className="mt-1 ml-6">
                          <p className="text-xs text-hc-success-text">{status.message}</p>
                          <p className="text-[11px] text-hc-muted mt-0.5">
                            Assign a room in{' '}
                            <button
                              onClick={() => onSwitchTab('devices')}
                              className="text-hc-accent-strong hover:underline"
                            >
                              Manage Accessories
                            </button>
                          </p>
                        </div>
                      )}
                      {isError && (
                        <div className="mt-1 ml-6 bg-hc-danger-bg border border-hc-danger-border rounded px-2 py-1">
                          <p className="text-xs text-hc-danger-text">{status.message}</p>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Empty state */}
          {!discoveredLoading && accessories.length === 0 && (
            <div className="flex flex-col items-center justify-center py-8 text-hc-muted text-center">
              <Wifi size={24} className="mb-2 opacity-40" />
              <p className="text-xs font-medium">No accessories found</p>
              <p className="text-[11px] mt-0.5">Click Scan Network to search.</p>
            </div>
          )}

        </div>

        {/* ── Matter Card ───────────────────────────────────────────────── */}
        <MatterCard
          setup={setup}
          matterForm={matterForm}
          setMatterForm={setMatterForm}
          matterFeedback={matterFeedback}
          setMatterFeedback={setMatterFeedback}
          matterMode={matterMode}
          setMatterMode={setMatterMode}
          matterAdvancedOpen={matterAdvancedOpen}
          setMatterAdvancedOpen={setMatterAdvancedOpen}
          handleMatterSubmit={handleMatterSubmit}
          onOpenHelp={(section) => setMatterHelpOpen(section || true)}
          onSwitchTab={onSwitchTab}
        />
      </div>

    </div>
  );
}

/* ── Matter Card ────────────────────────────────────────────────────────── */

function MatterCard({
  setup,
  matterForm,
  setMatterForm,
  matterFeedback,
  setMatterFeedback,
  matterMode,
  setMatterMode,
  matterAdvancedOpen,
  setMatterAdvancedOpen,
  handleMatterSubmit,
  onOpenHelp,
  onSwitchTab,
}) {
  const {
    commissionConfigured,
    pairMatterMutation,
    matterDiscoveredData,
    matterDiscoveredLoading,
    matterScanMutation,
  } = setup;

  const [matterPairingStatus, setMatterPairingStatus] = useState({});
  const matterScanning = matterScanMutation.isPending;
  const matterDevices = matterDiscoveredData?.devices ?? [];
  const unpaired = matterDevices.filter((d) => !d.alreadyPaired && matterPairingStatus[d.id]?.state !== 'success');

  function handleMatterPairOne(device) {
    const name = matterForm[`name_${device.id}`]?.trim();
    const setupCode = matterForm[`code_${device.id}`]?.trim();
    if (!name) {
      setMatterPairingStatus((s) => ({
        ...s, [device.id]: { state: 'error', message: 'Enter an accessory name.' },
      }));
      return;
    }
    if (!setupCode) {
      setMatterPairingStatus((s) => ({
        ...s, [device.id]: { state: 'error', message: 'Enter the setup code from Apple Home.' },
      }));
      return;
    }

    setMatterPairingStatus((s) => ({
      ...s, [device.id]: { state: 'loading', message: 'Commissioning\u2026' },
    }));

    const payload = {
      name,
      setupCode,
      transport: 'ip',
      address: device.address ?? undefined,
      port: device.port ?? undefined,
    };

    pairMatterMutation.mutate(payload, {
      onSuccess: (result) => {
        const id = result?.pairing?.nodeId ?? result?.pairing?.id ?? 'device';
        setMatterPairingStatus((s) => ({
          ...s, [device.id]: { state: 'success', message: `Paired \u2014 now logging ${name} (${id})` },
        }));
      },
      onError: (err) => {
        setMatterPairingStatus((s) => ({
          ...s, [device.id]: { state: 'error', message: err.message ?? 'Commissioning failed.' },
        }));
      },
    });
  }

  return (
    <div className="bg-hc-panel rounded-xl p-4 space-y-3 border border-hc-panel-border">
      <div>
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-hc-fg-strong">Matter</h3>
          <span className="text-[10px] font-medium text-hc-success-text bg-hc-success-bg border border-hc-success-border rounded-full px-1.5 py-0.5">Matter</span>
        </div>
        <p className="text-xs text-hc-muted mt-0.5">
          Pair Matter accessories using a setup code from Apple Home.
        </p>
        <button
          onClick={onOpenHelp}
          className="flex items-center gap-1 mt-1.5 text-xs text-hc-accent-strong hover:text-hc-accent-stronger transition-colors"
        >
          <HelpCircle size={12} />
          How do I pair a Matter accessory?
        </button>
      </div>

      {/* Scan button */}
      <button
        onClick={() => { matterScanMutation.mutate(); setMatterPairingStatus({}); }}
        disabled={matterScanning || !commissionConfigured}
        className={clsx(
          'w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors',
          matterScanning ? 'bg-hc-panel-mid text-hc-muted cursor-not-allowed'
                         : !commissionConfigured ? 'bg-hc-panel-mid text-hc-muted cursor-not-allowed'
                         : 'bg-hc-accent-strong text-hc-on-accent hover:bg-hc-accent-stronger',
        )}
      >
        <RefreshCw size={15} className={matterScanning ? 'animate-spin' : ''} />
        {matterScanning ? 'Scanning\u2026' : 'Scan Network'}
      </button>

      {!commissionConfigured && (
        <p className="text-xs text-hc-warning-text bg-hc-warning-bg border border-hc-warning-border rounded-lg px-3 py-2">
          Matter commissioning is not available. Check listener logs for details.
        </p>
      )}

      {matterDiscoveredData?.cachedAt && (
        <p className="text-xs text-hc-muted">
          Last Manual Scan: {formatDistanceToNow(new Date(matterDiscoveredData.cachedAt), { addSuffix: true })}
        </p>
      )}

      {matterScanMutation.isError && (
        <div className="bg-hc-danger-bg border border-hc-danger-border text-hc-danger-text rounded-lg px-3 py-2 text-xs">
          Scan failed: {matterScanMutation.error?.message}
        </div>
      )}

      {matterDiscoveredData?.warning && (
        <div className="bg-hc-warning-bg border border-hc-warning-border text-hc-warning-text rounded-lg px-3 py-2 text-xs">
          {matterDiscoveredData.warning}
        </div>
      )}

      {matterDiscoveredLoading && (
        <div className="flex justify-center py-8 text-hc-muted gap-2 text-sm">
          <Loader size={16} className="animate-spin" /> Loading...
        </div>
      )}

      {/* Discovered device list */}
      {unpaired.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs text-hc-muted">{unpaired.length} commissionable</span>
          </div>
          <div className="divide-y divide-hc-panel-border border border-hc-panel-border rounded-lg">
            {unpaired.map((device) => {
              const status = matterPairingStatus[device.id];
              const isPairing = status?.state === 'loading';
              const isSuccess = status?.state === 'success';
              const isError = status?.state === 'error';
              return (
                <div key={device.id} className="px-3 py-2.5 space-y-1.5">
                  <div className="flex items-center gap-2">
                    {isPairing
                      ? <Loader size={14} className="text-hc-accent-strong animate-spin flex-shrink-0" />
                      : isSuccess
                        ? <CheckCircle size={14} className="text-hc-success-text flex-shrink-0" />
                        : <Circle size={14} className="text-hc-muted flex-shrink-0" />}
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-hc-fg-strong text-xs truncate">
                        {device.deviceName ?? device.name}
                      </div>
                      <div className="text-[11px] text-hc-muted space-x-2">
                        {device.address && <span>{device.address}{device.port ? `:${device.port}` : ''}</span>}
                        {device.discriminator != null && <span>Disc: {device.discriminator}</span>}
                        {device.vendorId != null && <span>VID: {device.vendorId}</span>}
                      </div>
                    </div>
                  </div>
                  {!isSuccess && (
                    <div className="ml-6 space-y-1.5">
                      <input
                        type="text"
                        placeholder="Accessory name (e.g. Office Plug)"
                        value={matterForm[`name_${device.id}`] ?? ''}
                        onChange={(e) => setMatterForm((f) => ({ ...f, [`name_${device.id}`]: e.target.value }))}
                        disabled={isPairing}
                        className="w-full px-2 py-1 border border-hc-panel-border bg-hc-panel-mid text-hc-fg-strong rounded text-xs focus:outline-none focus:ring-1 focus:ring-hc-focus-ring disabled:opacity-50"
                      />
                      <div className="flex gap-1.5">
                        <input
                          type="text"
                          placeholder="Setup code from Apple Home"
                          value={matterForm[`code_${device.id}`] ?? ''}
                          onChange={(e) => setMatterForm((f) => ({ ...f, [`code_${device.id}`]: e.target.value }))}
                          disabled={isPairing}
                          className="flex-1 px-2 py-1 border border-hc-panel-border bg-hc-panel-mid text-hc-fg-strong rounded text-xs focus:outline-none focus:ring-1 focus:ring-hc-focus-ring disabled:opacity-50"
                        />
                        <button
                          onClick={() => handleMatterPairOne(device)}
                          disabled={isPairing}
                          className="text-[10px] px-2.5 py-1 rounded bg-hc-accent-strong text-hc-on-accent hover:bg-hc-accent-stronger disabled:opacity-40 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
                        >
                          {isPairing ? 'Pairing\u2026' : 'Pair'}
                        </button>
                      </div>
                    </div>
                  )}
                  {isSuccess && (
                    <div className="ml-6">
                      <p className="text-xs text-hc-success-text">{status.message}</p>
                      <p className="text-[11px] text-hc-muted mt-0.5">
                        Assign a room in{' '}
                        <button
                          onClick={() => onSwitchTab('devices')}
                          className="text-hc-accent-strong hover:underline"
                        >
                          Manage Accessories
                        </button>
                      </p>
                    </div>
                  )}
                  {isError && (
                    <div className="ml-6 bg-hc-danger-bg border border-hc-danger-border rounded px-2 py-1">
                      <p className="text-xs text-hc-danger-text">{status.message}</p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Empty state after scan */}
      {!matterDiscoveredLoading && matterDiscoveredData && matterDevices.length === 0 && (
        <div className="flex flex-col items-center justify-center py-4 text-hc-muted text-center">
          <Wifi size={20} className="mb-1.5 opacity-40" />
          <p className="text-xs font-medium">No commissionable accessories found</p>
          <p className="text-[11px] mt-0.5">Put an accessory in pairing mode from Apple Home, then scan again.</p>
        </div>
      )}

      {/* Manual add fallback */}
      {matterFeedback && (
        <div
          className={clsx(
            'rounded-lg px-3 py-2 text-xs border',
            matterFeedback.type === 'success'
              ? 'bg-hc-success-bg border-hc-success-border text-hc-success-text'
              : 'bg-hc-danger-bg border-hc-danger-border text-hc-danger-text',
          )}
        >
          {matterFeedback.message}
          {matterFeedback.type === 'success' && (
            <p className="text-[11px] text-hc-muted mt-1">
              Assign a room in{' '}
              <button
                onClick={() => onSwitchTab('devices')}
                className="text-hc-accent-strong hover:underline"
              >
                Manage Accessories
              </button>
            </p>
          )}
        </div>
      )}

      <button
        type="button"
        onClick={() => setMatterAdvancedOpen((open) => !open)}
        className="text-xs text-hc-muted hover:text-hc-fg underline underline-offset-2"
      >
        {matterAdvancedOpen ? 'Hide manual setup' : 'Add manually\u2026'}
      </button>

      <p className="text-[11px] text-hc-muted italic">
        Supports 15 clusters, including on/off, dimming, contact, temperature, humidity, motion,
        locks, blinds, thermostats and energy. Accessories using other clusters will pair but
        won't produce events.{' '}
        <button onClick={() => onOpenHelp('clusters')} className="underline hover:text-hc-fg transition-colors">See supported accessories</button>
      </p>

      {matterAdvancedOpen && (
        <form onSubmit={handleMatterSubmit} className="space-y-2 bg-hc-panel-mid rounded-lg p-2.5">
          <p className="text-[11px] text-hc-muted">
            Add an accessory without scanning. Use this if the scan doesn't find your accessory.
          </p>
          <input
            type="text"
            value={matterForm.name}
            onChange={(e) => setMatterForm((f) => ({ ...f, name: e.target.value }))}
            placeholder="Accessory name (e.g. Office Plug)"
            className="w-full text-xs border border-hc-panel-border bg-hc-panel-mid text-hc-fg-strong rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-hc-focus-ring"
          />
          <div className="inline-flex items-center gap-1 rounded-lg bg-hc-panel p-1 border border-hc-panel-border">
            <button
              type="button"
              onClick={() => { setMatterMode('commission'); setMatterFeedback(null); }}
              className={clsx(
                'px-2.5 py-1 text-xs rounded transition-colors',
                matterMode === 'commission' ? 'bg-hc-accent-soft text-hc-accent-strong shadow-sm' : 'text-hc-muted hover:text-hc-fg',
              )}
            >
              Setup code
            </button>
            <button
              type="button"
              onClick={() => { setMatterMode('import'); setMatterFeedback(null); }}
              className={clsx(
                'px-2.5 py-1 text-xs rounded transition-colors',
                matterMode === 'import' ? 'bg-hc-accent-soft text-hc-accent-strong shadow-sm' : 'text-hc-muted hover:text-hc-fg',
              )}
            >
              Import by Node ID
            </button>
          </div>
          {matterMode === 'commission' ? (
            <input
              type="text"
              value={matterForm.setupCode}
              onChange={(e) => setMatterForm((f) => ({ ...f, setupCode: e.target.value }))}
              placeholder="Setup code from Apple Home"
              className="w-full text-xs border border-hc-panel-border bg-hc-panel-mid text-hc-fg-strong rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-hc-focus-ring"
            />
          ) : (
            <input
              type="text"
              value={matterForm.nodeId}
              onChange={(e) => setMatterForm((f) => ({ ...f, nodeId: e.target.value }))}
              placeholder="Node ID"
              className="w-full text-xs border border-hc-panel-border bg-hc-panel-mid text-hc-fg-strong rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-hc-focus-ring"
            />
          )}
          <div className="grid grid-cols-1 gap-2">
            <select
              value={matterForm.transport}
              onChange={(e) => setMatterForm((f) => ({ ...f, transport: e.target.value }))}
              className="text-xs border border-hc-panel-border rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-hc-focus-ring bg-hc-panel text-hc-fg-strong"
            >
              <option value="ip">Transport: IP</option>
              <option value="thread">Transport: Thread</option>
            </select>
            <input
              type="text"
              value={matterForm.address}
              onChange={(e) => setMatterForm((f) => ({ ...f, address: e.target.value }))}
              placeholder="Address (optional)"
              className="text-xs border border-hc-panel-border bg-hc-panel-mid text-hc-fg-strong rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-hc-focus-ring"
            />
            <input
              type="text"
              value={matterForm.port}
              onChange={(e) => setMatterForm((f) => ({ ...f, port: e.target.value }))}
              placeholder="Port (optional)"
              className="text-xs border border-hc-panel-border bg-hc-panel-mid text-hc-fg-strong rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-hc-focus-ring"
            />
          </div>
          <button
            type="submit"
            disabled={pairMatterMutation.isPending || (matterMode === 'commission' && !commissionConfigured)}
            className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 bg-hc-accent-strong text-hc-on-accent text-xs font-medium rounded-lg hover:bg-hc-accent-stronger disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {pairMatterMutation.isPending && <Loader size={12} className="animate-spin" />}
            {pairMatterMutation.isPending ? 'Adding\u2026' : 'Add Accessory'}
          </button>
        </form>
      )}

    </div>
  );
}
