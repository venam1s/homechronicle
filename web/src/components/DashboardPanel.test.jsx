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

  // DASH-09: in view mode a panel is a ruled section — each panel component
  // supplies its own title, so the wrapper must not add a second one. In edit
  // mode the wrapper's handle is the only place the title appears.
  it('shows no wrapper title in view mode and one while editing', () => {
    const { rerender } = render(<DashboardPanel title="Daily Activity" body={<p>body</p>} />);
    expect(screen.queryByText('Daily Activity')).toBeNull();

    rerender(<DashboardPanel title="Daily Activity" body={<p>body</p>} editing />);
    expect(screen.getByText('Daily Activity')).toBeInTheDocument();
  });

  it('carries a hairline border rather than a drop shadow', () => {
    const { container } = render(<DashboardPanel title="T" body={<p>body</p>} />);
    const root = container.firstChild;
    expect(root.className).toContain('border-hc-panel-border');
    expect(root.className).not.toContain('shadow');
  });

  // A `bare` panel is transparent in view mode, which would make it invisible
  // as a drag target; edit mode has to outline it like any other.
  it('outlines a bare panel while editing even though it is transparent', () => {
    const { container, rerender } = render(<DashboardPanel title="T" body={<p>body</p>} bare />);
    expect(container.firstChild.className).not.toContain('ring-');

    rerender(<DashboardPanel title="T" body={<p>body</p>} bare editing />);
    expect(container.firstChild.className).toContain('ring-');
  });
});
