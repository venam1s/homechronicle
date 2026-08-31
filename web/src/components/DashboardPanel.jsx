import { forwardRef } from 'react';
import { GripVertical, X } from 'lucide-react';
import clsx from 'clsx';

/**
 * Chrome wrapper for a single dashboard grid item.
 *
 * react-grid-layout (v2) clones each grid child and injects `className`,
 * `style`, drag/resize event handlers, and an appended resize-handle element
 * (delivered via `children`). On React 19 it also requires the child to forward
 * a ref to its root DOM node (the library uses that ref instead of the removed
 * ReactDOM.findDOMNode). This component satisfies all of that:
 *
 *   - `ref` is forwarded to the root <div>
 *   - RGL's `className`/`style`/handlers are spread onto the root via `...rest`
 *   - RGL's injected `children` (the resize handle) is rendered last
 *   - our own content is passed separately as `body` so it never collides with
 *     the library-injected `children`
 *
 * The panel only exposes a drag handle and remove button while `editing`.
 */
const DashboardPanel = forwardRef(function DashboardPanel(
  { title, body, editing, onRemove, bare = false, className, style, children, ...rest },
  ref,
) {
  return (
    <div
      ref={ref}
      style={style}
      className={clsx(
        'flex flex-col overflow-hidden rounded-xl',
        // `bare` panels host components that draw their own card(s) (KPI tiles,
        // the live feed), so the wrapper stays transparent to avoid card-in-card.
        // v0.4: hairline border rather than a drop shadow, matching Card.
        !bare && 'bg-hc-panel border border-hc-panel-border',
        // In edit mode every panel gets a visible outline — including `bare`
        // ones, which are otherwise invisible as drop targets.
        editing && 'ring-2 ring-hc-accent-strong/50',
        editing && bare && 'bg-hc-panel/40',
        className,
      )}
      {...rest}
    >
      {/* Header (drag handle + remove) only exists in edit mode. In view mode
          each panel's own component supplies its title, so we avoid a double
          header and the dashboard looks unchanged. */}
      {editing && (
        <div className="hc-drag-handle flex items-center justify-between gap-2 px-3 py-2 border-b border-hc-panel-border shrink-0 cursor-move select-none bg-hc-panel-soft">
          <div className="flex items-center gap-1.5 min-w-0">
            <GripVertical size={14} className="text-hc-muted shrink-0" aria-hidden="true" />
            <span className="text-xs font-semibold uppercase tracking-wide text-hc-muted truncate">
              {title}
            </span>
          </div>
          <button
            type="button"
            onClick={onRemove}
            // hc-no-drag keeps the drag layer from swallowing the click
            className="hc-no-drag flex items-center justify-center w-6 h-6 -mr-1 rounded text-hc-muted hover:text-hc-danger-text hover:bg-hc-panel-mid transition-colors"
            aria-label={`Remove ${title} panel`}
          >
            <X size={14} />
          </button>
        </div>
      )}

      <div className={clsx('flex-1 min-h-0 overflow-auto', bare ? 'p-0' : 'p-4 sm:p-5')}>{body}</div>

      {/* react-grid-layout injects its resize handle here */}
      {children}
    </div>
  );
});

export default DashboardPanel;
