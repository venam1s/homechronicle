import { ArrowUpCircle, BookOpen } from 'lucide-react';
import clsx from 'clsx';
import Card from './Card.jsx';

const FOCUS_RING = 'focus-visible:outline-2 focus-visible:outline-hc-focus-ring focus-visible:outline-offset-2';

/**
 * About — build identity and what changed.
 *
 * v0.4 moved this out of the masthead. A version string is diagnostic metadata:
 * you read it when filing a bug or checking what an update brought, not while
 * navigating. Persistent chrome is for things you act on, so only the
 * *actionable* half — "an update is available" — stays visible up there, as a
 * dot on the Settings nav item pointing here.
 */
export default function AboutSection({ buildVersion, hasNewVersion, onOpenChangelog, availableUpdate }) {
  return (
    <Card>
      <Card.Header title="About" headingLevel={2} />
      <Card.Body>
        <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-hc-body">
          <dt className="text-hc-muted">Version</dt>
          <dd className="font-mono text-hc-fg-strong">{buildVersion || 'unknown'}</dd>
          <dt className="text-hc-muted">Update</dt>
          <dd>
            {availableUpdate ? (
              <a
                href={availableUpdate.url}
                target="_blank"
                rel="noopener noreferrer"
                className={clsx('inline-flex items-center gap-1 text-hc-success-text hover:underline', FOCUS_RING)}
              >
                <ArrowUpCircle size={14} aria-hidden="true" />
                {availableUpdate.tag} available
              </a>
            ) : (
              <span className="text-hc-muted">Up to date</span>
            )}
          </dd>
        </dl>

        <button
          type="button"
          onClick={onOpenChangelog}
          className={clsx(
            'mt-4 inline-flex items-center gap-2 rounded-lg border border-hc-panel-border px-3 py-2',
            'text-hc-label font-medium text-hc-fg hover:bg-hc-interactive transition-colors',
            FOCUS_RING,
          )}
        >
          <BookOpen size={15} className="text-hc-muted" aria-hidden="true" />
          What&rsquo;s new
          {hasNewVersion && (
            <span className="w-1.5 h-1.5 rounded-full bg-hc-warning-text" aria-label="Unread" />
          )}
        </button>

        <p className="mt-3 text-hc-caption text-hc-muted">
          Quote the version above when reporting a problem — it identifies the exact build you are running.
        </p>
      </Card.Body>
    </Card>
  );
}
