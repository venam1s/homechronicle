import { Bell } from 'lucide-react';
import SettingsGroup from './SettingsGroup.jsx';
import SettingsRow from './SettingsRow.jsx';
import Toggle from './Toggle.jsx';
import { LINK_CLASS, SELECT_CLASS } from './fieldStyles.js';
import { useToast } from '../Toast.jsx';
import { useAuth } from '../../hooks/useAuth.js';
import { useToastPrefs } from '../../hooks/useToastPrefs.js';
import { useCanManageHome } from '../../hooks/useCanManageHome.js';

const POSITION_OPTIONS = [
  { value: 'bottom-right', label: 'Bottom Right' },
  { value: 'bottom-left', label: 'Bottom Left' },
  { value: 'bottom-center', label: 'Bottom Center' },
  { value: 'top-right', label: 'Top Right' },
  { value: 'top-left', label: 'Top Left' },
  { value: 'top-center', label: 'Top Center' },
];

const DURATION_OPTIONS = [
  { value: 2, label: '2 seconds' },
  { value: 3, label: '3 seconds' },
  { value: 5, label: '5 seconds' },
  { value: 7, label: '7 seconds' },
];

const MAX_VISIBLE_OPTIONS = [1, 2, 3, 5].map((n) => ({ value: n, label: String(n) }));

// The saver has already reported a failure with a toast; the hook has reverted the value.
const ignore = () => {};

// A select that shows no value (an empty option) until its config loads.
function PrefSelect({ ariaLabel, value, options, loaded, disabled, onChange }) {
  return (
    <select
      aria-label={ariaLabel}
      value={loaded ? value : ''}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      className={SELECT_CLASS}
    >
      {!loaded && <option value="" />}
      {options.map(({ value: v, label }) => (
        <option key={v} value={v}>{label}</option>
      ))}
    </select>
  );
}

// Where to choose watched accessories. Only an admin (or the sole operator)
// may choose them; given onNavigate, the hint links to Manage Accessories.
function WatchListHint({ canManageHome, onNavigate }) {
  if (!canManageHome) {
    return <p className="text-xs text-hc-warning-text">An admin chooses which accessories are watched.</p>;
  }
  if (!onNavigate) {
    return <p className="text-xs text-hc-warning-text">Select accessories to watch in Manage Accessories.</p>;
  }
  return (
    <button
      type="button"
      onClick={() => onNavigate('devices', { tab: 'devices' })}
      className={LINK_CLASS}
    >
      Select accessories to watch in Manage Accessories
    </button>
  );
}

export default function NotificationsGroup({ setup, onNavigate }) {
  const { retentionConfig } = setup;
  const { user } = useAuth();
  const canManageHome = useCanManageHome();
  const { addToast, configure: configureToasts } = useToast();
  const prefs = useToastPrefs(setup);

  // Signed in, the preference values are the real ones; signed out they wait for the config.
  const loaded = Boolean(user) || retentionConfig != null;
  const toastsOn = loaded && prefs.toastsEnabled;
  const liveOn = loaded && prefs.liveEventToastsEnabled;
  const dependentsDisabled = !toastsOn;

  const update = (key, value) => {
    prefs.set(key, value)?.catch(ignore);
  };

  // Preview the current toast settings. Push them into the provider first:
  // the signed-out path only reconfigures after the debounced save round-trips.
  const showTestToast = () => {
    configureToasts({
      position: prefs.position,
      duration: prefs.duration,
      maxVisible: prefs.maxVisible,
    });
    addToast('Test notification — toasts will appear here', 'info', { duration: prefs.duration * 1000 });
  };

  return (
    <SettingsGroup title="Notifications">
      <SettingsRow
        label="Toast notifications"
        description="Show brief popup messages for saves, deletes, and other actions."
        control={(
          <Toggle
            checked={toastsOn}
            ariaLabel="Toast notifications"
            disabled={!loaded}
            onChange={(v) => update('toastsEnabled', v)}
          />
        )}
      />
      <SettingsRow
        label="Live event toasts"
        description="Show a popup when selected accessories report events. Only appears when you're not on the Timeline tab."
        disabled={dependentsDisabled}
        control={(
          <Toggle
            checked={liveOn}
            ariaLabel="Live event toasts"
            disabled={dependentsDisabled}
            onChange={(v) => update('liveEventToastsEnabled', v)}
          />
        )}
      >
        {liveOn && !(retentionConfig?.toastAccessories?.length > 0) && (
          <WatchListHint canManageHome={canManageHome} onNavigate={onNavigate} />
        )}
      </SettingsRow>
      <SettingsRow
        label="Toast position"
        description="Where on screen to show toast popups."
        disabled={dependentsDisabled}
        control={(
          <PrefSelect
            ariaLabel="Toast position"
            value={prefs.position}
            options={POSITION_OPTIONS}
            loaded={loaded}
            disabled={dependentsDisabled}
            onChange={(v) => update('toastPosition', v)}
          />
        )}
        footnote={(
          <button
            type="button"
            onClick={showTestToast}
            disabled={dependentsDisabled}
            className="inline-flex items-center gap-1.5 text-xs text-hc-accent-strong hover:text-hc-accent-stronger disabled:opacity-50 transition-colors"
          >
            <Bell size={12} />
            Show test toast
          </button>
        )}
      />
      <SettingsRow
        label="Toast duration"
        description="How long each toast stays visible before auto-dismissing."
        disabled={dependentsDisabled}
        control={(
          <PrefSelect
            ariaLabel="Toast duration"
            value={prefs.duration}
            options={DURATION_OPTIONS}
            loaded={loaded}
            disabled={dependentsDisabled}
            onChange={(v) => update('toastDuration', Number(v))}
          />
        )}
      />
      <SettingsRow
        label="Max visible toasts"
        description="Maximum number of toasts that can stack on screen at once."
        disabled={dependentsDisabled}
        control={(
          <PrefSelect
            ariaLabel="Max visible toasts"
            value={prefs.maxVisible}
            options={MAX_VISIBLE_OPTIONS}
            loaded={loaded}
            disabled={dependentsDisabled}
            onChange={(v) => update('toastMaxVisible', Number(v))}
          />
        )}
      />
    </SettingsGroup>
  );
}
