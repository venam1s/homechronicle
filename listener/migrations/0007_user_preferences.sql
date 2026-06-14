-- Up Migration

-- Per-user UI preferences blob (Phase 24). One row per user; purely additive.
CREATE TABLE IF NOT EXISTS user_preferences (
  user_id    BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  prefs      JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Down Migration
DROP TABLE IF EXISTS user_preferences;
