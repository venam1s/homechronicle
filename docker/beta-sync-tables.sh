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

# Tables beta owns outright and the sync never touches, on top of the excluded
# ones: beta's migration history must describe beta's own schema. (_migrations
# is the pre-node-pg-migrate history table; nothing reads it any more.)
BETA_SYNC_BETA_OWNED_TABLES="pgmigrations _migrations"

# DATA-ONLY SYNC (2026-10-25). The sync copies prod's ROWS into beta's own
# tables; it never copies prod's schema. Beta's tables, constraints and
# pgmigrations always come from beta's own migrations, so beta can run a newer
# schema than prod (new columns get their defaults, widened CHECKs accept prod's
# rows) with no migration replay and no out-of-order migration runs. A future
# migration that renames or drops a column, or tightens a constraint prod's rows
# break, makes the restore fail inside its single transaction: beta is left as
# it was and the failure is logged (fail_or_skip / SYNC_REQUIRED).

# beta_sync_exclude_flags — prints the concatenated
# `--exclude-table=public.<table>` flags for the excluded and beta-owned
# tables on stdout, space-separated, ready to splice into a pg_dump argument
# list. Each table's `<t>_id_seq` is excluded too, so its setval() is not
# dumped over beta's own sequence. A pattern that matches nothing (e.g.
# user_preferences has no sequence) is ignored by pg_dump unless
# --strict-names is given. No `local` (not POSIX) — `_t` / `_flags` temporaries.
beta_sync_exclude_flags() {
  _flags=""
  for _t in $BETA_SYNC_EXCLUDED_TABLES $BETA_SYNC_BETA_OWNED_TABLES; do
    _flags="$_flags --exclude-table=public.${_t} --exclude-table=public.${_t}_id_seq"
  done
  printf '%s' "$_flags"
}

# beta_sync_tables_to_copy PROD_TABLES — from a whitespace-separated list of
# prod's public tables, print the ones the sync copies (everything except the
# excluded and beta-owned tables), space-separated.
beta_sync_tables_to_copy() {
  _out=""
  for _t in $1; do
    case " $BETA_SYNC_EXCLUDED_TABLES $BETA_SYNC_BETA_OWNED_TABLES " in
      *" $_t "*) ;;
      *) _out="${_out:+$_out }$_t" ;;
    esac
  done
  printf '%s' "$_out"
}

# SQL to run in the restore transaction BEFORE the data-only dump. Everything
# MUST be schema-qualified: pg_dump's stream sets `search_path = ''`.
#   - alert_rules.user_id -> users(id) (migration 0008): users is beta's own, so
#     prod's owner ids would fail the FK as each row is copied. Drop it here and
#     re-add it after (beta_sync_post_restore_sql) with owners nulled.
#   - TRUNCATE the tables about to be reloaded. Deliberately NO CASCADE: if a
#     table the sync must not touch references one of these, the TRUNCATE fails
#     and the whole restore rolls back instead of silently emptying it.
beta_sync_pre_restore_sql() {
  _tables=""
  for _t in $1; do
    _tables="${_tables:+$_tables, }public.${_t}"
  done
  printf '%s\n' 'ALTER TABLE public.alert_rules DROP CONSTRAINT IF EXISTS alert_rules_user_id_fkey;'
  [ -n "$_tables" ] && printf 'TRUNCATE TABLE %s;\n' "$_tables"
  return 0
}

# SQL to append to the restore stream (same --single-transaction) after the dump.
beta_sync_post_restore_sql() {
  printf '%s\n' \
    'UPDATE public.alert_rules SET user_id = NULL WHERE user_id IS NOT NULL;' \
    'ALTER TABLE public.alert_rules ADD CONSTRAINT alert_rules_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;'
}
