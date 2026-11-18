import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Segmented from './Segmented.jsx';

describe('Segmented', () => {
  it('is a radiogroup with one checked radio and reports the clicked id', async () => {
    const onChange = vi.fn();
    render(
      <Segmented
        ariaLabel="Theme"
        value="dark"
        onChange={onChange}
        options={[{ id: 'light', label: 'Light' }, { id: 'dark', label: 'Dark' }]}
      />,
    );
    expect(screen.getByRole('radiogroup', { name: 'Theme' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Dark' })).toHaveAttribute('aria-checked', 'true');
    await userEvent.click(screen.getByRole('radio', { name: 'Light' }));
    expect(onChange).toHaveBeenCalledWith('light');
  });
});
