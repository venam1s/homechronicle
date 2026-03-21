import clsx from 'clsx';

export function SkeletonBlock({ className }) {
  return <div className={clsx('skeleton rounded', className)} />;
}

export function SkeletonCard({ className, lines = 3 }) {
  return (
    <div className={clsx('bg-[var(--hc-panel)] rounded-xl p-4 space-y-3 border border-[var(--hc-panel-border)]', className)}>
      <SkeletonBlock className="h-4 w-1/3" />
      {Array.from({ length: lines }, (_, i) => (
        <SkeletonBlock key={i} className={clsx('h-3', i === lines - 1 ? 'w-2/3' : 'w-full')} />
      ))}
    </div>
  );
}

export function SkeletonChart({ className }) {
  return (
    <div className={clsx('bg-[var(--hc-panel)] rounded-xl p-4 border border-[var(--hc-panel-border)]', className)}>
      <SkeletonBlock className="h-4 w-24 mb-4" />
      <div className="flex items-end gap-1.5 h-32">
        {Array.from({ length: 12 }, (_, i) => (
          <SkeletonBlock
            key={i}
            className="flex-1 rounded-t"
            style={{ height: `${20 + Math.sin(i * 0.8) * 30 + 30}%` }}
          />
        ))}
      </div>
    </div>
  );
}

export function SkeletonRow({ className }) {
  return (
    <div className={clsx('flex items-center gap-3 px-4 py-3', className)}>
      <SkeletonBlock className="h-5 w-5 rounded-full flex-shrink-0" />
      <div className="flex-1 space-y-1.5">
        <SkeletonBlock className="h-3.5 w-2/5" />
        <SkeletonBlock className="h-2.5 w-1/4" />
      </div>
      <SkeletonBlock className="h-6 w-16 rounded-full" />
    </div>
  );
}

export function SkeletonList({ rows = 5, className }) {
  return (
    <div className={clsx('bg-[var(--hc-panel)] rounded-xl border border-[var(--hc-panel-border)] divide-y divide-[var(--hc-panel-border)]', className)}>
      {Array.from({ length: rows }, (_, i) => (
        <SkeletonRow key={i} />
      ))}
    </div>
  );
}

export function DashboardSkeleton() {
  return (
    <div className="space-y-4 animate-tab-enter">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {Array.from({ length: 4 }, (_, i) => (
          <SkeletonCard key={i} lines={1} />
        ))}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <SkeletonChart />
        <SkeletonChart />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <SkeletonList rows={4} />
        <SkeletonList rows={4} />
      </div>
    </div>
  );
}

export function TimelineSkeleton() {
  return (
    <div className="space-y-3 animate-tab-enter">
      <SkeletonBlock className="h-10 w-full rounded-lg" />
      <div className="bg-[var(--hc-panel)] rounded-xl border border-[var(--hc-panel-border)] divide-y divide-[var(--hc-panel-border)]">
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className="flex items-center gap-3 px-4 py-3">
            <SkeletonBlock className="h-4 w-4 rounded flex-shrink-0" />
            <div className="flex-1 space-y-1.5">
              <SkeletonBlock className="h-3.5 w-3/5" />
              <SkeletonBlock className="h-2.5 w-2/5" />
            </div>
            <SkeletonBlock className="h-3 w-12" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function AccessoriesSkeleton() {
  return (
    <div className="space-y-4 animate-tab-enter">
      <SkeletonBlock className="h-4 w-28" />
      <SkeletonList rows={6} />
    </div>
  );
}
