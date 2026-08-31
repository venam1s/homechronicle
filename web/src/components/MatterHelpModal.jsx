import { useState, useRef, useEffect } from 'react';
import { X, Wifi, Smartphone, Zap, AlertTriangle, List } from 'lucide-react';
import clsx from 'clsx';

const SUPPORTED_CLUSTERS = [
  { name: 'On/Off', id: '0x0006', examples: 'Smart plugs, switches, lights' },
  { name: 'Level Control', id: '0x0008', examples: 'Dimmers, adjustable lights' },
  { name: 'Boolean State', id: '0x0045', examples: 'Contact sensors, door/window sensors' },
  { name: 'Temperature', id: '0x0402', examples: 'Temperature sensors, thermostats' },
  { name: 'Relative Humidity', id: '0x0405', examples: 'Humidity sensors' },
  { name: 'Occupancy', id: '0x0406', examples: 'Motion/occupancy sensors' },
  { name: 'Color Control', id: '0x0300', examples: 'Color-capable lights (hue, saturation, color temp)' },
  { name: 'Door Lock', id: '0x0101', examples: 'Smart locks' },
  { name: 'Window Covering', id: '0x0102', examples: 'Blinds, shades, shutters' },
  { name: 'Fan Control', id: '0x0202', examples: 'Ceiling fans, ventilation' },
  { name: 'Thermostat', id: '0x0201', examples: 'HVAC thermostats' },
  { name: 'Pressure', id: '0x0403', examples: 'Barometric pressure sensors' },
  { name: 'Illuminance', id: '0x0400', examples: 'Light level sensors' },
  { name: 'Electrical Power', id: '0x0090', examples: 'Energy monitoring plugs, meters' },
  { name: 'Smoke/CO Alarm', id: '0x005C', examples: 'Smoke detectors, CO alarms' },
];

const STEPS = [
  {
    id: 'commission',
    icon: Smartphone,
    title: 'Put your device in commissioning mode',
    color: 'blue',
    defaultOpen: true,
    content: () => (
      <div className="space-y-3">
        <p className="text-sm text-hc-fg">
          Matter devices must be in commissioning mode before homechronicle can pair with them.
          If your device is already set up in Apple Home, you can share it:
        </p>
        <div className="bg-hc-accent-soft border border-hc-accent-soft rounded-lg px-3 py-2.5 text-sm text-hc-accent-stronger">
          <p className="font-medium">From Apple Home:</p>
          <ol className="mt-1.5 space-y-1 list-none">
            {[
              'Open the Home app and long-press the device tile',
              'Tap the gear icon to open device settings',
              'Scroll down and tap "Turn On Pairing Mode"',
              'A setup code will appear — enter it in homechronicle',
            ].map((s, i) => (
              <li key={s} className="flex items-start gap-2">
                <span className="mt-0.5 text-hc-accent-strong text-xs font-medium">{i + 1}.</span>{s}
              </li>
            ))}
          </ol>
        </div>
        <div className="bg-hc-panel-mid border border-hc-panel-border rounded-lg px-3 py-2.5 text-sm text-hc-fg">
          <p className="font-medium text-hc-fg-strong">New (unpaired) device?</p>
          <p className="mt-1">
            Power it on — most Matter devices enter commissioning mode automatically on first boot.
            Check the device manual for a pairing button if it doesn't appear in the scan.
          </p>
        </div>
      </div>
    ),
  },
  {
    id: 'setup-code',
    icon: Zap,
    title: 'Where to find the setup code',
    color: 'green',
    content: () => (
      <div className="space-y-3">
        <p className="text-sm text-hc-fg">
          The Matter setup code is a numeric code used during commissioning.
        </p>
        <ul className="text-sm text-hc-fg space-y-1.5 list-none">
          {[
            'Apple Home app — shown when you enable pairing mode (see above)',
            'Printed on the device label, packaging, or quick-start guide',
            'On a QR code sticker — scan it with your phone camera to reveal the numeric code',
            'In the manufacturer\'s app under device settings',
          ].map((loc) => (
            <li key={loc} className="flex items-start gap-2">
              <span className="mt-0.5 text-hc-success-text text-xs">▸</span>
              {loc}
            </li>
          ))}
        </ul>
        <div className="bg-hc-success-bg border border-hc-success-border rounded px-3 py-2 text-sm text-hc-success-text">
          <span className="font-medium">Format:</span> A numeric code, typically{' '}
          <code className="bg-hc-panel border border-hc-panel-border px-1.5 py-0.5 rounded text-xs font-mono text-hc-fg-strong">XXXX-XXX-XXXX</code>{' '}
          (11 digits) or a shorter manual code.
        </div>
      </div>
    ),
  },
  {
    id: 'network',
    icon: Wifi,
    title: 'Network requirements',
    color: 'orange',
    content: () => (
      <div className="space-y-3">
        <p className="text-sm text-hc-fg">
          Matter commissioning and polling require the device to be reachable on your local network.
        </p>
        <ul className="text-sm text-hc-fg space-y-1.5 list-none">
          {[
            'Device and homechronicle must be on the same LAN (or have Layer 2 connectivity)',
            'IPv6 link-local must be available — this is the default on most networks',
            'If using Docker, host networking is strongly recommended',
            'Devices on a separate IoT VLAN need a VLAN interface on the Docker host',
          ].map((req) => (
            <li key={req} className="flex items-start gap-2">
              <span className="mt-0.5 text-hc-warning-text text-xs">▸</span>
              {req}
            </li>
          ))}
        </ul>
        <div className="bg-hc-warning-bg border border-hc-warning-border rounded-lg px-3 py-2.5 text-sm text-hc-warning-text">
          <span className="font-medium">Thread devices:</span> Thread border routers (like HomePod or Apple TV)
          bridge Thread devices onto your IP network. These should work as long as the border router
          is reachable from the listener.
        </div>
      </div>
    ),
  },
  {
    id: 'clusters',
    icon: List,
    title: 'Supported device types',
    color: 'teal',
    content: () => (
      <div className="space-y-3">
        <p className="text-sm text-hc-fg">
          Matter devices expose capabilities through clusters. homechronicle polls a fixed set of clusters —
          devices using only unsupported clusters will pair but won't produce timeline events.
        </p>
        <div className="border border-hc-panel-border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-hc-panel-mid border-b border-hc-panel-border">
                <th className="text-left px-3 py-2 text-xs font-medium text-hc-muted">Cluster</th>
                <th className="text-left px-3 py-2 text-xs font-medium text-hc-muted">Device examples</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-hc-panel-border">
              {SUPPORTED_CLUSTERS.map((c) => (
                <tr key={c.id}>
                  <td className="px-3 py-1.5 text-hc-fg-strong whitespace-nowrap">
                    {c.name}{' '}
                    <code className="text-[10px] text-hc-muted font-mono">{c.id}</code>
                  </td>
                  <td className="px-3 py-1.5 text-hc-muted">{c.examples}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="bg-hc-accent-soft border border-hc-accent-soft rounded px-3 py-2 text-sm text-hc-accent-stronger">
          Devices outside this list (e.g. media players, air purifiers) can still be paired —
          they just won't generate events until cluster support is added.
        </div>
      </div>
    ),
  },
  {
    id: 'troubleshoot',
    icon: AlertTriangle,
    title: 'Troubleshooting',
    color: 'red',
    content: () => (
      <div className="space-y-3">
        <div className="space-y-2.5">
          {[
            {
              symptom: 'Scan finds the device but commissioning times out',
              fix: 'The device may be on a different VLAN. IPv6 link-local does not cross VLAN boundaries — add a VLAN interface on the Docker host.',
            },
            {
              symptom: 'Paired but no events appear',
              fix: 'The device likely uses clusters outside the supported set. Pairing succeeds but no timeline events are produced.',
            },
            {
              symptom: 'Commissioning fails with a manual address',
              fix: 'Direct commissioning requires IPv6. Use an IPv6 address or retry using on-network discovery.',
            },
            {
              symptom: '"Matter commissioning is not available"',
              fix: 'The Matter runtime failed to initialize. Check listener logs: docker compose logs -f listener.',
            },
          ].map(({ symptom, fix }) => (
            <div key={symptom} className="bg-hc-panel border border-hc-panel-border rounded-lg px-3 py-2.5 text-sm">
              <p className="font-medium text-hc-fg-strong">{symptom}</p>
              <p className="text-hc-fg mt-0.5">{fix}</p>
            </div>
          ))}
        </div>
      </div>
    ),
  },
];

const COLOR_MAP = {
  blue:   'bg-hc-accent-soft text-hc-accent-stronger',
  green:  'bg-hc-success-bg text-hc-success-text',
  orange: 'bg-hc-warning-bg text-hc-warning-text',
  teal:   'bg-hc-accent-soft text-hc-accent-stronger',
  red:    'bg-hc-danger-bg text-hc-danger-text',
};

export default function MatterHelpModal({ onClose, initialSection }) {
  const [open, setOpen] = useState(() => {
    const initial = new Set(['commission']);
    if (initialSection) initial.add(initialSection);
    return initial;
  });
  const scrollRef = useRef(null);
  const sectionRefs = useRef({});

  useEffect(() => {
    if (initialSection && sectionRefs.current[initialSection]) {
      sectionRefs.current[initialSection].scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [initialSection]);

  function toggle(id) {
    setOpen((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="hc-modal bg-hc-panel rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-start justify-between px-5 pt-5 pb-3 border-b border-hc-panel-border">
          <div>
            <h2 className="text-base font-semibold text-hc-fg-strong">How to pair a Matter device</h2>
            <p className="text-sm text-hc-muted mt-0.5">Setup, codes, and supported devices</p>
          </div>
          <button
            onClick={onClose}
            className="hc-modal-close ml-3 flex-shrink-0 p-1.5 rounded-lg text-hc-muted hover:text-hc-fg hover:bg-hc-panel-mid transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Scrollable steps */}
        <div ref={scrollRef} className="overflow-y-auto flex-1 px-5 py-4 space-y-2">
          {STEPS.map(({ id, icon: Icon, title, color }) => {
            const isOpen = open.has(id);
            const step = STEPS.find((s) => s.id === id);
            return (
              <div key={id} ref={(el) => { sectionRefs.current[id] = el; }} className="border border-hc-panel-border rounded-xl overflow-hidden">
                <button
                  onClick={() => toggle(id)}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-hc-panel-mid transition-colors"
                >
                  <span className={clsx('flex-shrink-0 p-1.5 rounded-lg', COLOR_MAP[color])}>
                    <Icon size={15} />
                  </span>
                  <span className="flex-1 text-sm font-medium text-hc-fg-strong">{title}</span>
                  <span className="text-hc-muted text-xs">{isOpen ? '▲' : '▼'}</span>
                </button>
                {isOpen && (
                  <div className="px-4 pb-4 pt-1 border-t border-hc-panel-border bg-hc-panel-mid/50">
                    {step.content()}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-hc-panel-border">
          <button
            onClick={onClose}
            className="w-full py-2 text-sm font-medium rounded-xl transition-colors"
            style={{ backgroundColor: 'rgb(var(--hc-accent-rgb))', color: '#fff' }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
