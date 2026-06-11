-- Up Migration

ALTER TABLE users ADD COLUMN IF NOT EXISTS disabled_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS invites (
  id           BIGSERIAL PRIMARY KEY,
  email        TEXT NOT NULL,
  token_hash   TEXT NOT NULL UNIQUE,
  role         TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'member')),
  status       TEXT NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending', 'accepted', 'revoked', 'expired')),
  invited_by   BIGINT REFERENCES users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at   TIMESTAMPTZ NOT NULL,
  used_at      TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_invites_token_hash ON invites (token_hash);
CREATE INDEX IF NOT EXISTS idx_invites_email      ON invites (email);
CREATE INDEX IF NOT EXISTS idx_invites_status     ON invites (status);

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id           BIGSERIAL PRIMARY KEY,
  user_id      BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash   TEXT NOT NULL UNIQUE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at   TIMESTAMPTZ NOT NULL,
  used_at      TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_token_hash ON password_reset_tokens (token_hash);
CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_user_id   ON password_reset_tokens (user_id);

-- Down Migration
DROP TABLE IF EXISTS password_reset_tokens;
DROP TABLE IF EXISTS invites;
ALTER TABLE users DROP COLUMN IF EXISTS disabled_at;
