---
phase: 22-email-alert-channel
plan: "03"
subsystem: listener/api
tags: [alerts, email, router, validation, tdd]
dependency_graph:
  requires:
    - listener/migrations/0005_email_alert_channel.sql (22-01 schema)
    - listener/test/alerts-router.test.js (22-01 Wave 0 router scaffolds)
    - listener/src/alerts.js (22-02 processor channel branch)
  provides:
    - listener/src/alerts-router.js (validateTargetEmail + channel-aware validateCreate/validatePatch + toApiRule + INSERT/PATCH/GET wiring)
  affects:
    - GET /api/alerts/rules (now returns channel + targetEmail, still redacts targetUrl)
    - POST /api/alerts/rules (11-param INSERT with channel + target_url + target_email)
    - PATCH /api/alerts/rules/:id (channel/targetEmail in map + RETURNING; channel-switch field clearing)
    - GET /api/alerts/deliveries (now returns channel + recipient per row)
tech_stack:
  added: []
  patterns:
    - VALID_EMAIL_RE format-only validator (trim + lowercase + length cap)
    - Channel enum branch in validateCreate (webhook/email)
    - Channel-switch field clearing in validatePatch (keeps DB CHECK constraint satisfiable)
    - D-08 redaction asymmetry (delete targetUrl, retain targetEmail)
key_files:
  created: []
  modified:
    - listener/src/alerts-router.js
    - listener/test/alerts-router.integration.test.js
decisions:
  - "validateTargetEmail: trim + lowercase + VALID_EMAIL_RE format check only (no MX probe) + length <= 254; matches D-01/D-03 free-form recipient design"
  - "validatePatch channel-switch clearing: switching to email sets targetUrl=null and requires targetEmail; switching to webhook sets targetEmail=null — keeps chk_alert_channel_fields satisfiable"
  - "D-08 redaction asymmetry: delete rule.targetUrl (webhook URL can embed secrets), do NOT delete targetEmail (email address is not a credential); both preserved in comment at deletion site"
  - "Rule 1 auto-fix: alerts-router.integration.test.js mock pool INSERT was keyed to old 9-param layout; updated to 11-param (channel at $8, target_url at $9, target_email at $10, quiet_minutes at $11)"
metrics:
  duration: "12m"
  completed_date: "2026-06-12"
  tasks_completed: 2
  tasks_total: 2
  files_created: 0
  files_modified: 2
---

# Phase 22 Plan 03: Alerts Router Channel + Email Wiring Summary

Extended alerts-router.js with email-channel validation (validateTargetEmail), channel-aware validateCreate/validatePatch with channel-switch field clearing, toApiRule exposing channel + targetEmail, 11-param INSERT, updated PATCH map/RETURNING, GET /rules adding target_email + channel to SELECT while preserving target_url redaction (D-08), and GET /deliveries returning channel + recipient.

## What Was Built

**Task 1 — validateTargetEmail + channel-aware validateCreate/validatePatch** (commit `473b55d`):

- `VALID_EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/` added alongside existing validators.
- `validateTargetEmail(value)`: trims + lowercases; returns `{ error }` for empty/malformed/over-254; returns `{ value: email }` for well-formed.
- `validateCreate`: replaced unconditional `validateWebhookTargetUrl` block with a channel enum branch. `channel` parsed from `body.channel ?? 'webhook'`; rejects unknown values with `'channel must be webhook or email'`; webhook path unchanged; email path calls `validateTargetEmail`, sets `targetUrl=null`; return value now includes `channel`, `targetUrl`, `targetEmail`.
- `validatePatch`: added `'channel' in body` and `'targetEmail' in body` blocks after existing `targetUrl` block. After field parsing: switching to email clears `targetUrl=null` and requires `targetEmail`; switching to webhook clears `targetEmail=null`.

**Task 2 — toApiRule, INSERT/PATCH/GET wiring, D-08 redaction** (commit `473b55d`):

- `toApiRule`: added `channel: row.channel ?? 'webhook'` and `targetEmail: row.target_email ?? null`.
- GET `/rules`: added `target_email, channel` to SELECT; preserved `delete rule.targetUrl` with D-08 comment; `targetEmail` intentionally NOT deleted (D-08 — not a credential).
- POST `/rules`: INSERT extended to 11 params + RETURNING includes `channel, target_url, target_email`.
- PATCH `/rules/:id`: added `channel: 'channel'` and `targetEmail: 'target_email'` to column `map`; RETURNING extended to include `channel, target_url, target_email`. Null values from channel-switch clearing (set by validatePatch) are included in the dynamic SET, writing NULL to the DB.
- GET `/deliveries`: added `d.channel, d.recipient` to SELECT; added `channel` and `recipient` to row map.

**Rule 1 auto-fix — integration test mock pool** (commit `473b55d`): `alerts-router.integration.test.js` mock INSERT handler was keyed to the old 9-param layout (params[7]=target_url, params[8]=quiet_minutes). The new 11-param INSERT shifted these indices, causing the mock to return `target_url: 'webhook'` (the channel value) which broke the POST-response-echoes-targetUrl assertion. Fixed by updating the mock to match the new 11-param layout.

## Commits

| Task | Commit | Files |
|------|--------|-------|
| 1+2 — validator + wiring + test mock fix | `473b55d` | `listener/src/alerts-router.js`, `listener/test/alerts-router.integration.test.js` |

## Test Results

```
listener full suite: 592 total — 592 pass, 0 fail

Wave 0 router scaffolds (all GREEN):
  ✔ SC-4 regression: POST with webhook channel creates rule correctly
  ✔ POST with channel=email but no targetEmail returns 400
  ✔ POST with channel=email and malformed targetEmail returns 400
  ✔ POST with channel=email and well-formed targetEmail succeeds
  ✔ POST with channel=email inserts channel and target_email params
  ✔ GET /rules returns channel and targetEmail for email rule
  ✔ GET /rules does not expose targetUrl for webhook rules either (SC-4 + D-08)

Phase 22 full backend: 592/592 GREEN
```

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Integration test mock pool broke on new 11-param INSERT**
- **Found during:** Task 2 (full `npm test` run)
- **Issue:** `alerts-router.integration.test.js` mock INSERT handler used old 9-param index layout; params[7] was target_url but is now channel, causing `target_url: 'webhook'` in returned row and a failing assertion on POST response at line 155.
- **Fix:** Updated mock to 11-param layout with a comment documenting the param positions.
- **Files modified:** `listener/test/alerts-router.integration.test.js`
- **Commit:** `473b55d`

## Known Stubs

None. All new columns are fully wired through validation, INSERT, PATCH, and GET responses.

## Threat Surface Scan

Per the plan threat model:
- **T-22-07** (channel/email tampering): `validateTargetEmail` format-validates before parameterized INSERT; channel constrained to enum in `validateCreate`/`validatePatch` and by DB `chk_alert_channel`. No string concatenation into SQL.
- **T-22-08** (targetEmail exposure): Intentional per D-08 — admin-only authenticated endpoint; email is not a credential. `delete rule.targetUrl` redaction preserved verbatim; `targetEmail` retained with comment.
- **T-22-09** (target_url leak regression): `delete rule.targetUrl` present at line 254; test asserts `targetUrl === undefined` for both webhook and email rules in GET response.
- **T-22-10** (spam-relay): rule create/patch is admin-only, CSRF-protected, behind `alertsWriteLimiter` (existing); recipient format-validated; `isEmailEnabled()` gate + quiet-period suppression bound blast radius (Plan 22-02).

No new network endpoints, auth paths, or schema changes beyond what the plan specifies.

## Self-Check: PASSED

| Item | Status |
|------|--------|
| `listener/src/alerts-router.js` validateTargetEmail | FOUND |
| `listener/src/alerts-router.js` VALID_EMAIL_RE | FOUND |
| `listener/src/alerts-router.js` channel branch in validateCreate | FOUND |
| `listener/src/alerts-router.js` channel-switch clearing in validatePatch | FOUND |
| `listener/src/alerts-router.js` toApiRule channel + targetEmail | FOUND |
| `listener/src/alerts-router.js` GET /rules SELECT includes target_email + channel | FOUND |
| `grep -n "delete rule.targetUrl"` | line 254 FOUND |
| `listener/src/alerts-router.js` POST INSERT 11 params | FOUND |
| `listener/src/alerts-router.js` PATCH map channel + targetEmail | FOUND |
| `listener/src/alerts-router.js` GET /deliveries channel + recipient | FOUND |
| `listener/test/alerts-router.integration.test.js` mock 11-param fix | FOUND |
| commit `473b55d` | FOUND |
| `cd listener && npm test` — 592/592 GREEN | CONFIRMED |
