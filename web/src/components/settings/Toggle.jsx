import clsx from 'clsx';
import { FOCUS_RING } from './fieldStyles.js';

export default function Toggle({ checked, onChange, ariaLabel, disabled }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={clsx(
        'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors',
        FOCUS_RING,
        checked
          ? 'bg-hc-accent-strong border-transparent'
          : 'bg-hc-panel-mid border-hc-border-strong',
        disabled && 'opacity-50 cursor-not-allowed',
      )}
    >
      <span
        aria-hidden="true"
        data-testid="toggle-knob"
        className={clsx(
          'inline-block h-4 w-4 rounded-full shadow-sm transition-transform',
          checked ? 'translate-x-6 bg-hc-on-accent' : 'translate-x-1 bg-hc-muted',
        )}
      />
    </button>
  );
}
