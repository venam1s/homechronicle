import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import Card from './Card.jsx';

describe('Card', () => {
  it('Test 1: renders children inside a div with correct base classes', () => {
    render(<Card><p>Hello</p></Card>);
    const card = screen.getByText('Hello').parentElement;
    expect(card).toHaveClass('bg-hc-panel', 'rounded-xl', 'shadow-sm', 'overflow-hidden');
  });

  it('Test 2: accepts and applies additional className prop via clsx', () => {
    render(<Card className="mt-4 w-full"><p>Styled</p></Card>);
    const card = screen.getByText('Styled').parentElement;
    expect(card).toHaveClass('bg-hc-panel', 'rounded-xl', 'shadow-sm', 'overflow-hidden', 'mt-4', 'w-full');
  });

  it('Test 3: Card.Header renders title text with correct classes', () => {
    render(<Card><Card.Header title="My Title" /></Card>);
    const title = screen.getByText('My Title');
    expect(title.tagName).toBe('SPAN');
    expect(title).toHaveClass('text-hc-section', 'font-semibold', 'text-hc-fg-strong');
  });

  it('Test 3b: Card.Header renders title as <h2> when headingLevel={2}', () => {
    render(<Card><Card.Header title="My H2" headingLevel={2} /></Card>);
    const title = screen.getByText('My H2');
    expect(title.tagName).toBe('H2');
    expect(title).toHaveClass('text-hc-section', 'font-semibold', 'text-hc-fg-strong');
  });

  it('Test 4: Card.Header renders actions slot content when provided', () => {
    render(
      <Card>
        <Card.Header title="Title" actions={<button>Action</button>} />
      </Card>
    );
    expect(screen.getByRole('button', { name: 'Action' })).toBeInTheDocument();
  });

  it('Test 5: Card.Header does not render actions div when actions prop is omitted', () => {
    render(<Card><Card.Header title="No Actions" /></Card>);
    const header = screen.getByText('No Actions').closest('div[class*="border-b"]');
    // The header should only contain the title span, no extra wrapper div for actions
    const children = header.children;
    expect(children.length).toBe(1);
  });

  it('Test 6: Card.Header has border-b border-hc-panel-border class', () => {
    render(<Card><Card.Header title="Bordered" /></Card>);
    const header = screen.getByText('Bordered').closest('div[class*="border-b"]');
    expect(header).toHaveClass('border-b', 'border-hc-panel-border');
  });

  it('Test 7: Card.Body renders children with standard padding by default', () => {
    render(<Card><Card.Body><p>Body content</p></Card.Body></Card>);
    const body = screen.getByText('Body content').parentElement;
    expect(body).toHaveClass('p-4', 'sm:p-5');
  });

  it('Test 8: Card.Body renders children with compact padding when compact={true}', () => {
    render(<Card><Card.Body compact={true}><p>Compact content</p></Card.Body></Card>);
    const body = screen.getByText('Compact content').parentElement;
    expect(body).toHaveClass('p-3', 'sm:p-4');
    expect(body).not.toHaveClass('p-4', 'sm:p-5');
  });
});
