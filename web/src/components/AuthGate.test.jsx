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

describe('AuthGate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders children when /auth/me succeeds', async () => {
    fetchJson.mockResolvedValueOnce({ id: 1, email: 'user@example.com', role: 'admin' });

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
    fetchJson.mockRejectedValueOnce(authError);

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

  it('does not retry on 401 (fetchJson called exactly once)', async () => {
    const authError = new Error('Unauthorized');
    authError.status = 401;
    fetchJson.mockRejectedValue(authError);

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

    // retry:false means fetchJson should only be called once
    expect(fetchJson).toHaveBeenCalledTimes(1);
  });

  it('renders loading state (spinner) while /auth/me is pending', () => {
    // Never resolves — stays loading
    fetchJson.mockReturnValueOnce(new Promise(() => {}));

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
});
