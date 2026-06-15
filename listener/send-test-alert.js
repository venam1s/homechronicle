#!/usr/bin/env node
/**
 * Live UAT for the email ALERT channel (Phase 22 — ALERT-01..04).
 *
 * This is the one Phase 22 path NOT covered by sending invite/reset emails: an
 * alert *rule* with channel=email that fires when a device event matches, routed
 * through the same quiet-period suppression + delivery-logging path as webhooks.
 *
 * It runs the REAL pipeline the listener uses (processAlertsForEvent → nodemailer
 * SMTP), then cleans up everything it creates so nothing is left in the DB.
 *
 * What it does:
 *   1. Initializes the SMTP transport exactly like src/index.js (env > smtp-config.json).
 *   2. Creates a temporary email-channel rule scoped to a unique synthetic accessory
 *      (so it cannot match real device traffic during the test).
 *   3. Inserts a matching synthetic event (a real event_logs row — required by the
 *      alert_deliveries.event_id foreign key).
 *   4. Calls processAlertsForEvent() — the exact function subscriber.js calls.
 *   5. Reports the delivery status (sent / failed + error).
 *   6. Deletes the temp rule, its delivery rows, and the synthetic event.
 *
 * Usage (from the listener/ directory, with the same env the listener runs with):
 *   node send-test-alert.js you@example.com
 *
 * Against a running container:
 *   docker compose exec listener node send-test-alert.js you@example.com
 *
 * Reads DATABASE_URL + SMTP config the same way the listener does. If SMTP is set
 * via the Settings UI (not env), run it where smtp-config.json / smtp-secret.json
 * live (i.e. inside the listener container, or with SMTP_* env vars set).
 */

import { readFile } from 'node:fs/promises';
import { pool, insertEvent } from './src/db.js';
import { processAlertsForEvent } from './src/alerts.js';
import { initEmail, isEmailEnabled } from './src/emails.js';
import {
  readSmtpSecret,
  buildSmtpConfig,
  SMTP_CONFIG_FILE,
  SMTP_SECRET_FILE,
} from './src/smtp-config.js';

const recipient = process.argv[2];
if (!recipient) {
  console.error('Usage: node send-test-alert.js <recipient@email>');
  process.exit(1);
}

// Unique so the temp rule cannot match real device events while the test runs.
const UNIQUE_ACCESSORY = 'HomeChronicle Email Test';

async function loadSmtpSnapshot() {
  try {
    return JSON.parse(await readFile(SMTP_CONFIG_FILE, 'utf8'));
  } catch {
    return {}; // missing/unreadable → rely on env overrides in buildSmtpConfig
  }
}

async function main() {
  // 1. Initialize SMTP transport exactly like index.js (env wins, then JSON store).
  const snapshot = await loadSmtpSnapshot();
  const secret = await readSmtpSecret(SMTP_SECRET_FILE);
  const smtpConfig = buildSmtpConfig(snapshot, secret);
  await initEmail(smtpConfig);

  if (!isEmailEnabled()) {
    console.error(
      '✗ Email is NOT configured (SMTP host/from missing). Configure SMTP in ' +
        'Settings or via SMTP_* env vars, then retry from a context that can read ' +
        `the config (${SMTP_CONFIG_FILE}).`,
    );
    await pool.end();
    process.exit(2);
  }

  console.log(`SMTP configured. From: ${smtpConfig.from || '(default)'}`);
  console.log(`Sending a test email alert to: ${recipient}\n`);

  let ruleId;
  let eventId;
  try {
    // 2. Temp email-channel rule scoped to the unique accessory.
    const ruleRes = await pool.query(
      `INSERT INTO alert_rules
         (name, enabled, scope_type, scope_value, characteristic,
          operator, match_value, channel, target_url, target_email, quiet_minutes)
       VALUES ($1, TRUE, 'accessory', $2, 'On', 'equals', 'ON', 'email', NULL, $3, 0)
       RETURNING id`,
      [`[UAT] Email alert test ${new Date().toISOString()}`, UNIQUE_ACCESSORY, recipient],
    );
    ruleId = ruleRes.rows[0].id;
    console.log(`→ Created temp rule #${ruleId} (channel=email, accessory="${UNIQUE_ACCESSORY}").`);

    // 3. Matching synthetic event (real row — satisfies the deliveries FK).
    const evt = await insertEvent({
      accessoryId: 'hc-email-test',
      accessoryName: UNIQUE_ACCESSORY,
      roomName: 'Test',
      serviceType: 'Switch',
      characteristic: 'On',
      oldValue: 'OFF',
      newValue: 'ON',
      protocol: 'homekit',
    });
    eventId = evt.id;
    console.log(`→ Inserted synthetic event #${eventId} (On: OFF → ON).`);

    // 4. Run the REAL alert pipeline (same call subscriber.js makes).
    await processAlertsForEvent(
      pool,
      {
        eventId,
        timestamp: evt.timestamp,
        accessoryId: 'hc-email-test',
        accessoryName: UNIQUE_ACCESSORY,
        roomName: 'Test',
        serviceType: 'Switch',
        characteristic: 'On',
        oldValue: 'OFF',
        newValue: 'ON',
      },
      smtpConfig.from ?? '',
    );

    // 5. Report the delivery outcome.
    const del = await pool.query(
      `SELECT status, channel, recipient, error
       FROM alert_deliveries WHERE rule_id = $1 ORDER BY id DESC LIMIT 1`,
      [ruleId],
    );
    const row = del.rows[0];
    if (!row) {
      console.error('\n✗ No delivery row created — the event did not match the rule.');
      process.exitCode = 3;
    } else if (row.status === 'sent') {
      console.log(`\n✓ SUCCESS — delivery status=sent, channel=${row.channel}, recipient=${row.recipient}.`);
      console.log(`  Check ${recipient} for subject: "[HomeChronicle] ${UNIQUE_ACCESSORY} On = ON"`);
    } else {
      console.error(`\n✗ Delivery status=${row.status} — error: ${row.error ?? '(none)'}`);
      process.exitCode = 3;
    }
  } finally {
    // 6. Clean up everything we created.
    if (ruleId) {
      await pool.query('DELETE FROM alert_deliveries WHERE rule_id = $1', [ruleId]);
      await pool.query('DELETE FROM alert_rules WHERE id = $1', [ruleId]);
    }
    if (eventId) {
      await pool.query('DELETE FROM event_logs WHERE id = $1', [eventId]);
    }
    console.log('→ Cleaned up temp rule, delivery rows, and synthetic event.');
    await pool.end();
  }
}

main().catch((err) => {
  console.error('Test failed:', err?.stack ?? err);
  process.exit(1);
});
