import { useState } from 'react';
import { Wrench, Loader2, CheckCircle2, AlertCircle, X } from 'lucide-react';

export default function RepairFlow({ device, deviceId, repairMutation, onClose }) {
  const [pin, setPin] = useState('');
  const [phase, setPhase] = useState('confirm'); // confirm | repairing | success | failed
  const [error, setError] = useState(null);

  const deviceName = device?.bridge_name || device?.accessory_name || 'Unknown Device';

  async function handleRepair(overridePin) {
    setPhase('repairing');
    setError(null);
    try {
      await repairMutation.mutateAsync({
        deviceId,
        pin: overridePin || undefined,
      });
      setPhase('success');
    } catch (err) {
      setError(err);
      setPhase('failed');
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-hc-panel rounded-xl shadow-xl max-w-md w-full mx-4 p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Wrench size={18} className="text-amber-600" />
            <h3 className="font-semibold text-hc-fg">Repair Pairing</h3>
          </div>
          <button onClick={onClose} className="text-hc-muted hover:text-hc-fg">
            <X size={18} />
          </button>
        </div>

        {phase === 'confirm' && (
          <div className="space-y-4">
            <p className="text-sm text-hc-muted-light">
              Attempting to repair the pairing for <strong>{deviceName}</strong>. This will try to re-establish the connection using the stored PIN.
            </p>
            <button
              onClick={() => handleRepair()}
              className="w-full py-2 px-4 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors"
            >
              Repair Now
            </button>
          </div>
        )}

        {phase === 'repairing' && (
          <div className="flex flex-col items-center py-6 gap-3">
            <Loader2 size={32} className="animate-spin text-blue-500" />
            <p className="text-sm text-hc-muted-light">Repairing {deviceName}...</p>
            <p className="text-xs text-gray-400">This may take up to 20 seconds</p>
          </div>
        )}

        {phase === 'success' && (
          <div className="flex flex-col items-center py-6 gap-3">
            <CheckCircle2 size={32} className="text-green-500" />
            <p className="text-sm text-hc-fg font-medium">Pairing repaired successfully!</p>
            <button
              onClick={onClose}
              className="mt-2 py-2 px-4 rounded-lg bg-hc-panel-mid text-sm text-hc-fg hover:bg-hc-panel-hover transition-colors"
            >
              Close
            </button>
          </div>
        )}

        {phase === 'failed' && (
          <div className="space-y-4">
            <div className="flex items-start gap-2 p-3 bg-hc-danger-bg rounded-lg">
              <AlertCircle size={16} className="text-red-500 shrink-0 mt-0.5" />
              <p className="text-sm text-hc-danger-text">
                {error?.guidance || error?.message || 'Repair failed.'}
              </p>
            </div>

            {(error?.code === 'WRONG_PIN' || error?.code === 'NO_PIN') && (
              <div className="space-y-2">
                <label className="text-sm text-hc-muted-light">Enter the device PIN:</label>
                <input
                  type="text"
                  value={pin}
                  onChange={(e) => setPin(e.target.value)}
                  placeholder="123-45-678"
                  className="w-full px-3 py-2 rounded-lg border border-hc-panel-border bg-hc-panel text-sm"
                />
              </div>
            )}

            <div className="flex gap-2">
              <button
                onClick={() => handleRepair(pin || undefined)}
                disabled={error?.code === 'NO_PIN' && !pin.trim()}
                className="flex-1 py-2 px-4 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Retry
              </button>
              <button
                onClick={onClose}
                className="py-2 px-4 rounded-lg bg-hc-panel-mid text-sm text-hc-fg hover:bg-hc-panel-hover transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
