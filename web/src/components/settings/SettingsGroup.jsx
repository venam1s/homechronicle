import Card from '../Card.jsx';

export default function SettingsGroup({ title, children }) {
  return (
    <Card>
      <Card.Header title={title} headingLevel={2} />
      <div className="divide-y divide-hc-panel-border">{children}</div>
    </Card>
  );
}
