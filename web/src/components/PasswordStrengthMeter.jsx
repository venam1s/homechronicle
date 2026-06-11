import { passwordStrengthTier, strengthFeedback } from '../lib/strength.js';

// Color tokens for each strength tier (inline CSS vars — theme-reactive, NOT Tailwind bg- classes)
const TIER_COLORS = {
  weak: 'var(--hc-danger-text)',
  fair: 'var(--hc-warning-text)',
  strong: 'var(--hc-success-text)',
};

// Number of filled segments per tier
const TIER_FILL_COUNT = {
  weak: 1,
  fair: 2,
  strong: 3,
};

/**
 * 3-segment password strength meter driven by passwordStrengthTier().
 * Uses inline CSS-var fills (not Tailwind bg- classes) so segments are theme-reactive.
 *
 * @param {{ password: string }} props
 */
export default function PasswordStrengthMeter({ password }) {
  const tier = passwordStrengthTier(password);
  const fillCount = TIER_FILL_COUNT[tier];
  const fillColor = TIER_COLORS[tier];
  const unfilled = 'var(--hc-panel-border)';

  return (
    <div className="space-y-1">
      <div className="flex gap-1 h-1">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            data-testid="strength-segment"
            className="flex-1 rounded-full"
            style={{ backgroundColor: i < fillCount ? fillColor : unfilled }}
          />
        ))}
      </div>
      <p className="text-hc-caption text-hc-muted">{strengthFeedback(password)}</p>
    </div>
  );
}
