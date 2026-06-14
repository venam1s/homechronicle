# Phase 25 — Discussion Log (Per-User Quiet Hours)

**Date:** 2026-06-14
**Mode:** discuss (standard). User selected all 4 gray areas; accepted all 4 recommendations.

## Area 1 — Endpoint per-user source
- Options: (A) server reads session user's blob, shared fallback [recommended]; (B) client passes params.
- **Chosen: A.** `GET /stats/quiet-hours` becomes session-aware, reads `user_preferences` JSONB for
  `req.hcSession.user_id`; service-token / `AUTH_ENABLED=false` → shared config. (→ D-25-01)

## Area 2 — Fallback granularity
- Options: (A) whole-config fallback [recommended]; (B) per-field fallback.
- **Chosen: A.** No quiet-hours keys in blob → use shared entirely; cleanly covers existing
  Phase-24 users with non-empty blobs. (→ D-25-02)

## Area 3 — Seeding continuity
- Options: (A) fallback covers it; prefill SettingsTab form on edit [recommended]; (B) add quiet-hours
  to seedIfEmpty.
- **Chosen: A.** No special seeding (seedIfEmpty only fires on empty blob; existing users are
  non-empty). Fallback keeps them on shared until they save their own. (→ D-25-03)

## Area 4 — Excluded accessories vs muted devices
- Options: (A) keep separate [recommended]; (B) unify.
- **Chosen: A.** `quietHoursExcludedAccessories` and `mutedDevices` stay distinct per-user keys. (→ D-25-04)

## Claude's discretion noted
- SQL shape for the per-user read (separate SELECT vs JOIN/CTE).
- The canonical "has quiet-hours config" presence predicate (consistent endpoint+UI).
- **Flagged risk:** the `cached()` stats wrapper must be keyed by `user_id` (or bypassed) for the
  now per-user quiet-hours result, or one user's config leaks into another's cached response.

## Deferred / scope creep
- None raised. Multiple windows / schedules / quiet-hours notifications remain out of scope.
