// First-paint theme + palette, applied before the React bundle loads so a
// dark-mode user does not see a flash of the light default.
//
// This must be a same-origin file: the CSP is `script-src 'self'`, which
// blocked the inline <script> this replaces on every load.
//
// It mirrors getStoredPalette() (src/hooks/usePalette.js) and the theme
// resolution in src/hooks/useTheme.js. themeInit.test.js runs this file
// against those modules so the two cannot drift apart.
(function () {
  var PALETTES = ['gallery', 'ember', 'almanac', 'harvest', 'ink', 'fern', 'porcelain', 'tide', 'atlas', 'iris', 'dusk', 'graphite'];
  var ACCENT_TO_PALETTE = {
    ocean: 'tide',
    graphite: 'graphite',
    sunrise: 'harvest',
    red: 'ember',
    yellow: 'harvest',
    purple: 'iris',
    slate: 'atlas',
    pink: 'dusk',
  };
  var DEFAULT_PALETTE = 'porcelain';

  var storedTheme = null;
  var palette = null;
  var accent = null;
  try {
    storedTheme = localStorage.getItem('hc_theme_preference');
    palette = localStorage.getItem('hc_palette');
    accent = localStorage.getItem('hc_accent');
    if (accent === null) accent = localStorage.getItem('hc_ui_skin');
  } catch (e) {
    // Storage blocked (private mode, sandboxed iframe): fall through to defaults.
  }

  var preference = storedTheme === 'light' || storedTheme === 'dark' || storedTheme === 'system' ? storedTheme : 'system';
  var theme = preference === 'system'
    ? (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
    : preference;

  if (PALETTES.indexOf(palette) === -1) {
    palette = Object.prototype.hasOwnProperty.call(ACCENT_TO_PALETTE, accent) ? ACCENT_TO_PALETTE[accent] : DEFAULT_PALETTE;
  }

  var root = document.documentElement;
  root.dataset.theme = theme;
  root.dataset.palette = palette;
  root.classList.toggle('theme-dark', theme === 'dark');
  root.classList.toggle('theme-light', theme === 'light');
  root.style.colorScheme = theme;
})();
