import SettingsGroup from './SettingsGroup.jsx';
import SettingsRow from './SettingsRow.jsx';
import NumberField from './NumberField.jsx';
import { useAuth } from '../../hooks/useAuth.js';
import { usePreference } from '../../hooks/usePreference.js';
import { useSettingSaver } from '../../hooks/useSettingSaver.js';
import { useToastsEnabled } from '../../hooks/useToastsEnabled.js';

// Shown in place of a number field until its config loads: never an invented value.
const LOADING = <span className="text-xs text-hc-muted">Loading…</span>;

const FIELDS = [
  {
    key: 'episodeWindowMinutes',
    label: 'Episode capture interval',
    description: 'Events within this window are grouped into timeline episodes.',
    max: 30,
    unit: 'min',
    fallback: 3,
  },
  {
    key: 'sceneWindowSeconds',
    label: 'Scene grouping window',
    description: 'Events within this many seconds are clustered into a single scene.',
    max: 30,
    unit: 'sec',
    fallback: 5,
  },
  {
    key: 'episodeMinEventCount',
    label: 'Episode minimum events',
    description: 'A scene cluster needs at least this many events to be promoted to an episode.',
    max: 20,
    unit: 'events',
    fallback: 3,
  },
];

// Signed in, the grouping fields are per-user preferences (PREF-10); signed out, household config.
export default function TimelineGroup({ setup }) {
  const { retentionConfig, saveRetentionMutation } = setup;
  const { user } = useAuth();
  const toastsEnabled = useToastsEnabled(setup);
  const saveRetention = useSettingSaver(saveRetentionMutation, { toastsEnabled });

  const [blobEpisodeWindowMinutes, setBlobEpisodeWindowMinutes] = usePreference('episodeWindowMinutes', 3, { localStorageKey: 'hc_pref_episodeWindowMinutes' });
  const [blobSceneWindowSeconds, setBlobSceneWindowSeconds] = usePreference('sceneWindowSeconds', 5, { localStorageKey: 'hc_pref_sceneWindowSeconds' });
  const [blobEpisodeMinEventCount, setBlobEpisodeMinEventCount] = usePreference('episodeMinEventCount', 3, { localStorageKey: 'hc_pref_episodeMinEventCount' });
  const blob = {
    episodeWindowMinutes: [blobEpisodeWindowMinutes, setBlobEpisodeWindowMinutes],
    sceneWindowSeconds: [blobSceneWindowSeconds, setBlobSceneWindowSeconds],
    episodeMinEventCount: [blobEpisodeMinEventCount, setBlobEpisodeMinEventCount],
  };

  const loaded = Boolean(user) || retentionConfig != null;

  return (
    <SettingsGroup title="Timeline">
      {FIELDS.map(({ key, label, description, max, unit, fallback }) => {
        const [blobValue, setBlobValue] = blob[key];
        const value = user ? blobValue : (retentionConfig?.[key] ?? fallback);
        // Signed out, return the save's promise: NumberField keeps the draft if it fails.
        const onApply = user
          ? (n) => { setBlobValue(n); }
          : (n) => saveRetention({ [key]: n });
        return (
          <SettingsRow
            key={key}
            label={label}
            description={description}
            control={loaded ? (
              <NumberField
                value={value}
                min={1}
                max={max}
                unit={unit}
                ariaLabel={label}
                onApply={onApply}
              />
            ) : LOADING}
          />
        );
      })}
    </SettingsGroup>
  );
}
