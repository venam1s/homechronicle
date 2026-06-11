import { useState } from 'react';
import { useSetup } from '../hooks/useSetup.js';
import { useAuth } from '../hooks/useAuth.js';
import { useMediaQuery } from '../hooks/useMediaQuery.js';
import SettingsTab from '../components/setup/SettingsTab.jsx';
import PageContainer from '../components/PageContainer.jsx';
import UsersPanel from '../components/UsersPanel.jsx';
import SMTPConfigSection from '../components/SMTPConfigSection.jsx';
import ChangePasswordSection from '../components/ChangePasswordSection.jsx';

const NAV_ACTIVE =
  'px-3 py-2 rounded-lg bg-hc-panel-mid font-semibold text-hc-fg-strong border-l-2 border-hc-accent-strong cursor-pointer';
const NAV_INACTIVE =
  'px-3 py-2 rounded-lg text-hc-body text-hc-fg cursor-pointer hover:bg-hc-panel-hover';

export default function SettingsPage() {
  const setup = useSetup();
  const { user } = useAuth();
  const isDesktop = useMediaQuery('(min-width: 768px)');
  const isAdmin = user?.role === 'admin';

  const [section, setSection] = useState(() => (user?.role === 'admin' ? 'admin' : 'account'));

  // If a non-admin somehow lands on 'admin', redirect to 'account'
  const activeSection = (!isAdmin && section === 'admin') ? 'account' : section;

  const navItems = [
    ...(isAdmin ? [{ id: 'admin', label: 'Admin' }] : []),
    { id: 'configuration', label: 'Configuration' },
    { id: 'account', label: 'Account' },
  ];

  function handleNavChange(id) {
    if (id === 'admin' && !isAdmin) return;
    setSection(id);
  }

  return (
    <PageContainer>
      <div className="mb-6">
        <h1 className="text-hc-page-title font-semibold text-hc-fg-strong">Settings</h1>
      </div>

      {/* Mobile: select nav */}
      {!isDesktop && (
        <div className="mb-4">
          <select
            value={activeSection}
            onChange={(e) => handleNavChange(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-hc-panel-border bg-hc-panel text-hc-body text-hc-fg"
          >
            {navItems.map((item) => (
              <option key={item.id} value={item.id}>{item.label}</option>
            ))}
          </select>
        </div>
      )}

      <div className="flex gap-6">
        {/* Desktop: left-rail nav */}
        {isDesktop && (
          <nav className="w-40 shrink-0 flex flex-col gap-1">
            {navItems.map((item) => (
              <div
                key={item.id}
                role="button"
                tabIndex={0}
                onClick={() => handleNavChange(item.id)}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleNavChange(item.id); }}
                className={activeSection === item.id ? NAV_ACTIVE : NAV_INACTIVE}
              >
                {item.label}
              </div>
            ))}
          </nav>
        )}

        {/* Content area */}
        <div className="flex-1 min-w-0 space-y-4">
          {activeSection === 'admin' && isAdmin && (
            <>
              <UsersPanel />
              <SMTPConfigSection />
            </>
          )}
          {activeSection === 'configuration' && (
            <SettingsTab setup={setup} />
          )}
          {activeSection === 'account' && (
            <ChangePasswordSection />
          )}
        </div>
      </div>
    </PageContainer>
  );
}
