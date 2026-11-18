import SettingsGroup from './SettingsGroup.jsx';
import SettingsRow from './SettingsRow.jsx';
import NumberField from './NumberField.jsx';
import { FOCUS_RING } from './fieldStyles.js';
import { useSettingSaver } from '../../hooks/useSettingSaver.js';

// Shown in place of a number field until its config loads: never an invented value.
const LOADING = <span className="text-xs text-hc-muted">Loading…</span>;

// onNavigate, when given, adds a link to the Alerts page, where rules are managed.
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
      {onNavigate && (
        <div className="px-4 py-3">
          <button
            type="button"
            onClick={() => onNavigate('alerts')}
            className={`text-xs text-hc-accent-strong hover:underline ${FOCUS_RING}`}
          >
            Manage rules on the Alerts page
          </button>
        </div>
      )}
    </SettingsGroup>
  );
}
