import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import NumberField from './NumberField.jsx';

const setup = (props = {}) => {
  const onApply = vi.fn().mockResolvedValue({});
  const utils = render(<NumberField value={365} min={1} max={3650} unit="days"
    ariaLabel="Retention cutoff" onApply={onApply} {...props} />);
  return { onApply, input: screen.getByRole('spinbutton', { name: 'Retention cutoff' }), ...utils };
};

describe('NumberField', () => {
  it('shows no Apply until the value differs', async () => {
    const { input } = setup();
    expect(screen.queryByRole('button', { name: 'Apply' })).toBeNull();
    await userEvent.clear(input); await userEvent.type(input, '30');
    expect(screen.getByRole('button', { name: 'Apply' })).toBeEnabled();
  });
  it('never saves on blur', async () => {
    const { input, onApply } = setup();
    await userEvent.clear(input); await userEvent.type(input, '3');
    await userEvent.tab();
    expect(onApply).not.toHaveBeenCalled();
  });
  it.each(['', 'abc', '3.5', '-1', '0', '3651'])('refuses %j', async (junk) => {
    const { input, onApply } = setup();
    await userEvent.clear(input);
    if (junk) await userEvent.type(input, junk);
    expect(screen.getByRole('button', { name: 'Apply' })).toBeDisabled();
    expect(screen.getByRole('alert')).toHaveTextContent('Enter a whole number from 1 to 3650.');
    await userEvent.keyboard('{Enter}');
    expect(onApply).not.toHaveBeenCalled();
  });
  it('applies on click and on Enter with a number', async () => {
    const { input, onApply } = setup();
    await userEvent.clear(input); await userEvent.type(input, '30{Enter}');
    expect(onApply).toHaveBeenCalledWith(30);
    await waitFor(() => expect(input).toBeEnabled());
  });
  it('does nothing on Enter when the field is unchanged', async () => {
    const { input, onApply } = setup();
    await userEvent.click(input);
    await userEvent.keyboard('{Enter}');
    expect(onApply).not.toHaveBeenCalled();
    await userEvent.clear(input); await userEvent.type(input, '365{Enter}');
    expect(onApply).not.toHaveBeenCalled();
  });
  it('Escape and Cancel restore the saved value', async () => {
    const { input } = setup();
    await userEvent.clear(input); await userEvent.type(input, '30{Escape}');
    expect(input).toHaveValue(365);
    await userEvent.clear(input); await userEvent.type(input, '40');
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(input).toHaveValue(365);
  });
  it('shows the warning for a valid dirty draft only', async () => {
    const { input } = setup({ warning: (n) => (n < 365 ? 'will delete' : null) });
    await userEvent.clear(input); await userEvent.type(input, '30');
    expect(screen.getByText('will delete')).toBeInTheDocument();
    await userEvent.clear(input); await userEvent.type(input, '400');
    expect(screen.queryByText('will delete')).toBeNull();
  });
  it('follows a new saved value when clean, keeps the draft when dirty', async () => {
    const { input, rerender, onApply } = setup();
    rerender(<NumberField value={400} min={1} max={3650} ariaLabel="Retention cutoff" onApply={onApply} />);
    expect(input).toHaveValue(400);
    await userEvent.clear(input); await userEvent.type(input, '30');
    rerender(<NumberField value={500} min={1} max={3650} ariaLabel="Retention cutoff" onApply={onApply} />);
    expect(input).toHaveValue(30);
  });
  it('keeps the draft when apply fails', async () => {
    const { input } = setup({ onApply: vi.fn().mockRejectedValue(new Error('x')) });
    await userEvent.clear(input); await userEvent.type(input, '30{Enter}');
    await waitFor(() => expect(input).toBeEnabled());
    expect(input).toHaveValue(30);
  });
});
