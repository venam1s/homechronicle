import clsx from 'clsx';

// Single source of truth for page-level horizontal width and padding.
// All top-level pages (Dashboard, Devices, Timeline, Alerts, Settings)
// should sit inside this so widths feel consistent across tabs.
//
// `narrow` gives list/detail pages a medium centered column (max-w-4xl) so the
// content doesn't float in a wide expanse; the default (max-w-6xl) stays for
// width-hungry layouts like the Dashboard's 12-column grid.
export default function PageContainer({ children, className, narrow = false }) {
  return (
    <div
      className={clsx(
        narrow ? 'max-w-4xl' : 'max-w-6xl',
        'mx-auto py-4 sm:py-6 px-3 sm:px-4',
        className,
      )}
    >
      {children}
    </div>
  );
}
