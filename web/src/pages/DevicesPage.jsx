import { useState } from 'react';
import clsx from 'clsx';
import { useSetup } from '../hooks/useSetup.js';
import { useAuth } from '../hooks/useAuth.js';
import { useAuthConfig } from '../hooks/useAuthConfig.js';
import AccessoryList from '../components/AccessoryList.jsx';
import AccessoryLegend from '../components/AccessoryLegend.jsx';
import AddDevicesTab from '../components/setup/AddDevicesTab.jsx';
import MyDevicesTab from '../components/setup/MyDevicesTab.jsx';
import Card from '../components/Card.jsx';
import PageContainer from '../components/PageContainer.jsx';

const DEVICE_TABS = [
  { id: 'browse', label: 'Browse' },
  { id: 'add', label: 'Add Accessories' },
  { id: 'devices', label: 'Manage Accessories' },
];

/**
 * DevicesPage.
 *
 * `tab` / `onTabChange` make the active tab CONTROLLED, so a caller can
 * deep-link into one, as Settings' "Manage accessories" link does. Rendered
 * without them it falls back to owning the state. `onNavigate(page, options)`
 * lets a tab link elsewhere in the app.
 */
export default function DevicesPage({ onSelectAccessory, onNavigate, tab: controlledTab, onTabChange }) {
  const [ownTab, setOwnTab] = useState('browse');
  const isControlled = controlledTab != null && typeof onTabChange === 'function';
  const requestedTab = isControlled ? controlledTab : ownTab;
  // An unknown tab id (a bad deep link) lands on Browse, never a blank page.
  const activeTab = DEVICE_TABS.some((t) => t.id === requestedTab) ? requestedTab : 'browse';
  const setActiveTab = isControlled ? onTabChange : setOwnTab;
  const setup = useSetup();
  const { user } = useAuth();
  const { authEnabled } = useAuthConfig();
  // Admin-only on the server: auth off means the sole operator.
  const canChangeSplit = !authEnabled || user?.role === 'admin';

  return (
    <PageContainer narrow className="space-y-6">
      <div className="flex items-center gap-2 border-b border-hc-panel-border">
        <nav className="flex gap-1 min-w-0 overflow-x-auto">
          {DEVICE_TABS.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              onClick={() => setActiveTab(id)}
              className={clsx(
                'px-4 py-2 text-sm font-medium whitespace-nowrap transition-colors border-b-2 -mb-px',
                activeTab === id
                  ? 'border-hc-accent-strong text-hc-accent-strong'
                  : 'border-transparent text-hc-muted hover:text-hc-fg hover:border-hc-panel-border',
              )}
            >
              {label}
            </button>
          ))}
        </nav>
        {activeTab === 'browse' && (
          <div className="ml-auto shrink-0 self-center pb-1">
            <AccessoryLegend />
          </div>
        )}
      </div>
      {activeTab === 'browse' && (
        <AccessoryList onSelectAccessory={onSelectAccessory} />
      )}
      {activeTab === 'add' && (
        <Card>
          <Card.Body>
            <AddDevicesTab setup={setup} onSwitchTab={setActiveTab} />
          </Card.Body>
        </Card>
      )}
      {activeTab === 'devices' && (
        <Card>
          <Card.Body>
            <MyDevicesTab setup={setup} canChangeSplit={canChangeSplit} onNavigate={onNavigate} />
          </Card.Body>
        </Card>
      )}
    </PageContainer>
  );
}
