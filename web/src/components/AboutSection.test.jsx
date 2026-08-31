import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import AboutSection from './AboutSection.jsx';

function renderAbout(props = {}) {
  return render(
    <AboutSection
      buildVersion="v0.4.0"
      hasNewVersion={false}
      onOpenChangelog={vi.fn()}
      availableUpdate={null}
      {...props}
    />,
  );
}

describe('AboutSection', () => {
  it('shows the build version', () => {
    renderAbout();
    expect(screen.getByText('v0.4.0')).toBeInTheDocument();
  });

  it('says so when there is nothing to update to', () => {
    renderAbout();
    expect(screen.getByText('Up to date')).toBeInTheDocument();
  });

  it('links to an available update', () => {
    renderAbout({ availableUpdate: { tag: 'v0.5.0', url: 'https://example.test/rel' } });
    expect(screen.getByRole('link', { name: /v0\.5\.0 available/ })).toHaveAttribute('href', 'https://example.test/rel');
  });

  it('opens the changelog', () => {
    const onOpenChangelog = vi.fn();
    renderAbout({ onOpenChangelog });
    screen.getByRole('button', { name: /What’s new/ }).click();
    expect(onOpenChangelog).toHaveBeenCalled();
  });

  describe('help links', () => {
    it('links to the published documentation site', () => {
      renderAbout();
      expect(screen.getByRole('link', { name: 'Documentation' }))
        .toHaveAttribute('href', 'https://homechronicle.net');
    });

    // GitLab, not GitHub: the GitHub account was lost to a suspension and
    // `havuq` no longer resolves there, so a GitHub link would 404. This is
    // the same target as the existing links in ChangelogModal and SettingsTab.
    it('links to the issue tracker that actually exists', () => {
      renderAbout();
      expect(screen.getByRole('link', { name: 'Report an issue' }))
        .toHaveAttribute('href', 'https://gitlab.com/havuq/homechronicle/-/issues');
    });

    it('opens external links safely', () => {
      renderAbout();
      for (const name of ['Documentation', 'Report an issue']) {
        const link = screen.getByRole('link', { name });
        expect(link).toHaveAttribute('target', '_blank');
        expect(link.getAttribute('rel')).toContain('noopener');
      }
    });
  });
});
