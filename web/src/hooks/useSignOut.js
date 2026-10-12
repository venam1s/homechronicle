import { useNavigate } from 'react-router-dom';
import { useAuth } from './useAuth.js';
import { useAuthConfig } from './useAuthConfig.js';
import { useUserPreferences } from './useUserPreferences.js';

/**
 * Sign-out shared by the desktop account menu (Masthead) and the floating nav
 * on phones and tablets.
 *
 * `available` is false when login is turned off (AUTH_ENABLED=false) or nobody
 * is signed in, so callers can hide the control.
 */
export function useSignOut() {
  const { user, logoutMutation } = useAuth();
  const { authEnabled } = useAuthConfig();
  const { flushNow } = useUserPreferences();
  const navigate = useNavigate();

  async function signOut() {
    // Preference writes are debounced; ending the session first would discard a
    // palette change or a dashboard drag made in the last half second.
    await flushNow();
    logoutMutation.mutate(undefined, {
      onSuccess: () => {
        if (typeof sessionStorage !== 'undefined') {
          sessionStorage.removeItem('csrfToken');
        }
        navigate('/login', { replace: true });
      },
    });
  }

  return {
    signOut,
    isPending: logoutMutation.isPending,
    available: authEnabled !== false && Boolean(user),
  };
}
