import clsx from 'clsx';

/**
 * Card — the app's standard raised surface.
 *
 * v0.4: a hairline border replaces the drop shadow. The Almanac look is built
 * from ruled edges rather than floating cards, and a shadow tuned for a light
 * theme reads as grey haze on the darker palettes.
 */
export default function Card({ children, className }) {
  return (
    <div className={clsx('bg-hc-panel rounded-xl border border-hc-panel-border overflow-hidden', className)}>
      {children}
    </div>
  );
}

Card.Header = function CardHeader({ title, actions, headingLevel }) {
  const Heading = headingLevel ? `h${headingLevel}` : 'span';
  return (
    <div className="flex items-center justify-between px-4 py-3 border-b border-hc-panel-border">
      <Heading className="text-hc-section font-semibold text-hc-fg-strong">{title}</Heading>
      {actions && <div>{actions}</div>}
    </div>
  );
};

Card.Body = function CardBody({ children, compact }) {
  return (
    <div className={clsx(compact ? 'p-3 sm:p-4' : 'p-4 sm:p-5')}>
      {children}
    </div>
  );
};
