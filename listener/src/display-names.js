// Display names: a user-chosen name for an accessory, replacing the name the
// device reports (e.g. a Homebridge plugin that names a sensor after its
// serial number). The display name is written into event_logs.accessory_name —
// for new events at insert time and for past events when it is set — because
// the stored name is what search, the heatmap jump, mutes and alert scopes key
// on. The reported name is kept in reported_name so clearing restores it.
//
// Names match the exact accessory id only: naming a bridge must not rename
// every child behind it. An accessory with several watched services records
// "<name> · <service type>" per service; that suffix is kept.

import { log } from './logger.js';
import { invalidate } from './query-cache.js';

const SEP = ' · ';

/** The stored name for an event from `reportedName` once `displayName` applies. */
export function withDisplayName(reportedName, serviceType, displayName) {
  const name = typeof displayName === 'string' ? displayName.trim() : '';
  if (!name) return reportedName;
  if (serviceType && typeof reportedName === 'string' && reportedName.endsWith(`${SEP}${serviceType}`)) {
    return `${name}${SEP}${serviceType}`;
  }
  return name;
}

// SQL twin of withDisplayName over a row's reported name ($2 = display name).
const RENAMED_EXPR = `
  CASE
    WHEN service_type IS NOT NULL
     AND right(COALESCE(reported_name, accessory_name), length(service_type) + 3) = ' · ' || service_type
    THEN $2 || ' · ' || service_type
    ELSE $2
  END`;

// A rule scoped to a name another accessory also carries (two plugins each
// exposing "Occupancy Sensor") covers both; renaming one must not move the
// rule off the other. Live matching still accepts the reported name.
const NOT_SHARED = (nameColumn) => `
            AND NOT EXISTS (
              SELECT 1 FROM event_logs o
               WHERE o.accessory_id <> $1 AND lower(o.accessory_name) = lower(${nameColumn})
            )`;

/**
 * Rewrite one accessory's stored events (live and, unless `archive` is false,
 * archived) to `displayName`, or restore the reported names when it is empty.
 * Alert rules scoped to one of the accessory's old names follow the rename so
 * they keep matching. Runs in one transaction; idempotent (rows already
 * carrying the right name are left alone).
 *
 * @returns {Promise<number>} events updated
 */
export async function renameAccessoryEvents(pool, accessoryId, displayName, { archive = true } = {}) {
  const name = typeof displayName === 'string' ? displayName.trim() : '';
  const tables = archive ? ['event_logs', 'event_logs_archive'] : ['event_logs'];
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    let updated = 0;
    if (name) {
      await client.query(
        `UPDATE alert_rules r
            SET scope_value = m.new_name, updated_at = NOW()
           FROM (
             SELECT DISTINCT accessory_name AS old_name, ${RENAMED_EXPR} AS new_name
               FROM event_logs WHERE accessory_id = $1
           ) m
          WHERE r.scope_type = 'accessory'
            AND lower(r.scope_value) = lower(m.old_name)
            AND m.old_name IS DISTINCT FROM m.new_name
            ${NOT_SHARED('m.old_name')}`,
        [accessoryId, name]
      );
      for (const table of tables) {
        // eslint-disable-next-line no-await-in-loop
        const result = await client.query(
          `UPDATE ${table}
              SET reported_name = COALESCE(reported_name, accessory_name),
                  accessory_name = ${RENAMED_EXPR}
            WHERE accessory_id = $1
              AND accessory_name IS DISTINCT FROM ${RENAMED_EXPR}`,
          [accessoryId, name]
        );
        updated += result.rowCount ?? 0;
      }
    } else {
      await client.query(
        `UPDATE alert_rules r
            SET scope_value = m.old_name, updated_at = NOW()
           FROM (
             SELECT DISTINCT accessory_name AS new_name, reported_name AS old_name
               FROM event_logs WHERE accessory_id = $1 AND reported_name IS NOT NULL
           ) m
          WHERE r.scope_type = 'accessory'
            AND lower(r.scope_value) = lower(m.new_name)
            AND m.old_name IS DISTINCT FROM m.new_name
            ${NOT_SHARED('m.new_name')}`,
        [accessoryId]
      );
      for (const table of tables) {
        // eslint-disable-next-line no-await-in-loop
        const result = await client.query(
          `UPDATE ${table}
              SET accessory_name = reported_name, reported_name = NULL
            WHERE accessory_id = $1 AND reported_name IS NOT NULL`,
          [accessoryId]
        );
        updated += result.rowCount ?? 0;
      }
    }
    await client.query('COMMIT');
    // Cached stats (heatmap, patterns, anomalies) hold names; drop them.
    invalidate('stats:');
    return updated;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Bring stored events in line with the display names file at startup — e.g.
 * names set before display names applied to events, or a file edited by hand.
 * Live events only: the archive has no accessory_id index, and scanning it on
 * every boot would grow without bound (renames via the API cover it). Logged,
 * never thrown: a failure here must not stop the listener.
 */
export async function reconcileDisplayNames(pool, names) {
  for (const [accessoryId, displayName] of Object.entries(names ?? {})) {
    try {
      // eslint-disable-next-line no-await-in-loop
      const updated = await renameAccessoryEvents(pool, accessoryId, displayName, { archive: false });
      if (updated) log.info(`[display-names] ${accessoryId}: ${updated} past event(s) renamed to "${displayName}"`);
    } catch (err) {
      log.warn(`[display-names] ${accessoryId}: could not rename past events:`, err.message ?? err);
    }
  }
}
