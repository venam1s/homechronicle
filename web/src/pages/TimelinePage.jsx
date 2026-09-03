import Timeline from '../components/Timeline.jsx';

export default function TimelinePage({ initialFilters, onSelectAccessory }) {
  return (
    <div className="flex flex-col h-full pt-2 sm:pt-4">
      <Timeline initialFilters={initialFilters} onSelectAccessory={onSelectAccessory} />
    </div>
  );
}
