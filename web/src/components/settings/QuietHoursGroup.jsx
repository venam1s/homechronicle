import { X } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import SettingsGroup from './SettingsGroup.jsx';
import SettingsRow from './SettingsRow.jsx';
import Toggle from './Toggle.jsx';
import { SELECT_CLASS } from './fieldStyles.js';
import { HOURS_OPTIONS } from './hourOptions.js';
import { localHourToUtc, utcHourToLocal } from '../../lib/hours.js';
import { useAuth } from '../../hooks/useAuth.js';
import { usePreference } from '../../hooks/usePreference.js';
import { useUserPreferences } from '../../hooks/useUserPreferences.js';
import { useSettingSaver } from '../../hooks/useSettingSaver.js';
import { useSetting } from '../../hooks/useSetting.js';
import { useToastsEnabled } from '../../hooks/useToastsEnabled.js';

// The saver has already reported a failure with a toast; useSetting has reverted the value.
const ignore = () => {};

// A stable empty list, so useSetting's `saved` keeps its reference when the config has none.
const NO_EXCLUSIONS = [];

function HourLine({ label, ariaLabel, value, onChange }) {
  return (
    <div className="flex items-center justify-between gap-4 flex-wrap">
      <span className="text-sm text-hc-fg">{label}</span>
      <select
        aria-label={ariaLabel}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className={SELECT_CLASS}
      >
        {HOURS_OPTIONS.map(({ value: v, label: optionLabel }) => (
          <option key={v} value={v}>{optionLabel}</option>
        ))}
      </select>
    </div>
  );
}

export default function QuietHoursGroup({ setup }) {
  const { retentionConfig, saveRetentionMutation, paired = [], dbAccessories = [] } = setup;
  const { user } = useAuth();
  const { prefs, setPrefsBlob } = useUserPreferences();
  const queryClient = useQueryClient();
  const toastsEnabled = useToastsEnabled(setup);
  const saveRetention = useSettingSaver(saveRetentionMutation, { toastsEnabled });

  // QH-06/QH-07/QH-08: per-user quiet-hours blob fields.
  // Value read path — hooks reconcile from blob when present (D-18 type guard in usePreference).
  // Write path — every signed-in change calls setPrefsBlob with ALL FOUR keys to keep the
  // presence predicate coherent (QH-08). Do NOT add these to D12_KEYS (D-25-03: no force-seed).
  const [blobQhEnabled] = usePreference('quietHoursEnabled', false, { localStorageKey: 'hc_pref_quietHoursEnabled' });
  const [blobQhStart] = usePreference('quietHoursStart', 23, { localStorageKey: 'hc_pref_quietHoursStart' });
  const [blobQhEnd] = usePreference('quietHoursEnd', 6, { localStorageKey: 'hc_pref_quietHoursEnd' });
  const [blobQhExcluded] = usePreference('quietHoursExcludedAccessories', [], {
    localStorageKey: 'hc_pref_quietHoursExcludedAccessories',
    serialize: JSON.stringify,
    deserialize: JSON.parse,
  });

  // Presence check (D-25-03): reads branch on whether the blob already has the QH key, NOT on
  // user truthiness. A signed-in Phase-24 user with a non-empty blob but no quietHoursEnabled
  // key prefills from retentionConfig rather than the hook defaults (QH-07: no write on mount).
  const blobHasQh = !!user && prefs != null && 'quietHoursEnabled' in prefs;
  // Until the source the values come from has loaded, the switch is off and inert.
  const loaded = blobHasQh || retentionConfig != null;

  const savedEnabled = blobHasQh ? blobQhEnabled : Boolean(retentionConfig?.quietHoursEnabled ?? false);
  const savedStart = blobHasQh
    ? utcHourToLocal(blobQhStart)
    : (retentionConfig?.quietHoursStart != null ? utcHourToLocal(retentionConfig.quietHoursStart) : 22);
  const savedEnd = blobHasQh
    ? utcHourToLocal(blobQhEnd)
    : (retentionConfig?.quietHoursEnd != null ? utcHourToLocal(retentionConfig.quietHoursEnd) : 6);
  const savedExcluded = blobHasQh ? blobQhExcluded : (retentionConfig?.quietHoursExcludedAccessories ?? NO_EXCLUSIONS);

  // Writes branch on the user. Signed in: one grouped four-key write built from the values
  // on screen, so "turn on, then change Start" keeps enabled: true (QH-08).
  const writeBlob = (next) => {
    setPrefsBlob({
      quietHoursEnabled: next.enabled ?? enabled,
      quietHoursStart: localHourToUtc(next.start ?? start),
      quietHoursEnd: localHourToUtc(next.end ?? end),
      quietHoursExcludedAccessories: next.excluded ?? excluded,
    });
  };

  const [enabled, changeEnabled] = useSetting(loaded && savedEnabled, (v) => {
    if (user) return writeBlob({ enabled: v });
    return saveRetention({ quietHoursEnabled: v });
  });
  const [start, changeStart] = useSetting(savedStart, (v) => {
    if (user) return writeBlob({ start: v });
    return saveRetention({ quietHoursStart: localHourToUtc(v) });
  });
  const [end, changeEnd] = useSetting(savedEnd, (v) => {
    if (user) return writeBlob({ end: v });
    return saveRetention({ quietHoursEnd: localHourToUtc(v) });
  });

  // Optimistic, so each removal filters the list on screen: two quick removals inside the
  // saver's 300ms window merge into one patch that carries both.
  const [excluded, changeExcluded] = useSetting(savedExcluded, async (next) => {
    if (user) {
      writeBlob({ excluded: next });
    } else {
      // saveRetentionMutation's own onSuccess writes the result into ['setup', 'retention'].
      await saveRetention({ quietHoursExcludedAccessories: next });
    }
    queryClient.invalidateQueries({ queryKey: ['stats', 'quiet-hours'] });
  });

  const removeExcluded = (id) => {
    changeExcluded(excluded.filter((a) => a !== id)).catch(ignore);
  };

  return (
    <SettingsGroup title="Quiet hours">
      <SettingsRow
        label="Quiet hours"
        description="Flag accessory activity during this window as unexpected on the dashboard."
        control={(
          <Toggle
            checked={enabled}
            ariaLabel="Quiet hours"
            disabled={!loaded}
            onChange={(v) => changeEnabled(v).catch(ignore)}
          />
        )}
      >
        {enabled && (
          <>
            <HourLine
              label="Start"
              ariaLabel="Quiet hours start"
              value={start}
              onChange={(v) => changeStart(v).catch(ignore)}
            />
            <HourLine
              label="End"
              ariaLabel="Quiet hours end"
              value={end}
              onChange={(v) => changeEnd(v).catch(ignore)}
            />
            {excluded.length > 0 && (
              <div>
                <p className="text-xs text-hc-muted mb-2">Excluded from quiet hours:</p>
                <div className="flex flex-wrap gap-1.5">
                  {excluded.map((id) => {
                    const matchedAcc = paired.find((a) => a.id === id) ?? dbAccessories.find((a) => a.accessory_id === id);
                    const label = matchedAcc?.name ?? matchedAcc?.accessory_name ?? id;
                    return (
                      <span key={id} className="inline-flex items-center gap-1 text-xs bg-hc-panel-mid text-hc-muted-light rounded-full px-2.5 py-1">
                        <span className="truncate max-w-[180px]">{label}</span>
                        <button
                          type="button"
                          onClick={() => removeExcluded(id)}
                          disabled={saveRetentionMutation.isPending}
                          className="p-0.5 rounded-full hover:bg-hc-panel-mid transition-colors"
                          title={`Restore ${id} to quiet hours`}
                        >
                          <X size={10} />
                        </button>
                      </span>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        )}
      </SettingsRow>
    </SettingsGroup>
  );
}
