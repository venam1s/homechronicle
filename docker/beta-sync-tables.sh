#!/bin/sh
#
# beta-sync-tables.sh — single source of truth for the tables excluded from
# every prod→beta pg_dump. Both sync paths source (`.`) this file — it is
# NEVER executed directly:
#   - docker/beta-db-sync.sh   (in-container, busybox ash, bind-mounted read-only)
#   - scripts/sync-prod-to-beta.sh (host, bash, run by cron / deploy-beta.sh)
#
# POSIX sh ONLY (no arrays, no `[[ ]]`, no `local`) — postgres:16-alpine's
# busybox ash must be able to source this without a bash-only construct
# tripping it up. Verified to parse under both `sh -n` and `bash -n`.
#
# Why each table is excluded:
#   - users, sessions, invites, password_reset_tokens — the Phase 20/21 auth
#     tables. Prod predates them and has its own account set; overwriting
#     beta's accounts from prod every sync would sign every beta tester out
#     and hand prod's password/reset state to a database that never issued it.
#   - user_preferences (migration 0007) — user_preferences.user_id REFERENCES
#     users(id). Prod's rows point at prod user ids that do not exist in beta's
#     users table, so restoring this table would violate the FK the moment
#     users itself is excluded (as it must be, above).
#   - alert_rules (migration 0008) — alert_rules.user_id REFERENCES users(id),
#     backfilled to the lowest-id admin at migration time. Same FK problem as
#     user_preferences: prod's user_id values do not exist in beta's users.
#   - alert_deliveries — alert_deliveries.rule_id is a NOT NULL FK to
#     alert_rules(id) (0001_baseline.sql:66). Keeping alert_deliveries while
#     excluding alert_rules recreates the exact same FK failure one table over,
#     so it must be excluded alongside alert_rules.
#
# Design decision — exclude alert_rules/alert_deliveries rather than NULL
# alert_rules.user_id after restore: pg_dump emits FK constraints in the
# *post-data* section of the dump, so `ALTER TABLE alert_rules ADD CONSTRAINT
# ... FOREIGN KEY (user_id) REFERENCES users(id)` is validated *before* the end
# of the piped stream. An UPDATE appended after the dump runs too late — by
# then ON_ERROR_STOP has already aborted the transaction on the invalid FK.
# Suppressing the check would require `session_replication_role = replica`,
# which needs superuser and is not available to the sync role. Excluding the
# table is the only restore-order-independent fix.
#
# Trade-off: beta no longer mirrors prod's alert rules or delivery history —
# it keeps its own, independently created rules. Side benefit: beta can no
# longer inherit and re-fire webhooks aimed at prod's real (e.g. paging/
# notification) targets, since it never receives prod's alert_rules rows.

BETA_SYNC_EXCLUDED_TABLES="users sessions invites password_reset_tokens user_preferences alert_rules alert_deliveries"

# beta_sync_exclude_flags — prints the concatenated
# `--exclude-table=public.<table>` flags for BETA_SYNC_EXCLUDED_TABLES on
# stdout, space-separated, ready to splice into a pg_dump argument list.
# No `local` (not POSIX) — uses `_t` / `_flags` prefixed temporaries instead.
beta_sync_exclude_flags() {
  _flags=""
  for _t in $BETA_SYNC_EXCLUDED_TABLES; do
    _flags="$_flags --exclude-table=public.${_t}"
  done
  printf '%s' "$_flags"
}
