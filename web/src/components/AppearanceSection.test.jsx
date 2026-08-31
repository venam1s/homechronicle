import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const setPreference = vi.fn();
const setPalette = vi.fn();
const themeState = { preference: 'system', resolvedTheme: 'light' };
const paletteState = { palette: 'porcelain' };

vi.mock('../hooks/useTheme.js', () => ({
  useTheme: () => ({ ...themeState, setPreference }),
}));

vi.mock('../hooks/usePalette.js', () => ({
  usePalette: () => ({ ...paletteState, setPalette }),
}));

const { default: AppearanceSection } = await import('./AppearanceSection.jsx');
const { PALETTE_IDS, PALETTES } = await import('../lib/palettes.js');

describe('AppearanceSection', () => {
  beforeEach(() => {
    setPreference.mockClear();
    setPalette.mockClear();
    themeState.preference = 'system';
    themeState.resolvedTheme = 'light';
    paletteState.palette = 'porcelain';
  });

  it('offers exactly the three theme choices', () => {
    render(<AppearanceSection />);
    const group = screen.getByRole('radiogroup', { name: 'Theme' });
    const options = within(group).getAllByRole('radio');
    expect(options.map((o) => o.textContent)).toEqual(['Light', 'Dark', 'System']);
  });

  it('marks the stored theme as selected', () => {
    themeState.preference = 'dark';
    render(<AppearanceSection />);
    const group = screen.getByRole('radiogroup', { name: 'Theme' });
    expect(within(group).getByRole('radio', { name: 'Dark' })).toBeChecked();
    expect(within(group).getByRole('radio', { name: 'Light' })).not.toBeChecked();
  });

  it('sets the theme preference on click', async () => {
    const user = userEvent.setup();
    render(<AppearanceSection />);
    await user.click(screen.getByRole('radio', { name: 'Dark' }));
    expect(setPreference).toHaveBeenCalledWith('dark');
  });

  // PAL-02: System is only meaningful if the user can tell what it resolved to.
  it('reports which palette System resolved to', () => {
    themeState.preference = 'system';
    themeState.resolvedTheme = 'dark';
    render(<AppearanceSection />);
    expect(screen.getByText(/Currently showing the/)).toHaveTextContent('dark');
  });

  it('does not claim a resolved mode when the theme is explicit', () => {
    themeState.preference = 'light';
    render(<AppearanceSection />);
    expect(screen.queryByText(/Currently showing the/)).toBeNull();
  });

  it('renders a card for every palette', () => {
    render(<AppearanceSection />);
    const group = screen.getByRole('radiogroup', { name: 'Palette' });
    const options = within(group).getAllByRole('radio');
    expect(options).toHaveLength(PALETTE_IDS.length);
    for (const id of PALETTE_IDS) {
      expect(within(group).getByRole('radio', { name: new RegExp(PALETTES[id].name) })).toBeTruthy();
    }
  });

  it('marks the active palette as selected and no other', () => {
    paletteState.palette = 'dusk';
    render(<AppearanceSection />);
    const group = screen.getByRole('radiogroup', { name: 'Palette' });
    const checked = within(group).getAllByRole('radio').filter((el) => el.getAttribute('aria-checked') === 'true');
    expect(checked).toHaveLength(1);
    expect(checked[0]).toHaveTextContent('Dusk');
  });

  it('sets the palette on click', async () => {
    const user = userEvent.setup();
    render(<AppearanceSection />);
    await user.click(screen.getByRole('radio', { name: /Gallery/ }));
    expect(setPalette).toHaveBeenCalledWith('gallery');
  });

  // PAL-07: the card must preview both modes, so a viewer can judge the pair
  // before committing — that is the whole point of choosing a palette here
  // rather than by trial and error.
  it('previews each palette in both light and dark', () => {
    const { container } = render(<AppearanceSection />);
    for (const id of PALETTE_IDS) {
      const card = container.querySelector(`[role="radio"][aria-checked][data-testid="${id}"]`)
        ?? screen.getByRole('radio', { name: new RegExp(PALETTES[id].name) });
      const style = card.innerHTML;
      // Both mode backgrounds appear in the card's inline styles.
      for (const mode of ['light', 'dark']) {
        const { bg } = PALETTES[id][mode];
        const rgb = bg.match(/^#(..)(..)(..)$/).slice(1).map((h) => parseInt(h, 16)).join(', ');
        expect(
          style.includes(bg) || style.includes(`rgb(${rgb})`),
          `${id} ${mode} background ${bg} missing from preview`,
        ).toBe(true);
      }
    }
  });
});
