import clsx from 'clsx';

export default function SettingsRow({ label, description, control, children, footnote, disabled }) {
  return (
    <div
      data-testid="settings-row"
      className={clsx('px-4 py-3', disabled && 'opacity-50 pointer-events-none')}
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <div className="min-w-0 sm:flex-1">
          <div className="text-sm font-medium text-hc-fg">{label}</div>
          {description && (
            <p className="text-xs text-hc-muted mt-0.5 max-w-prose">{description}</p>
          )}
        </div>
        <div className="shrink-0">{control}</div>
      </div>
      {children && (
        <div data-testid="settings-row-dependents" className="mt-3 pl-4 space-y-3">
          {children}
        </div>
      )}
      {footnote && <p className="text-xs text-hc-muted mt-2">{footnote}</p>}
    </div>
  );
}
