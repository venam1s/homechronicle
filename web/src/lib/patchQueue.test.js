import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createPatchQueue } from './patchQueue.js';

describe('createPatchQueue', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('merges patches pushed inside the delay into one send', async () => {
    const send = vi.fn().mockResolvedValue({ ok: 1 });
    const q = createPatchQueue({ send });
    const a = q.push({ autoScanHomeKit: false });
    const b = q.push({ archiveBeforeDelete: false });
    await vi.advanceTimersByTimeAsync(300);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith({ autoScanHomeKit: false, archiveBeforeDelete: false });
    await expect(a).resolves.toEqual({ ok: 1 });
    await expect(b).resolves.toEqual({ ok: 1 });
  });

  it('later value wins for the same key', async () => {
    const send = vi.fn().mockResolvedValue({});
    const q = createPatchQueue({ send });
    q.push({ x: 1 });
    q.push({ x: 2 });
    await vi.advanceTimersByTimeAsync(300);
    expect(send).toHaveBeenCalledWith({ x: 2 });
  });

  it('holds patches pushed during a send and sends them next, in order', async () => {
    let release;
    const send = vi.fn()
      .mockImplementationOnce(() => new Promise((r) => { release = r; }))
      .mockResolvedValue({});
    const q = createPatchQueue({ send });
    q.push({ a: 1 });
    await vi.advanceTimersByTimeAsync(300);
    q.push({ b: 2 });
    await vi.advanceTimersByTimeAsync(300);
    expect(send).toHaveBeenCalledTimes(1);
    release({});
    await vi.advanceTimersByTimeAsync(0);
    expect(send).toHaveBeenNthCalledWith(2, { b: 2 });
  });

  it('rejects every push carried by a failed send, and keeps working after', async () => {
    const send = vi.fn().mockRejectedValueOnce(new Error('403')).mockResolvedValue({});
    const q = createPatchQueue({ send });
    const a = q.push({ a: 1 });
    const b = q.push({ b: 2 });
    a.catch(() => {});
    b.catch(() => {});
    await vi.advanceTimersByTimeAsync(300);
    await expect(a).rejects.toThrow('403');
    await expect(b).rejects.toThrow('403');
    const c = q.push({ c: 3 });
    await vi.advanceTimersByTimeAsync(300);
    await expect(c).resolves.toEqual({});
  });

  it('dispose cancels a pending send and rejects its pushes', async () => {
    const send = vi.fn();
    const q = createPatchQueue({ send });
    const p = q.push({ a: 1 });
    const assertion = expect(p).rejects.toThrow('patch queue disposed');
    q.dispose();
    await vi.advanceTimersByTimeAsync(300);
    expect(send).not.toHaveBeenCalled();
    await assertion;
  });

  it('push after dispose rejects', async () => {
    const q = createPatchQueue({ send: vi.fn() });
    q.dispose();
    await expect(q.push({ a: 1 })).rejects.toThrow('patch queue disposed');
  });

  it('flush sends the pending batch before the delay elapses', async () => {
    const send = vi.fn().mockResolvedValue({ ok: 1 });
    const q = createPatchQueue({ send });
    const p = q.push({ a: 1 });
    q.flush();
    await vi.advanceTimersByTimeAsync(0);
    expect(send).toHaveBeenCalledWith({ a: 1 });
    await expect(p).resolves.toEqual({ ok: 1 });
    await vi.advanceTimersByTimeAsync(300);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('flush during a send sends the pending batch when that send finishes', async () => {
    let release;
    const send = vi.fn()
      .mockImplementationOnce(() => new Promise((r) => { release = r; }))
      .mockResolvedValue({});
    const q = createPatchQueue({ send });
    q.push({ a: 1 });
    await vi.advanceTimersByTimeAsync(300);
    q.push({ b: 2 });
    q.flush();
    expect(send).toHaveBeenCalledTimes(1);
    release({});
    await vi.advanceTimersByTimeAsync(0);
    expect(send).toHaveBeenNthCalledWith(2, { b: 2 });
  });
});
