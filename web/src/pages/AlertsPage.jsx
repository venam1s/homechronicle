import Alerts from '../components/Alerts.jsx';

export default function AlertsPage() {
  return (
    <div className="max-w-4xl mx-auto py-6 px-4 space-y-4">
      <div className="mb-6">
        <h1 className="text-hc-page-title font-semibold text-hc-fg-strong">Alerts</h1>
        <p className="mt-1 text-hc-body text-hc-muted">Manage webhook alert rules</p>
      </div>
      <Alerts />
    </div>
  );
}
