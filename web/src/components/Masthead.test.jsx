import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within, fireEvent, waitFor } from '@testing-library/react';

const setPreference = vi.fn();
const mutate = vi.fn();
const mockNavigate = vi.fn();
const flushNow = vi.fn(() => Promise.resolve());
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
vi.mock('../hooks/useUserPreferences.js', () => ({
  useUserPreferences: () => ({ flushNow }),
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
    flushNow.mockClear();
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

  // The version string moved to Settings -> About: it is diagnostic metadata,
  // not something you act on, so it no longer occupies persistent chrome.
  it('does not show a build version in the masthead', () => {
    renderMasthead();
    expect(screen.queryByText(/v0\.4\.0/)).toBeNull();
  });

  // Only the actionable half stays: a dot on Settings pointing at About.
  it('marks Settings with a dot when a new version is available', () => {
    const { unmount } = renderMasthead({ hasNewVersion: false });
    expect(screen.queryByLabelText('New version available')).toBeNull();
    unmount();

    renderMasthead({ hasNewVersion: true });
    expect(screen.getByLabelText('New version available')).toBeInTheDocument();
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
  describe('account menu', () => {
    const openMenu = () => fireEvent.click(screen.getByRole('button', { name: /Account:/ }));

    it('keeps sign out behind the menu rather than loose in the toolbar', () => {
      renderMasthead();
      // Sign out is reversible, so it gets a menu rather than a confirm dialog —
      // but it must not sit one misclick from the theme toggle either.
      expect(screen.queryByRole('menuitem', { name: 'Sign out' })).toBeNull();
      openMenu();
      expect(screen.getByRole('menuitem', { name: 'Sign out' })).toBeInTheDocument();
    });

    it('shows who is signed in', () => {
      renderMasthead();
      openMenu();
      expect(screen.getByText('admin@example.com')).toBeInTheDocument();
    });

    it('falls back to the role when the account has no email', () => {
      authState.user = { role: 'member' };
      renderMasthead();
      openMenu();
      expect(screen.getByText('Member')).toBeInTheDocument();
      expect(screen.queryByText(/undefined/)).toBeNull();
    });

    it('offers a shortcut to Appearance', () => {
      const onNavigate = vi.fn();
      renderMasthead({ onNavigate });
      openMenu();
      fireEvent.click(screen.getByRole('menuitem', { name: 'Appearance' }));
      expect(onNavigate).toHaveBeenCalledWith('settings');
    });

    it('closes on Escape', () => {
      renderMasthead();
      openMenu();
      fireEvent.keyDown(document, { key: 'Escape' });
      expect(screen.queryByRole('menuitem', { name: 'Sign out' })).toBeNull();
    });

    // The bug this fixes: preference writes are debounced 500ms and logout only
    // DELETEs the session, so signing out just after a palette change discarded
    // it. The flush must complete BEFORE the session ends.
    it('flushes pending preference writes before ending the session', async () => {
      renderMasthead();
      openMenu();
      fireEvent.click(screen.getByRole('menuitem', { name: 'Sign out' }));

      await waitFor(() => expect(mutate).toHaveBeenCalled());
      expect(flushNow).toHaveBeenCalled();
      expect(flushNow.mock.invocationCallOrder[0])
        .toBeLessThan(mutate.mock.invocationCallOrder[0]);
    });

    it('signs out and clears the CSRF token before redirecting', async () => {
      sessionStorage.setItem('csrfToken', 'abc');
      renderMasthead();
      openMenu();
      fireEvent.click(screen.getByRole('menuitem', { name: 'Sign out' }));

      await waitFor(() => expect(mutate).toHaveBeenCalled());
      mutate.mock.calls[0][1].onSuccess();
      expect(sessionStorage.getItem('csrfToken')).toBeNull();
      expect(mockNavigate).toHaveBeenCalledWith('/login', { replace: true });
    });

    it('hides the account menu entirely when auth is disabled', () => {
      configState.authEnabled = false;
      renderMasthead();
      expect(screen.queryByRole('button', { name: /Account:/ })).toBeNull();
    });
  });
});
