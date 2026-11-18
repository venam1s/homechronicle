import { useAuth } from './useAuth.js';
import { useAuthConfig } from './useAuthConfig.js';

// True when the viewer may change household settings: auth is off, or they are an admin.
export function useCanManageHome() {
  const { authEnabled } = useAuthConfig();
  const { user } = useAuth();
  return !authEnabled || user?.role === 'admin';
}
