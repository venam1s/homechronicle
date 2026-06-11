---
phase: 21-email-infrastructure-invites-password-reset
plan: "02"
subsystem: security
tags: [password-strength, blocklist, security, tdd]
dependency_graph:
  requires: []
  provides:
    - listener/src/security.js::validatePasswordStrength
    - web/src/lib/strength.js::passwordStrengthTier
    - web/src/lib/strength.js::strengthFeedback
  affects:
    - listener/src/auth-router.js (will import validatePasswordStrength in Plans 05, 06)
    - web/src/pages/AcceptInvitePage.jsx (will import passwordStrengthTier/strengthFeedback in Plan 07)
    - web/src/pages/ResetPasswordPage.jsx (will import strength helpers in Plan 08)
tech_stack:
  added: []
  patterns:
    - Server-authoritative password strength enforcement (NIST 800-63B — length + blocklist only)
    - Inline COMMON_PASSWORDS Set (<200 entries, no external dependency)
    - Client strength tier mirrors server logic for UX only (server re-validates on every route)
key_files:
  created:
    - web/src/lib/strength.js
    - web/src/lib/strength.test.js
  modified:
    - listener/src/security.js
    - listener/test/security.test.js
decisions:
  - "D-14 enforced: no character-class composition rules, min-10 length is the only structural constraint"
  - "D-15 enforced: inline Set, no external file or npm dependency for blocklist"
  - "D-16 enforced: no zxcvbn; 3-tier (weak/fair/strong) at 10-14/15+ char thresholds"
  - "strengthFeedback() uses exact UI-SPEC Copywriting Contract copy strings"
  - "COMMON_PASSWORDS contains 172 unique entries (172 < 200 constraint)"
metrics:
  duration: "~8 minutes"
  completed: "2026-06-11"
  tasks_completed: 2
  tasks_total: 2
  files_changed: 4
---

# Phase 21 Plan 02: Password Strength Primitives Summary

Server-authoritative `validatePasswordStrength()` + inline 172-entry common-password blocklist in `listener/src/security.js`, plus parallel client-only `passwordStrengthTier()` and `strengthFeedback()` in new `web/src/lib/strength.js` for the 3-segment strength meter.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 (RED) | Failing tests for validatePasswordStrength | 62f85aa | listener/test/security.test.js |
| 1 (GREEN) | validatePasswordStrength + COMMON_PASSWORDS | a8626da | listener/src/security.js |
| 2 (RED) | Failing tests for passwordStrengthTier/strengthFeedback | bd691e8 | web/src/lib/strength.test.js |
| 2 (GREEN) | passwordStrengthTier + strengthFeedback | 62afc49 | web/src/lib/strength.js |

## TDD Gate Compliance

Both tasks followed strict RED → GREEN TDD:
- Task 1 RED: `62f85aa` — tests imported non-existent export, confirmed `ERR_MODULE_NOT_FOUND` failure
- Task 1 GREEN: `a8626da` — 29/29 listener security tests pass
- Task 2 RED: `bd691e8` — Vitest reported module-not-found failure
- Task 2 GREEN: `62afc49` — 16/16 vitest strength tests pass

## Verification Results

```
Listener: node --test test/security.test.js
  tests 29, pass 29, fail 0

Web: npx vitest run src/lib/strength.test.js
  Test Files 1 passed (1)
  Tests      16 passed (16)

No zxcvbn in package.json files: PASS
COMMON_PASSWORDS Set.size = 172 (< 200 constraint): PASS
No new imports added to security.js: PASS
No React/zxcvbn imports in strength.js: PASS
```

## Implementation Details

### listener/src/security.js

Added `-- Password strength (PWD-04 / D-14 / D-15) --` section (before existing password/token section):

- `COMMON_PASSWORDS` — module-level `const`, `new Set([...])`, 172 unique entries (NIST/HaveIBeenPwned top-list subset) plus `homechronicle` (self-referential). All lowercase; check uses `password.toLowerCase()`.
- `validatePasswordStrength(password)` — `export function`, returns `{ ok: boolean, error?: string }`. Guards: non-string → "Password is required."; length < 10 → "Password must be at least 10 characters."; blocklist hit → "That password is too common. Choose a less predictable passphrase."; else `{ ok: true }`.

### web/src/lib/strength.js

New file, zero imports, two named exports:

- `passwordStrengthTier(password)` — returns `'weak' | 'fair' | 'strong'` per UI-SPEC thresholds: weak = empty OR <10 chars OR blocklisted; fair = 10-14 chars; strong = 15+ chars.
- `strengthFeedback(password)` — returns exact UI-SPEC Copywriting Contract copy: "At least 10 characters required" / "That password is too common. Choose something more unique." / "Fair — try a longer passphrase" / "Strong".
- Embeds `CLIENT_COMMON_PASSWORDS` representative subset (UX-only per T-21-02-BLOCK accept disposition).

## Deviations from Plan

None — plan executed exactly as written.

## Threat Model Coverage

| Threat ID | Disposition | Status |
|-----------|-------------|--------|
| T-21-02-WEAK | mitigate | MITIGATED — validatePasswordStrength() is server-authoritative (min 10 + blocklist) |
| T-21-02-BLOCK | accept | ACCEPTED — client meter is bypass-able; server re-validates on every password-set route (Plan 21-05) |

## Known Stubs

None — this plan produces standalone primitives with no data sources required.

## Threat Flags

None — no new network endpoints, auth paths, or file access patterns introduced. Pure in-process validation functions.

## Self-Check: PASSED

- `listener/src/security.js` modified with validatePasswordStrength export: FOUND
- `web/src/lib/strength.js` created with passwordStrengthTier and strengthFeedback: FOUND
- `listener/test/security.test.js` extended in place: FOUND
- `web/src/lib/strength.test.js` created: FOUND
- Commit 62f85aa (test RED listener): FOUND
- Commit a8626da (feat GREEN listener): FOUND
- Commit bd691e8 (test RED web): FOUND
- Commit 62afc49 (feat GREEN web): FOUND
