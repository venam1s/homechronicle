# Localization (i18n) — Design

**Date:** 2026-10-17
**Status:** Approved 2026-10-17 — **parked 2026-10-23** (see `docs/project/ideas/localization.md`)

## Intent

HomeChronicle is trying to attract users beyond its author. A non-English
speaker landing on the project today sees an English-only UI with no way to
change it. This design makes the product *translatable* now — while the UI is
still small enough (~80 components; roughly 700–900 strings once attribute
strings, ternaries and template literals are counted) to convert in about a
week — and ships English plus one complete, well-maintained second language
(German) as proof the system works. Further languages are added on request,
cheaply, because the plumbing exists.

Why German: it is the largest non-English HomeKit/homelab community, LTR,
Latin script, and its ~30% longer strings are a good stress test for layouts.

Why not five languages at launch: each shipped language is a maintenance
promise on every release. One complete translation looks professional; five
partial ones look abandoned.

## Goals

- Every string a user reads in the web UI comes from a locale file, not source.
- A signed-in user picks their language; it follows them across devices.
- Dates, times, relative times ("3 minutes ago") and numbers follow the chosen
  language.
- Emails the listener sends (invite, password reset, alert) arrive in the
  language of the user they are for (see *Listener* for who that is per email).
- Ship with `en` (source) and `de` (complete).
- Untranslated or missing strings are caught by tooling, not by users.
- Adding a language is a documented, file-only change a contributor can make.

## Non-goals

- Translating the docs site (`docs/`), `CHANGELOG.md`, or in-app changelog
  (`web/src/changelog.js`). English.
- Translating webhook payloads, log lines, audit log.
- Translating generic listener error messages (`err.message` surfaced in
  toasts and inline errors, ~9 call sites). These stay English and this is a
  **documented gap**; see *Server-originated text* below for what *is* done.
- Translating user data: accessory names, room names, rule names, notes.
- Right-to-left languages. No layout audit for RTL in this work.
- **Units of measure.** `°C`, `kPa`, `lux`, `W` are hard-coded in
  `describeChange()`. A US user wants `°F`; that is a *units* preference, not a
  language one, and is deferred to its own follow-up. This design must not make
  that follow-up harder (keep unit strings in one place).

## Anti-goals (what would make this a failure)

- A mixed-language UI: German with English fragments leaking through.
- Breaking the 70 existing web test files that assert on English text.
- A database migration. None is needed and none should be added.
- Anything a user cannot undo by switching back to English.

## Constraints

- Backward compatible: older builds ignore the new preference key; the
  `user_preferences` JSONB blob is merged per-key server-side (D-05), so an old
  client cannot clobber it.
- Auth-off installs (no users) must keep working with zero server calls, like
  theme does today (`usePreference` anonymous path).
- Must work in the standalone single-container image and the 3-service compose
  without configuration.
- ES modules; no TypeScript; existing code conventions (`CLAUDE.md`).
- Recoverable at every step: feature branch, one commit per phase, no schema
  change, locale files are additive.

## Decisions

### Language preference (per user)

- Preference key `language` in the existing per-user prefs blob, values
  `'system' | 'en' | 'de'` (plus `'pseudo'` in dev builds only). Default
  `'system'`.
- Stored and read via the existing `usePreference('language', 'system',
  { localStorageKey: 'hc-language', identity codecs })`, so authed users get
  server persistence + cross-device sync and anonymous users get localStorage,
  with no new code paths.
- `'system'` resolves to the first entry of `navigator.languages` whose base
  tag (`de-AT` → `de`) is a supported locale, else `en`.
- Picker lives in Settings → **Appearance** (`SettingsPage.jsx`), as a new
  row under Theme, using the same segmented radio-row style as `THEME_OPTIONS`
  in `AppearanceSection.jsx`: System / English / Deutsch. Each language's label
  is written in that language (endonym), never translated. The `pseudo` option
  is shown only when `import.meta.env.DEV && import.meta.env.MODE !== 'test'`
  so it does not appear in Vitest renders.
- localStorage key `hc_language`, registered in `D12_KEYS`
  (`web/src/lib/prefKeys.js`) with the raw codec, so it behaves exactly like
  theme: seeded into the server blob on first sign-in, purged on logout. (My
  call: following the existing per-user-key convention beats inventing a third
  lifecycle; a shared device returns to the browser language after logout.)
- On change: i18next `changeLanguage()`, `<html lang>` updated, date-fns
  locale swapped. No reload.

### Web library and layout

- `i18next` + `react-i18next` (`useTranslation()` hook, global instance via
  `initReactI18next` — no provider wrapping required, which keeps test friction
  low) + `i18next-browser-languagedetector` is **not** used; the resolution
  above is simpler and already owned by the preference hook.
- `web/src/i18n/index.js` initialises i18next once. **Both `en` and `de` are
  bundled statically** (each ~20–40 KB; my call — with one extra locale, a
  lazy chunk buys nothing and adds a visible English→German flash plus
  `changeLanguage` ordering concerns). Switch to `import()` per locale only
  when a third language lands.
- Initial language is resolved **before React mounts**, in the same
  pre-React pattern as `web/public/theme-init.js`: read `hc_language` from
  localStorage, resolve `'system'` against `navigator.languages`, set
  `<html lang>` and i18next's initial language. An authed user on a brand-new
  device still sees one flip when `['me','preferences']` resolves — the same
  behaviour theme/palette have today, accepted.
- One file per language: `web/src/i18n/locales/<lang>.json`. Semantic,
  area-prefixed keys, nested one level by area:
  `common.*`, `nav.*`, `dashboard.*`, `timeline.*`, `events.*`,
  `accessories.*`, `setup.*`, `settings.*`, `alerts.*`, `auth.*`, `account.*`,
  `toast.*`, `errors.*`. No natural-language keys.
- Plurals use i18next's `_one` / `_other` suffix convention (backed by
  `Intl.PluralRules`). Interpolation `{{name}}`. Never concatenate translated
  fragments.
- `events.*` holds everything `web/src/lib/icons.js` produces today
  (`SERVICE_LABELS`, `describeChange`, `describeBeforeAfter`, `formatGap`,
  `humanizeCharacteristic` fallback). These functions become
  `describeChange(t, characteristic, newValue)` style — they take the `t`
  function as the first argument rather than importing i18next, so they stay
  pure and unit-testable. Unit suffixes (`°C`, `% RH`, `lux`, `kPa`, `W`, `K`)
  go through keys under `events.units.*` so the deferred units work has a
  single seam.
- Formatting: a `useFormatters()` hook in `web/src/i18n/useFormatters.js`
  returns `{ formatDate, formatTime, formatDateTime, formatRelative,
  formatNumber, formatPercent, hourCycle }` built on `Intl.DateTimeFormat` /
  `Intl.NumberFormat` / `date-fns`. All 13 files that call `toLocale*String`,
  all 14 that call date-fns `format()`, and the 17 `formatDistanceToNow`
  calls switch to it.
- **Formatting locale ≠ UI language tag** (my call). The formatting locale is
  the browser's full tag (`navigator.language`, e.g. `en-GB`, `de-AT`) when
  its base language matches the active UI language; otherwise the UI
  language's default region (`en` → `en-US`, `de` → `de-DE`). So a UK user who
  picks English keeps 24-hour clock and DD/MM, a German user gets `1.234,5`,
  and nobody is silently moved to en-US. `web/src/lib/hours.js` (12-hour axis
  labels like "11 PM") takes `hourCycle` from the same source, so German axes
  read `23`. Explicit date-fns format strings (`'MMM d, HH:mm'`) are replaced by
  `Intl` option objects so order and separators follow the locale; where a
  chart axis needs a compact fixed pattern it may keep date-fns `format` with
  the locale passed.
- Recharts tooltips, axis tick formatters, and panel titles in
  `web/src/lib/dashboardPanels.js` read via `t` as well; dashboard panel
  registry titles become keys, resolved at render.

### Listener (emails)

- No library. `listener/src/i18n/index.js` exports `t(lang, key, vars)` over
  plain-object dictionaries `listener/src/i18n/en.js`, `listener/src/i18n/de.js`
  (~15 strings: invite and reset subject/heading/body/CTA/footer, alert email
  field labels). Unknown lang → `en`; unknown key → key.
- `resolveUserLanguage(pool, userId)` reads
  `user_preferences.prefs->>'language'`; `'system'`, null, or unsupported →
  `'en'`. (The server cannot see the browser's language; `'system'` means
  English for email.)
- Invite email: language of the **inviter** (`req.hcSession.user_id`), since
  the invitee has no account. Password reset: the target user's language.
  Alert email: the **rule owner's** language (`alert_rules.user_id`) —
  `target_email` is a free-form address with no account behind it, so the
  owner is the only resolvable choice; `NULL` owner → `en`. The
  `processAlertsForEvent` query in `alerts.js` must select `user_id` (today it
  does not).
- The email functions are not called by routers directly: `index.js` injects
  2-argument wrappers (`sendInvite: (to, url) => …`, `sendPasswordReset`,
  `sendTestEmail`). Those wrappers and the router deps gain the `lang`
  argument; `renderEmailLayout` sets `<html lang>` from it instead of the
  hard-coded `"en"`.
- Alert email **body** stays the technical label/value table; only the labels
  (`Rule`, `Accessory`, `Room`, `Characteristic`, `Change`, `Time`) translate.
  Characteristic names and values stay raw because the rule was authored on
  them. Subject keeps the `[HomeChronicle]` prefix.
- `sendInvite`, `sendPasswordReset`, `sendAlertEmail` gain a `{ lang }`
  option, default `'en'`, so every existing call site and test stays valid.

### Server-originated text

Some text the web shows is composed by the listener. Three kinds:

1. **Repair guidance** — multi-sentence instructions from
   `listener/src/setup-router.js` (`guidance`, ~243–311) rendered by
   `RepairFlow.jsx`. A user is expected to read and act on this; English
   paragraphs inside a German UI would be the worst mixed-language case.
   **Decision: translate it.** `setup-router.js` returns a stable
   `guidanceCode` (one per existing guidance branch) alongside the structured
   fields it already has, and keeps the English `guidance` string for old
   clients. The web renders `setup.repair.<guidanceCode>` from the locale
   files, falling back to the raw `guidance` string if the code is unknown.
   Additive API change; `setup-router` integration tests assert on the code.
2. **Anomaly `message`** (`AnomalyPanel.jsx` fallback) — composed from
   characteristic/accessory names; builder decides whether the web can
   compose it from structured fields already in the response. If so, do that.
3. **Generic `err.message`** in toasts/inline errors — stays English
   (non-goal, documented gap). The surrounding chrome ("Could not save rule")
   is translated; only the detail line is English.

### Guardrails

- **Pseudo-locale (dev only).** When `import.meta.env.DEV`, a `pseudo`
  option appears in the picker; an i18next post-processor wraps every `t()`
  result as `[ḓȧşħƀǿȧřḓ·····]` (accented, ~35% padded, bracketed). Any plain
  English on screen in pseudo mode is a missed string. Not present in
  production bundles.
- **Locale completeness test.** `web/src/i18n/locales.test.js` flattens every
  shipped locale and asserts key-set equality with `en`, naming the missing
  and extra keys. A new string without a German translation fails CI.
- **Extraction check.** `i18next-parser` configured at `web/i18next-parser.config.js`
  scanning `src/**/*.{js,jsx}` with `keepRemoved: true` (my call: the
  dashboard panel registry and `events.<characteristic>` lookups are dynamic
  keys the lexer cannot see, and deleting them on every run would make the
  check useless). `npm run i18n:extract` adds new keys to `en.json`
  (empty-string value) and CI runs it with `--fail-on-update`, so a `t('key')`
  missing from `en.json` fails the build. Dead-key detection is *not* a
  property of this guardrail; the completeness test covers `de` ⊆ `en`.
- **Length audit.** German strings are ~30% longer. Before the German locale
  ships, a visual pass of every tab at 390 px and desktop in `de`, both themes,
  using the existing `ui-theme-auditor` agent / Playwright flow, specifically
  the masthead tabs, dashboard panel titles, button rows, and the
  house-summary row (see memory: font-size tokens render 16 px).
- `<html lang>` is always set to the active language so screen readers and
  hyphenation behave.

### Tests

- `web/src/test/setup.js` imports `../i18n/index.js` so i18next is initialised
  with the real `en` bundle in every test. Existing `getByText('Light')`-style
  assertions keep passing unchanged. Tests that need another language call
  `i18n.changeLanguage('de')` and reset in `afterEach`.
- `icons.test.js` passes a real `t` bound to `en`.
- Listener: `listener/test/i18n.test.js` covers fallback rules and the three
  email functions in `de`; existing email tests unchanged (default `en`).

### Contributor workflow

- `CONTRIBUTING.md` gains an "Adding a language" section: copy `en.json` to
  `<lang>.json`, add the lang to `SUPPORTED_LOCALES` and the date-fns locale
  map, add the endonym to the picker, add `listener/src/i18n/<lang>.js`, run
  `npm test`. Nothing else.
- A project-local skill `.claude/skills/translate-locale/SKILL.md` holds the
  per-language glossary (Apple Home app terminology: *Accessory* → *Zubehör*,
  *Room* → *Raum*, *Scene* → *Szene*, *Bridge* → *Bridge*, *Home* → *Zuhause*,
  …) and the rule "fill keys present in `en` and missing in `<lang>`; never
  change existing translations without being asked". This is how new
  languages get generated on request.

### Rollout (one commit per phase, feature branch)

1. Infra: libraries, `i18n/index.js`, `useFormatters`, pseudo-locale,
   completeness test, extraction config, test setup, language picker wired to
   the preference (shows System / English only; `de` not yet present).
2. App shell, nav, `common.*`, `toast.*`, `errors.*`, Settings tabs.
3. Dashboard panels and charts (incl. `dashboardPanels.js`, Recharts
   formatters).
4. Timeline + events (`icons.js`, `episodes.js`, `EventRow`, `SceneGroup`,
   `AnomalyPanel`).
5. Accessories + Setup/Manage (pairing, Matter, retention, rooms).
6. Auth, account, alerts UI.
7. Listener emails + language resolution (+ repair-guidance codes if chosen).
8. German locale (web + listener), length audit, `Deutsch` appears in picker,
   CONTRIBUTING section, translate skill.

Phases 2–6 are independent of each other once phase 1 lands and can run in
parallel worktrees. Pseudo-locale is the acceptance check for each: every
screen in the phase's area shows no plain English.

Nothing in phases 1–7 changes what an English user sees. Phase 8 is the only
user-visible change (a new option in the picker).

## Left to the builder

- Exact key names within each area; whether `common.*` holds shared verbs
  (Save, Cancel, Delete) — yes, but the split is the builder's.
- Whether lazy-loading `de` needs a loading state (probably not: switching is
  rare; resolve the import before `changeLanguage()`).
- Which Recharts tick formats keep date-fns and which move to `Intl`.
- How the German glossary is seeded (the author can draft; the translate skill
  owns it afterwards).
- Order of phases 2–6.

## Open questions resolved during brainstorming

- Per-install vs per-user language → **per user** (follows the existing prefs
  blob; invite from a German admin can still yield an English UI for the guest).
- Which languages → **en + de** now; others on request via the translate skill.
- Wait for demand? → No for the plumbing (cost grows with every new string);
  yes for languages beyond German.
- Repair guidance text → **translated** via `guidanceCode` (author chose this
  over accepting English, since it is the text users most need to read).
