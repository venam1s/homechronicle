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
import AboutSection from '../components/AboutSection.jsx';

const NAV_ACTIVE =
  'px-3 py-2 rounded-lg bg-hc-panel-mid font-semibold text-hc-fg-strong border-l-2 border-hc-accent-strong cursor-pointer';
// Settings opens on Configuration, not on the first nav item: About is
// reference material, and landing there would put a read-only page between the
// user and the setting they came to change.
const DEFAULT_SECTION = 'configuration';

const NAV_INACTIVE =
  'px-3 py-2 rounded-lg text-hc-body text-hc-fg cursor-pointer hover:bg-hc-panel-hover';

/**
 * SettingsPage.
 *
 * `section` / `onSectionChange` make the active section CONTROLLED, so a caller
 * can deep-link into one — the account menu's "Appearance" item used to call
 * onNavigate('settings') and land on Configuration, because the section was
 * private state that the navigation could not address. Rendered without them
 * (unit tests, any future standalone use) it falls back to owning the state.
 */
export default function SettingsPage({
  buildVersion,
  hasNewVersion,
  onOpenChangelog,
  availableUpdate,
  updateStatus,
  section: controlledSection,
  onSectionChange,
}) {
  const setup = useSetup();
  const { user } = useAuth();
  const { authEnabled } = useAuthConfig();
  const isDesktop = useMediaQuery('(min-width: 768px)');
  const isAdmin = user?.role === 'admin';

  // Advanced (log level + Danger Zone) visible to admins in auth-on, and to
  // the sole operator in auth-off (no session = full access, same as v1.3).
  const showAdvanced = isAdmin || !authEnabled;

  const [ownSection, setOwnSection] = useState(DEFAULT_SECTION);
  const isControlled = controlledSection != null && typeof onSectionChange === 'function';
  const section = isControlled ? controlledSection : ownSection;
  const setSection = isControlled ? onSectionChange : setOwnSection;

  // Build visible nav items based on auth state:
  // - Admin tab: only when auth is on AND user is admin (Users + SMTP)
  // - Configuration: always present
  // - Account tab: only when auth is on (no password/session management in auth-off)
  // About leads: it is the app's identity card — version, what changed, where
  // to read the docs and file a bug — and it is the one section that is always
  // available whatever the auth mode.
  const navItems = [
    { id: 'about', label: 'About' },
    ...(authEnabled && isAdmin ? [{ id: 'admin', label: 'Admin' }] : []),
    { id: 'configuration', label: 'Configuration' },
    { id: 'appearance', label: 'Appearance' },
    ...(authEnabled ? [{ id: 'account', label: 'Account' }] : []),
  ];

  // Generalized guard: if the stored section is not in the visible nav, fall back
  // to 'configuration'. This handles auth-off (no admin/account) as well as the
  // prior member-on-admin case.
  const activeSection = navItems.some((i) => i.id === section) ? section : DEFAULT_SECTION;

  function handleNavChange(id) {
    if (!navItems.some((i) => i.id === id)) return;
    setSection(id);
  }

  return (
    <PageContainer>
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
          {activeSection === 'about' && (
            <AboutSection
              buildVersion={buildVersion}
              hasNewVersion={hasNewVersion}
              onOpenChangelog={onOpenChangelog}
              availableUpdate={availableUpdate}
              updateStatus={updateStatus}
            />
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
