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
//
// display_name_applied records the name each accessory's history currently
// carries, so reconciling with display-names.json only touches what differs.

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

// Old → new name pairs for one accessory ($1), as a CTE body. A name another
// accessory also carries (two plugins each exposing "Occupancy Sensor") is
// left out: a rule or mute on it covers both devices.
const RENAME_MAPPING = `
  SELECT DISTINCT accessory_name AS old_name, ${RENAMED_EXPR} AS new_name
    FROM event_logs l
   WHERE accessory_id = $1
     AND accessory_name IS DISTINCT FROM ${RENAMED_EXPR}
     AND NOT EXISTS (
       SELECT 1 FROM event_logs o WHERE o.accessory_id <> $1 AND lower(o.accessory_name) = lower(l.accessory_name)
     )`;
const RESTORE_MAPPING = `
  SELECT DISTINCT accessory_name AS old_name, reported_name AS new_name
    FROM event_logs l
   WHERE accessory_id = $1 AND reported_name IS NOT NULL
     AND accessory_name IS DISTINCT FROM reported_name
     AND NOT EXISTS (
       SELECT 1 FROM event_logs o WHERE o.accessory_id <> $1 AND lower(o.accessory_name) = lower(l.accessory_name)
     )`;

// Per-user mutes are stored by name: carry them over to the new names.
const MOVE_MUTES = (mapping) => `
  WITH mapping AS (${mapping})
  UPDATE user_preferences up
     SET prefs = jsonb_set(up.prefs, '{mutedDevices}', (
           SELECT COALESCE(jsonb_agg(DISTINCT COALESCE(m.new_name, e.value)), '[]'::jsonb)
             FROM jsonb_array_elements_text(up.prefs->'mutedDevices') AS e(value)
             LEFT JOIN mapping m ON m.old_name = e.value
         )),
         updated_at = now()
   WHERE jsonb_typeof(up.prefs->'mutedDevices') = 'array'
     AND EXISTS (
       SELECT 1 FROM jsonb_array_elements_text(up.prefs->'mutedDevices') AS e(value)
         JOIN mapping m ON m.old_name = e.value
     )`;

/**
 * Rewrite one accessory's stored events (live and archived) to `displayName`,
 * or restore the reported names when it is empty, in one transaction.
 * Idempotent: rows already carrying the right name are left alone.
 *
 * Accessory-scoped alert rules naming one of the accessory's old names follow
 * the rename, remembering which accessory moved them and their scope before;
 * clearing restores those exactly, and moves rules created against the display
 * name back to the reported name. Per-user mutes follow the same way. Names
 * shared with another accessory are left alone. Live alert matching also
 * accepts the reported name.
 *
 * @returns {Promise<number>} events updated
 */
export async function renameAccessoryEvents(pool, accessoryId, displayName) {
  const name = typeof displayName === 'string' ? displayName.trim() : '';
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    let updated = 0;
    if (name) {
      await client.query(
        `WITH mapping AS (${RENAME_MAPPING})
         UPDATE alert_rules r
            SET scope_value = m.new_name,
                renamed_by_accessory_id = COALESCE(r.renamed_by_accessory_id, $1),
                scope_value_before_rename = COALESCE(r.scope_value_before_rename, r.scope_value),
                updated_at = NOW()
           FROM mapping m
          WHERE r.scope_type = 'accessory'
            AND lower(r.scope_value) = lower(m.old_name)
            AND (r.renamed_by_accessory_id IS NULL OR r.renamed_by_accessory_id = $1)`,
        [accessoryId, name]
      );
      await client.query(MOVE_MUTES(RENAME_MAPPING), [accessoryId, name]);
      for (const table of ['event_logs', 'event_logs_archive']) {
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
      await client.query(
        `INSERT INTO display_name_applied (accessory_id, display_name) VALUES ($1, $2)
         ON CONFLICT (accessory_id) DO UPDATE SET display_name = EXCLUDED.display_name, applied_at = now()`,
        [accessoryId, name]
      );
    } else {
      // Rules a rename moved go back to exactly what they were…
      await client.query(
        `UPDATE alert_rules
            SET scope_value = scope_value_before_rename,
                renamed_by_accessory_id = NULL,
                scope_value_before_rename = NULL,
                updated_at = NOW()
          WHERE renamed_by_accessory_id = $1 AND scope_value_before_rename IS NOT NULL`,
        [accessoryId]
      );
      // …and rules created against the display name move to the reported name.
      await client.query(
        `WITH mapping AS (${RESTORE_MAPPING})
         UPDATE alert_rules r
            SET scope_value = m.new_name, updated_at = NOW()
           FROM mapping m
          WHERE r.scope_type = 'accessory'
            AND r.renamed_by_accessory_id IS NULL
            AND lower(r.scope_value) = lower(m.old_name)`,
        [accessoryId]
      );
      await client.query(MOVE_MUTES(RESTORE_MAPPING), [accessoryId]);
      for (const table of ['event_logs', 'event_logs_archive']) {
        // eslint-disable-next-line no-await-in-loop
        const result = await client.query(
          `UPDATE ${table}
              SET accessory_name = reported_name, reported_name = NULL
            WHERE accessory_id = $1 AND reported_name IS NOT NULL`,
          [accessoryId]
        );
        updated += result.rowCount ?? 0;
      }
      await client.query('DELETE FROM display_name_applied WHERE accessory_id = $1', [accessoryId]);
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

// Renames run one at a time, in request order: two overlapping renames would
// otherwise race on the same rows and alert rules.
let renameQueue = Promise.resolve();

/**
 * Queue a rename of one accessory's history. `displayName` may be a function,
 * called when the job runs: jobs queued from a snapshot (startup reconcile)
 * then apply whatever name is current, so a name changed in the meantime is
 * never overwritten by a stale one. Resolves with the number of events
 * updated; rejects if it failed (also logged — the periodic reconcile retries).
 */
export function scheduleRename(pool, accessoryId, displayName) {
  const job = renameQueue.then(() => renameAccessoryEvents(
    pool,
    accessoryId,
    typeof displayName === 'function' ? displayName() : displayName,
  ));
  renameQueue = job.catch((err) => {
    log.warn(`[display-names] ${accessoryId}: renaming past events failed:`, err.message ?? err);
  });
  return job;
}

/**
 * Bring stored history in line with the display names file: rename accessories
 * whose applied name differs from the file (names set before display names
 * applied to events, added by hand, or a rename that failed) and restore those
 * whose name is gone (deleted with the device's data, edited out of the file,
 * or a restore that failed). Only compares two small lists, so it is cheap to
 * run periodically. Logged, never thrown.
 *
 * @param {function(): Record<string, string>} getNames - current display names
 */
export async function reconcileDisplayNames(pool, getNames) {
  let applied;
  try {
    const result = await pool.query('SELECT accessory_id, display_name FROM display_name_applied');
    applied = new Map(result.rows.map((r) => [r.accessory_id, r.display_name]));
  } catch (err) {
    log.warn('[display-names] could not read applied display names:', err.message ?? err);
    return;
  }
  const names = getNames() ?? {};
  const ids = new Set([...Object.keys(names), ...applied.keys()]);
  for (const accessoryId of ids) {
    const wanted = (names[accessoryId] ?? '').trim();
    if (wanted === (applied.get(accessoryId) ?? '') && (wanted || !applied.has(accessoryId))) continue;
    try {
      // eslint-disable-next-line no-await-in-loop
      const updated = await scheduleRename(pool, accessoryId, () => (getNames()?.[accessoryId] ?? '').trim());
      if (updated) {
        log.info(wanted
          ? `[display-names] ${accessoryId}: ${updated} past event(s) renamed to "${wanted}"`
          : `[display-names] ${accessoryId}: ${updated} past event(s) restored to the reported name`);
      }
    } catch (_err) {
      // Logged by scheduleRename.
    }
  }
}
