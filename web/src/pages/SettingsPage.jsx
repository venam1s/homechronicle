import { useSetup } from '../hooks/useSetup.js';
import SettingsTab from '../components/setup/SettingsTab.jsx';
import PageContainer from '../components/PageContainer.jsx';

export default function SettingsPage() {
  const setup = useSetup();
  return (
    <PageContainer>
      <div className="mb-6">
        <h1 className="text-hc-page-title font-semibold text-hc-fg-strong">Settings</h1>
      </div>
      <SettingsTab setup={setup} />
    </PageContainer>
  );
}
