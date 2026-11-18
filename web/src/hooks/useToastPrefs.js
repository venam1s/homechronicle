import { useToast } from '../components/Toast.jsx';
import { useAuth } from './useAuth.js';
import { usePreference } from './usePreference.js';
import { useSettingSaver } from './useSettingSaver.js';
import { useSetting } from './useSetting.js';

/**
 * Where the viewer's toast preferences are read and written.
 *
 * Signed in: the per-user preferences blob (PREF-10), via usePreference; `set`
 * returns nothing and never toasts. Signed out: the household config, through
 * the household saver; `set` returns the save's promise, and the shown value
 * moves at once and returns if the save fails.
 */
export function useToastPrefs(setup) {
  const { retentionConfig, saveRetentionMutation } = setup;
  const { user } = useAuth();
  const { configure: configureToasts } = useToast();

  // Default codec (JSON) is correct for bool/number/string-enum values.
  // Unique localStorage keys (hc_pref_*) prevent cross-contamination between instances.
  const [blobToastsEnabled, setBlobToastsEnabled] = usePreference('toastsEnabled', true, { localStorageKey: 'hc_pref_toastsEnabled' });
  const [blobLiveEventToastsEnabled, setBlobLiveEventToastsEnabled] = usePreference('liveEventToastsEnabled', false, { localStorageKey: 'hc_pref_liveEventToastsEnabled' });
  const [blobToastPosition, setBlobToastPosition] = usePreference('toastPosition', 'bottom-right', { localStorageKey: 'hc_pref_toastPosition' });
  const [blobToastDuration, setBlobToastDuration] = usePreference('toastDuration', 3, { localStorageKey: 'hc_pref_toastDuration' });
  const [blobToastMaxVisible, setBlobToastMaxVisible] = usePreference('toastMaxVisible', 3, { localStorageKey: 'hc_pref_toastMaxVisible' });

  // Signed out: the household values, shown optimistically while a save is pending.
  // The commits call `save` (declared below) only on a change, never during render.
  const [houseToastsEnabled, changeToastsEnabled] = useSetting(
    retentionConfig?.toastsEnabled ?? true,
    (v) => save({ toastsEnabled: v }),
  );
  const [houseLiveEventToastsEnabled, changeLiveEventToastsEnabled] = useSetting(
    retentionConfig?.liveEventToastsEnabled ?? false,
    (v) => save({ liveEventToastsEnabled: v }),
  );
  const [housePosition, changePosition] = useSetting(
    retentionConfig?.toastPosition ?? 'bottom-right',
    (v) => save({ toastPosition: v }),
  );
  const [houseDuration, changeDuration] = useSetting(
    retentionConfig?.toastDuration ?? 3,
    (v) => save({ toastDuration: v }),
  );
  const [houseMaxVisible, changeMaxVisible] = useSetting(
    retentionConfig?.toastMaxVisible ?? 3,
    (v) => save({ toastMaxVisible: v }),
  );

  const save = useSettingSaver(saveRetentionMutation, {
    toastsEnabled: houseToastsEnabled,
    // Apply the saved toast config at once, so the confirmation toast follows it.
    onSaved: (result) => configureToasts({
      position: result?.toastPosition,
      duration: result?.toastDuration,
      maxVisible: result?.toastMaxVisible,
    }),
  });

  const blobSetters = {
    toastsEnabled: setBlobToastsEnabled,
    liveEventToastsEnabled: setBlobLiveEventToastsEnabled,
    toastPosition: setBlobToastPosition,
    toastDuration: setBlobToastDuration,
    toastMaxVisible: setBlobToastMaxVisible,
  };
  const houseChanges = {
    toastsEnabled: changeToastsEnabled,
    liveEventToastsEnabled: changeLiveEventToastsEnabled,
    toastPosition: changePosition,
    toastDuration: changeDuration,
    toastMaxVisible: changeMaxVisible,
  };

  const set = (key, value) => {
    if (user) {
      blobSetters[key](value);
      return undefined;
    }
    return houseChanges[key](value);
  };

  return user
    ? {
      toastsEnabled: blobToastsEnabled,
      liveEventToastsEnabled: blobLiveEventToastsEnabled,
      position: blobToastPosition,
      duration: blobToastDuration,
      maxVisible: blobToastMaxVisible,
      set,
    }
    : {
      toastsEnabled: houseToastsEnabled,
      liveEventToastsEnabled: houseLiveEventToastsEnabled,
      position: housePosition,
      duration: houseDuration,
      maxVisible: houseMaxVisible,
      set,
    };
}
