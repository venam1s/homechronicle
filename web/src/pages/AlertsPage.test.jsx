import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import AlertsPage from './AlertsPage.jsx';
import { useCanManageHome } from '../hooks/useCanManageHome.js';

vi.mock('../components/Alerts.jsx', () => ({ default: () => <div>alert rules</div> }));
vi.mock('../hooks/useCanManageHome.js', () => ({ useCanManageHome: vi.fn() }));

describe('AlertsPage', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('shows "Alert defaults" to an admin and navigates to Settings general; hides it from a member', () => {
    useCanManageHome.mockReturnValue(true);
    const onNavigate = vi.fn();
    const { unmount } = render(<AlertsPage onNavigate={onNavigate} />);
    fireEvent.click(screen.getByRole('button', { name: 'Alert defaults' }));
    expect(onNavigate).toHaveBeenCalledWith('settings', { section: 'general' });
    expect(screen.getByText('alert rules')).toBeInTheDocument();
    unmount();

    useCanManageHome.mockReturnValue(false);
    render(<AlertsPage onNavigate={onNavigate} />);
    expect(screen.queryByRole('button', { name: 'Alert defaults' })).toBeNull();
    expect(screen.getByText('alert rules')).toBeInTheDocument();
  });

  it('shows no link when rendered without onNavigate', () => {
    useCanManageHome.mockReturnValue(true);
    render(<AlertsPage />);
    expect(screen.queryByRole('button', { name: 'Alert defaults' })).toBeNull();
  });
});
