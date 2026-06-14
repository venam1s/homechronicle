import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import AuthGate from './AuthGate.jsx';

// Mock fetchJson to control /auth/config and /auth/me responses.
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

describe('AuthGate — auth-off mode (authEnabled: false)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
  });

  it('renders children directly when /auth/config returns authEnabled: false (no login required)', async () => {
    fetchJson.mockImplementation((url) => {
      if (url.includes('/auth/config')) return Promise.resolve({ authEnabled: false });
      // /auth/me must NOT be called in auth-off; reject loudly if it is.
      return Promise.reject(new Error(`Unexpected fetchJson call in auth-off: ${url}`));
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
      expect(screen.getByTestId('protected-content')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('login-page')).not.toBeInTheDocument();
  });

  it('renders children without needing /auth/me to succeed when authEnabled is false', async () => {
    // In auth-off mode the me-query is disabled after config resolves. The key guarantee
    // is that children render and no redirect occurs — not that /me is never touched
    // (fail-closed loading briefly enables it before config arrives).
    fetchJson.mockImplementation((url) => {
      if (url.includes('/auth/config')) return Promise.resolve({ authEnabled: false });
      // /auth/me: if called during the loading window, reject it (simulates 401).
      // Children must still render regardless.
      if (url.includes('/auth/me')) return Promise.reject(new Error('401 Unauthorized'));
      return Promise.reject(new Error(`Unexpected fetchJson call: ${url}`));
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

    // Children render even if /me rejects — auth-off overrides the session requirement.
    await waitFor(() => {
      expect(screen.getByTestId('protected-content')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('login-page')).not.toBeInTheDocument();
  });

  it('does NOT navigate to /login when authEnabled is false', async () => {
    fetchJson.mockImplementation((url) => {
      if (url.includes('/auth/config')) return Promise.resolve({ authEnabled: false });
      return Promise.reject(new Error(`Unexpected fetchJson call: ${url}`));
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
      expect(screen.getByTestId('protected-content')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('login-page')).not.toBeInTheDocument();
  });

  it('is fail-closed: treats authEnabled as true when /auth/config errors', async () => {
    // Config fetch fails → authEnabled stays true → redirects to /login (login wall preserved).
    fetchJson.mockImplementation((url) => {
      if (url.includes('/auth/config')) return Promise.reject(new Error('network error'));
      if (url.includes('/auth/me')) return Promise.reject(new Error('Unauthorized'));
      return Promise.reject(new Error(`Unexpected fetchJson call: ${url}`));
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

    // Must NOT render children — login wall must be preserved on config error.
    await waitFor(() => {
      expect(screen.getByTestId('login-page')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('protected-content')).not.toBeInTheDocument();
  });

  it('auth-on mode (authEnabled: true) still redirects to /login when no session', async () => {
    const authError = new Error('Unauthorized');
    authError.status = 401;
    fetchJson.mockImplementation((url) => {
      if (url.includes('/auth/config')) return Promise.resolve({ authEnabled: true });
      if (url.includes('/auth/me')) return Promise.reject(authError);
      return Promise.reject(new Error(`Unexpected fetchJson call: ${url}`));
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
    expect(screen.queryByTestId('protected-content')).not.toBeInTheDocument();
  });
});
