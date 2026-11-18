import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSetting } from './useSetting.js';

describe('useSetting', () => {
  it('shows the new value at once and returns to the saved value when commit rejects', async () => {
    const commit = vi.fn().mockRejectedValue(new Error('nope'));
    const { result } = renderHook(() => useSetting(true, commit));
    await act(async () => { await result.current[1](false).catch(() => {}); });
    expect(commit).toHaveBeenCalledWith(false);
    expect(result.current[0]).toBe(true);
  });

  it('keeps the new value after success until saved catches up', async () => {
    const commit = vi.fn().mockResolvedValue({});
    const { result, rerender } = renderHook(({ s }) => useSetting(s, commit), { initialProps: { s: true } });
    await act(async () => { await result.current[1](false); });
    expect(result.current[0]).toBe(false);
    rerender({ s: false });
    expect(result.current[0]).toBe(false);
    rerender({ s: true });
    expect(result.current[0]).toBe(true);
  });

  it('shows the override while the commit is pending', async () => {
    let release;
    const commit = vi.fn(() => new Promise((r) => { release = r; }));
    const { result } = renderHook(() => useSetting(true, commit));
    let pending;
    act(() => { pending = result.current[1](false); });
    expect(result.current[0]).toBe(false);
    await act(async () => { release({}); await pending; });
    expect(result.current[0]).toBe(false);
  });

  it('reverts when commit throws synchronously', async () => {
    const commit = vi.fn(() => { throw new Error('sync'); });
    const { result } = renderHook(() => useSetting('a', commit));
    await act(async () => { await result.current[1]('b').catch(() => {}); });
    expect(result.current[0]).toBe('a');
  });

  it('keeps the newer value when an older change fails while it is pending', async () => {
    let failA;
    let finishB;
    const commit = vi.fn()
      .mockImplementationOnce(() => new Promise((_, rej) => { failA = rej; }))
      .mockImplementationOnce(() => new Promise((res) => { finishB = res; }));
    const { result } = renderHook(() => useSetting('saved', commit));
    let pa;
    let pb;
    act(() => { pa = result.current[1]('a').catch(() => {}); });
    act(() => { pb = result.current[1]('b'); });
    await act(async () => { failA(new Error('nope')); await pa; });
    expect(result.current[0]).toBe('b');
    await act(async () => { finishB({}); await pb; });
    expect(result.current[0]).toBe('b');
  });
});
