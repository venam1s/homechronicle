---
phase: 22-email-alert-channel
plan: "02"
subsystem: listener
tags: [alerts, email, processor, nodemailer, tdd]
dependency_graph:
  requires:
    - listener/migrations/0005_email_alert_channel.sql (22-01 schema)
    - listener/test/alerts.processor.test.js (22-01 email RED scaffolds)
    - listener/src/emails.js (Phase 21 sendAlertEmail + isEmailEnabled)
  provides:
    - listener/src/alerts.js (sendEmailAlertForRule + buildAlertBody + channel branch + 8-col createDelivery)
    - listener/src/subscriber.js (setAlertEmailFrom setter + alertEmailFrom thread)
    - listener/src/index.js (startup wiring setAlertEmailFrom(smtpConfig.from))
  affects:
    - processAlertsForEvent signature -> (pool, event, emailFrom)
tech_stack:
  added: []
  patterns:
    - Setter-injection dependency (setAlertEmailFrom mirrors setAlertsEnabledFn)
    - Send-step-only channel branch (matching + suppression core untouched, D-11)
    - Graceful degradation gate via isEmailEnabled() (D-09)
key_files:
  created: []
  modified:
    - listener/src/alerts.js
    - listener/src/subscriber.js
    - listener/src/index.js
    - listener/test/alerts.processor.test.js
decisions:
  - "Helper named sendEmailAlertForRule (not sendEmailAlert) to avoid shadowing the imported emails.js sendAlertEmail; still satisfies must_haves contains:'sendEmailAlert' and the sendAlertEmail(rule.target_email...) key-link"
  - "DEVIATION: 22-01's 'sent' RED scaffold was internally unsatisfiable — it expected status='sent' while the plan (correctly, per D-09) gates the send on isEmailEnabled(), which is false in unit tests (transporter null). Fixed the scaffold to configure a stub transport via initEmail({_testTransport}) so isEmailEnabled() is true, then tear it down in finally so the D-09 + suppression scaffolds still observe email disabled. Production design (isEmailEnabled gate) and assertions (sent/channel/recipient/targetUrl) are unchanged — only the test's email-configured precondition was supplied."
  - "emailFrom threaded via subscriber.js setter (the only caller of processAlertsForEvent is processAlertsSafe; matter-controller.js does not call it) — no router dependency change"
metrics:
  completed_date: "2026-06-12"
  tasks_completed: 2
  tasks_total: 2
  files_created: 0
  files_modified: 4
---

# Phase 22 Plan 02: Email Alert Send Branch + Startup Wiring Summary

Adds the `channel === 'email'` branch to the alert processor — a plain-text email send via the Phase 21 `sendAlertEmail` transport, graceful degradation when SMTP is off (D-09), channel/recipient logging in `alert_deliveries`, and the startup wiring that threads the configured SMTP `from` address into the processor. Webhook behavior is byte-for-byte unchanged (SC-4); `emails.js` is untouched.

## What Was Built

**Task 1 — Email send branch in alerts.js** (commit `d9289aa`):
- `import { sendAlertEmail, isEmailEnabled } from './emails.js'`
- `buildAlertBody(rule, event)` — plain-text multi-line renderer (Rule / Accessory+id / Room (fallback `(no room)`) / Characteristic / Change `old → new` / Time).
- `sendEmailAlertForRule(rule, event, emailFrom)` — returns the same `{ status, error? }` shape as `sendWebhook`. Gates on `isEmailEnabled()` → `{ status:'failed', error:'Email not configured' }` when off (D-09, no throw escapes). Builds subject `[HomeChronicle] <accessory> <characteristic> = <newValue>` (sliced 200) with a rule-name fallback, sends via `sendAlertEmail(rule.target_email, subject, body, { from: emailFrom })`, returns `{ status:'sent' }`; catch → `{ status:'failed', error: ... }`.
- `createDelivery` INSERT extended to 8 columns `(rule_id, event_id, status, target_url, channel, recipient, response_code, error)` with `channel ?? 'webhook'`, `recipient ?? null`, `targetUrl ?? null` defaults.
- `processAlertsForEvent(pool, event, emailFrom)` — added `target_email, channel` to the rules SELECT; both the suppressed and sent `createDelivery` calls now pass `channel`, conditional `recipient` (email → target_email else null), and conditional `targetUrl` (webhook → target_url else null); send step branches `rule.channel === 'email' ? sendEmailAlertForRule(...) : sendWebhook(...)`. Suppression query/matching logic untouched (D-11).

**Task 2 — Startup wiring** (commit `76f097e`):
- `subscriber.js`: module-level `let alertEmailFrom = ''` + `export function setAlertEmailFrom(value)` (mirrors `setAlertsEnabledFn`); `processAlertsSafe` passes `alertEmailFrom` as the 3rd arg to `processAlertsForEvent`.
- `index.js`: imports `setAlertEmailFrom`, calls `setAlertEmailFrom(smtpConfig.from ?? '')` immediately after `initEmail(smtpConfig)` / `setAlertsEnabledFn(...)`. The alert From now matches the invite/reset From (D-07).
- `matter-controller.js` untouched — no email wiring leaked into Matter.

## Commits

| Task | Commit | Files |
|------|--------|-------|
| 1 — Email send branch | `d9289aa` | `listener/src/alerts.js`, `listener/test/alerts.processor.test.js` |
| 2 — Startup wiring | `76f097e` | `listener/src/subscriber.js`, `listener/src/index.js` |

## Test Results

```
listener full suite: 592 total — 588 pass, 4 fail
  ✔ all 7 alerts.processor.test.js (incl. the 3 email scaffolds, now GREEN)
  ✔ migration.0005.test.js 18/18
  ✖ 4 remaining failures are ALL alerts-router.test.js scaffolds labelled
    "(Wave 0 - implemented by 22-03)" — expected RED until plan 22-03.
```

## Deviations from Plan

One — the 22-01 "sent" RED scaffold (`processAlertsForEvent sends email delivery for matching email rule`) was logically unsatisfiable as written: it asserted `status='sent'` while the plan's send branch correctly gates on `isEmailEnabled()` (transporter `!== null`), which is always false in unit tests because no transport is initialized. The scaffold comment even acknowledged the gate. Resolution: configure a stub transport via `initEmail({ host, smtpPass, from, _testTransport })` before the call (so `isEmailEnabled()` is true), and tear it down with `initEmail({})` in `finally` so the subsequent D-09 and suppression scaffolds still observe email disabled. The production design (isEmailEnabled gate, D-09 degradation) and all assertions are unchanged — only the test's "email configured" precondition was supplied. Documented here rather than silently editing a sibling plan's test.

## Known Stubs

None. The send path uses the real Phase 21 `sendAlertEmail` transport; tests inject `_testTransport` only.

## Threat Surface Scan

Per the plan threat model: device values flow only into the plain-text `text:` body/subject (T-22-04 — nodemailer escapes MIME headers from structured fields; subject sliced to 200), a slow/dead SMTP yields a `failed` delivery rather than a stalled subscriber (T-22-03 — `sendAlertEmail` timeouts + try/catch + `processAlertsSafe` swallow), and `recipient` logging matches the existing `target_url` exposure on the admin-only `/deliveries` endpoint (T-22-05). No new endpoints or auth paths; `emails.js` unchanged.

## Self-Check: PASSED

| Item | Status |
|------|--------|
| `listener/src/alerts.js` sendEmailAlertForRule + 8-col createDelivery | FOUND |
| `listener/src/subscriber.js` setAlertEmailFrom + alertEmailFrom thread | FOUND |
| `listener/src/index.js` setAlertEmailFrom(smtpConfig.from) wiring | FOUND |
| `git diff listener/src/emails.js` empty | CONFIRMED |
| matter-controller.js has no processAlertsForEvent | CONFIRMED |
| commit `d9289aa` | FOUND |
| commit `76f097e` | FOUND |
| 3 processor email scaffolds GREEN; only 22-03 router scaffolds remain RED | CONFIRMED |
