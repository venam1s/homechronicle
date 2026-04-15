import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useMediaQuery } from './useMediaQuery.js';

function makeMatchMedia(matches) {
  let changeListener = null;
  return {
    media: {
      matches,
      addEventListener: vi.fn((event, cb) => { changeListener = cb; }),
      removeEventListener: vi.fn(),
    },
    fireChange(newMatches) {
      if (changeListener) changeListener({ matches: newMatches });
    },
  };
}

describe('useMediaQuery', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns true when query matches on mount', () => {
    const mock = makeMatchMedia(true);
    vi.spyOn(window, 'matchMedia').mockReturnValue(mock.media);

    const { result } = renderHook(() => useMediaQuery('(min-width: 768px)'));
    expect(result.current).toBe(true);
  });

  it('returns false when query does not match on mount', () => {
    const mock = makeMatchMedia(false);
    vi.spyOn(window, 'matchMedia').mockReturnValue(mock.media);

    const { result } = renderHook(() => useMediaQuery('(min-width: 768px)'));
    expect(result.current).toBe(false);
  });

  it('updates when matchMedia fires change event', () => {
    const mock = makeMatchMedia(false);
    vi.spyOn(window, 'matchMedia').mockReturnValue(mock.media);

    const { result } = renderHook(() => useMediaQuery('(min-width: 768px)'));
    expect(result.current).toBe(false);

    act(() => {
      mock.fireChange(true);
    });
    expect(result.current).toBe(true);
  });

  it('cleans up listener on unmount', () => {
    const mock = makeMatchMedia(false);
    vi.spyOn(window, 'matchMedia').mockReturnValue(mock.media);

    const { unmount } = renderHook(() => useMediaQuery('(min-width: 768px)'));
    unmount();

    expect(mock.media.removeEventListener).toHaveBeenCalledWith('change', expect.any(Function));
  });
});
