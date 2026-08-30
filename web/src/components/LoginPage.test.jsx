import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import LoginPage from './LoginPage.jsx';

// Captured before vi.mock hoisting so the Toast mock can close over it.
const { addToast, navigate } = vi.hoisted(() => ({ addToast: vi.fn(), navigate: vi.fn() }));

vi.mock('../lib/api.js', () => ({
  API_BASE: 'http://localhost:3001/api',
  fetchJson: vi.fn(),
}));

vi.mock('./Toast.jsx', () => ({
  useToast: () => ({ addToast }),
}));

vi.mock('react-router-dom', async (importOriginal) => ({
  ...(await importOriginal()),
  useNavigate: () => navigate,
}));

import { fetchJson } from '../lib/api.js';

const CREDENTIAL_COPY = 'Incorrect email or password.';
const OUTAGE_COPY = 'HomeChronicle is temporarily unavailable. Please try again in a moment.';

function renderLogin() {
  const queryClient = new QueryClient({
    defaultOptions: {
      mutations: { retry: false },
      queries: { retry: false },
    },
  });
  const result = render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return { ...result, queryClient };
}

function submitCredentials() {
  fireEvent.change(screen.getByLabelText('Email address'), {
    target: { value: 'user@example.com' },
  });
  fireEvent.change(screen.getByLabelText('Password'), {
    target: { value: 'somepassword' },
  });
  fireEvent.click(screen.getByRole('button', { name: /sign in/i }));
}

describe('LoginPage — error copy distinguishes 401 from a backend outage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
  });

  it('401: shows the non-enumerating credential message', async () => {
    const err = new Error('Invalid credentials');
    err.status = 401;
    fetchJson.mockRejectedValueOnce(err);

    renderLogin();
    submitCredentials();

    await waitFor(() => {
      expect(addToast).toHaveBeenCalledWith(CREDENTIAL_COPY, 'error');
    });
    expect(addToast).not.toHaveBeenCalledWith(OUTAGE_COPY, 'error');
  });

  it('502 gateway error: shows the server-unavailable copy, NOT the credential message', async () => {
    const err = new Error('HTTP 502 (Bad Gateway)');
    err.status = 502;
    fetchJson.mockRejectedValueOnce(err);

    renderLogin();
    submitCredentials();

    await waitFor(() => {
      expect(addToast).toHaveBeenCalledWith(OUTAGE_COPY, 'error');
    });
    expect(addToast).not.toHaveBeenCalledWith(CREDENTIAL_COPY, 'error');
  });

  it('network failure (no status): shows the server-unavailable copy', async () => {
    fetchJson.mockRejectedValueOnce(new Error('Failed to fetch'));

    renderLogin();
    submitCredentials();

    await waitFor(() => {
      expect(addToast).toHaveBeenCalledWith(OUTAGE_COPY, 'error');
    });
    expect(addToast).not.toHaveBeenCalledWith(CREDENTIAL_COPY, 'error');
  });

  it.each([403, 429, 500, 503, 504])('status %i → outage copy, not credential copy', async (status) => {
    const err = new Error(`HTTP ${status}`);
    err.status = status;
    fetchJson.mockRejectedValueOnce(err);

    renderLogin();
    submitCredentials();

    await waitFor(() => {
      expect(addToast).toHaveBeenCalledWith(OUTAGE_COPY, 'error');
    });
    expect(addToast).not.toHaveBeenCalledWith(CREDENTIAL_COPY, 'error');
  });

  it('status 0 → outage copy (not treated as 401)', async () => {
    const err = new Error('HTTP 0');
    err.status = 0;
    fetchJson.mockRejectedValueOnce(err);

    renderLogin();
    submitCredentials();

    await waitFor(() => {
      expect(addToast).toHaveBeenCalledWith(OUTAGE_COPY, 'error');
    });
    expect(addToast).not.toHaveBeenCalledWith(CREDENTIAL_COPY, 'error');
  });

  // Pins the `err?.status === 401` STRICT equality check: a string '401' must
  // NOT be treated the same as the number 401.
  it('status "401" (string) → outage copy, not credential copy (pins strict === 401 check)', async () => {
    const err = new Error('HTTP 401 (string status)');
    err.status = '401';
    fetchJson.mockRejectedValueOnce(err);

    renderLogin();
    submitCredentials();

    await waitFor(() => {
      expect(addToast).toHaveBeenCalledWith(OUTAGE_COPY, 'error');
    });
    expect(addToast).not.toHaveBeenCalledWith(CREDENTIAL_COPY, 'error');
  });

  it('exactly one toast per failed submit', async () => {
    const err = new Error('Invalid credentials');
    err.status = 401;
    fetchJson.mockRejectedValueOnce(err);

    renderLogin();
    submitCredentials();

    await waitFor(() => {
      expect(addToast).toHaveBeenCalledTimes(1);
    });
  });

  it('null/undefined rejection → outage copy, no throw (covers the err?. optional chain)', async () => {
    fetchJson.mockRejectedValueOnce(undefined);

    renderLogin();
    submitCredentials();

    await waitFor(() => {
      expect(addToast).toHaveBeenCalledWith(OUTAGE_COPY, 'error');
    });
    expect(addToast).not.toHaveBeenCalledWith(CREDENTIAL_COPY, 'error');
  });
});

describe('LoginPage — successful sign-in', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
  });

  it('POSTs credentials, stores csrf token, invalidates auth query, and navigates to /', async () => {
    fetchJson.mockResolvedValueOnce({ ok: true });
    fetchJson.mockResolvedValueOnce({ csrfToken: 'tok-123' });

    const { queryClient } = renderLogin();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    submitCredentials();

    await waitFor(() => {
      expect(navigate).toHaveBeenCalledWith('/');
    });

    expect(fetchJson).toHaveBeenNthCalledWith(
      1,
      'http://localhost:3001/api/auth/login',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    const body = JSON.parse(fetchJson.mock.calls[0][1].body);
    expect(body).toEqual({ email: 'user@example.com', password: 'somepassword', rememberMe: false });

    expect(fetchJson).toHaveBeenNthCalledWith(2, 'http://localhost:3001/api/auth/csrf-token');

    expect(sessionStorage.getItem('csrfToken')).toBe('tok-123');
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['auth', 'me'] });
    expect(addToast).not.toHaveBeenCalled();
  });

  it('rememberMe checkbox checked → POST body carries rememberMe: true', async () => {
    fetchJson.mockResolvedValueOnce({ ok: true });
    fetchJson.mockResolvedValueOnce({ csrfToken: 'tok-123' });

    renderLogin();
    fireEvent.click(screen.getByLabelText('Keep me signed in for 30 days'));
    submitCredentials();

    await waitFor(() => {
      expect(navigate).toHaveBeenCalledWith('/');
    });

    const body = JSON.parse(fetchJson.mock.calls[0][1].body);
    expect(body.rememberMe).toBe(true);
  });

  it('csrf-token fetch failure is non-fatal — still navigates, no csrfToken stored, no toast', async () => {
    fetchJson.mockResolvedValueOnce({ ok: true });
    fetchJson.mockRejectedValueOnce(new Error('csrf fetch failed'));

    renderLogin();
    submitCredentials();

    await waitFor(() => {
      expect(navigate).toHaveBeenCalledWith('/');
    });

    expect(sessionStorage.getItem('csrfToken')).toBeNull();
    expect(addToast).not.toHaveBeenCalled();
  });

  it('csrf response with no token → csrfToken stays null, still navigates', async () => {
    fetchJson.mockResolvedValueOnce({ ok: true });
    fetchJson.mockResolvedValueOnce({});

    renderLogin();
    submitCredentials();

    await waitFor(() => {
      expect(navigate).toHaveBeenCalledWith('/');
    });

    expect(sessionStorage.getItem('csrfToken')).toBeNull();
  });
});

describe('LoginPage — pending state', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
  });

  it('disables the submit button while the login request is in flight, re-enables after resolve', async () => {
    let resolveLogin;
    fetchJson.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveLogin = resolve;
      }),
    );

    renderLogin();
    const btn = screen.getByRole('button', { name: /sign in/i });
    submitCredentials();

    await waitFor(() => expect(btn).toBeDisabled());
    expect(btn).not.toHaveTextContent('Sign in');

    await act(async () => {
      resolveLogin({ ok: true });
    });

    await waitFor(() => expect(btn).not.toBeDisabled());
  });
});

describe('LoginPage — show/hide password toggle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
  });

  it('toggles the password input type and aria-label without submitting the form', async () => {
    renderLogin();

    const passwordInput = screen.getByLabelText('Password');
    expect(passwordInput).toHaveAttribute('type', 'password');
    const toggleBtn = screen.getByRole('button', { name: 'Show password' });

    fireEvent.click(toggleBtn);
    expect(passwordInput).toHaveAttribute('type', 'text');
    expect(screen.getByRole('button', { name: 'Hide password' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Hide password' }));
    expect(passwordInput).toHaveAttribute('type', 'password');
    expect(screen.getByRole('button', { name: 'Show password' })).toBeInTheDocument();

    expect(fetchJson).not.toHaveBeenCalled();
  });
});

describe('LoginPage — form basics', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
  });

  it('"Forgot password?" links to /reset-password', () => {
    renderLogin();
    expect(screen.getByText('Forgot password?')).toHaveAttribute('href', '/reset-password');
  });

  it('email and password inputs are required; email input has type="email"', () => {
    renderLogin();
    expect(screen.getByLabelText('Email address')).toBeRequired();
    expect(screen.getByLabelText('Email address')).toHaveAttribute('type', 'email');
    expect(screen.getByLabelText('Password')).toBeRequired();
  });
});
