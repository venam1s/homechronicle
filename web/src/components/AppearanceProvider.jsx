import { useTheme } from '../hooks/useTheme.js';
import { usePalette } from '../hooks/usePalette.js';

/**
 * AppearanceProvider — applies the active theme and palette to <html>.
 *
 * Both hooks paint by side effect (setting `class="theme-dark"` and
 * `data-palette` on the document element), so SOMETHING must call them on every
 * route for the app to be themed at all. Mounting that at the router root is
 * the only placement that covers every surface: the authenticated shell, the
 * login/setup/reset pages, and both breakpoints.
 *
 * This exists because it previously did not. `useTheme` and `useAccent` were
 * called inside Sidebar, which is only rendered at >=1024px — so the theme was
 * silently never applied on mobile or tablet, and every unauthenticated page
 * rendered with the base token defaults. Retiring the sidebar for the masthead
 * would have widened that to the whole desktop app, since the palette hook went
 * with it. Appearance is global state; it does not belong to a nav component.
 *
 * Renders children unchanged — it holds no UI of its own.
 */
export default function AppearanceProvider({ children }) {
  useTheme();
  usePalette();
  return children;
}
