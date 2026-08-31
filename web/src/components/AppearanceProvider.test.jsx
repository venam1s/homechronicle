import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..');

vi.mock('../hooks/useAuth.js', () => ({
  useAuth: () => ({ user: null }),
}));
vi.mock('../hooks/useUserPreferences.js', () => ({
  useUserPreferences: () => ({ prefs: undefined, setPreference: vi.fn(), seedIfEmpty: vi.fn() }),
}));

const { default: AppearanceProvider } = await import('./AppearanceProvider.jsx');
const { DEFAULT_PALETTE } = await import('../lib/palettes.js');

describe('AppearanceProvider', () => {
  beforeEach(() => {
    document.documentElement.removeAttribute('data-palette');
    document.documentElement.removeAttribute('data-theme');
    document.documentElement.className = '';
    localStorage.clear();
  });

  it('renders its children untouched', () => {
    render(<AppearanceProvider><span>content</span></AppearanceProvider>);
    expect(screen.getByText('content')).toBeInTheDocument();
  });

  it('paints the palette onto the document', () => {
    render(<AppearanceProvider><span>content</span></AppearanceProvider>);
    expect(document.documentElement.dataset.palette).toBe(DEFAULT_PALETTE);
  });

  it('paints the stored palette rather than the default', () => {
    localStorage.setItem('hc_palette', 'dusk');
    render(<AppearanceProvider><span>content</span></AppearanceProvider>);
    expect(document.documentElement.dataset.palette).toBe('dusk');
  });

  it('paints the theme onto the document', () => {
    localStorage.setItem('hc_theme_preference', 'dark');
    render(<AppearanceProvider><span>content</span></AppearanceProvider>);
    expect(document.documentElement.classList.contains('theme-dark')).toBe(true);
  });
});

// The bug this component exists to prevent: appearance was applied from inside
// a navigation component, so it silently did not apply wherever that component
// was not rendered — every route below 1024px, and every unauthenticated page.
// Appearance is global; keep it mounted at the root.
describe('appearance is applied globally, not by a nav component', () => {
  // The tree itself is asserted behaviourally in AppProviders.test.jsx. All
  // main.jsx owes us is that it delegates to AppProviders rather than
  // hand-rolling the order again.
  it('is composed by AppProviders, above the router', () => {
    const main = readFileSync(join(SRC, 'main.jsx'), 'utf8');
    expect(main).toContain('<AppProviders>');
    expect(
      main.indexOf('<AppProviders>'),
      'AppProviders must wrap the router, not sit inside it',
    ).toBeLessThan(main.indexOf('<RouterProvider'));
    for (const inlined of ['AppearanceProvider', 'UserPreferencesProvider', 'ToastProvider']) {
      expect(main, `main.jsx must not mount ${inlined} itself`).not.toContain(inlined);
    }
  });

  it('is not called from a breakpoint-conditional navigation component', () => {
    for (const file of ['components/Masthead.jsx', 'components/FloatingNav.jsx']) {
      const src = readFileSync(join(SRC, file), 'utf8');
      expect(src, `${file} must not own palette application`).not.toContain('usePalette(');
    }
  });
});
