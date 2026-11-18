import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import SettingsPage from './SettingsPage.jsx';

// -- Heavy dep mocks --

vi.mock('../hooks/useSetup.js', () => ({
  useSetup: () => ({}),
}));

// useMediaQuery, useAuth and useAuthConfig are vi.fn so individual tests can override.
const { mockUseAuth, mockUseAuthConfig, mockUseMediaQuery } = vi.hoisted(() => ({
  mockUseAuth: vi.fn(),
  mockUseAuthConfig: vi.fn(),
  mockUseMediaQuery: vi.fn(),
}));

vi.mock('../hooks/useMediaQuery.js', () => ({
  useMediaQuery: () => mockUseMediaQuery(),
}));

vi.mock('../hooks/useAuth.js', () => ({
  useAuth: () => mockUseAuth(),
}));

vi.mock('../hooks/useAuthConfig.js', () => ({
  useAuthConfig: () => mockUseAuthConfig(),
}));

// Stub the leaf sections and groups so we only test nav/visibility logic. GeneralSection
// and PreferencesSection stay real, so their mounting is tested. Each stub renders its
// group's h2 title, and the household stubs carry a row label the member tests look for.
vi.mock('../components/settings/DevicesGroup.jsx', () => ({
  default: ({ onNavigate }) => (
    <section>
      <h2>Devices</h2>Scheduled Repair
      <button type="button" onClick={() => onNavigate('devices')}>Go to Devices</button>
    </section>
  ),
}));
vi.mock('../components/settings/DataGroup.jsx', () => ({
  default: () => <section><h2>Data</h2>Retention cutoff</section>,
}));
vi.mock('../components/settings/AlertDefaultsGroup.jsx', () => ({
  default: () => <section><h2>Alerts</h2></section>,
}));
vi.mock('../components/settings/NotificationsGroup.jsx', () => ({
  default: ({ onNavigate }) => (
    <section>
      <h2>Notifications</h2>
      <button type="button" onClick={() => onNavigate('devices')}>Pick accessories</button>
    </section>
  ),
}));
vi.mock('../components/settings/TimelineGroup.jsx', () => ({
  default: () => <section><h2>Timeline</h2></section>,
}));
vi.mock('../components/settings/QuietHoursGroup.jsx', () => ({
  default: () => <section><h2>Quiet hours</h2></section>,
}));
vi.mock('../components/setup/AdminAdvancedSection.jsx', () => ({
  default: () => <section data-testid="admin-advanced"><h2>Advanced</h2>Log level</section>,
}));

vi.mock('../components/UsersPanel.jsx', () => ({
  default: () => <div data-testid="users-panel">UsersPanel</div>,
}));

vi.mock('../components/SMTPConfigSection.jsx', () => ({
  default: () => <div data-testid="smtp-section">SMTPConfigSection</div>,
}));

vi.mock('../components/ChangePasswordSection.jsx', () => ({
  default: () => <div data-testid="change-password">ChangePasswordSection</div>,
}));

vi.mock('../components/ActiveSessionsPanel.jsx', () => ({
  default: () => <div data-testid="active-sessions">ActiveSessionsPanel</div>,
}));

vi.mock('../components/AppearanceSection.jsx', () => ({
  default: () => <section data-testid="appearance-section"><h2>Appearance</h2></section>,
}));

vi.mock('../components/AboutSection.jsx', () => ({
  default: ({ buildVersion }) => <div data-testid="about-section">AboutSection {buildVersion}</div>,
}));

vi.mock('../components/PageContainer.jsx', () => ({
  default: ({ children }) => <div>{children}</div>,
}));

// -- Render helpers --

const AUTH = {
  off: { user: null, authEnabled: false },
  admin: { user: { id: 1, role: 'admin', email: 'admin@example.com' }, authEnabled: true },
  member: { user: { id: 2, role: 'member', email: 'member@example.com' }, authEnabled: true },
};

function setAuth(mode) {
  mockUseAuth.mockReturnValue({ user: AUTH[mode].user });
  mockUseAuthConfig.mockReturnValue({ authEnabled: AUTH[mode].authEnabled });
}

function renderPage({ auth, ...props } = {}) {
  if (auth) setAuth(auth);
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <SettingsPage {...props} />
    </QueryClientProvider>
  );
}

const railLabels = () => screen.getAllByRole('button').map((b) => b.textContent);

beforeEach(() => {
  vi.clearAllMocks();
  mockUseMediaQuery.mockReturnValue(true); // desktop: shows the left-rail nav
  setAuth('admin');
});

// -- Rail visibility --

describe('SettingsPage: rail', () => {
  it('auth off: shows Appearance, Preferences, General, Advanced, About', () => {
    renderPage({ auth: 'off' });
    expect(railLabels()).toEqual(['Appearance', 'Preferences', 'General', 'Advanced', 'About']);
    expect(within(screen.getByRole('group', { name: 'You' })).getAllByRole('button').map((b) => b.textContent))
      .toEqual(['Appearance', 'Preferences']);
    expect(within(screen.getByRole('group', { name: 'This home' })).getAllByRole('button').map((b) => b.textContent))
      .toEqual(['General', 'Advanced']);
  });

  it('admin: shows all seven items under You / This home', () => {
    renderPage({ auth: 'admin' });
    expect(railLabels()).toEqual([
      'Appearance', 'Preferences', 'Account', 'General', 'Users & email', 'Advanced', 'About',
    ]);
    expect(within(screen.getByRole('group', { name: 'You' })).getAllByRole('button').map((b) => b.textContent))
      .toEqual(['Appearance', 'Preferences', 'Account']);
    expect(within(screen.getByRole('group', { name: 'This home' })).getAllByRole('button').map((b) => b.textContent))
      .toEqual(['General', 'Users & email', 'Advanced']);
    // About sits outside both groups.
    const about = screen.getByRole('button', { name: 'About' });
    expect(within(screen.getByRole('group', { name: 'You' })).queryByText('About')).toBeNull();
    expect(within(screen.getByRole('group', { name: 'This home' })).queryByText('About')).toBeNull();
    expect(about).toBeInTheDocument();
  });

  it('member: shows Appearance, Preferences, Account, About and no "This home" heading', () => {
    renderPage({ auth: 'member' });
    expect(railLabels()).toEqual(['Appearance', 'Preferences', 'Account', 'About']);
    expect(screen.queryByText('This home')).toBeNull();
    expect(screen.queryByRole('group', { name: 'This home' })).toBeNull();
  });

  it('opens on Appearance', () => {
    renderPage({ auth: 'admin' });
    expect(screen.getByRole('heading', { level: 2, name: 'Appearance' })).toBeInTheDocument();
    expect(screen.queryByTestId('about-section')).toBeNull();
  });

  it.each(['general', 'advanced', 'admin', 'configuration', 'nonsense'])(
    'member holding section %j lands on Appearance with no household control', (section) => {
      renderPage({ auth: 'member', section, onSectionChange: vi.fn() });
      expect(screen.getByRole('heading', { level: 2, name: 'Appearance' })).toBeInTheDocument();
      expect(screen.queryByText('Retention cutoff')).toBeNull();
      expect(screen.queryByText('Log level')).toBeNull();
      expect(screen.queryByText('Scheduled Repair')).toBeNull();
    });

  it('renders no tablist anywhere in Settings', () => {
    renderPage({ auth: 'admin', section: 'general', onSectionChange: vi.fn() });
    expect(screen.queryByRole('tablist')).toBeNull();
  });

  it('General shows the Devices, Data and Alerts groups; Preferences shows Notifications, Timeline and Quiet hours', () => {
    const { unmount } = renderPage({ auth: 'admin', section: 'general', onSectionChange: vi.fn() });
    const h2s = () => screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent);
    expect(h2s()).toEqual(['Devices', 'Data', 'Alerts']);
    // Advanced (Log level, Danger Zone) is its own page, not part of General.
    expect(screen.queryByText('Log level')).toBeNull();
    unmount();

    renderPage({ auth: 'admin', section: 'preferences', onSectionChange: vi.fn() });
    expect(h2s()).toEqual(['Notifications', 'Timeline', 'Quiet hours']);
  });

  it('passes onNavigate to the General and Preferences pages', () => {
    const onNavigate = vi.fn();
    const { unmount } = renderPage({ auth: 'admin', section: 'general', onSectionChange: vi.fn(), onNavigate });
    fireEvent.click(screen.getByRole('button', { name: 'Go to Devices' }));
    unmount();
    renderPage({ auth: 'admin', section: 'preferences', onSectionChange: vi.fn(), onNavigate });
    fireEvent.click(screen.getByRole('button', { name: 'Pick accessories' }));
    expect(onNavigate).toHaveBeenCalledTimes(2);
    expect(onNavigate).toHaveBeenCalledWith('devices');
  });

  it('Advanced shows the Log level and Danger Zone section', () => {
    renderPage({ auth: 'off' });
    fireEvent.click(screen.getByRole('button', { name: 'Advanced' }));
    expect(screen.getByTestId('admin-advanced')).toBeInTheDocument();
  });

  it('phone: the select groups options under You and This home', () => {
    mockUseMediaQuery.mockReturnValue(false);
    renderPage({ auth: 'admin' });
    expect(screen.queryByRole('navigation')).toBeNull(); // no desktop rail
    const select = screen.getByRole('combobox');
    const groups = [...select.querySelectorAll('optgroup')];
    expect(groups.map((g) => g.label)).toEqual(['You', 'This home']);
    expect([...groups[0].querySelectorAll('option')].map((o) => o.value))
      .toEqual(['appearance', 'preferences', 'account']);
    expect([...groups[1].querySelectorAll('option')].map((o) => o.value))
      .toEqual(['general', 'admin', 'advanced']);
    const about = [...select.querySelectorAll('option')].find((o) => o.value === 'about');
    expect(about.parentElement).toBe(select);
    expect(select.value).toBe('appearance');
  });

  it('phone: a member sees no This home optgroup', () => {
    mockUseMediaQuery.mockReturnValue(false);
    renderPage({ auth: 'member' });
    const select = screen.getByRole('combobox');
    expect([...select.querySelectorAll('optgroup')].map((g) => g.label)).toEqual(['You']);
  });
});

// -- Auth modes --

describe('SettingsPage: auth-off mode (AUTH_ENABLED=false)', () => {
  it('does NOT render UsersPanel or SMTPConfigSection in auth-off', () => {
    renderPage({ auth: 'off' });
    expect(screen.queryByTestId('users-panel')).not.toBeInTheDocument();
    expect(screen.queryByTestId('smtp-section')).not.toBeInTheDocument();
  });

  it('does NOT render ChangePasswordSection or ActiveSessionsPanel in auth-off', () => {
    renderPage({ auth: 'off' });
    expect(screen.queryByTestId('change-password')).not.toBeInTheDocument();
    expect(screen.queryByTestId('active-sessions')).not.toBeInTheDocument();
  });
});

describe('SettingsPage: auth-on, member (not admin)', () => {
  it('shows Account content when Account nav is clicked', () => {
    renderPage({ auth: 'member' });
    fireEvent.click(screen.getByRole('button', { name: 'Account' }));
    expect(screen.getByTestId('change-password')).toBeInTheDocument();
    expect(screen.getByTestId('active-sessions')).toBeInTheDocument();
  });
});

describe('SettingsPage: auth-on, admin', () => {
  it('shows UsersPanel and SMTPConfigSection in Users & email', () => {
    renderPage({ auth: 'admin' });
    fireEvent.click(screen.getByRole('button', { name: 'Users & email' }));
    expect(screen.getByTestId('users-panel')).toBeInTheDocument();
    expect(screen.getByTestId('smtp-section')).toBeInTheDocument();
    expect(screen.queryByTestId('admin-advanced')).not.toBeInTheDocument();
  });

  it('shows Account content when Account nav is clicked', () => {
    renderPage({ auth: 'admin' });
    fireEvent.click(screen.getByRole('button', { name: 'Account' }));
    expect(screen.getByTestId('change-password')).toBeInTheDocument();
    expect(screen.getByTestId('active-sessions')).toBeInTheDocument();
  });

  it('falls back to Appearance when the held section is not visible (guard)', () => {
    // An admin who was on Account, after auth was turned off.
    renderPage({ auth: 'off', section: 'account', onSectionChange: vi.fn() });
    expect(screen.getByTestId('appearance-section')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Account' })).not.toBeInTheDocument();
  });
});

// -- About --

describe('SettingsPage: About section', () => {
  it('is available in auth-off mode too', () => {
    renderPage({ auth: 'off' });
    expect(screen.getByRole('button', { name: 'About' })).toBeInTheDocument();
  });

  // It used to be stacked under Appearance, which is where nobody looks for a
  // version number.
  it('does not render About underneath Appearance', () => {
    renderPage({ auth: 'admin' });
    fireEvent.click(screen.getByRole('button', { name: 'Appearance' }));
    expect(screen.getByTestId('appearance-section')).toBeInTheDocument();
    expect(screen.queryByTestId('about-section')).not.toBeInTheDocument();
  });

  it('shows About when its nav item is clicked', () => {
    renderPage({ auth: 'admin' });
    fireEvent.click(screen.getByRole('button', { name: 'About' }));
    expect(screen.getByTestId('about-section')).toBeInTheDocument();
  });

  it('passes its props through to AboutSection', () => {
    renderPage({ auth: 'admin', section: 'about', onSectionChange: vi.fn(), buildVersion: '9.9.9' });
    expect(screen.getByTestId('about-section')).toHaveTextContent('AboutSection 9.9.9');
  });
});

// -- Controlled section (deep linking) --

describe('SettingsPage: controlled section (deep linking)', () => {
  // This is what the account menu's Appearance shortcut relies on.
  it('opens directly on the section it is given', () => {
    renderPage({ auth: 'admin', section: 'about', onSectionChange: vi.fn() });
    expect(screen.getByTestId('about-section')).toBeInTheDocument();
    expect(screen.queryByTestId('appearance-section')).not.toBeInTheDocument();
  });

  it('deep-links to appearance', () => {
    renderPage({ auth: 'admin', section: 'appearance', onSectionChange: vi.fn() });
    expect(screen.getByTestId('appearance-section')).toBeInTheDocument();
  });

  it('reports nav clicks upward instead of holding its own state', () => {
    const onSectionChange = vi.fn();
    renderPage({ auth: 'admin', section: 'appearance', onSectionChange });
    fireEvent.click(screen.getByRole('button', { name: 'About' }));
    expect(onSectionChange).toHaveBeenCalledWith('about');
    // Controlled: the page stays where the parent says until the parent updates it.
    expect(screen.getByTestId('appearance-section')).toBeInTheDocument();
  });

  it('uncontrolled: owns the section itself when rendered without section/onSectionChange', () => {
    renderPage({ auth: 'admin' });
    fireEvent.click(screen.getByRole('button', { name: 'General' }));
    expect(screen.getByRole('heading', { level: 2, name: 'Devices' })).toBeInTheDocument();
  });

  it('falls back to Appearance when handed a section that is not visible', () => {
    renderPage({ auth: 'off', section: 'account', onSectionChange: vi.fn() });
    expect(screen.getByTestId('appearance-section')).toBeInTheDocument();
  });
});
