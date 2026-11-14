import { render, screen, fireEvent } from '@testing-library/react';
import DevicesPage from './DevicesPage.jsx';

vi.mock('../hooks/useSetup.js', () => ({ useSetup: () => ({}) }));
vi.mock('../components/AccessoryList.jsx', () => ({ default: () => <div>accessory list</div> }));
vi.mock('../components/setup/AddDevicesTab.jsx', () => ({ default: () => <div>add devices</div> }));
vi.mock('../components/setup/MyDevicesTab.jsx', () => ({ default: () => <div>my devices</div> }));

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
