-- Up Migration

-- Display names rewrite accessory_name on stored events (so every name-keyed
-- lookup — search, heatmap jump, mutes, alert scopes — follows the rename).
-- reported_name keeps the name the device itself reported, so clearing a
-- display name restores history exactly. NULL means accessory_name already is
-- the reported name. Adding a nullable column is instant; no table rewrite.
ALTER TABLE event_logs ADD COLUMN IF NOT EXISTS reported_name TEXT;
ALTER TABLE event_logs_archive ADD COLUMN IF NOT EXISTS reported_name TEXT;

-- Down Migration

UPDATE event_logs SET accessory_name = reported_name WHERE reported_name IS NOT NULL;
UPDATE event_logs_archive SET accessory_name = reported_name WHERE reported_name IS NOT NULL;
ALTER TABLE event_logs DROP COLUMN IF EXISTS reported_name;
ALTER TABLE event_logs_archive DROP COLUMN IF EXISTS reported_name;
