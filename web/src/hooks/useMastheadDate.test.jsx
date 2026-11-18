import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useMastheadDate, STORAGE_KEY } from './useMastheadDate.js';

let api;
function Probe() {
  api = useMastheadDate();
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

describe('useMastheadDate', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => { api = undefined; });

  it('shows the date with nothing stored', () => {
    renderProbe();
    expect(STORAGE_KEY).toBe('hc_show_masthead_date');
    expect(api.showDate).toBe(true);
  });

  it('reads a stored false as hidden', () => {
    localStorage.setItem(STORAGE_KEY, 'false');
    renderProbe();
    expect(api.showDate).toBe(false);
  });

  it('setShowDate(false) persists to localStorage and back again', () => {
    renderProbe();
    act(() => api.setShowDate(false));
    expect(api.showDate).toBe(false);
    expect(localStorage.getItem(STORAGE_KEY)).toBe('false');

    act(() => api.setShowDate(true));
    expect(api.showDate).toBe(true);
    expect(localStorage.getItem(STORAGE_KEY)).toBe('true');
  });

  it('garbage in storage falls back to shown', () => {
    localStorage.setItem(STORAGE_KEY, 'not-json{');
    renderProbe();
    expect(api.showDate).toBe(true);

    localStorage.setItem(STORAGE_KEY, '"no"');
    renderProbe();
    expect(api.showDate).toBe(true);
  });
});
