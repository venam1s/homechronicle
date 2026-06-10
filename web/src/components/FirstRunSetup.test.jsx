import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes, Navigate } from 'react-router-dom';

// Mock useUserCount — controls the user-count probe for first-run routing
vi.mock('../hooks/useAuth.js', () => ({
  useUserCount: vi.fn(),
  useAuth: vi.fn(() => ({ user: null, isLoading: false, isError: false, logoutMutation: {} })),
}));

// Mock fetchJson and API_BASE so LoginPage / SetupAdminPage don't fire real requests
vi.mock('../lib/api.js', () => ({
  API_BASE: 'http://localhost:3001/api',
  fetchJson: vi.fn(),
  ApiError: class ApiError extends Error {
    constructor(message, opts = {}) {
      super(message);
      this.status = opts.status ?? null;
    }
  },
}));

import { useUserCount } from '../hooks/useAuth.js';

// Minimal wrapper reproducing the LoginOrSetup / SetupOrLogin pattern from main.jsx
function LoginOrSetup() {
  const { data, isLoading } = useUserCount();
  if (isLoading) return <div data-testid="loading">Loading…</div>;
  if (data?.count === 0) return <Navigate to="/setup" replace />;
  // Render a lightweight stand-in for LoginPage (avoids full page mount)
  return <div data-testid="login-page">Login Page</div>;
}

function SetupOrLogin() {
  const { data, isLoading } = useUserCount();
  if (isLoading) return <div data-testid="loading">Loading…</div>;
  if (data?.count > 0) return <Navigate to="/login" replace />;
  return <div data-testid="setup-page">Setup Admin Page</div>;
}

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  return function Wrapper({ children }) {
    return (
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    );
  };
}

describe('First-run routing (AUTH-01)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('routes to /setup when user-count is 0', async () => {
    // count===0 → zero users → first run
    useUserCount.mockReturnValue({ data: { count: 0 }, isLoading: false });

    const Wrapper = makeWrapper();
    render(
      <Wrapper>
        <MemoryRouter initialEntries={['/login']}>
          <Routes>
            <Route path="/login" element={<LoginOrSetup />} />
            <Route path="/setup" element={<div data-testid="setup-page">Setup Admin Page</div>} />
          </Routes>
        </MemoryRouter>
      </Wrapper>
    );

    await waitFor(() => {
      expect(screen.getByTestId('setup-page')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('login-page')).not.toBeInTheDocument();
  });

  it('stays on /login (shows LoginPage) when user-count is greater than 0', async () => {
    // count>0 → users exist → normal login
    useUserCount.mockReturnValue({ data: { count: 1 }, isLoading: false });

    const Wrapper = makeWrapper();
    render(
      <Wrapper>
        <MemoryRouter initialEntries={['/login']}>
          <Routes>
            <Route path="/login" element={<LoginOrSetup />} />
            <Route path="/setup" element={<div data-testid="setup-page">Setup Admin Page</div>} />
          </Routes>
        </MemoryRouter>
      </Wrapper>
    );

    await waitFor(() => {
      expect(screen.getByTestId('login-page')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('setup-page')).not.toBeInTheDocument();
  });

  it('redirects /setup to /login when user-count is greater than 0', async () => {
    // count>0 → setup screen must not appear
    useUserCount.mockReturnValue({ data: { count: 2 }, isLoading: false });

    const Wrapper = makeWrapper();
    render(
      <Wrapper>
        <MemoryRouter initialEntries={['/setup']}>
          <Routes>
            <Route path="/login" element={<div data-testid="login-page">Login Page</div>} />
            <Route path="/setup" element={<SetupOrLogin />} />
          </Routes>
        </MemoryRouter>
      </Wrapper>
    );

    await waitFor(() => {
      expect(screen.getByTestId('login-page')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('setup-page')).not.toBeInTheDocument();
  });

  it('shows SetupAdminPage on /setup when user-count is 0', async () => {
    useUserCount.mockReturnValue({ data: { count: 0 }, isLoading: false });

    const Wrapper = makeWrapper();
    render(
      <Wrapper>
        <MemoryRouter initialEntries={['/setup']}>
          <Routes>
            <Route path="/login" element={<div data-testid="login-page">Login Page</div>} />
            <Route path="/setup" element={<SetupOrLogin />} />
          </Routes>
        </MemoryRouter>
      </Wrapper>
    );

    await waitFor(() => {
      expect(screen.getByTestId('setup-page')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('login-page')).not.toBeInTheDocument();
  });

  it('renders loading state while user-count probe is in flight', () => {
    useUserCount.mockReturnValue({ data: undefined, isLoading: true });

    const Wrapper = makeWrapper();
    render(
      <Wrapper>
        <MemoryRouter initialEntries={['/login']}>
          <Routes>
            <Route path="/login" element={<LoginOrSetup />} />
            <Route path="/setup" element={<div data-testid="setup-page">Setup Admin Page</div>} />
          </Routes>
        </MemoryRouter>
      </Wrapper>
    );

    expect(screen.getByTestId('loading')).toBeInTheDocument();
    expect(screen.queryByTestId('login-page')).not.toBeInTheDocument();
    expect(screen.queryByTestId('setup-page')).not.toBeInTheDocument();
  });
});
