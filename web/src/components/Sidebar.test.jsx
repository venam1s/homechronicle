import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import Sidebar from './Sidebar.jsx';

// useAuthConfig lives in its own file; mock it so Sidebar tests don't need a QueryClientProvider.
// Default: auth-on (authEnabled: true) — existing 16 tests see unchanged behavior.
const { mockUseAuthConfig } = vi.hoisted(() => ({ mockUseAuthConfig: vi.fn(() => ({ authEnabled: true })) }));
vi.mock('../hooks/useAuthConfig.js', () => ({
  useAuthConfig: () => mockUseAuthConfig(),
}));

vi.mock('../hooks/useTheme.js', () => ({
  useTheme: () => ({
    preference: 'system',
    resolvedTheme: 'light',
    setPreference: vi.fn(),
  }),
}));

vi.mock('../hooks/useAccent.js', () => ({
  useAccent: () => ({
    accent: 'ocean',
    setAccent: vi.fn(),
  }),
}));

const { mockNavigate } = vi.hoisted(() => ({ mockNavigate: vi.fn() }));

vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
}));

const { mockLogoutMutate } = vi.hoisted(() => ({ mockLogoutMutate: vi.fn() }));

vi.mock('../hooks/useAuth.js', () => ({
  useAuth: vi.fn(() => ({
    user: { id: 1, role: 'admin' },
    isLoading: false,
    isError: false,
    logoutMutation: {
      mutate: mockLogoutMutate,
      isPending: false,
    },
  })),
}));

const defaultProps = {
  collapsed: false,
  onToggle: vi.fn(),
  inDrawer: false,
  activePage: 'dashboard',
  onNavigate: vi.fn(),
  showChangelog: false,
  hasNewVersion: false,
  onOpenChangelog: vi.fn(),
  buildVersion: 'v1.0.0',
  availableUpdate: null,
  onDismissUpdate: vi.fn(),
};

describe('Sidebar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('Test 1 (NAV-01): renders 5 nav buttons with accessible names', () => {
    render(<Sidebar {...defaultProps} />);
    expect(screen.getByRole('button', { name: 'Dashboard' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Devices' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Timeline' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Alerts' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Settings' })).toBeInTheDocument();
  });

  it('Test 2 (NAV-01): each nav button has an SVG icon child', () => {
    render(<Sidebar {...defaultProps} />);
    const dashBtn = screen.getByRole('button', { name: 'Dashboard' });
    expect(dashBtn.querySelector('svg')).not.toBeNull();
    const timelineBtn = screen.getByRole('button', { name: 'Timeline' });
    expect(timelineBtn.querySelector('svg')).not.toBeNull();
  });

  it('Test 3 (NAV-05): active page button has aria-current="page", others do not', () => {
    render(<Sidebar {...defaultProps} activePage="timeline" />);
    const timelineBtn = screen.getByRole('button', { name: 'Timeline' });
    expect(timelineBtn).toHaveAttribute('aria-current', 'page');
    const dashBtn = screen.getByRole('button', { name: 'Dashboard' });
    expect(dashBtn).not.toHaveAttribute('aria-current');
    const devicesBtn = screen.getByRole('button', { name: 'Devices' });
    expect(devicesBtn).not.toHaveAttribute('aria-current');
  });

  it('Test 4 (NAV-02): clicking edge handle button calls onToggle', () => {
    const onToggle = vi.fn();
    render(<Sidebar {...defaultProps} onToggle={onToggle} />);
    const handle = screen.getByRole('button', { name: 'Collapse sidebar' });
    fireEvent.click(handle);
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it('Test 5 (NAV-02): when collapsed=true, nav buttons have title attribute', () => {
    render(<Sidebar {...defaultProps} collapsed={true} />);
    expect(screen.getByRole('button', { name: /Dashboard/i })).toHaveAttribute('title', 'Dashboard');
    expect(screen.getByRole('button', { name: /Devices/i })).toHaveAttribute('title', 'Devices');
    expect(screen.getByRole('button', { name: /Timeline/i })).toHaveAttribute('title', 'Timeline');
  });

  it('Test 6 (NAV-02): when collapsed=false, nav buttons do NOT have title attribute', () => {
    render(<Sidebar {...defaultProps} collapsed={false} />);
    const dashBtn = screen.getByRole('button', { name: 'Dashboard' });
    expect(dashBtn).not.toHaveAttribute('title');
  });

  it('Test 7: clicking a nav button calls onNavigate with the item id', () => {
    const onNavigate = vi.fn();
    render(<Sidebar {...defaultProps} onNavigate={onNavigate} />);
    fireEvent.click(screen.getByRole('button', { name: 'Timeline' }));
    expect(onNavigate).toHaveBeenCalledWith('timeline');
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    expect(onNavigate).toHaveBeenCalledWith('settings');
  });

  it('Test 8: edge handle has correct aria-label based on collapsed state', () => {
    const { rerender } = render(<Sidebar {...defaultProps} collapsed={false} />);
    expect(screen.getByRole('button', { name: 'Collapse sidebar' })).toBeInTheDocument();

    rerender(<Sidebar {...defaultProps} collapsed={true} />);
    expect(screen.getByRole('button', { name: 'Expand sidebar' })).toBeInTheDocument();
  });

  it('Test 9: sidebar has role="navigation" and aria-label="Main navigation"', () => {
    render(<Sidebar {...defaultProps} />);
    expect(screen.getByRole('navigation', { name: 'Main navigation' })).toBeInTheDocument();
  });

  it('Test 10: hides edge handle when inDrawer is true', () => {
    render(<Sidebar {...defaultProps} inDrawer={true} />);
    expect(screen.queryByRole('button', { name: /expand|collapse/i })).not.toBeInTheDocument();
  });

  it('Test 11: hides edge handle when onToggle is undefined', () => {
    render(<Sidebar {...defaultProps} onToggle={undefined} />);
    expect(screen.queryByRole('button', { name: /expand|collapse/i })).not.toBeInTheDocument();
  });

  // -- Sign out control tests (AUTH-03) --

  it('Test 12 (AUTH-03): renders a Sign out button in expanded sidebar (accessible name "Sign out")', () => {
    render(<Sidebar {...defaultProps} collapsed={false} />);
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeInTheDocument();
  });

  it('Test 13 (AUTH-03): renders a Sign out button when collapsed=true (accessible name "Sign out" via aria-label)', () => {
    render(<Sidebar {...defaultProps} collapsed={true} />);
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeInTheDocument();
  });

  it('Test 14 (AUTH-03): clicking Sign out calls logoutMutation.mutate', () => {
    render(<Sidebar {...defaultProps} collapsed={false} />);
    const signOutBtn = screen.getByRole('button', { name: 'Sign out' });
    fireEvent.click(signOutBtn);
    expect(mockLogoutMutate).toHaveBeenCalledTimes(1);
  });

  it('Test 15 (AUTH-03): logout onSuccess clears csrfToken from sessionStorage and navigates to /login', () => {
    // Configure mockLogoutMutate to invoke the onSuccess callback synchronously
    mockLogoutMutate.mockImplementation((_arg, opts) => {
      opts?.onSuccess?.();
    });
    sessionStorage.setItem('csrfToken', 'test-token-value');

    render(<Sidebar {...defaultProps} collapsed={false} />);
    const signOutBtn = screen.getByRole('button', { name: 'Sign out' });
    fireEvent.click(signOutBtn);

    expect(sessionStorage.getItem('csrfToken')).toBeNull();
    expect(mockNavigate).toHaveBeenCalledWith('/login', { replace: true });
  });

  it('Test 16 (AUTH-03): account label falls back gracefully when /auth/me has no email (shows role, not undefined)', () => {
    // Default mock already has user: { id: 1, role: 'admin' } with no email
    render(<Sidebar {...defaultProps} collapsed={false} />);
    // The label should show a capitalized role ("Admin"), never undefined or blank
    expect(screen.getByText('Admin')).toBeInTheDocument();
  });

  // -- Auth-off sidebar tests --

  it('Test 17 (AUTH-OFF): hides Sign out button in expanded sidebar when authEnabled is false', () => {
    mockUseAuthConfig.mockReturnValueOnce({ authEnabled: false });
    render(<Sidebar {...defaultProps} collapsed={false} />);
    expect(screen.queryByRole('button', { name: 'Sign out' })).not.toBeInTheDocument();
  });

  it('Test 18 (AUTH-OFF): hides Sign out button in collapsed sidebar when authEnabled is false', () => {
    mockUseAuthConfig.mockReturnValueOnce({ authEnabled: false });
    render(<Sidebar {...defaultProps} collapsed={true} />);
    expect(screen.queryByRole('button', { name: 'Sign out' })).not.toBeInTheDocument();
  });

  it('Test 19 (AUTH-OFF): shows Sign out button when authEnabled is true (guard does not over-suppress)', () => {
    mockUseAuthConfig.mockReturnValueOnce({ authEnabled: true });
    render(<Sidebar {...defaultProps} collapsed={false} />);
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeInTheDocument();
  });
});
