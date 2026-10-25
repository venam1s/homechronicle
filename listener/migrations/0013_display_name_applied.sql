-- Up Migration

-- Which display name each accessory's stored events and alert rules currently
-- carry. The listener compares it with display-names.json (at startup and
-- periodically) and renames or restores only what differs, instead of
-- walking every named accessory's history each time.
CREATE TABLE IF NOT EXISTS display_name_applied (
  accessory_id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  applied_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Accessories renamed before this table existed: record them with an empty
-- name so the next reconcile re-applies (or restores) them once.
INSERT INTO display_name_applied (accessory_id, display_name)
SELECT DISTINCT accessory_id, '' FROM event_logs WHERE reported_name IS NOT NULL
ON CONFLICT (accessory_id) DO NOTHING;
INSERT INTO display_name_applied (accessory_id, display_name)
SELECT DISTINCT accessory_id, '' FROM event_logs_archive WHERE reported_name IS NOT NULL
ON CONFLICT (accessory_id) DO NOTHING;

-- Down Migration

DROP TABLE IF EXISTS display_name_applied;
