import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useAuth } from './useAuth.js';
import { useToastsEnabled } from './useToastsEnabled.js';

vi.mock('./useAuth.js', () => ({
  useAuth: vi.fn(),
}));

// The viewer's own preference is read through the real usePreference; with no
// UserPreferencesProvider mounted it reads the localStorage copy.
const setOwnPreference = (value) => {
  localStorage.setItem('hc_pref_toastsEnabled', JSON.stringify(value));
};

const household = (toastsEnabled) => ({ retentionConfig: { toastsEnabled } });

describe('useToastsEnabled', () => {
  beforeEach(() => { localStorage.clear(); });
  afterEach(() => { localStorage.clear(); });

  describe('signed in', () => {
    beforeEach(() => { useAuth.mockReturnValue({ user: { id: 1, role: 'admin' } }); });

    it('is false when the own preference is off, even with the household flag on', () => {
      setOwnPreference(false);
      const { result } = renderHook(() => useToastsEnabled(household(true)));
      expect(result.current).toBe(false);
    });

    it('is true when the own preference is on, even with the household flag off', () => {
      setOwnPreference(true);
      const { result } = renderHook(() => useToastsEnabled(household(false)));
      expect(result.current).toBe(true);
    });
  });

  describe('signed out', () => {
    beforeEach(() => { useAuth.mockReturnValue({ user: null }); });

    it('follows the household flag, whatever the stored preference', () => {
      setOwnPreference(true);
      const { result, rerender } = renderHook(({ setup }) => useToastsEnabled(setup), {
        initialProps: { setup: household(false) },
      });
      expect(result.current).toBe(false);
      rerender({ setup: household(true) });
      expect(result.current).toBe(true);
    });

    it('defaults to true while the household config is absent', () => {
      const { result } = renderHook(() => useToastsEnabled({ retentionConfig: undefined }));
      expect(result.current).toBe(true);
    });
  });
});
