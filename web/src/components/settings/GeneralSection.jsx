import DevicesGroup from './DevicesGroup.jsx';
import DataGroup from './DataGroup.jsx';
import AlertDefaultsGroup from './AlertDefaultsGroup.jsx';

// Household settings: Devices, Data, Alerts.
export default function GeneralSection({ setup, onNavigate }) {
  return (
    <>
      <DevicesGroup setup={setup} onNavigate={onNavigate} />
      <DataGroup setup={setup} />
      <AlertDefaultsGroup setup={setup} onNavigate={onNavigate} />
    </>
  );
}
