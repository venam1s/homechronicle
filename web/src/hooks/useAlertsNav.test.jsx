import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useAlertsNav, STORAGE_KEY } from './useAlertsNav.js';
import { PREF_LS_PREFIX, KNOWN_PREF_LS_KEYS } from '../lib/prefKeys.js';

let api;
function Probe() {
  api = useAlertsNav();
  return null;
}

function renderProbe() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, enabled: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <Probe />
    </QueryClientProvider>,
  );
}

describe('useAlertsNav', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => { api = undefined; });

  it('shows Alerts with nothing stored', () => {
    renderProbe();
    expect(api.showAlerts).toBe(true);
  });

  it('reads a stored false as hidden', () => {
    localStorage.setItem(STORAGE_KEY, 'false');
    renderProbe();
    expect(api.showAlerts).toBe(false);
  });

  it('setShowAlerts(false) persists to localStorage and back again', () => {
    renderProbe();
    act(() => api.setShowAlerts(false));
    expect(api.showAlerts).toBe(false);
    expect(localStorage.getItem(STORAGE_KEY)).toBe('false');

    act(() => api.setShowAlerts(true));
    expect(api.showAlerts).toBe(true);
    expect(localStorage.getItem(STORAGE_KEY)).toBe('true');
  });

  it('garbage in storage falls back to shown', () => {
    localStorage.setItem(STORAGE_KEY, 'not-json{');
    renderProbe();
    expect(api.showAlerts).toBe(true);

    localStorage.setItem(STORAGE_KEY, '"no"');
    renderProbe();
    expect(api.showAlerts).toBe(true);
  });

  // One member hiding Alerts must not hide it for the next person who signs in
  // on the same browser: the sign-out purge removes every hc_pref_* key.
  it('stores under a key the sign-out purge removes', () => {
    expect(STORAGE_KEY.startsWith(PREF_LS_PREFIX)).toBe(true);
    expect(KNOWN_PREF_LS_KEYS).toContain(STORAGE_KEY);
  });
});
