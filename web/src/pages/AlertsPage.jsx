import Alerts from '../components/Alerts.jsx';
import PageContainer from '../components/PageContainer.jsx';

export default function AlertsPage() {
  return (
    <PageContainer className="space-y-4">
      <div className="mb-6">
        <h1 className="text-hc-page-title font-semibold text-hc-fg-strong">Alerts</h1>
        <p className="mt-1 text-hc-body text-hc-muted">Manage webhook alert rules</p>
      </div>
      <Alerts />
    </PageContainer>
  );
}
