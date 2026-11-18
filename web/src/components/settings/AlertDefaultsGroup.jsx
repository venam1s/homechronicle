import SettingsGroup from './SettingsGroup.jsx';
import SettingsRow from './SettingsRow.jsx';
import NumberField from './NumberField.jsx';
import { useSettingSaver } from '../../hooks/useSettingSaver.js';

// Shown in place of a number field until its config loads: never an invented value.
const LOADING = <span className="text-xs text-hc-muted">Loading…</span>;

// onNavigate is accepted now and used once the Alerts link lands.
export default function AlertDefaultsGroup({ setup, onNavigate }) {
  const { retentionConfig, alertsConfig, saveAlertsMutation } = setup;
  const saveAlerts = useSettingSaver(saveAlertsMutation, {
    toastsEnabled: retentionConfig?.toastsEnabled ?? true,
  });
  const loaded = alertsConfig != null;
  const timeoutFromEnv = Boolean(alertsConfig?.webhookTimeoutFromEnv);

  return (
    <SettingsGroup title="Alerts">
      <SettingsRow
        label="Default quiet period"
        description="Applied to new rules. 0 = no quiet period."
        control={loaded ? (
          <NumberField
            value={alertsConfig.defaultQuietMinutes ?? 0}
            min={0}
            max={10080}
            unit="min"
            ariaLabel="Default quiet period"
            onApply={(n) => saveAlerts({ defaultQuietMinutes: n })}
          />
        ) : LOADING}
      />
      <SettingsRow
        label="Webhook timeout"
        description={timeoutFromEnv
          ? 'Set by ALERTS_WEBHOOK_TIMEOUT_MS in .env.'
          : 'Max wait time for webhook delivery.'}
        control={loaded ? (
          <NumberField
            value={alertsConfig.webhookTimeoutMs ?? 5000}
            min={1000}
            max={30000}
            step={500}
            unit="ms"
            ariaLabel="Webhook timeout"
            disabled={timeoutFromEnv}
            onApply={(n) => saveAlerts({ webhookTimeoutMs: n })}
          />
        ) : LOADING}
      />
    </SettingsGroup>
  );
}
