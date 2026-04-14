import { useEffect, useMemo, useState } from 'react';
import clsx from 'clsx';
import { useSetup } from '../../hooks/useSetup.js';
import { SETUP_TABS } from './constants.js';
import AddDevicesTab from './AddDevicesTab.jsx';
import MyDevicesTab from './MyDevicesTab.jsx';
import SettingsTab from './SettingsTab.jsx';
import Alerts from '../Alerts.jsx';

export default function SetupTabs() {
  const [activeTab, setActiveTab] = useState('devices');
  const setup = useSetup();

  const displayTabs = useMemo(
    () => setup.alertsConfig?.enabled
      ? [...SETUP_TABS, { id: 'alerts', label: 'Alerts' }]
      : SETUP_TABS,
    [setup.alertsConfig?.enabled],
  );

  // Redirect away from alerts tab when alerts become disabled
  useEffect(() => {
    if (!setup.alertsConfig?.enabled && activeTab === 'alerts') {
      setActiveTab('devices');
    }
  }, [setup.alertsConfig?.enabled, activeTab]);

  return (
    <div className="max-w-4xl mx-auto py-6 px-4 space-y-6">
      <nav className="flex gap-1 border-b border-hc-panel-border">
        {displayTabs.map(({ id, label }) => (
          <button
            key={id}
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

      {activeTab === 'add' && <AddDevicesTab setup={setup} onSwitchTab={setActiveTab} />}
      {activeTab === 'devices' && <MyDevicesTab setup={setup} />}
      {activeTab === 'settings' && <SettingsTab setup={setup} />}
      {activeTab === 'alerts' && <Alerts />}
    </div>
  );
}
