import { render, screen, fireEvent } from '@testing-library/react';
import DevicesPage from './DevicesPage.jsx';

vi.mock('../hooks/useSetup.js', () => ({ useSetup: () => ({}) }));
vi.mock('../components/AccessoryList.jsx', () => ({ default: () => <div>accessory list</div> }));
vi.mock('../components/setup/AddDevicesTab.jsx', () => ({ default: () => <div>add devices</div> }));
vi.mock('../components/setup/MyDevicesTab.jsx', () => ({ default: () => <div>my devices</div> }));
// The page reads the session to gate admin-only controls; no QueryClientProvider here.
vi.mock('../hooks/useAuth.js', () => ({ useAuth: () => ({ user: null }) }));
vi.mock('../hooks/useAuthConfig.js', () => ({ useAuthConfig: () => ({ authEnabled: true }) }));

const legendButton = () => screen.queryByRole('button', { name: 'Legend' });

describe('DevicesPage legend', () => {
  it('offers the legend from the tab bar on Browse only', () => {
    render(<DevicesPage />);
    expect(legendButton()).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Add Accessories' }));
    expect(legendButton()).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Manage Accessories' }));
    expect(legendButton()).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Browse' }));
    expect(legendButton()).toBeInTheDocument();
  });

  it('opens the legend popover on click and closes it on Escape or an outside click', () => {
    render(<DevicesPage />);
    const button = legendButton();
    expect(button).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('dialog', { name: 'Legend' })).not.toBeInTheDocument();

    fireEvent.click(button);
    expect(button).toHaveAttribute('aria-expanded', 'true');
    const panel = screen.getByRole('dialog', { name: 'Legend' });
    expect(panel).toHaveTextContent('Active within the last hour');
    expect(panel).toHaveTextContent('Service icon: accessory type');

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: 'Legend' })).not.toBeInTheDocument();
    expect(button).toHaveFocus();

    fireEvent.click(button);
    expect(screen.getByRole('dialog', { name: 'Legend' })).toBeInTheDocument();
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole('dialog', { name: 'Legend' })).not.toBeInTheDocument();
  });
});

describe('DevicesPage tab', () => {
  const tabButton = (name) => screen.getByRole('button', { name });
  const isSelected = (name) => tabButton(name).classList.contains('border-hc-accent-strong');

  it('opens the tab given by the tab prop and reports changes', () => {
    const onTabChange = vi.fn();
    render(<DevicesPage tab="devices" onTabChange={onTabChange} />);
    expect(isSelected('Manage Accessories')).toBe(true);
    expect(isSelected('Browse')).toBe(false);
    expect(screen.getByText('my devices')).toBeInTheDocument();

    fireEvent.click(tabButton('Browse'));
    expect(onTabChange).toHaveBeenCalledWith('browse');
    // Controlled: the page shows what the caller holds until the caller changes it.
    expect(screen.getByText('my devices')).toBeInTheDocument();
  });

  it('owns its tab when rendered without tab/onTabChange', () => {
    render(<DevicesPage />);
    expect(isSelected('Browse')).toBe(true);
    expect(screen.getByText('accessory list')).toBeInTheDocument();

    fireEvent.click(tabButton('Manage Accessories'));
    expect(isSelected('Manage Accessories')).toBe(true);
    expect(screen.getByText('my devices')).toBeInTheDocument();
  });
});
