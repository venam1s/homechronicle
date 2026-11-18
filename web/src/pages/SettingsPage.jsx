import { useState } from 'react';
import { useSetup } from '../hooks/useSetup.js';
import { useAuth } from '../hooks/useAuth.js';
import { useAuthConfig } from '../hooks/useAuthConfig.js';
import { useCanManageHome } from '../hooks/useCanManageHome.js';
import { useMediaQuery } from '../hooks/useMediaQuery.js';
import PageContainer from '../components/PageContainer.jsx';
import UsersPanel from '../components/UsersPanel.jsx';
import SMTPConfigSection from '../components/SMTPConfigSection.jsx';
import ChangePasswordSection from '../components/ChangePasswordSection.jsx';
import ActiveSessionsPanel from '../components/ActiveSessionsPanel.jsx';
import AppearanceSection from '../components/AppearanceSection.jsx';
import AboutSection from '../components/AboutSection.jsx';
import GeneralSection from '../components/settings/GeneralSection.jsx';
import PreferencesSection from '../components/settings/PreferencesSection.jsx';
import AdminAdvancedSection from '../components/setup/AdminAdvancedSection.jsx';

const NAV_ACTIVE =
  'px-3 py-2 rounded-lg bg-hc-panel-mid font-semibold text-hc-fg-strong border-l-2 border-hc-accent-strong cursor-pointer';
const NAV_INACTIVE =
  'px-3 py-2 rounded-lg text-hc-body text-hc-fg cursor-pointer hover:bg-hc-panel-hover';
const GROUP_HEADING = 'px-3 pb-1 text-xs font-semibold uppercase tracking-wider text-hc-muted';

// Settings opens on the first item. An id that is unknown or not visible to
// this viewer (including the retired 'configuration') falls back to it.
const DEFAULT_SECTION = 'appearance';

/**
 * Rail groups by owner: "You" holds per-user settings; "This home" holds
 * household settings that only an admin, or the sole operator when auth is
 * off, may change. About stands alone with no heading. Items the viewer may
 * not see are dropped, and a group left empty is dropped with its heading.
 */
function buildNavGroups({ authEnabled, isAdmin, canManageHome }) {
  const groups = [
    {
      id: 'you',
      heading: 'You',
      items: [
        { id: 'appearance', label: 'Appearance' },
        { id: 'preferences', label: 'Preferences' },
        authEnabled && { id: 'account', label: 'Account' },
      ],
    },
    {
      id: 'home',
      heading: 'This home',
      items: [
        canManageHome && { id: 'general', label: 'General' },
        authEnabled && isAdmin && { id: 'admin', label: 'Users & email' },
        canManageHome && { id: 'advanced', label: 'Advanced' },
      ],
    },
    { id: 'other', heading: null, items: [{ id: 'about', label: 'About' }] },
  ];
  return groups
    .map((group) => ({ ...group, items: group.items.filter(Boolean) }))
    .filter((group) => group.items.length > 0);
}

/**
 * SettingsPage.
 *
 * `section` / `onSectionChange` make the active section CONTROLLED, so a caller
 * can deep-link into one, as the account menu's "Appearance" item does.
 * Rendered without them (unit tests, any future standalone use) it falls back
 * to owning the state. `onNavigate(page, options)` lets a settings page link
 * elsewhere in the app.
 */
export default function SettingsPage({
  buildVersion,
  hasNewVersion,
  onOpenChangelog,
  availableUpdate,
  updateStatus,
  section: controlledSection,
  onSectionChange,
  onNavigate,
}) {
  const setup = useSetup();
  const { user } = useAuth();
  const { authEnabled } = useAuthConfig();
  const canManageHome = useCanManageHome();
  const isDesktop = useMediaQuery('(min-width: 768px)');
  const isAdmin = user?.role === 'admin';

  const [ownSection, setOwnSection] = useState(DEFAULT_SECTION);
  const isControlled = controlledSection != null && typeof onSectionChange === 'function';
  const section = isControlled ? controlledSection : ownSection;
  const setSection = isControlled ? onSectionChange : setOwnSection;

  const navGroups = buildNavGroups({ authEnabled, isAdmin, canManageHome });
  const navItems = navGroups.flatMap((group) => group.items);

  // A held section the viewer cannot see (a member holding 'general', the old
  // 'configuration', 'account' after auth is turned off) lands on the default.
  const activeSection = navItems.some((i) => i.id === section) ? section : DEFAULT_SECTION;

  function handleNavChange(id) {
    if (!navItems.some((i) => i.id === id)) return;
    setSection(id);
  }

  function renderNavItem(item) {
    return (
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
    );
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
            {navGroups.map((group) => {
              const options = group.items.map((item) => (
                <option key={item.id} value={item.id}>{item.label}</option>
              ));
              return group.heading
                ? <optgroup key={group.id} label={group.heading}>{options}</optgroup>
                : options;
            })}
          </select>
        </div>
      )}

      <div className="flex gap-6">
        {/* Desktop: left-rail nav */}
        {isDesktop && (
          <nav className="w-40 shrink-0 flex flex-col gap-4">
            {navGroups.map((group) => (
              group.heading ? (
                <div
                  key={group.id}
                  role="group"
                  aria-labelledby={`settings-nav-${group.id}`}
                  className="flex flex-col gap-1"
                >
                  <div id={`settings-nav-${group.id}`} className={GROUP_HEADING}>{group.heading}</div>
                  {group.items.map(renderNavItem)}
                </div>
              ) : (
                <div key={group.id} className="flex flex-col gap-1">
                  {group.items.map(renderNavItem)}
                </div>
              )
            ))}
          </nav>
        )}

        {/* Content area. activeSection is always a visible item, so each page
            below is already gated by the rail's rules. */}
        <div className="flex-1 min-w-0 max-w-[720px] space-y-4">
          {activeSection === 'appearance' && <AppearanceSection />}
          {activeSection === 'preferences' && (
            <PreferencesSection setup={setup} onNavigate={onNavigate} />
          )}
          {activeSection === 'account' && (
            <>
              <ChangePasswordSection />
              <ActiveSessionsPanel />
            </>
          )}
          {activeSection === 'general' && (
            <GeneralSection setup={setup} onNavigate={onNavigate} />
          )}
          {activeSection === 'admin' && (
            <>
              <UsersPanel />
              <SMTPConfigSection />
            </>
          )}
          {activeSection === 'advanced' && <AdminAdvancedSection setup={setup} />}
          {activeSection === 'about' && (
            <AboutSection
              buildVersion={buildVersion}
              hasNewVersion={hasNewVersion}
              onOpenChangelog={onOpenChangelog}
              availableUpdate={availableUpdate}
              updateStatus={updateStatus}
            />
          )}
        </div>
      </div>
    </PageContainer>
  );
}
