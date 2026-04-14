import { useSetup } from '../hooks/useSetup.js';
import SettingsTab from '../components/setup/SettingsTab.jsx';

export default function SettingsPage() {
  const setup = useSetup();
  return (
    <div className="max-w-4xl mx-auto py-6 px-4">
      <SettingsTab setup={setup} />
    </div>
  );
}
