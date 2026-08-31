import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within, fireEvent } from '@testing-library/react';

const setPreference = vi.fn();
const mutate = vi.fn();
const mockNavigate = vi.fn();
const themeState = { preference: 'system' };
const authState = { user: { email: 'admin@example.com', role: 'admin' } };
const configState = { authEnabled: true };

vi.mock('../hooks/useTheme.js', () => ({
  useTheme: () => ({ ...themeState, resolvedTheme: 'light', setPreference }),
}));
vi.mock('../hooks/useAuthConfig.js', () => ({
  useAuthConfig: () => configState,
}));
vi.mock('../hooks/useAuth.js', () => ({
  useAuth: () => ({ user: authState.user, logoutMutation: { mutate, isPending: false } }),
}));
vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
}));

const { default: Masthead } = await import('./Masthead.jsx');

const NAV = ['Dashboard', 'Devices', 'Timeline', 'Alerts', 'Settings'];

function renderMasthead(props = {}) {
  return render(
    <Masthead
      activePage="dashboard"
      onNavigate={vi.fn()}
      hasNewVersion={false}
      onOpenChangelog={vi.fn()}
      buildVersion="v0.4.0"
      availableUpdate={null}
      {...props}
    />,
  );
}

describe('Masthead', () => {
  beforeEach(() => {
    setPreference.mockClear();
    mutate.mockClear();
    mockNavigate.mockClear();
    themeState.preference = 'system';
    authState.user = { email: 'admin@example.com', role: 'admin' };
    configState.authEnabled = true;
  });

  // NAV-01
  it('exposes the five sections as a labelled navigation landmark', () => {
    renderMasthead();
    const nav = screen.getByRole('navigation', { name: 'Main navigation' });
    const buttons = within(nav).getAllByRole('button');
    expect(buttons.map((b) => b.textContent)).toEqual(NAV);
  });

  it('marks only the active section with aria-current', () => {
    renderMasthead({ activePage: 'timeline' });
    const nav = screen.getByRole('navigation', { name: 'Main navigation' });
    const current = within(nav).getAllByRole('button').filter((b) => b.getAttribute('aria-current') === 'page');
    expect(current).toHaveLength(1);
    expect(current[0]).toHaveTextContent('Timeline');
  });

  it('calls onNavigate with the section id', () => {
    const onNavigate = vi.fn();
    renderMasthead({ onNavigate });
    fireEvent.click(screen.getByRole('button', { name: 'Devices' }));
    expect(onNavigate).toHaveBeenCalledWith('devices');
  });

  // MALERT-07 — carried over from the sidebar: Alerts is never gated.
  it('always shows Alerts, with no enablement prop', () => {
    renderMasthead();
    expect(screen.getByRole('button', { name: 'Alerts' })).toBeInTheDocument();
  });

  // NAV-03
  it('renders the wordmark', () => {
    renderMasthead();
    expect(screen.getByRole('img', { name: 'homechronicle' })).toBeInTheDocument();
  });

  it('shows the build version and opens the changelog', () => {
    const onOpenChangelog = vi.fn();
    renderMasthead({ onOpenChangelog });
    const button = screen.getByRole('button', { name: /v0\.4\.0/ });
    fireEvent.click(button);
    expect(onOpenChangelog).toHaveBeenCalled();
  });

  it('links to an available update only when there is one', () => {
    const { unmount } = renderMasthead();
    expect(screen.queryByRole('link', { name: /available/ })).toBeNull();
    unmount();

    renderMasthead({ availableUpdate: { tag: 'v0.5.0', url: 'https://example.test/rel' } });
    const link = screen.getByRole('link', { name: /v0\.5\.0 available/ });
    expect(link).toHaveAttribute('href', 'https://example.test/rel');
    expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'));
  });

  it('cycles the theme preference', () => {
    themeState.preference = 'system';
    const { unmount } = renderMasthead();
    fireEvent.click(screen.getByRole('button', { name: 'Switch to light mode' }));
    expect(setPreference).toHaveBeenCalledWith('light');
    unmount();

    themeState.preference = 'light';
    renderMasthead();
    fireEvent.click(screen.getByRole('button', { name: 'Switch to dark mode' }));
    expect(setPreference).toHaveBeenCalledWith('dark');
  });

  // AUTH-03 — carried over from the sidebar.
  describe('account', () => {
    it('signs out and clears the CSRF token before redirecting', () => {
      sessionStorage.setItem('csrfToken', 'abc');
      renderMasthead();
      fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
      expect(mutate).toHaveBeenCalled();

      // Run the success path the mutation would invoke.
      mutate.mock.calls[0][1].onSuccess();
      expect(sessionStorage.getItem('csrfToken')).toBeNull();
      expect(mockNavigate).toHaveBeenCalledWith('/login', { replace: true });
    });

    it('falls back to the role when the account has no email', () => {
      authState.user = { role: 'member' };
      renderMasthead();
      expect(screen.getByText('Member')).toBeInTheDocument();
      expect(screen.queryByText(/undefined/)).toBeNull();
    });

    it('hides sign out when auth is disabled', () => {
      configState.authEnabled = false;
      renderMasthead();
      expect(screen.queryByRole('button', { name: 'Sign out' })).toBeNull();
    });

    it('shows sign out when auth is enabled', () => {
      configState.authEnabled = true;
      renderMasthead();
      expect(screen.getByRole('button', { name: 'Sign out' })).toBeInTheDocument();
    });
  });
});
