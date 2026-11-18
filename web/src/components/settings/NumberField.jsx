import { useEffect, useRef, useState } from 'react';
import { FOCUS_RING, INPUT_CLASS } from './fieldStyles.js';

const BUTTON_BASE = `text-sm font-medium rounded-lg px-3 py-1.5 disabled:opacity-40 disabled:cursor-not-allowed ${FOCUS_RING}`;
const APPLY_CLASS = `${BUTTON_BASE} bg-hc-accent-strong hover:bg-hc-accent-stronger text-hc-on-accent`;
const CANCEL_CLASS = `${BUTTON_BASE} text-hc-muted hover:text-hc-fg-strong`;

function parseDraft(draft, min, max) {
  const text = draft.trim();
  if (!/^\d+$/.test(text)) return null;
  const n = Number(text);
  return n >= min && n <= max ? n : null;
}

// One typed number with an inline Apply / Cancel. Never saves without Apply or Enter.
export default function NumberField({
  value, min, max, step = 1, unit, ariaLabel, onApply, warning, disabled = false,
}) {
  const [draft, setDraft] = useState(String(value));
  const [prevValue, setPrevValue] = useState(value);
  const [pending, setPending] = useState(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  const parsed = parseDraft(draft, min, max);
  const valid = parsed !== null;
  const dirty = !valid || parsed !== value;

  // Follow a new saved value only while the field is clean.
  if (value !== prevValue) {
    setPrevValue(value);
    if (parseDraft(draft, min, max) === prevValue) setDraft(String(value));
  }

  const reset = () => setDraft(String(value));

  const apply = async () => {
    if (!dirty || !valid || pending || disabled) return;
    setPending(true);
    try {
      await onApply(parsed);
    } catch {
      // Keep the draft so the user can retry; the caller reports the failure.
    } finally {
      if (mounted.current) setPending(false);
    }
  };

  const onKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      apply();
    } else if (e.key === 'Escape') {
      reset();
    }
  };

  const warningText = dirty && valid && warning ? warning(parsed) : null;
  const busy = pending || disabled;

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex flex-wrap items-center justify-end gap-2">
        <input
          type="number"
          inputMode="numeric"
          className={INPUT_CLASS}
          value={draft}
          min={min}
          max={max}
          step={step}
          aria-label={ariaLabel}
          disabled={busy}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
        />
        {/* Fixed width (fits "events") so inputs in one group line up whatever their unit. */}
        {unit && <span className="w-11 text-left text-xs text-hc-muted">{unit}</span>}
        {dirty && (
          <>
            <button type="button" className={APPLY_CLASS} disabled={!valid || busy} onClick={apply}>
              Apply
            </button>
            <button type="button" className={CANCEL_CLASS} disabled={busy} onClick={reset}>
              Cancel
            </button>
          </>
        )}
      </div>
      {dirty && !valid && (
        <p role="alert" className="text-xs text-hc-danger-text">
          Enter a whole number from {min} to {max}.
        </p>
      )}
      {warningText && <p className="text-xs text-hc-warning-text">{warningText}</p>}
    </div>
  );
}
