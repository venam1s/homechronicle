import { ToastProvider } from './Toast.jsx';
import { UserPreferencesProvider } from './UserPreferencesProvider.jsx';
import AppearanceProvider from './AppearanceProvider.jsx';

/**
 * AppProviders — the app-wide context tree, in the one order that works.
 *
 * This exists as a component rather than as JSX inline in main.jsx so the
 * composition can be rendered and asserted in a test. It was inline, and it
 * was wrong: AppearanceProvider had been hoisted above the router (so that
 * login, setup and reset are painted in the user's theme) while
 * UserPreferencesProvider stayed inside the authenticated route. Appearance
 * then resolved the preferences CONTEXT DEFAULT — an empty blob with no-op
 * writers — so the reconciliation effect never ran and a signed-in user on a
 * new device got the default palette rather than their own. It self-corrected
 * the moment they opened Settings, whose own usePalette instance did sit
 * inside the provider, which is exactly why it survived review.
 *
 * The invariants, in order:
 *   ToastProvider            toasts are available to everything below
 *   UserPreferencesProvider  owns the account blob; MUST enclose appearance
 *   AppearanceProvider       paints theme + palette onto <html>
 *
 * All three sit ABOVE the router so every route is covered, authenticated or
 * not. That is safe for the preferences query because it is gated on
 * `user?.id` — signed out, it never fires. And there must be exactly ONE
 * UserPreferencesProvider in the tree: a second, nested instance would split
 * the shared debounce buffer and reintroduce the racing whole-blob PUTs
 * (CR-01) that the single-provider design exists to prevent.
 */
export default function AppProviders({ children }) {
  return (
    <ToastProvider>
      <UserPreferencesProvider>
        <AppearanceProvider>
          {children}
        </AppearanceProvider>
      </UserPreferencesProvider>
    </ToastProvider>
  );
}
