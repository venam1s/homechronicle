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

BETA_SYNC_EXCLUDED_TABLES="users sessions invites password_reset_tokens user_preferences"

# Migrations beta has run but prod may not have yet, that alter a table the
# sync overwrites from prod (here alert_rules' operator CHECK). The restore
# brings that table back in prod's shape, so these must NOT be re-stamped from
# beta's pgmigrations history after the restore: left un-stamped, the beta
# listener (which starts only after db-sync completes) replays them. Each one
# listed here must be idempotent. Once prod has run them, prod's own
# pgmigrations rows cover them and the entries are harmless.
BETA_SYNC_REPLAY_MIGRATIONS="0009_alert_threshold_operators 0010_alert_quiet_operator"

# beta_sync_replay_sql_list — BETA_SYNC_REPLAY_MIGRATIONS as a quoted SQL list
# for `NOT IN (...)`, e.g. '0009_x','0010_y'; '' when the list is empty.
beta_sync_replay_sql_list() {
  _list=""
  for _m in $BETA_SYNC_REPLAY_MIGRATIONS; do
    _list="${_list:+$_list,}'${_m}'"
  done
  printf '%s' "${_list:-''}"
}

# beta_sync_exclude_flags — prints the concatenated
# `--exclude-table=public.<table>` flags for BETA_SYNC_EXCLUDED_TABLES on
# stdout, space-separated, ready to splice into a pg_dump argument list.
# No `local` (not POSIX) — uses `_t` / `_flags` prefixed temporaries instead.
beta_sync_exclude_flags() {
  _flags=""
  for _t in $BETA_SYNC_EXCLUDED_TABLES; do
    # Exclude the table AND its BIGSERIAL sequence. `--exclude-table` matches the
    # exact name only, so the sequence would otherwise still be dumped and the
    # `--clean` restore would emit `DROP SEQUENCE public.<t>_id_seq`, which fails
    # with "cannot drop sequence ... because other objects depend on it" (beta's
    # own <t>.id default depends on it) and aborts the whole single-transaction
    # restore. Seen nightly on beta 2026-08-26 → 08-29 (users_id_seq). A pattern
    # that matches nothing (user_preferences has no sequence) is ignored by
    # pg_dump unless --strict-names is given.
    _flags="$_flags --exclude-table=public.${_t} --exclude-table=public.${_t}_id_seq"
  done
  printf '%s' "$_flags"
}

# alert_rules / alert_deliveries are deliberately NOT excluded: they are real data
# beta should show, and excluding alert_deliveries leaves beta's copy holding an
# FK onto event_logs so `--clean` cannot drop event_logs_pkey (seen 2026-08-30).
# The only problem they carry is alert_rules.user_id -> users(id) (migration 0008):
# users is excluded, so prod owner ids would not exist in beta and the dump's
# post-data `ADD CONSTRAINT alert_rules_user_id_fkey` would fail validation.
# Strip that one FK from the dump stream, then null the owners and re-add the
# constraint inside the same restore transaction.

# Filter for the pg_dump stream: drop any `ALTER TABLE ONLY public.<t>` +
# `ADD CONSTRAINT ... REFERENCES public.users(` pair (pg_dump emits FKs on two
# lines) and, defensively, any single-line form. POSIX/BusyBox sed compatible.
beta_sync_strip_user_fks() {
  sed -E \
    -e '/^ALTER TABLE ONLY public\.[a-z_]+$/{N;/REFERENCES public\.users\(/d;}' \
    -e '/ADD CONSTRAINT .*REFERENCES public\.users\(/d'
}

# SQL to append to the restore stream (same --single-transaction) after the dump.
# Everything MUST be schema-qualified: pg_dump starts its stream with
# `SET search_path = ''`, so an unqualified `alert_rules` fails with
# 'relation "alert_rules" does not exist' (seen 2026-08-30 16:09Z).
beta_sync_post_restore_sql() {
  printf '%s\n' \
    'UPDATE public.alert_rules SET user_id = NULL WHERE user_id IS NOT NULL;' \
    'ALTER TABLE public.alert_rules DROP CONSTRAINT IF EXISTS alert_rules_user_id_fkey;' \
    'ALTER TABLE public.alert_rules ADD CONSTRAINT alert_rules_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;'
}
