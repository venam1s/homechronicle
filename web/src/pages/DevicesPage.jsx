import { useState } from 'react';
import clsx from 'clsx';
import { useSetup } from '../hooks/useSetup.js';
import AccessoryList from '../components/AccessoryList.jsx';
import AddDevicesTab from '../components/setup/AddDevicesTab.jsx';
import MyDevicesTab from '../components/setup/MyDevicesTab.jsx';

const DEVICE_TABS = [
  { id: 'browse', label: 'Browse' },
  { id: 'add', label: 'Add Accessories' },
  { id: 'devices', label: 'Manage Accessories' },
];

export default function DevicesPage({ onSelectAccessory }) {
  const [activeTab, setActiveTab] = useState('browse');
  const setup = useSetup();

  return (
    <div className="max-w-4xl mx-auto py-6 px-4 space-y-6">
      <nav className="flex gap-1 border-b border-hc-panel-border">
        {DEVICE_TABS.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            onClick={() => setActiveTab(id)}
            className={clsx(
              'px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px',
              activeTab === id
                ? 'border-hc-accent-strong text-hc-accent-strong'
                : 'border-transparent text-hc-muted hover:text-hc-fg hover:border-hc-panel-border',
            )}
          >
            {label}
          </button>
        ))}
      </nav>
      {activeTab === 'browse' && <AccessoryList onSelectAccessory={onSelectAccessory} />}
      {activeTab === 'add' && <AddDevicesTab setup={setup} onSwitchTab={setActiveTab} />}
      {activeTab === 'devices' && <MyDevicesTab setup={setup} />}
    </div>
  );
}
