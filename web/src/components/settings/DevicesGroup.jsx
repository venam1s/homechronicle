import { formatDistanceToNow } from 'date-fns';
import SettingsGroup from './SettingsGroup.jsx';
import SettingsRow from './SettingsRow.jsx';
import Toggle from './Toggle.jsx';
import { SELECT_CLASS } from './fieldStyles.js';
import { HOURS_OPTIONS } from './hourOptions.js';
import { localHourToUtc, utcHourToLocal } from '../../lib/hours.js';
import { useSettingSaver } from '../../hooks/useSettingSaver.js';
import { useSetting } from '../../hooks/useSetting.js';

// The saver has already reported a failure with a toast; useSetting has reverted the value.
const ignore = () => {};

function lastRunLine(repairConfig) {
  return (
    <>
      {repairConfig?.lastRunAt ? (
        <span>Last run: {formatDistanceToNow(new Date(repairConfig.lastRunAt), { addSuffix: true })}</span>
      ) : (
        <span>No runs yet</span>
      )}
      {repairConfig?.lastRunResult && (
        <span className="ml-2">
          &middot; {repairConfig.lastRunResult.repaired} repaired, {repairConfig.lastRunResult.failed} failed
        </span>
      )}
    </>
  );
}

// onNavigate is accepted now and used once the Devices link lands.
export default function DevicesGroup({ setup, onNavigate }) {
  const { retentionConfig, saveRetentionMutation, repairConfig, saveRepairMutation } = setup;
  const toastsEnabled = retentionConfig?.toastsEnabled ?? true;
  const saveRetention = useSettingSaver(saveRetentionMutation, { toastsEnabled });
  const saveRepair = useSettingSaver(saveRepairMutation, { toastsEnabled });

  // Until a config loads its switches are off and inert: never an invented value.
  const retentionLoaded = retentionConfig != null;
  const repairLoaded = repairConfig != null;
  const [autoScan, changeAutoScan] = useSetting(
    retentionLoaded && Boolean(retentionConfig.autoScanHomeKit ?? true),
    (v) => saveRetention({ autoScanHomeKit: v }),
  );
  const [repairEnabled, changeRepairEnabled] = useSetting(
    repairLoaded && Boolean(repairConfig.enabled ?? false),
    (v) => saveRepair({ enabled: v }),
  );
  const [repairHour, changeRepairHour] = useSetting(
    repairConfig?.hour != null ? utcHourToLocal(repairConfig.hour) : 3,
    (v) => saveRepair({ hour: localHourToUtc(v) }),
  );

  return (
    <SettingsGroup title="Devices">
      <SettingsRow
        label="HomeKit auto-scan"
        description="Scan for HomeKit accessories every hour in the background. Manual scans from Add Accessories still work when this is off."
        control={(
          <Toggle
            checked={autoScan}
            ariaLabel="HomeKit auto-scan"
            disabled={!retentionLoaded}
            onChange={(v) => changeAutoScan(v).catch(ignore)}
          />
        )}
      />
      <SettingsRow
        label="Scheduled Repair"
        description="Automatically re-pairs HomeKit devices that lose their connection overnight. Enable this if you notice devices going offline and not reconnecting on their own."
        control={(
          <Toggle
            checked={repairEnabled}
            ariaLabel="Scheduled Repair"
            disabled={!repairLoaded}
            onChange={(v) => changeRepairEnabled(v).catch(ignore)}
          />
        )}
        footnote={repairEnabled ? lastRunLine(repairConfig) : null}
      >
        {repairEnabled && (
          // A dependent line, not a full SettingsRow: no second set of row padding.
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <span className="text-sm text-hc-fg">Repair hour</span>
            <select
              aria-label="Repair hour"
              value={repairHour}
              onChange={(e) => changeRepairHour(Number(e.target.value)).catch(ignore)}
              className={SELECT_CLASS}
            >
              {HOURS_OPTIONS.map(({ value, label }) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </div>
        )}
      </SettingsRow>
    </SettingsGroup>
  );
}
