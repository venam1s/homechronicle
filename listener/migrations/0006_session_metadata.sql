-- Up Migration

-- Additive session metadata for the Active Sessions UI (D-01).
-- Both columns are nullable with no DEFAULT: existing session rows correctly get
-- NULL and render as blank device info until the user re-logs in. Display-only —
-- never query-filtered, so no indexes.
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS user_agent TEXT;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS ip_address TEXT;

-- Down Migration
ALTER TABLE sessions DROP COLUMN IF EXISTS ip_address;
ALTER TABLE sessions DROP COLUMN IF EXISTS user_agent;
