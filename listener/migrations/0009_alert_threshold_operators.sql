-- Up Migration

-- Numeric threshold operators for alert rules: "above" / "below" fire when a
-- reading crosses match_value (parsed as a number). Purely a widened CHECK.
ALTER TABLE alert_rules DROP CONSTRAINT IF EXISTS chk_alert_operator;
ALTER TABLE alert_rules ADD CONSTRAINT chk_alert_operator
  CHECK (operator IN ('equals', 'not_equals', 'contains', 'above', 'below'));

-- Down Migration

-- Threshold rules cannot be expressed with the old operators; remove them so
-- the narrower constraint can be restored.
DELETE FROM alert_rules WHERE operator IN ('above', 'below');
ALTER TABLE alert_rules DROP CONSTRAINT IF EXISTS chk_alert_operator;
ALTER TABLE alert_rules ADD CONSTRAINT chk_alert_operator
  CHECK (operator IN ('equals', 'not_equals', 'contains'));
