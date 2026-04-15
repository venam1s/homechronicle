import clsx from 'clsx';

export default function Card({ children, className }) {
  return (
    <div className={clsx('bg-hc-panel rounded-xl shadow-sm overflow-hidden', className)}>
      {children}
    </div>
  );
}

Card.Header = function CardHeader({ title, actions }) {
  return (
    <div className="flex items-center justify-between px-4 py-3 border-b border-hc-panel-border">
      <span className="text-hc-section font-semibold text-hc-fg-strong">{title}</span>
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
