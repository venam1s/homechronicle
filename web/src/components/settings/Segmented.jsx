import clsx from 'clsx';
import { FOCUS_RING } from './fieldStyles.js';

export default function Segmented({ options, value, onChange, ariaLabel }) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className="inline-flex gap-1 p-1 rounded-lg bg-hc-panel-mid"
    >
      {options.map(({ id, label, icon: Icon }) => {
        const selected = value === id;
        return (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(id)}
            className={clsx(
              'flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-semibold transition-colors',
              FOCUS_RING,
              selected
                ? 'bg-hc-panel text-hc-fg-strong border border-hc-panel-border'
                : 'text-hc-muted hover:text-hc-fg',
            )}
          >
            {Icon && <Icon size={14} aria-hidden="true" />}
            {label}
          </button>
        );
      })}
    </div>
  );
}
