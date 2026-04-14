import Timeline from '../components/Timeline.jsx';

export default function TimelinePage({ initialFilters, onSelectAccessory }) {
  return <Timeline initialFilters={initialFilters} onSelectAccessory={onSelectAccessory} />;
}
