import { describe, expect, it } from 'vitest';
import { passwordStrengthTier, strengthFeedback } from './strength.js';

describe('passwordStrengthTier', () => {
  it('returns "weak" for empty string', () => {
    expect(passwordStrengthTier('')).toBe('weak');
  });

  it('returns "weak" for short password (len < 10)', () => {
    expect(passwordStrengthTier('shortpw')).toBe('weak');
  });

  it('returns "weak" for exactly 9 chars', () => {
    expect(passwordStrengthTier('abcdefghi')).toBe('weak');
  });

  it('returns "weak" for blocklisted password', () => {
    // 'password' is 8 chars — fails on length; use a blocklisted entry that is >= 10 chars
    // '1234567890' is 10 chars and should be in the client blocklist
    expect(passwordStrengthTier('1234567890')).toBe('weak');
  });

  it('returns "weak" for homechronicle (self-referential blocklist)', () => {
    expect(passwordStrengthTier('homechronicle')).toBe('weak');
  });

  it('returns "fair" for 10-14 char non-blocklisted password', () => {
    expect(passwordStrengthTier('twelve-chars')).toBe('fair');
  });

  it('returns "fair" for exactly 10 non-blocklisted chars', () => {
    expect(passwordStrengthTier('xYz9!@#$%^')).toBe('fair');
  });

  it('returns "fair" for exactly 14 non-blocklisted chars', () => {
    expect(passwordStrengthTier('abcde!@#$%1234')).toBe('fair');
  });

  it('returns "strong" for 15+ char non-blocklisted passphrase', () => {
    expect(passwordStrengthTier('a-much-longer-passphrase')).toBe('strong');
  });

  it('returns "strong" for exactly 15 non-blocklisted chars', () => {
    expect(passwordStrengthTier('abcde!@#$%12345')).toBe('strong');
  });
});

describe('strengthFeedback', () => {
  it('returns "At least 10 characters required" for empty string', () => {
    expect(strengthFeedback('')).toBe('At least 10 characters required');
  });

  it('returns "At least 10 characters required" for short password', () => {
    expect(strengthFeedback('short')).toBe('At least 10 characters required');
  });

  it('returns blocklist copy for a blocklisted password', () => {
    // homechronicle is 13 chars (>=10) and blocklisted — should show blocklist message
    expect(strengthFeedback('homechronicle')).toBe('That password is too common. Choose something more unique.');
  });

  it('returns fair feedback for 10-14 char non-blocklisted password', () => {
    expect(strengthFeedback('twelve-chars')).toBe('Fair — try a longer passphrase');
  });

  it('returns "Strong" for 15+ char non-blocklisted password', () => {
    expect(strengthFeedback('a-much-longer-passphrase')).toBe('Strong');
  });
});

describe('strength.js purity', () => {
  it('exports passwordStrengthTier and strengthFeedback as named exports', async () => {
    const mod = await import('./strength.js');
    expect(typeof mod.passwordStrengthTier).toBe('function');
    expect(typeof mod.strengthFeedback).toBe('function');
  });
});
