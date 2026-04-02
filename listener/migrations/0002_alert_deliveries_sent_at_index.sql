-- Up Migration
CREATE INDEX IF NOT EXISTS idx_alert_deliveries_sent_at ON alert_deliveries (sent_at);

-- Down Migration
DROP INDEX IF EXISTS idx_alert_deliveries_sent_at;
