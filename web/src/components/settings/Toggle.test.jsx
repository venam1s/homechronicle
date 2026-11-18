import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Toggle from './Toggle.jsx';

describe('Toggle', () => {
  it('is a switch named by ariaLabel that reports the flipped value', async () => {
    const onChange = vi.fn();
    render(<Toggle checked={false} onChange={onChange} ariaLabel="HomeKit auto-scan" />);
    const sw = screen.getByRole('switch', { name: 'HomeKit auto-scan' });
    expect(sw).toHaveAttribute('aria-checked', 'false');
    await userEvent.click(sw);
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it('does nothing when disabled', async () => {
    const onChange = vi.fn();
    render(<Toggle checked onChange={onChange} ariaLabel="X" disabled />);
    await userEvent.click(screen.getByRole('switch'));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('shows a muted knob when off and an on-accent knob when on', () => {
    const { rerender } = render(<Toggle checked={false} onChange={() => {}} ariaLabel="X" />);
    let knob = screen.getByTestId('toggle-knob');
    expect(knob).toHaveClass('bg-hc-muted');
    expect(knob).not.toHaveClass('bg-hc-on-accent');
    expect(knob).not.toHaveClass('bg-hc-panel');
    rerender(<Toggle checked onChange={() => {}} ariaLabel="X" />);
    knob = screen.getByTestId('toggle-knob');
    expect(knob).toHaveClass('bg-hc-on-accent');
    expect(knob).not.toHaveClass('bg-hc-muted');
    expect(knob).not.toHaveClass('bg-hc-panel');
  });
});
