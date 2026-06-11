import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import PasswordStrengthMeter from './PasswordStrengthMeter.jsx';

describe('PasswordStrengthMeter', () => {
  function getSegments(container) {
    return container.querySelectorAll('[data-testid="strength-segment"]');
  }

  it('weak password: 1 of 3 segments filled with danger color, 2 unfilled', () => {
    const { container } = render(<PasswordStrengthMeter password="short" />);
    const segments = getSegments(container);
    expect(segments.length).toBe(3);
    expect(segments[0].style.backgroundColor).toBe('var(--hc-danger-text)');
    expect(segments[1].style.backgroundColor).toBe('var(--hc-panel-border)');
    expect(segments[2].style.backgroundColor).toBe('var(--hc-panel-border)');
  });

  it('fair password: 2 of 3 segments filled with warning color', () => {
    const { container } = render(<PasswordStrengthMeter password="MyPassword12" />);
    const segments = getSegments(container);
    expect(segments.length).toBe(3);
    expect(segments[0].style.backgroundColor).toBe('var(--hc-warning-text)');
    expect(segments[1].style.backgroundColor).toBe('var(--hc-warning-text)');
    expect(segments[2].style.backgroundColor).toBe('var(--hc-panel-border)');
  });

  it('strong password: 3 of 3 segments filled with success color', () => {
    const { container } = render(<PasswordStrengthMeter password="ThisIsAVeryStrongPassphrase123!" />);
    const segments = getSegments(container);
    expect(segments.length).toBe(3);
    expect(segments[0].style.backgroundColor).toBe('var(--hc-success-text)');
    expect(segments[1].style.backgroundColor).toBe('var(--hc-success-text)');
    expect(segments[2].style.backgroundColor).toBe('var(--hc-success-text)');
  });

  it('empty password: 1 segment with danger color, 2 unfilled', () => {
    const { container } = render(<PasswordStrengthMeter password="" />);
    const segments = getSegments(container);
    expect(segments[0].style.backgroundColor).toBe('var(--hc-danger-text)');
    expect(segments[1].style.backgroundColor).toBe('var(--hc-panel-border)');
    expect(segments[2].style.backgroundColor).toBe('var(--hc-panel-border)');
  });

  it('renders strengthFeedback text below the bar for weak/empty password', () => {
    render(<PasswordStrengthMeter password="" />);
    expect(screen.getByText('At least 10 characters required')).toBeInTheDocument();
  });

  it('renders strengthFeedback text below the bar for fair password', () => {
    render(<PasswordStrengthMeter password="MyPassword12" />);
    expect(screen.getByText('Fair — try a longer passphrase')).toBeInTheDocument();
  });

  it('renders strengthFeedback text below the bar for strong password', () => {
    render(<PasswordStrengthMeter password="ThisIsAVeryStrongPassphrase123!" />);
    expect(screen.getByText('Strong')).toBeInTheDocument();
  });

  it('blocklisted password: 1 segment with danger color + common-password feedback', () => {
    const { container } = render(<PasswordStrengthMeter password="homechronicle" />);
    const segments = getSegments(container);
    expect(segments[0].style.backgroundColor).toBe('var(--hc-danger-text)');
    expect(segments[1].style.backgroundColor).toBe('var(--hc-panel-border)');
    expect(segments[2].style.backgroundColor).toBe('var(--hc-panel-border)');
    expect(screen.getByText('That password is too common. Choose something more unique.')).toBeInTheDocument();
  });
});
