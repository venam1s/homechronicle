import clsx from 'clsx';

// Single source of truth for page-level horizontal width and padding.
// All top-level pages (Dashboard, Devices, Timeline, Alerts, Settings)
// should sit inside this so widths feel consistent across tabs.
export default function PageContainer({ children, className }) {
  return (
    <div className={clsx('max-w-6xl mx-auto py-4 sm:py-6 px-3 sm:px-4', className)}>
      {children}
    </div>
  );
}
