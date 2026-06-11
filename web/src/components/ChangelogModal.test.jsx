import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ChangelogModal from './ChangelogModal.jsx';

describe('ChangelogModal', () => {
  it('renders a "Report issue" link to the GitLab issues page (new tab)', () => {
    render(<ChangelogModal onClose={vi.fn()} />);
    const link = screen.getByRole('link', { name: /report issue/i });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute('href', 'https://gitlab.com/havuq/homechronicle/-/issues');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('Close button calls onClose', () => {
    const onClose = vi.fn();
    render(<ChangelogModal onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: /close/i }));
    expect(onClose).toHaveBeenCalled();
  });
});
