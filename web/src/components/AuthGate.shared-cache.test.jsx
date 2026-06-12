import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import AuthGate from './AuthGate.jsx';
import { useAuth } from '../hooks/useAuth.js';

// Regression for the ['auth','me'] shared-cache shape collision.
// AuthGate and useAuth both query queryKey ['auth','me']. GET /api/auth/me
// responds { user: {...} }. If only useAuth unwraps and AuthGate does not, the
// first query to resolve populates the shared cache entry with the wrong shape —
// AuthGate (it wraps the app) wrote the wrapped { user } body, so useAuth
// consumers saw user.role === undefined → no Admin tab, "Account" label.
// Both queryFns must unwrap identically. This test mounts them together against
// ONE QueryClient (the real composition) — the per-component unit suites mock
// the hook and can't catch this.

vi.mock('../lib/api.js', () => ({
  API_BASE: 'http://localhost:3001/api',
  fetchJson: vi.fn(),
}));

import { fetchJson } from '../lib/api.js';

function RoleProbe() {
  const { user } = useAuth();
  return <div data-testid="role">{user?.role ?? 'none'}</div>;
}

it('AuthGate + useAuth share the cache and both see the flat admin user (not wrapped)', async () => {
  fetchJson.mockImplementation((url) =>
    url.includes('/auth/me')
      ? Promise.resolve({ user: { id: '1', role: 'admin', email: 'admin@example.com' } })
      : Promise.resolve({ csrfToken: 'x' }),
  );

  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });

  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/']}>
        <AuthGate>
          <RoleProbe />
        </AuthGate>
      </MemoryRouter>
    </QueryClientProvider>,
  );

  // AuthGate must render children (authenticated) AND useAuth must read role 'admin'
  // from the shared cache — not undefined from a wrapped { user } body.
  await waitFor(() => expect(screen.getByTestId('role')).toHaveTextContent('admin'));
});
