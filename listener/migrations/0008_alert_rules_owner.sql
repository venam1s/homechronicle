-- Up Migration

-- Per-user ownership for alert_rules (Phase 26). Purely additive.
-- Existing rows are backfilled to the lowest-id admin so current webhook rules keep firing.
-- NULL is intentional: auth-off installs with no admin users leave user_id NULL (A1).

-- 1. Add nullable user_id FK to alert_rules
ALTER TABLE alert_rules ADD COLUMN IF NOT EXISTS user_id BIGINT REFERENCES users(id) ON DELETE CASCADE;

-- 2. Index for efficient per-user queries (plan 26-02 uses WHERE user_id = $1)
CREATE INDEX IF NOT EXISTS ix_alert_rules_user_id ON alert_rules (user_id);

-- 3. Backfill: assign existing rows to the lowest-id admin user.
--    When no admin exists (auth-off install), the subquery yields NULL and rows stay NULL.
UPDATE alert_rules
  SET user_id = (SELECT id FROM users WHERE role = 'admin' ORDER BY id ASC LIMIT 1)
  WHERE user_id IS NULL;

-- Down Migration

DROP INDEX IF EXISTS ix_alert_rules_user_id;
ALTER TABLE alert_rules DROP COLUMN IF EXISTS user_id;
