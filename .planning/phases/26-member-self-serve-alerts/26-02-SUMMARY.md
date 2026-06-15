---
phase: 26-member-self-serve-alerts
plan: 02
subsystem: api
tags: [express, postgres, alerts, auth, idor, session, owner-scoping, email]

# Dependency graph
requires:
  - phase: 26-01
    provides: alert_rules.user_id column + index (migration 0008)
provides:
  - Owner-scoped alerts-router with per-user GET/POST/PATCH/DELETE /rules
  - Inline requireSession guard (any authed session, no admin role required)
  - IDOR-safe PATCH/DELETE (WHERE id=$N AND user_id=$M → 404)
  - Member email recipient lock (server forces target_email to session email)
  - SMTP-off guard (channel=email rejected with 400 when isEmailEnabled() false)
  - createAlertsRouter({ isEmailEnabled }) factory contract for plan 26-03
  - hcSession-aware integration test harness (invoke() + createMockPool with user_id filtering)
affects:
  - 26-03 (wires real isEmailEnabled from emails.js)
  - 26-04 (web frontend - relies on member-writable POST/PATCH/DELETE)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Inline session guard: !req.hcSession?.user_id → 401 in handler body (not separate middleware)"
    - "IDOR-safe WHERE: WHERE id=$N AND user_id=$M → 0 rows → 404 (Phase 23 pattern)"
    - "Factory dep injection: isEmailEnabled = () => true default, 26-03 injects real fn"
    - "Member email lock in handler after validate: override targetEmail when role===member && channel===email"
    - "createMockPool with initialRules: pre-seed rules for IDOR and scoping tests"

key-files:
  created: []
  modified:
    - listener/src/alerts-router.js
    - listener/test/alerts-router.integration.test.js
    - listener/test/alerts-router.test.js
    - listener/test/require-admin-session.test.js

key-decisions:
  - "Inline session guard in handler body (not separate middleware) so test harness (calls .at(-1).handle directly) can exercise auth rejection without Express middleware chain"
  - "Member email lock applied AFTER validate() in handler — validateCreate/validatePatch remain pure (no session context)"
  - "SMTP guard applied BEFORE DB write in both POST and PATCH to fail fast"
  - "require-admin-session.test.js alerts section replaced with route-existence checks — requireAdminSession no longer gating alerts routes"

patterns-established:
  - "TDD deviation: email lock + SMTP guard implemented together with owner-scoping in Task 2; Task 3 adds tests that confirm already-GREEN implementation (no separate RED commit for these features)"

requirements-completed: [MALERT-01, MALERT-02, MALERT-04, MALERT-05, MALERT-06]

# Metrics
duration: 45min
completed: 2026-06-15
---

# Phase 26 Plan 02: Owner-Scoped Alerts Router Summary

**Per-user owner-scoped CRUD on alert_rules with inline session guard, IDOR-safe WHERE id+user_id, member email lock, and SMTP-off rejection via factory-injected isEmailEnabled**

## Performance

- **Duration:** ~45 min
- **Started:** 2026-06-15T11:30:00Z
- **Completed:** 2026-06-15T12:21:21Z
- **Tasks:** 3 (RED + GREEN + email/smtp GREEN)
- **Files modified:** 4

## Accomplishments
- All five alerts-router handlers (GET/POST/PATCH/DELETE /rules, GET /deliveries) now scope queries off `req.hcSession.user_id` — each user sees and manages only their own rules
- Inline session guard on POST/PATCH/DELETE rejects service-token-only callers with 401; members and admins both allowed (replaces `requireAdminSession`)
- IDOR: PATCH/DELETE use `WHERE id=$N AND user_id=$M`; cross-user id access returns 404
- Member email lock: server forces `target_email` to `req.hcSession.email` for member+email rules, regardless of body
- SMTP guard: `channel=email` returns 400 with clear error when `isEmailEnabled()` is false
- Published `createAlertsRouter({ pool, isEmailEnabled = () => true })` factory contract for plan 26-03 to inject the real SMTP check
- Extended hcSession-aware test harness (invoke + createMockPool with initialRules + user_id filtering); 710 listener tests pass

## Task Commits

1. **Task 1 RED: Extend integration harness for hcSession + failing owner-scoping/IDOR/auth tests** - `aca9358` (test)
2. **Task 2 GREEN: Owner-scope all five handlers + auth guard + IDOR** - `2726e25` (feat)
3. **Task 3 GREEN: Member email lock + SMTP-off rejection tests** - `e9d549c` (feat)

## Files Created/Modified
- `listener/src/alerts-router.js` — createAlertsRouter factory with isEmailEnabled dep; all 5 handlers owner-scoped; inline session guards; IDOR-safe WHERE clauses; member email lock; SMTP guard
- `listener/test/alerts-router.integration.test.js` — invoke() extended with hcSession; createMockPool extended with initialRules + user_id filtering; 9 new owner-scoping/IDOR/auth/email/smtp tests
- `listener/test/alerts-router.test.js` — updated invoke() with hcSession; ADMIN_SESSION constant; all POST/GET calls now pass hcSession; mock pool updated for 12-param INSERT
- `listener/test/require-admin-session.test.js` — removed stale member→403 guards for alerts routes (requireAdminSession removed); replaced with route-existence assertions

## Decisions Made
- **Inline session guard (not middleware):** The test harness calls `layer.route.stack.at(-1).handle` (last handler) directly, bypassing Express middleware. To make the no-session 401 test work correctly, the guard runs inline at the top of the async handler.
- **Email lock in handler, not validate:** `validateCreate`/`validatePatch` stay pure (no session context). Override `parsed.value.targetEmail` in the handler after validate, only when `role===member && channel===email`.
- **SMTP guard before DB write:** Checked after validate so channel is known, before pool.query so no partial state is created.
- **Task 3 collapsed to GREEN-only:** Email lock and SMTP guard were implemented together with the owner-scoping in Task 2 (all part of the same handler rewrite). Task 3 writes the confirmation tests — implementation was already in place. Documented as a deviation (TDD sequence compressed).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Test harness invoke() called last handler (not middleware) — requireSession had to move inline**
- **Found during:** Task 2 (GREEN) verification
- **Issue:** The test harness uses `.at(-1).handle` to get the route handler, bypassing Express middleware. Putting `requireSession` as middleware (not the last handler) meant the no-session test got 500 (TypeError) not 401.
- **Fix:** Moved the session guard to the TOP of the async handler body (`if (!req.hcSession?.user_id) return res.status(401).json({...})`), removing the separate `requireSession` middleware function.
- **Files modified:** `listener/src/alerts-router.js`
- **Verification:** "POST /rules no-session: service-token-only caller is rejected 401/403" passes (was 500 TypeError before fix)
- **Committed in:** 2726e25 (Task 2 commit)

**2. [Rule 1 - Bug] alerts-router.test.js had no hcSession — failed 401 after inline guard added**
- **Found during:** Task 2 (GREEN), running full npm test
- **Issue:** `listener/test/alerts-router.test.js` has its own invoke() without hcSession support. After inline guard, all POST calls returned 401.
- **Fix:** Added hcSession support to invoke(); added ADMIN_SESSION constant; updated all POST/GET invocations to pass hcSession; updated createMockPool() to handle 12-param INSERT and WHERE user_id.
- **Files modified:** `listener/test/alerts-router.test.js`
- **Committed in:** 2726e25 (Task 2 commit)

**3. [Rule 1 - Bug] require-admin-session.test.js alerts section tested stale requireAdminSession behavior**
- **Found during:** Task 2 (GREEN), running full npm test
- **Issue:** 5 tests in require-admin-session.test.js expected member→403 and no-session→next() for alerts routes (the OLD `requireAdminSession` behavior). Plan 26-02 changes these routes to accept members and reject no-session with 401.
- **Fix:** Replaced the 5 stale behavior assertions with 3 route-existence checks (route registered = route structure intact). Auth behavior is now tested in alerts-router.integration.test.js.
- **Files modified:** `listener/test/require-admin-session.test.js`
- **Committed in:** 2726e25 (Task 2 commit)

**4. [Rule 1 - Bug] Mock COUNT query detection string changed with new JOIN SQL**
- **Found during:** Task 2 (GREEN) — deliveries test returned total=0
- **Issue:** createMockPool COUNT detection checked `'COUNT(*)::int AS total FROM alert_deliveries'` but the new owner-scoped query has a line break between `AS total` and `FROM alert_deliveries d`.
- **Fix:** Changed to `sql.includes('COUNT(*)::int AS total') && sql.includes('alert_deliveries')`.
- **Files modified:** `listener/test/alerts-router.integration.test.js`
- **Committed in:** 2726e25 (Task 2 commit)

**5. [TDD deviation] Email lock + SMTP guard implemented in Task 2, not Task 3**
- **Found during:** Task 3 (writing RED tests)
- **Issue:** The plan called for Task 3 to be a separate RED→GREEN cycle for email lock and SMTP guard. These features were implemented as part of Task 2 because they live in the same handler blocks being rewritten for owner-scoping. Tests added in Task 3 were immediately GREEN.
- **Fix:** Task 3 was treated as a GREEN-only commit (confirmation tests). All required behaviors (D-08, D-09, MALERT-05, MALERT-06) are implemented and verified.
- **Impact:** TDD sequence compressed for these features; correctness unaffected; all tests pass.

---

**Total deviations:** 5 (4 Rule 1 auto-fixes, 1 TDD sequence compression)
**Impact on plan:** All auto-fixes necessary for test harness compatibility and full suite health. TDD compression is a documentation-only difference; the behaviors are implemented and tested. No scope creep.

## Issues Encountered
None beyond the auto-fixed issues above.

## Known Stubs
None — all five handler behaviors are fully implemented; no placeholder values or TODO stubs introduced.

## Threat Flags
No new threat surface introduced beyond the plan's documented scope:
- SSRF (T-26-SSRF): existing validateWebhookTargetUrl retained unchanged; broader authed audience but still validated
- IDOR (T-26-IDOR): mitigated by WHERE id+user_id
- Owner forgery (T-26-OWNER-FORGERY): mitigated (user_id sourced from session only)
- Email spoofing (T-26-EMAIL-SPOOF): mitigated (member target_email forced to session email)
- SMTP DoS (T-26-SMTP-DOS): mitigated (channel=email rejected when isEmailEnabled() false)

## Next Phase Readiness
- Plan 26-03 can wire the real `isEmailEnabled` from `emails.js` into `createAlertsRouter({ ..., isEmailEnabled })` — the factory contract is ready
- Plan 26-04 (web frontend) can now POST/PATCH/DELETE /rules as any authenticated user — admin-only gate is removed

## Self-Check
- [x] Files exist: `listener/src/alerts-router.js`, `listener/test/alerts-router.integration.test.js`
- [x] Commits: aca9358, 2726e25, e9d549c confirmed in git log
- [x] 710 listener tests passing (npm test exit 0)

---
*Phase: 26-member-self-serve-alerts*
*Completed: 2026-06-15*
