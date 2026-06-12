---
phase: 22-email-alert-channel
plan: "01"
subsystem: listener/database
tags: [migration, schema, tdd, alerts, email]
dependency_graph:
  requires: []
  provides:
    - listener/migrations/0005_email_alert_channel.sql
    - listener/test/migration.0005.test.js
    - listener/test/alerts.processor.test.js (email scaffolds)
    - listener/test/alerts-router.test.js
  affects:
    - alert_rules (schema: channel, target_email, relaxed target_url NOT NULL)
    - alert_deliveries (schema: channel, recipient, relaxed target_url NOT NULL)
tech_stack:
  added: []
  patterns:
    - Source-inspection migration test (readFileSync + assert.ok(includes))
    - Wave 0 RED scaffold pattern (failing tests assert intended future behavior)
key_files:
  created:
    - listener/migrations/0005_email_alert_channel.sql
    - listener/test/migration.0005.test.js
    - listener/test/alerts-router.test.js
  modified:
    - listener/test/alerts.processor.test.js
decisions:
  - "Single recipient column on alert_deliveries (channel-agnostic) rather than target_email alongside target_url (per RESEARCH.md D-10 rationale)"
  - "Wave 0 processor tests assert 8-param createDelivery layout (ruleId/eventId/status/targetUrl/channel/recipient/responseCode/error) — plan 22-02 must use this exact signature"
  - "Two router validation tests (email-no-targetEmail → 400, malformed email → 400) accidentally pass pre-22-03 due to existing targetUrl rejection; this is acceptable — they still prove the 400 contract"
metrics:
  duration: "6m 8s"
  completed_date: "2026-06-12"
  tasks_completed: 3
  tasks_total: 3
  files_created: 3
  files_modified: 1
---

# Phase 22 Plan 01: Email Alert Channel Schema + Wave 0 Test Scaffolds Summary

Additive migration 0005 for the email alert channel schema, source-inspection validation test, and Wave 0 RED scaffolds that plans 22-02 and 22-03 will turn GREEN.

## What Was Built

**Task 1 — Migration 0005** (`listener/migrations/0005_email_alert_channel.sql`, commit `08f3812`): Additive DDL that relaxes `target_url NOT NULL` on both `alert_rules` and `alert_deliveries`, adds `channel TEXT NOT NULL DEFAULT 'webhook'` and `target_email TEXT` to `alert_rules`, adds `channel TEXT NOT NULL DEFAULT 'webhook'` and `recipient TEXT` to `alert_deliveries`, and adds three named CHECK constraints (`chk_alert_channel`, `chk_alert_channel_fields`, `chk_alert_delivery_channel`). Matched Up/Down sections; existing webhook rows satisfy all new constraints via the `channel='webhook'` DEFAULT.

**Task 2 — Source-inspection test** (`listener/test/migration.0005.test.js`, commit `3fcd77e`): 18 `assert.ok(source.includes(...))` tests with no DB connection. Splits the SQL on `-- Down Migration` to enforce that `DROP NOT NULL` appears only in Up and `SET NOT NULL` appears only in Down. All 18 pass.

**Task 3 — Wave 0 RED scaffolds** (`listener/test/alerts.processor.test.js` + `listener/test/alerts-router.test.js`, commit `735deae`): Extended processor test with 3 failing email-channel tests (sent delivery, D-09 degradation, suppression). New router test file with SC-4 regression (GREEN) plus 4 failing channel/targetEmail tests. 7 Wave 0 tests are intentionally RED; 585 existing tests remain GREEN.

## Commits

| Task | Commit | Files |
|------|--------|-------|
| 1 — Migration 0005 | `08f3812` | `listener/migrations/0005_email_alert_channel.sql` |
| 2 — Source-inspection test | `3fcd77e` | `listener/test/migration.0005.test.js` |
| 3 — Wave 0 RED scaffolds | `735deae` | `listener/test/alerts.processor.test.js`, `listener/test/alerts-router.test.js` |

## Test Results

```
Tests: 592 total — 585 pass, 7 fail (all 7 are intentional Wave 0 RED scaffolds)

GREEN (pre-existing webhook SC-4 regression):
  ✔ processAlertsForEvent records sent delivery for matching rule
  ✔ processAlertsForEvent records suppressed delivery when within quiet period
  ✔ processAlertsForEvent records failed delivery for non-2xx response
  ✔ processAlertsForEvent blocks localhost webhook targets
  ✔ SC-4 regression: POST with webhook channel creates rule correctly
  ✔ POST with channel=email but no targetEmail returns 400 (contracts match pre-22-03)
  ✔ POST with channel=email and malformed targetEmail returns 400 (contracts match pre-22-03)
  ✔ migration.0005.test.js: 18/18

RED (Wave 0 scaffolds — expected):
  ✖ processAlertsForEvent sends email delivery for matching email rule (22-02)
  ✖ processAlertsForEvent records failed delivery when email is not configured (D-09) (22-02)
  ✖ processAlertsForEvent suppresses rapid-fire events on email rule (22-02)
  ✖ POST with channel=email and well-formed targetEmail succeeds (22-03)
  ✖ POST with channel=email inserts channel and target_email params (22-03)
  ✖ GET /rules returns channel and targetEmail for email rule (22-03)
  ✖ GET /rules does not expose targetUrl for webhook rules either (22-03)
```

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None. This plan creates only SQL DDL and test files; no UI rendering stubs.

## Threat Surface Scan

No new network endpoints, auth paths, file access patterns, or schema changes beyond what is specified in the plan's threat model. Migration 0005 is additive; existing rows satisfy new constraints via DEFAULT 'webhook'. `chk_alert_delivery_status` is untouched.

## Self-Check: PASSED

| Item | Status |
|------|--------|
| `listener/migrations/0005_email_alert_channel.sql` | FOUND |
| `listener/test/migration.0005.test.js` | FOUND |
| `listener/test/alerts-router.test.js` | FOUND |
| `22-01-SUMMARY.md` | FOUND |
| commit `08f3812` | FOUND |
| commit `3fcd77e` | FOUND |
| commit `735deae` | FOUND |
