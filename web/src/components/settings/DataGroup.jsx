import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Download } from 'lucide-react';
import SettingsGroup from './SettingsGroup.jsx';
import SettingsRow from './SettingsRow.jsx';
import Toggle from './Toggle.jsx';
import NumberField from './NumberField.jsx';
import { fetchJson, API_BASE, withApiAuthHeaders } from '../../lib/api.js';
import { saveBlob } from '../../lib/download.js';
import { useSettingSaver } from '../../hooks/useSettingSaver.js';
import { useSetting } from '../../hooks/useSetting.js';

// The saver has already reported a failure with a toast; useSetting has reverted the value.
const ignore = () => {};

// Shown in place of a number field until its config loads: never an invented value.
const LOADING = <span className="text-xs text-hc-muted">Loading…</span>;

export default function DataGroup({ setup }) {
  const { retentionConfig, saveRetentionMutation } = setup;
  const saveRetention = useSettingSaver(saveRetentionMutation, {
    toastsEnabled: retentionConfig?.toastsEnabled ?? true,
  });

  const loaded = retentionConfig != null;
  const retentionDays = retentionConfig?.retentionDays;
  const staleThresholdHours = retentionConfig?.staleThresholdHours;
  const [archiveBeforeDelete, changeArchiveBeforeDelete] = useSetting(
    loaded && Boolean(retentionConfig.archiveBeforeDelete ?? true),
    (v) => saveRetention({ archiveBeforeDelete: v }),
  );

  const archiveCountQuery = useQuery({
    queryKey: ['archive', 'count'],
    queryFn: () => fetchJson(`${API_BASE}/archive/count`),
    staleTime: 60_000,
  });
  const archiveCount = archiveCountQuery.data?.count ?? 0;
  const [archiveDownloading, setArchiveDownloading] = useState(false);

  async function handleDownloadArchive() {
    setArchiveDownloading(true);
    try {
      const res = await fetch(`${API_BASE}/archive/export`, { credentials: 'include', headers: withApiAuthHeaders() });
      if (!res.ok) throw new Error('Download failed');
      saveBlob(await res.blob(), 'homechronicle-archive.csv');
    } catch {
      // silently fail — user can retry
    } finally {
      setArchiveDownloading(false);
    }
  }

  const retentionWarning = (n) => {
    if (n >= retentionDays) return null;
    return archiveBeforeDelete
      ? `Events older than ${n} days will be archived at the next sweep.`
      : `Events older than ${n} days will be permanently deleted at the next sweep.`;
  };

  return (
    <SettingsGroup title="Data">
      <SettingsRow
        label="Retention cutoff"
        description="Keep timeline data in the main table for this many days. Changes apply without restart. Sweep interval is every 24 hours by default."
        control={loaded ? (
          <NumberField
            value={retentionDays}
            min={1}
            max={3650}
            unit="days"
            ariaLabel="Retention cutoff"
            warning={retentionWarning}
            onApply={(n) => saveRetention({ retentionDays: n })}
          />
        ) : LOADING}
      />
      <SettingsRow
        label="Archive before delete"
        description="Copy expired events to the archive table before removing them from the main table. When off, expired events are permanently deleted during retention sweep."
        control={(
          <Toggle
            checked={archiveBeforeDelete}
            ariaLabel="Archive before delete"
            disabled={!loaded}
            onChange={(v) => changeArchiveBeforeDelete(v).catch(ignore)}
          />
        )}
        footnote={archiveCount > 0 ? (
          <button
            type="button"
            onClick={handleDownloadArchive}
            disabled={archiveDownloading}
            className="inline-flex items-center gap-1.5 text-xs text-hc-accent-strong hover:text-hc-accent-stronger disabled:opacity-50 transition-colors"
          >
            <Download size={12} />
            {archiveDownloading ? 'Downloading…' : `Download archive (${archiveCount.toLocaleString()} events)`}
          </button>
        ) : null}
      />
      <SettingsRow
        label="Stale accessory threshold"
        description="An accessory is marked stale after this many hours with no events."
        control={loaded ? (
          <NumberField
            value={staleThresholdHours}
            min={1}
            max={720}
            unit="hours"
            ariaLabel="Stale accessory threshold"
            onApply={(n) => saveRetention({ staleThresholdHours: n })}
          />
        ) : LOADING}
      />
    </SettingsGroup>
  );
}
