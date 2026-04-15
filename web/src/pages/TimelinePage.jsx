import Timeline from '../components/Timeline.jsx';

export default function TimelinePage({ initialFilters, onSelectAccessory }) {
  return (
    <div className="flex flex-col h-full">
      <div className="mb-6 px-3 sm:px-4 pt-4 sm:pt-6">
        <h1 className="text-hc-page-title font-semibold text-hc-fg-strong">Timeline</h1>
        <p className="mt-1 text-hc-body text-hc-muted">Filter and browse device events</p>
      </div>
      <Timeline initialFilters={initialFilters} onSelectAccessory={onSelectAccessory} />
    </div>
  );
}
