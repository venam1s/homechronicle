-- Up Migration

-- "Goes quiet" alert rules: operator silent_for, match_value = hours without
-- a matching event. Evaluated on a timer (quiet-alerts.js), not per event.
ALTER TABLE alert_rules DROP CONSTRAINT IF EXISTS chk_alert_operator;
ALTER TABLE alert_rules ADD CONSTRAINT chk_alert_operator
  CHECK (operator IN ('equals', 'not_equals', 'contains', 'above', 'below', 'silent_for'));

-- Down Migration

DELETE FROM alert_rules WHERE operator = 'silent_for';
ALTER TABLE alert_rules DROP CONSTRAINT IF EXISTS chk_alert_operator;
ALTER TABLE alert_rules ADD CONSTRAINT chk_alert_operator
  CHECK (operator IN ('equals', 'not_equals', 'contains', 'above', 'below'));
