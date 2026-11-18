import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import SettingsRow from './SettingsRow.jsx';

describe('SettingsRow', () => {
  it('puts the description under the label and the control beside them', () => {
    render(<SettingsRow label="Theme" description="Follows this device." control={<button>ctl</button>} />);
    const label = screen.getByText('Theme');
    const desc = screen.getByText('Follows this device.');
    expect(label.compareDocumentPosition(desc) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByRole('button', { name: 'ctl' })).toBeInTheDocument();
  });

  it('renders dependents and footnote when given, and neither when not', () => {
    const { rerender } = render(<SettingsRow label="A" control={<i />} />);
    expect(screen.queryByTestId('settings-row-dependents')).toBeNull();
    rerender(<SettingsRow label="A" control={<i />} footnote="Last run 3h ago"><p>child</p></SettingsRow>);
    expect(screen.getByTestId('settings-row-dependents')).toHaveTextContent('child');
    expect(screen.getByText('Last run 3h ago')).toBeInTheDocument();
  });

  it('marks a disabled row inert', () => {
    render(<SettingsRow label="A" control={<i />} disabled />);
    expect(screen.getByTestId('settings-row')).toHaveClass('opacity-50', 'pointer-events-none');
  });
});
