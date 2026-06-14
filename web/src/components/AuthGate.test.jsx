import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import AuthGate from './AuthGate.jsx';

// Mock fetchJson to control /auth/me responses
vi.mock('../lib/api.js', () => ({
  API_BASE: 'http://localhost:3001/api',
  fetchJson: vi.fn(),
}));

import { fetchJson } from '../lib/api.js';

function makeWrapper({ initialPath = '/' } = {}) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        // Prevent stale queries from re-fetching during tests
        staleTime: Infinity,
      },
    },
  });

  return function Wrapper({ children }) {
    return (
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={[initialPath]}>
          {children}
        </MemoryRouter>
      </QueryClientProvider>
    );
  };
}

// Helper: build a URL-routing fetchJson mock. Routes /auth/config to { authEnabled: true }
// (so all tests run in auth-on mode by default) and delegates /auth/me to the provided
// meHandler. Any other URL rejects with an unexpected-URL error.
function mockFetchJsonWithConfig(meHandler) {
  fetchJson.mockImplementation((url) => {
    if (url.includes('/auth/config')) return Promise.resolve({ authEnabled: true });
    if (url.includes('/auth/me')) return meHandler(url);
    return Promise.reject(new Error(`Unexpected URL in test: ${url}`));
  });
}

describe('AuthGate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
  });

  it('renders children when /auth/me succeeds', async () => {
    // Real /auth/me envelope (WR-01): server returns { user: { id, email, role } }.
    mockFetchJsonWithConfig(() =>
      Promise.resolve({ user: { id: 1, email: 'user@example.com', role: 'admin' } }),
    );

    const Wrapper = makeWrapper();
    render(
      <Wrapper>
        <Routes>
          <Route
            path="/*"
            element={
              <AuthGate>
                <div data-testid="protected-content">Protected</div>
              </AuthGate>
            }
          />
        </Routes>
      </Wrapper>
    );

    await waitFor(() => {
      expect(screen.getByTestId('protected-content')).toBeInTheDocument();
    });
  });

  it('redirects to /login when /auth/me returns 401', async () => {
    const authError = new Error('Unauthorized');
    authError.status = 401;
    mockFetchJsonWithConfig(() => Promise.reject(authError));

    const Wrapper = makeWrapper();
    render(
      <Wrapper>
        <Routes>
          <Route
            path="/*"
            element={
              <AuthGate>
                <div data-testid="protected-content">Protected</div>
              </AuthGate>
            }
          />
          <Route path="/login" element={<div data-testid="login-page">Login</div>} />
        </Routes>
      </Wrapper>
    );

    await waitFor(() => {
      expect(screen.getByTestId('login-page')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('protected-content')).not.toBeInTheDocument();
  });

  it('does not retry on 401 (fetchJson called exactly once for /auth/me)', async () => {
    const authError = new Error('Unauthorized');
    authError.status = 401;
    mockFetchJsonWithConfig(() => Promise.reject(authError));

    const Wrapper = makeWrapper();
    render(
      <Wrapper>
        <Routes>
          <Route
            path="/*"
            element={
              <AuthGate>
                <div>Protected</div>
              </AuthGate>
            }
          />
          <Route path="/login" element={<div data-testid="login-page">Login</div>} />
        </Routes>
      </Wrapper>
    );

    await waitFor(() => {
      expect(screen.getByTestId('login-page')).toBeInTheDocument();
    });

    // retry:false means /auth/me fetchJson should only be called once (not retried).
    // /auth/config is also called once by useAuthConfig — filter to /me calls only.
    const meCalls = fetchJson.mock.calls.filter(([url]) => url.includes('/auth/me'));
    expect(meCalls).toHaveLength(1);
  });

  it('renders loading state (spinner) while /auth/me is pending', () => {
    // /auth/config resolves immediately (auth-on); /auth/me never resolves — stays loading.
    fetchJson.mockImplementation((url) => {
      if (url.includes('/auth/config')) return Promise.resolve({ authEnabled: true });
      return new Promise(() => {}); // /auth/me hangs
    });

    const Wrapper = makeWrapper();
    render(
      <Wrapper>
        <Routes>
          <Route
            path="/*"
            element={
              <AuthGate>
                <div data-testid="protected-content">Protected</div>
              </AuthGate>
            }
          />
        </Routes>
      </Wrapper>
    );

    // Children should not render while loading
    expect(screen.queryByTestId('protected-content')).not.toBeInTheDocument();
    // Spinner div should be present (animate-spin class)
    expect(document.querySelector('.animate-spin')).toBeInTheDocument();
  });

  describe('CSRF token recovery', () => {
    it('fetches /auth/csrf-token and stores it when authenticated but sessionStorage has no csrfToken', async () => {
      // Real /auth/me envelope (WR-01): { user: { id, email, role } }.
      const me = { user: { id: 1, email: 'user@example.com', role: 'admin' } };
      fetchJson.mockImplementation((url) => {
        if (url.includes('/auth/config')) return Promise.resolve({ authEnabled: true });
        if (url.includes('/auth/me')) return Promise.resolve(me);
        if (url.includes('/auth/csrf-token')) return Promise.resolve({ csrfToken: 'recovered-token' });
        return Promise.reject(new Error(`Unexpected URL: ${url}`));
      });

      const Wrapper = makeWrapper();
      render(
        <Wrapper>
          <Routes>
            <Route
              path="/*"
              element={
                <AuthGate>
                  <div data-testid="protected-content">Protected</div>
                </AuthGate>
              }
            />
          </Routes>
        </Wrapper>
      );

      await waitFor(() => {
        expect(screen.getByTestId('protected-content')).toBeInTheDocument();
      });

      await waitFor(() => {
        expect(sessionStorage.getItem('csrfToken')).toBe('recovered-token');
      });

      const csrfCalls = fetchJson.mock.calls.filter(([url]) => url.includes('/auth/csrf-token'));
      expect(csrfCalls.length).toBe(1);
    });

    it('does not fetch /auth/csrf-token when sessionStorage already has a csrfToken', async () => {
      sessionStorage.setItem('csrfToken', 'existing-token');

      // Real /auth/me envelope (WR-01): { user: { id, email, role } }.
      const me = { user: { id: 1, email: 'user@example.com', role: 'admin' } };
      fetchJson.mockImplementation((url) => {
        if (url.includes('/auth/config')) return Promise.resolve({ authEnabled: true });
        if (url.includes('/auth/me')) return Promise.resolve(me);
        if (url.includes('/auth/csrf-token')) return Promise.resolve({ csrfToken: 'new-token' });
        return Promise.reject(new Error(`Unexpected URL: ${url}`));
      });

      const Wrapper = makeWrapper();
      render(
        <Wrapper>
          <Routes>
            <Route
              path="/*"
              element={
                <AuthGate>
                  <div data-testid="protected-content">Protected</div>
                </AuthGate>
              }
            />
          </Routes>
        </Wrapper>
      );

      await waitFor(() => {
        expect(screen.getByTestId('protected-content')).toBeInTheDocument();
      });

      // Token must not be clobbered
      expect(sessionStorage.getItem('csrfToken')).toBe('existing-token');

      const csrfCalls = fetchJson.mock.calls.filter(([url]) => url.includes('/auth/csrf-token'));
      expect(csrfCalls.length).toBe(0);
    });

    it('does not fetch /auth/csrf-token when unauthenticated (redirects to /login)', async () => {
      const authError = new Error('Unauthorized');
      authError.status = 401;
      fetchJson.mockImplementation((url) => {
        if (url.includes('/auth/config')) return Promise.resolve({ authEnabled: true });
        if (url.includes('/auth/me')) return Promise.reject(authError);
        return Promise.reject(new Error(`Unexpected URL: ${url}`));
      });

      const Wrapper = makeWrapper();
      render(
        <Wrapper>
          <Routes>
            <Route
              path="/*"
              element={
                <AuthGate>
                  <div data-testid="protected-content">Protected</div>
                </AuthGate>
              }
            />
            <Route path="/login" element={<div data-testid="login-page">Login</div>} />
          </Routes>
        </Wrapper>
      );

      await waitFor(() => {
        expect(screen.getByTestId('login-page')).toBeInTheDocument();
      });

      const csrfCalls = fetchJson.mock.calls.filter(([url]) => url.includes('/auth/csrf-token'));
      expect(csrfCalls.length).toBe(0);
    });
  });
});
