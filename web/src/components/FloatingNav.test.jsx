import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import FloatingNav from './FloatingNav.jsx';

function setup(props = {}) {
  const onNavigate = vi.fn();
  const scrollEl = document.createElement('div');
  document.body.appendChild(scrollEl);
  const scrollRef = { current: scrollEl };
  const utils = render(
    <FloatingNav activePage="dashboard" onNavigate={onNavigate} scrollRef={scrollRef} {...props} />,
  );
  return { onNavigate, scrollEl, scrollRef, ...utils };
}

function openMenu() {
  fireEvent.click(screen.getByRole('button', { name: 'Open navigation menu' }));
}

describe('FloatingNav', () => {
  it('renders a collapsed FAB and hides the page links by default', () => {
    setup();
    const fab = screen.getByRole('button', { name: 'Open navigation menu' });
    expect(fab).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('Timeline')).not.toBeInTheDocument();
  });

  it('expands to reveal all five page links when the FAB is tapped', () => {
    setup();
    openMenu();
    expect(screen.getByRole('button', { name: 'Close navigation menu' })).toHaveAttribute('aria-expanded', 'true');
    for (const label of ['Dashboard', 'Devices', 'Timeline', 'Alerts', 'Settings']) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  it('calls onNavigate and collapses when a page is selected', () => {
    const { onNavigate } = setup();
    openMenu();
    fireEvent.click(screen.getByText('Timeline'));
    expect(onNavigate).toHaveBeenCalledWith('timeline');
    expect(screen.getByRole('button', { name: 'Open navigation menu' })).toBeInTheDocument();
    expect(screen.queryByText('Timeline')).not.toBeInTheDocument();
  });

  it('marks the active page with aria-current', () => {
    setup({ activePage: 'alerts' });
    openMenu();
    expect(screen.getByText('Alerts').closest('button')).toHaveAttribute('aria-current', 'page');
    expect(screen.getByText('Dashboard').closest('button')).not.toHaveAttribute('aria-current', 'page');
  });

  it('collapses on Escape', () => {
    setup();
    openMenu();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.getByRole('button', { name: 'Open navigation menu' })).toBeInTheDocument();
  });

  it('collapses when the backdrop is clicked', () => {
    setup();
    openMenu();
    fireEvent.click(screen.getByTestId('floatingnav-backdrop'));
    expect(screen.getByRole('button', { name: 'Open navigation menu' })).toBeInTheDocument();
  });

  it('collapses when the scroll container is scrolled', () => {
    const { scrollEl } = setup();
    openMenu();
    fireEvent.scroll(scrollEl);
    expect(screen.getByRole('button', { name: 'Open navigation menu' })).toBeInTheDocument();
    expect(screen.queryByText('Timeline')).not.toBeInTheDocument();
  });

  it('hides Sign out unless onSignOut is passed (login turned off)', () => {
    setup();
    openMenu();
    expect(screen.queryByRole('button', { name: 'Sign out' })).not.toBeInTheDocument();
  });

  // The masthead's account menu doesn't render below 1024px; without this
  // there was no way to sign out on a phone.
  it('offers Sign out, closing the menu before calling onSignOut', () => {
    const onSignOut = vi.fn();
    setup({ onSignOut });
    openMenu();
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(onSignOut).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Open navigation menu' })).toBeInTheDocument();
  });

  it('disables Sign out while signing out', () => {
    setup({ onSignOut: vi.fn(), signingOut: true });
    openMenu();
    expect(screen.getByRole('button', { name: 'Signing out…' })).toBeDisabled();
  });
});
