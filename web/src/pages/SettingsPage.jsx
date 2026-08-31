import { useState } from 'react';
import { useSetup } from '../hooks/useSetup.js';
import { useAuth } from '../hooks/useAuth.js';
import { useAuthConfig } from '../hooks/useAuthConfig.js';
import { useMediaQuery } from '../hooks/useMediaQuery.js';
import SettingsTab from '../components/setup/SettingsTab.jsx';
import PageContainer from '../components/PageContainer.jsx';
import UsersPanel from '../components/UsersPanel.jsx';
import SMTPConfigSection from '../components/SMTPConfigSection.jsx';
import ChangePasswordSection from '../components/ChangePasswordSection.jsx';
import ActiveSessionsPanel from '../components/ActiveSessionsPanel.jsx';
import AppearanceSection from '../components/AppearanceSection.jsx';

const NAV_ACTIVE =
  'px-3 py-2 rounded-lg bg-hc-panel-mid font-semibold text-hc-fg-strong border-l-2 border-hc-accent-strong cursor-pointer';
const NAV_INACTIVE =
  'px-3 py-2 rounded-lg text-hc-body text-hc-fg cursor-pointer hover:bg-hc-panel-hover';

export default function SettingsPage() {
  const setup = useSetup();
  const { user } = useAuth();
  const { authEnabled } = useAuthConfig();
  const isDesktop = useMediaQuery('(min-width: 768px)');
  const isAdmin = user?.role === 'admin';

  // Advanced (log level + Danger Zone) visible to admins in auth-on, and to
  // the sole operator in auth-off (no session = full access, same as v1.3).
  const showAdvanced = isAdmin || !authEnabled;

  const [section, setSection] = useState('configuration');

  // Build visible nav items based on auth state:
  // - Admin tab: only when auth is on AND user is admin (Users + SMTP)
  // - Configuration: always present
  // - Account tab: only when auth is on (no password/session management in auth-off)
  const navItems = [
    ...(authEnabled && isAdmin ? [{ id: 'admin', label: 'Admin' }] : []),
    { id: 'configuration', label: 'Configuration' },
    { id: 'appearance', label: 'Appearance' },
    ...(authEnabled ? [{ id: 'account', label: 'Account' }] : []),
  ];

  // Generalized guard: if the stored section is not in the visible nav, fall back
  // to 'configuration'. This handles auth-off (no admin/account) as well as the
  // prior member-on-admin case.
  const activeSection = navItems.some((i) => i.id === section) ? section : 'configuration';

  function handleNavChange(id) {
    if (!navItems.some((i) => i.id === id)) return;
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
          {/* Admin section: Users + SMTP only; shown when auth is on and user is admin.
              Advanced (Log level + Danger Zone) is an inner tab inside SettingsTab,
              gated by showAdvanced — visible to admins and the auth-off sole operator. */}
          {activeSection === 'admin' && authEnabled && isAdmin && (
            <>
              <UsersPanel />
              <SMTPConfigSection />
            </>
          )}
          {activeSection === 'configuration' && (
            <SettingsTab setup={setup} showAdvanced={showAdvanced} />
          )}
          {activeSection === 'appearance' && <AppearanceSection />}
          {activeSection === 'account' && authEnabled && (
            <>
              <ChangePasswordSection />
              <ActiveSessionsPanel />
            </>
          )}
        </div>
      </div>
    </PageContainer>
  );
}
