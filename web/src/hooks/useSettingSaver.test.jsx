import { StrictMode } from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { ToastProvider } from '../components/Toast.jsx';
import { useSettingSaver } from './useSettingSaver.js';

let save;
function Harness({ mutation, options }) {
  save = useSettingSaver(mutation, options);
  return null;
}

function mount(mutation, options) {
  return render(
    <ToastProvider>
      <Harness mutation={mutation} options={options} />
    </ToastProvider>,
  );
}

// Calls save, advances the debounce, and settles the promise.
async function saveAndFlush(patch) {
  let outcome;
  await act(async () => {
    const p = save(patch).then(
      (v) => ({ ok: true, v }),
      (e) => ({ ok: false, e }),
    );
    await vi.advanceTimersByTimeAsync(300);
    outcome = await p;
  });
  return outcome;
}

describe('useSettingSaver', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('toasts "Setting saved" on success and calls onSaved first', async () => {
    const mutation = { mutateAsync: vi.fn().mockResolvedValue({ done: true }) };
    const onSaved = vi.fn();
    mount(mutation, { onSaved });
    const outcome = await saveAndFlush({ a: 1 });
    expect(outcome.ok).toBe(true);
    expect(mutation.mutateAsync).toHaveBeenCalledWith({ a: 1 });
    expect(onSaved).toHaveBeenCalledWith({ done: true }, { a: 1 });
    expect(screen.getByText('Setting saved')).toBeInTheDocument();
  });

  it('stays silent on success when toastsEnabled is false', async () => {
    const mutation = { mutateAsync: vi.fn().mockResolvedValue({}) };
    mount(mutation, { toastsEnabled: false });
    await saveAndFlush({ a: 1 });
    expect(screen.queryByText('Setting saved')).not.toBeInTheDocument();
  });

  it('stays silent on success when the patch itself turns toasts off', async () => {
    const mutation = { mutateAsync: vi.fn().mockResolvedValue({}) };
    mount(mutation, { toastsEnabled: true });
    await saveAndFlush({ toastsEnabled: false });
    expect(screen.queryByText('Setting saved')).not.toBeInTheDocument();
  });

  it('toasts "Failed to save setting" and rejects on failure, even when toastsEnabled is false', async () => {
    const mutation = { mutateAsync: vi.fn().mockRejectedValue(new Error('403')) };
    mount(mutation, { toastsEnabled: false });
    const outcome = await saveAndFlush({ a: 1 });
    expect(outcome.ok).toBe(false);
    expect(outcome.e.message).toBe('403');
    expect(screen.getByText('Failed to save setting')).toBeInTheDocument();
  });

  it('returns a stable save function across renders', () => {
    const mutation = { mutateAsync: vi.fn() };
    const { rerender } = mount(mutation, {});
    const first = save;
    rerender(
      <ToastProvider>
        <Harness mutation={{ mutateAsync: vi.fn() }} options={{ toastsEnabled: false }} />
      </ToastProvider>,
    );
    expect(save).toBe(first);
  });

  it('merges two saves into one send and one success toast', async () => {
    const mutation = { mutateAsync: vi.fn().mockResolvedValue({}) };
    const onSaved = vi.fn();
    mount(mutation, { onSaved });
    await act(async () => {
      const a = save({ a: 1 });
      const b = save({ b: 2 });
      await vi.advanceTimersByTimeAsync(300);
      await Promise.all([a, b]);
    });
    expect(mutation.mutateAsync).toHaveBeenCalledTimes(1);
    expect(onSaved).toHaveBeenCalledTimes(1);
    expect(onSaved).toHaveBeenCalledWith({}, { a: 1, b: 2 });
    expect(screen.getAllByText('Setting saved')).toHaveLength(1);
  });

  it('shows one failure toast for a merged batch and rejects every save', async () => {
    const mutation = { mutateAsync: vi.fn().mockRejectedValue(new Error('403')) };
    mount(mutation, {});
    let results;
    await act(async () => {
      const a = save({ a: 1 }).catch((e) => e.message);
      const b = save({ b: 2 }).catch((e) => e.message);
      await vi.advanceTimersByTimeAsync(300);
      results = await Promise.all([a, b]);
    });
    expect(results).toEqual(['403', '403']);
    expect(screen.getAllByText('Failed to save setting')).toHaveLength(1);
  });

  it('still saves after a StrictMode mount/cleanup/mount cycle', async () => {
    const mutation = { mutateAsync: vi.fn().mockResolvedValue({}) };
    render(
      <StrictMode>
        <ToastProvider>
          <Harness mutation={mutation} options={{}} />
        </ToastProvider>
      </StrictMode>,
    );
    await saveAndFlush({ a: 1 });
    expect(mutation.mutateAsync).toHaveBeenCalledTimes(1);
    expect(mutation.mutateAsync).toHaveBeenCalledWith({ a: 1 });
  });

  it('saves a pending change when the component unmounts before the delay', async () => {
    const mutation = { mutateAsync: vi.fn().mockResolvedValue({}) };
    const { unmount } = mount(mutation, {});
    save({ a: 1 }).catch(() => {});
    unmount();
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(mutation.mutateAsync).toHaveBeenCalledTimes(1);
    expect(mutation.mutateAsync).toHaveBeenCalledWith({ a: 1 });
  });
});
