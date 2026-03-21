import { useState } from 'react';
import clsx from 'clsx';
import { useSetup } from '../../hooks/useSetup.js';
import { SETUP_TABS } from './constants.js';
import AddDevicesTab from './AddDevicesTab.jsx';
import MyDevicesTab from './MyDevicesTab.jsx';
import SettingsTab from './SettingsTab.jsx';

export default function SetupTabs() {
  const [activeTab, setActiveTab] = useState('devices');
  const setup = useSetup();

  return (
    <div className="max-w-4xl mx-auto py-6 px-4 space-y-6">
      <nav className="flex gap-1 border-b border-gray-200 dark:border-gray-700">
        {SETUP_TABS.map(({ id, label }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={clsx(
              'px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px',
              activeTab === id
                ? 'border-blue-600 dark:border-blue-400 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 hover:border-gray-300 dark:hover:border-gray-500',
            )}
          >
            {label}
          </button>
        ))}
      </nav>

      {activeTab === 'add' && <AddDevicesTab setup={setup} onSwitchTab={setActiveTab} />}
      {activeTab === 'devices' && <MyDevicesTab setup={setup} />}
      {activeTab === 'settings' && <SettingsTab setup={setup} />}
    </div>
  );
}
