-- Up Migration

-- 1. Relax target_url NOT NULL on alert_rules (email rules have no target_url)
ALTER TABLE alert_rules ALTER COLUMN target_url DROP NOT NULL;

-- 2. Add channel + target_email to alert_rules
ALTER TABLE alert_rules ADD COLUMN IF NOT EXISTS channel TEXT NOT NULL DEFAULT 'webhook';
ALTER TABLE alert_rules ADD COLUMN IF NOT EXISTS target_email TEXT;

-- 3. Per-channel CHECK constraints on alert_rules
ALTER TABLE alert_rules ADD CONSTRAINT chk_alert_channel
  CHECK (channel IN ('webhook', 'email'));
ALTER TABLE alert_rules ADD CONSTRAINT chk_alert_channel_fields
  CHECK (
    (channel = 'webhook' AND target_url IS NOT NULL) OR
    (channel = 'email'   AND target_email IS NOT NULL)
  );

-- 4. Relax target_url NOT NULL on alert_deliveries
ALTER TABLE alert_deliveries ALTER COLUMN target_url DROP NOT NULL;

-- 5. Add channel + recipient to alert_deliveries
ALTER TABLE alert_deliveries ADD COLUMN IF NOT EXISTS channel TEXT NOT NULL DEFAULT 'webhook';
ALTER TABLE alert_deliveries ADD COLUMN IF NOT EXISTS recipient TEXT;

-- 6. CHECK constraint on alert_deliveries channel
ALTER TABLE alert_deliveries ADD CONSTRAINT chk_alert_delivery_channel
  CHECK (channel IN ('webhook', 'email'));

-- Down Migration
ALTER TABLE alert_deliveries DROP CONSTRAINT IF EXISTS chk_alert_delivery_channel;
ALTER TABLE alert_deliveries DROP COLUMN IF EXISTS recipient;
ALTER TABLE alert_deliveries DROP COLUMN IF EXISTS channel;
ALTER TABLE alert_deliveries ALTER COLUMN target_url SET NOT NULL;
ALTER TABLE alert_rules DROP CONSTRAINT IF EXISTS chk_alert_channel_fields;
ALTER TABLE alert_rules DROP CONSTRAINT IF EXISTS chk_alert_channel;
ALTER TABLE alert_rules DROP COLUMN IF EXISTS target_email;
ALTER TABLE alert_rules DROP COLUMN IF EXISTS channel;
ALTER TABLE alert_rules ALTER COLUMN target_url SET NOT NULL;
