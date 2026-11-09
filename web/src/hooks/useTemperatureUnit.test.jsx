import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useTemperatureUnit, STORAGE_KEY } from './useTemperatureUnit.js';

let api;
function Probe() {
  api = useTemperatureUnit();
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

describe('useTemperatureUnit', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => { api = undefined; });

  it('defaults to c with nothing stored', () => {
    renderProbe();
    expect(STORAGE_KEY).toBe('hc_temperature_unit');
    expect(api.unit).toBe('c');
    expect(api.symbol).toBe('°C');
  });

  it('reads f from localStorage hc_temperature_unit', () => {
    localStorage.setItem('hc_temperature_unit', 'f');
    renderProbe();
    expect(api.unit).toBe('f');
    expect(api.symbol).toBe('°F');
  });

  it('setUnit(f) persists to localStorage', () => {
    renderProbe();
    act(() => api.setUnit('f'));
    expect(api.unit).toBe('f');
    expect(localStorage.getItem('hc_temperature_unit')).toBe('f');
  });

  it('garbage in storage falls back to c', () => {
    localStorage.setItem('hc_temperature_unit', 'kelvin');
    renderProbe();
    expect(api.unit).toBe('c');
  });
});
