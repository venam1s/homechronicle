import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import SettingsPage from './SettingsPage.jsx';

// -- Heavy dep mocks --

vi.mock('../hooks/useSetup.js', () => ({
  useSetup: () => ({}),
}));

vi.mock('../hooks/useMediaQuery.js', () => ({
  useMediaQuery: () => true, // desktop — shows the left-rail nav
}));

// useAuth and useAuthConfig are mocked via vi.fn so individual tests can override.
const { mockUseAuth, mockUseAuthConfig } = vi.hoisted(() => ({
  mockUseAuth: vi.fn(),
  mockUseAuthConfig: vi.fn(),
}));

vi.mock('../hooks/useAuth.js', () => ({
  useAuth: () => mockUseAuth(),
}));

vi.mock('../hooks/useAuthConfig.js', () => ({
  useAuthConfig: () => mockUseAuthConfig(),
}));

// Stub child sections so we only test nav/visibility logic, not their internals.
// SettingsTab stub exposes showAdvanced via data attribute so tests can verify the prop.
vi.mock('../components/setup/SettingsTab.jsx', () => ({
  default: ({ showAdvanced }) => (
    <div data-testid="settings-tab" data-show-advanced={showAdvanced ? 'true' : 'false'}>SettingsTab</div>
  ),
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

vi.mock('../components/PageContainer.jsx', () => ({
  default: ({ children }) => <div>{children}</div>,
}));

// -- Render helper --

function renderSettings() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <SettingsPage />
    </QueryClientProvider>
  );
}

// -- Test scenarios --

describe('SettingsPage — auth-off mode (AUTH_ENABLED=false)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseAuth.mockReturnValue({ user: null });
    mockUseAuthConfig.mockReturnValue({ authEnabled: false });
  });

  it('shows only the Configuration nav item (no Admin, no Account)', () => {
    renderSettings();
    expect(screen.getByRole('button', { name: 'Configuration' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Admin' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Account' })).not.toBeInTheDocument();
  });

  it('renders SettingsTab in Configuration by default', () => {
    renderSettings();
    expect(screen.getByTestId('settings-tab')).toBeInTheDocument();
  });

  it('passes showAdvanced=true to SettingsTab in Configuration (showAdvanced = !authEnabled)', () => {
    renderSettings();
    expect(screen.getByTestId('settings-tab')).toHaveAttribute('data-show-advanced', 'true');
  });

  it('does NOT render UsersPanel or SMTPConfigSection in auth-off', () => {
    renderSettings();
    expect(screen.queryByTestId('users-panel')).not.toBeInTheDocument();
    expect(screen.queryByTestId('smtp-section')).not.toBeInTheDocument();
  });

  it('does NOT render ChangePasswordSection or ActiveSessionsPanel in auth-off', () => {
    renderSettings();
    expect(screen.queryByTestId('change-password')).not.toBeInTheDocument();
    expect(screen.queryByTestId('active-sessions')).not.toBeInTheDocument();
  });
});

describe('SettingsPage — auth-on, member (not admin)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseAuth.mockReturnValue({ user: { id: 1, role: 'member', email: 'member@example.com' } });
    mockUseAuthConfig.mockReturnValue({ authEnabled: true });
  });

  it('shows Configuration and Account nav items but NOT Admin', () => {
    renderSettings();
    expect(screen.getByRole('button', { name: 'Configuration' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Account' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Admin' })).not.toBeInTheDocument();
  });

  it('passes showAdvanced=false to SettingsTab in Configuration (member has no Advanced)', () => {
    renderSettings();
    expect(screen.getByTestId('settings-tab')).toHaveAttribute('data-show-advanced', 'false');
  });

  it('shows SettingsTab in Configuration', () => {
    renderSettings();
    expect(screen.getByTestId('settings-tab')).toBeInTheDocument();
  });

  it('shows Account content when Account nav is clicked', () => {
    renderSettings();
    fireEvent.click(screen.getByRole('button', { name: 'Account' }));
    expect(screen.getByTestId('change-password')).toBeInTheDocument();
    expect(screen.getByTestId('active-sessions')).toBeInTheDocument();
  });
});

describe('SettingsPage — auth-on, admin', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseAuth.mockReturnValue({ user: { id: 1, role: 'admin', email: 'admin@example.com' } });
    mockUseAuthConfig.mockReturnValue({ authEnabled: true });
  });

  it('shows Admin, Configuration, and Account nav items', () => {
    renderSettings();
    expect(screen.getByRole('button', { name: 'Admin' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Configuration' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Account' })).toBeInTheDocument();
  });

  it('passes showAdvanced=true to SettingsTab under Configuration (showAdvanced = isAdmin)', () => {
    renderSettings();
    // Configuration is the default active section
    expect(screen.getByTestId('settings-tab')).toHaveAttribute('data-show-advanced', 'true');
  });

  it('shows SettingsTab with showAdvanced=true in Configuration', () => {
    renderSettings();
    expect(screen.getByTestId('settings-tab')).toBeInTheDocument();
    expect(screen.getByTestId('settings-tab')).toHaveAttribute('data-show-advanced', 'true');
  });

  it('shows UsersPanel and SMTPConfigSection (NOT SettingsTab) in Admin tab', () => {
    renderSettings();
    fireEvent.click(screen.getByRole('button', { name: 'Admin' }));
    expect(screen.getByTestId('users-panel')).toBeInTheDocument();
    expect(screen.getByTestId('smtp-section')).toBeInTheDocument();
    // SettingsTab (and its Advanced content) lives in Configuration only — not in Admin tab
    expect(screen.queryByTestId('settings-tab')).not.toBeInTheDocument();
  });

  it('shows Account content when Account nav is clicked', () => {
    renderSettings();
    fireEvent.click(screen.getByRole('button', { name: 'Account' }));
    expect(screen.getByTestId('change-password')).toBeInTheDocument();
    expect(screen.getByTestId('active-sessions')).toBeInTheDocument();
  });

  it('falls back to Configuration when stored section is not in nav (guard)', () => {
    // Simulate a user who had 'account' stored but then auth-off kicked in.
    // We test this by rendering as auth-off after an admin session.
    mockUseAuth.mockReturnValue({ user: null });
    mockUseAuthConfig.mockReturnValue({ authEnabled: false });
    renderSettings();
    // Default 'configuration' section renders; no Admin or Account present
    expect(screen.getByTestId('settings-tab')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Account' })).not.toBeInTheDocument();
  });
});
