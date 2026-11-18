import NotificationsGroup from './NotificationsGroup.jsx';
import TimelineGroup from './TimelineGroup.jsx';
import QuietHoursGroup from './QuietHoursGroup.jsx';

// Personal settings: Notifications, Timeline, Quiet hours.
export default function PreferencesSection({ setup, onNavigate }) {
  return (
    <>
      <NotificationsGroup setup={setup} onNavigate={onNavigate} />
      <TimelineGroup setup={setup} />
      <QuietHoursGroup setup={setup} />
    </>
  );
}
