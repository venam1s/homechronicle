-- Up Migration

-- Display-name renames rewrite one accessory's archived events; without an
-- accessory_id index each rename scanned the whole archive.
CREATE INDEX IF NOT EXISTS idx_event_logs_archive_accessory_id
  ON event_logs_archive (accessory_id);

-- Find renamed rows cheaply (startup restore of names that were removed).
CREATE INDEX IF NOT EXISTS idx_event_logs_renamed
  ON event_logs (accessory_id) WHERE reported_name IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_event_logs_archive_renamed
  ON event_logs_archive (accessory_id) WHERE reported_name IS NOT NULL;

-- An accessory-scoped rule moved by a display name remembers which accessory
-- moved it and its scope before, so clearing the name restores exactly that
-- rule — never one that merely shares a name with another accessory.
ALTER TABLE alert_rules ADD COLUMN IF NOT EXISTS renamed_by_accessory_id TEXT;
ALTER TABLE alert_rules ADD COLUMN IF NOT EXISTS scope_value_before_rename TEXT;

-- Down Migration

UPDATE alert_rules SET scope_value = scope_value_before_rename
  WHERE renamed_by_accessory_id IS NOT NULL AND scope_value_before_rename IS NOT NULL;
ALTER TABLE alert_rules DROP COLUMN IF EXISTS scope_value_before_rename;
ALTER TABLE alert_rules DROP COLUMN IF EXISTS renamed_by_accessory_id;
DROP INDEX IF EXISTS idx_event_logs_archive_renamed;
DROP INDEX IF EXISTS idx_event_logs_renamed;
DROP INDEX IF EXISTS idx_event_logs_archive_accessory_id;
