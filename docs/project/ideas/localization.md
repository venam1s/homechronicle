---
title: Localization (English + German, per-user language)
trigger_condition: A user asks for a language, or before a push to attract non-English users — and before the string count grows much further (cost scales with every new hard-coded string)
planted_date: 2026-10-23
---

## Idea

Make the web UI and listener emails translatable (i18next + react-i18next), add a per-user `language` preference in Settings → Appearance, and ship English + German. More languages on request via a translate skill with an Apple Home glossary.

## Status

Design approved 2026-10-17, then parked before any code was written.

- Design: `docs/superpowers/specs/2026-10-17-localization-design.md` (committed)
- Plan: `docs/superpowers/plans/2026-10-17-localization.md` (16 tasks; local only — `plans/` is gitignored)

## Why wait

Not a current priority. No user has asked for a language yet.

## Notes for when it resumes

- Roughly 700–900 strings to extract; about a week of work.
- No database migration: language is a key in the existing `user_preferences` blob.
- Repair guidance moves to stable codes (`setup-router.js` `code` field already exists) so it can be translated.
- Re-check the string count and file list in the plan against the code at that time; the plan was written against main at `a054687`.
