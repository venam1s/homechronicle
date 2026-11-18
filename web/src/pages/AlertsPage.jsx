import Alerts from '../components/Alerts.jsx';
import PageContainer from '../components/PageContainer.jsx';
import { LINK_CLASS } from '../components/settings/fieldStyles.js';
import { useCanManageHome } from '../hooks/useCanManageHome.js';

export default function AlertsPage({ onNavigate }) {
  const canManageHome = useCanManageHome();
  return (
    <PageContainer narrow className="space-y-4">
      {canManageHome && onNavigate && (
        // Alerts pads itself on every side: match its gutter so the link sits at
        // the cards' right edge, and cancel the stack gap so its own top padding
        // is the only space above the Alert Rules card.
        <div className="flex justify-end px-3 sm:px-4 -mb-4">
          <button
            type="button"
            onClick={() => onNavigate('settings', { section: 'general' })}
            className={LINK_CLASS}
          >
            Alert defaults
          </button>
        </div>
      )}
      <Alerts />
    </PageContainer>
  );
}
