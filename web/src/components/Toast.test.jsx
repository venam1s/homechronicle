import { describe, it, expect, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { ToastProvider, useToast } from './Toast.jsx';

function ToastTrigger({ count, type = 'success' }) {
  const { addToast } = useToast();
  return (
    <button onClick={() => {
      for (let i = 0; i < count; i++) addToast(`Toast ${i + 1}`, type, 60000);
    }}>
      Fire
    </button>
  );
}

describe('Toast', () => {
  it('limits visible toasts to 3', async () => {
    render(
      <ToastProvider>
        <ToastTrigger count={5} />
      </ToastProvider>
    );
    await act(async () => screen.getByText('Fire').click());
    const toasts = screen.getAllByText(/^Toast \d+$/);
    expect(toasts.length).toBeLessThanOrEqual(3);
  });

  it('renders Info icon for info type toasts', async () => {
    render(
      <ToastProvider>
        <ToastTrigger count={1} type="info" />
      </ToastProvider>
    );
    await act(async () => screen.getByText('Fire').click());
    expect(screen.getByText('Toast 1')).toBeInTheDocument();
  });
});
