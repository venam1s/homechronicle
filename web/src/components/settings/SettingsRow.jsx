import clsx from 'clsx';

export default function SettingsRow({ label, description, control, children, footnote, disabled }) {
  return (
    <div
      data-testid="settings-row"
      className={clsx('px-4 py-3', disabled && 'opacity-50 pointer-events-none')}
    >
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <div className="text-sm font-medium text-hc-fg">{label}</div>
          {description && (
            <p className="text-xs text-hc-muted mt-0.5 max-w-prose">{description}</p>
          )}
        </div>
        {control}
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
