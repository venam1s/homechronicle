import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { createRef } from 'react';
import DashboardPanel from './DashboardPanel.jsx';

describe('DashboardPanel', () => {
  it('renders body content with no edit chrome in view mode', () => {
    render(<DashboardPanel title="Trend" editing={false} body={<div>chart-body</div>} />);
    expect(screen.getByText('chart-body')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /remove/i })).toBeNull();
  });

  it('shows a remove button while editing and calls onRemove', () => {
    const onRemove = vi.fn();
    render(<DashboardPanel title="Trend" editing body={<div>chart-body</div>} onRemove={onRemove} />);
    expect(screen.getByText('Trend')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Remove Trend panel' }));
    expect(onRemove).toHaveBeenCalledTimes(1);
  });

  it('forwards its ref to the root node (react-grid-layout needs this on React 19)', () => {
    const ref = createRef();
    render(<DashboardPanel title="X" editing={false} body={<div />} ref={ref} />);
    expect(ref.current).toBeInstanceOf(HTMLElement);
  });

  it('renders library-injected children such as the resize handle', () => {
    render(
      <DashboardPanel title="X" editing body={<div>b</div>}>
        <span data-testid="resize-handle" />
      </DashboardPanel>,
    );
    expect(screen.getByTestId('resize-handle')).toBeInTheDocument();
  });

  it('omits the panel background for bare panels (avoids card-in-card)', () => {
    const { container } = render(
      <DashboardPanel title="X" editing={false} bare body={<div>b</div>} />,
    );
    expect(container.firstChild.className).not.toMatch(/bg-hc-panel/);
  });

  it('keeps the panel background for normal panels', () => {
    const { container } = render(
      <DashboardPanel title="X" editing={false} body={<div>b</div>} />,
    );
    expect(container.firstChild.className).toMatch(/bg-hc-panel/);
  });
});
