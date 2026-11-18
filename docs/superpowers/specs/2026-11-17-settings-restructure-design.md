# Settings restructure and a standard settings row

**Date:** 2026-11-17
**Status:** Approved 2026-11-17. The Alerts top-bar option is deferred and not part of the build.

## Intent

Make every setting in the app look and behave the same way, and make each one
findable in one obvious place. Settings keeps its left rail, but the
Configuration section and its inner tabs are dissolved into rail pages grouped
by who the setting belongs to. Every setting is drawn with one shared row
component.

### Why

The user's words about Settings, Appearance: "this takes up too much space and
inconsistent with other settings views. Can we standardize on a settings view?"
Then, wider: "of all the settings and with devices, does it make sense to
redesign everything and condense places? or is the current layout structurally
sound."

What the code shows today:

- **Appearance** renders Theme, Units and Date as three separate cards with one
  control each. Its text uses `text-hc-label` and `text-hc-caption`, which
  render at 16px because the hc font-size tokens are broken (see Constraints).
  The cards are both structurally oversized and typographically oversized.
- **Configuration** (`web/src/components/setup/SettingsTab.jsx`, 1,046 lines)
  is a third level of navigation: top bar, left rail, inner tabs. Its tabs are
  Device Management (2 settings), Data management (retention, alert defaults,
  quiet hours, timeline grouping), Toast (5 settings) and Advanced.
- **Rows are hand-rolled.** About twenty copies of a bordered box inside a
  card, raw browser checkboxes followed by the text "On" / "Off", descriptions
  sometimes above the label and sometimes below.
- **Personal and household settings are mixed.** Toasts, timeline grouping and
  quiet hours are per-user when signed in (they write to the preferences blob)
  but sit next to admin-only household settings.
- **Members see household settings they cannot change.** The web shows
  retention, repair, auto-scan and alert defaults to every signed-in user, but
  the server guards `PATCH /api/setup/retention`, `/repair` and `/alerts` with
  `requireAdminSession`. A member's change to auto-scan or archive fails with
  "Failed to save setting". A member's change to the repair toggle, the repair
  hour or either alert-default number fails with no message at all.
- **Save-on-change behaves three different ways** (see Saving).
- **Settings is wider than its neighbours.** It uses the default page container
  (`max-w-6xl`, 1152px) while Devices and Alerts use `narrow` (`max-w-4xl`), so
  a label and its control sit far apart.

The top-level pages, the Devices page (Browse / Add / Manage) and the Settings
left rail are structurally sound and stay.

## Goals

- One row design for every setting in Settings: label and description left,
  control right, hairline between rows, no box inside a box.
- No inner tabs anywhere in Settings. Two levels of navigation, not three.
- Settings grouped by owner: yours, this home's.
- A member never sees a control the server will refuse.
- Appearance shows Theme, Temperature and the top-bar options as rows of one
  card, with Palette as the only other card on the page.
- Settings content column has a readable maximum width.
- Light and dark, all twelve palettes, desktop and phone widths all correct.

## Non-goals

- No change to the five top-level pages or to the Devices page structure.
- No change to what any setting does, where it is stored, or any API. How a
  save is confirmed and how a failed save is handled does change (see Saving).
- No redesign of forms and tables that are not setting rows: Users panel, SMTP
  form, Change password form, Active sessions list, the Danger Zone lists, the
  Palette grid. They keep their layout and gain only the shared page width.
- No fix for the hc font-size tokens app-wide (see Constraints).
- No move of alert defaults onto the Alerts page or of repair/auto-scan onto
  Devices. The user chose to keep them in Settings and link to them.

## Anti-goals

- A typo in a number field must never change retention. Lowering retention
  deletes or archives data at the next sweep.
- No behaviour covered by an existing test may be dropped because its test
  lived in a file that got split. The per-user blob paths in
  `SettingsTab.blob.test.jsx` matter most.
- Hiding something from the top bar must never read as "this is switched off"
  when it is still running.

## Constraints

- **hc font-size tokens are broken.** `web/src/index.css` declares them as
  `--font-size-hc-*`, a namespace Tailwind v4 ignores, so `text-hc-label`,
  `text-hc-body` and `text-hc-caption` produce no size and inherit 16px. Two
  dashboard panels have pinned heights calibrated to that rendering, so the fix
  is its own piece of work. The new row components therefore use `text-sm` and
  `text-xs`, which is what Configuration uses today and what renders at the
  intended 14px and 12px. The type choice lives only in the row components, so
  a later token fix is a one-place change.
- **Earlier decision, kept:** the hybrid auto-save design
  (`2026-03-28-hybrid-auto-save-settings-design.md`) says constrained controls
  save on change and typed numbers need an explicit save, "to avoid accidental
  destructive changes (e.g., setting retention days to 1)". This design keeps
  that rule and changes only where the explicit save lives.
- **Earlier decision, kept:** MALERT-07 removed the household-wide, admin-only
  alerts gate because members could not enable it and the Alerts nav never
  appeared for them. Nothing here may bring back a household gate.
- Theme colours and room colours stay separate concepts. No new colours.
- Another Claude session may share the checkout. Commit only files this work
  touched, by explicit path.

## Approaches

1. **Quick fold.** Merge Theme/Units/Date into one card using Configuration's
   existing row markup. Cheapest. Copies the box-in-a-box look and the
   duplication, and fixes nothing outside Appearance.
2. **Row component plus regrouping (picked).** Build one settings row, rebuild
   Appearance on it, then dissolve Configuration into rail pages grouped by
   owner. Fixes the space problem and the cause of the inconsistency. Leaves
   the pages, the rail and Devices alone.
3. **Full redesign** of settings and devices together. Rejected: the page-level
   structure works. The problems are one overloaded section and the row level.

A second choice sat inside approach 2: controls that are split between
Settings and another page (alert defaults vs the Alerts page; repair schedule
and auto-scan vs Devices, Manage). Either move them to where the work happens,
or keep them in Settings and link both ways. **The user picked: keep them in
Settings and add links.** Alerts and Devices stay about rules and accessories.

## Design

### Navigation

Left rail on desktop, with two labelled groups. On phones the existing
`<select>` stays and gains matching `<optgroup>`s.

```
YOU
  Appearance
  Preferences
  Account            auth on only
THIS HOME            admin, or auth off
  General
  Users & email      auth on + admin
  Advanced
About
```

| Viewer | Sees |
|---|---|
| Auth off (sole operator) | Appearance, Preferences, General, Advanced, About |
| Auth on, admin | everything |
| Auth on, member | Appearance, Preferences, Account, About |

Hiding "This home" from members is a behaviour change (the author's call,
see Calls). Today they see those controls and every save fails.

Section ids: `appearance`, `preferences`, `account`, `general`, `admin`,
`advanced`, `about`. Settings opens on `appearance`, the first item. An unknown
or no-longer-visible id falls back to it, which covers the old `configuration`
id held in `App.jsx` state. The account menu's existing deep link to
`appearance` keeps working.

This is seven rail items, down from the ten in the sketch shown in
conversation. Reason: a page per subject would have produced several pages
with two or three rows each, the same fault as today's two-setting Device
Management tab.

### Pages and their contents

Every setting below already exists unless marked new. Wording of labels and
descriptions is the builder's to tighten; storage and behaviour are not.

**Appearance** (per user)

| Group | Rows |
|---|---|
| Appearance | Theme (Light / Dark / System), Temperature (°C / °F), Date in top bar (Show / Hide) |
| Palette | the existing grid, unchanged |

One card of rows, not a card per subject.

**Preferences** (per user when signed in; household store when auth is off, as
today)

| Group | Rows |
|---|---|
| Notifications | Toast notifications, Live event toasts, Toast position, Toast duration, Max visible toasts |
| Timeline | Episode capture interval, Scene grouping window, Episode minimum events |
| Quiet hours | Quiet hours on/off, with Start, End and the excluded-accessory chips as dependent rows |

Quiet hours flags dashboard activity. It is not an alerts setting, although
today's card is titled "Alerts & Quiet Hours".

One exception to "per user": the list of accessories watched for live event
toasts (`toastAccessories`) is household-wide and admin-only even when signed
in. It is edited with the bell icons on Devices, Manage Accessories, not here.

**General** (household, admin-only writes)

| Group | Rows |
|---|---|
| Devices | HomeKit auto-scan; Scheduled Repair, with Repair hour and the last-run line as dependents |
| Data | Retention cutoff, Archive before delete (with the Download archive action), Stale accessory threshold |
| Alerts | Default quiet period, Webhook timeout (read-only when set by env, as today) |

**Users & email**: `UsersPanel` and `SMTPConfigSection`, unchanged.

**Advanced**: `AdminAdvancedSection`. Its Log level becomes a standard row.
The Danger Zone keeps its layout.

**Account**: `ChangePasswordSection` and `ActiveSessionsPanel`, unchanged.

**About**: `AboutSection`, unchanged.

### The row

New components under `web/src/components/settings/`:

- `SettingsGroup`: a `Card` with a header title (an `h2`) and a body of rows
  separated by hairlines. No padding box around each row.
- `SettingsRow`: `label`, optional `description`, a `control` slot, optional
  `children` for dependent rows, optional `footnote` for status lines and
  inline actions, `disabled`.
- `Toggle`: `role="switch"` with `aria-checked`. Replaces the raw checkbox and
  the "On" / "Off" text. Keyboard and focus ring per the existing `FOCUS_RING`.
- `Segmented`: the radio-group control extracted from `AppearanceSection`, in a
  compact size. Keeps `role="radiogroup"` / `role="radio"`.
- Shared class constants for the native `<select>` and number input, so every
  field has the same height, border and focus ring.

```
┌ Appearance ────────────────────────────────────────────────┐
│ Theme                               [ Light | Dark |●System ]│
│ Follows this device. Showing light.                          │
├──────────────────────────────────────────────────────────────┤
│ Temperature                                    [ ●°C | °F ]  │
│ Readings, alert rules, emails and exports.                   │
└──────────────────────────────────────────────────────────────┘
┌ Devices ───────────────────────────────────────────────────┐
│ HomeKit auto-scan                                     ( ○ )  │
│ Scan for accessories every hour in the background.           │
├──────────────────────────────────────────────────────────────┤
│ Scheduled Repair                                      ( ● )  │
│ Re-pairs devices that lose their connection overnight.       │
│     Repair hour                                  [ 3 AM ▾ ]  │
│     Last run 3 hours ago · 4 repaired, 0 failed              │
└──────────────────────────────────────────────────────────────┘
```

Rules:

- Label is `text-sm font-medium`. Description is `text-xs text-hc-muted`,
  always under the label, never above it.
- Dependent rows are indented, appear only while their parent is on, and are
  not separate hairline rows.
- A row whose parent switch is off elsewhere (the toast rows when Toast
  notifications is off) is dimmed and inert, as today.
- Below the `sm` breakpoint the control drops under the text.
- The Settings content column gets a maximum width (about 720px) inside the
  existing page container, so the control stays near its label on wide
  screens. The rail plus that column does not fit the `narrow` container, so
  Settings does not switch to it.

### Saving

Two behaviours, decided by control type, the same on every page:

- **Toggles, segmented controls and selects save on change**, through the
  store each setting already uses. What the user sees is made uniform:
  - A control never keeps showing a value that was not saved. On failure it
    returns to the saved value and an error toast appears.
  - Household saves confirm with the existing "Setting saved" toast.
    Per-user preference saves apply at once and stay silent, as Theme and
    Palette do today.
  - Two changes made close together are both saved.

  Today this differs by store. Household retention fields debounce 300ms,
  toast, and refetch on failure. Per-user blob fields write at once with no
  toast. The repair toggle and hour call their mutation bare, with no toast
  and no error handling. Two faults to fix on the way, each with a failing
  test first: the debounce holds one timer and one payload, so a second
  toggle within 300ms discards the first; and the reviewer reports that the
  failure path refetches without resetting the local input, so the control
  stays flipped (confirm before fixing).
- **Typed numbers need an explicit Apply, on the row.** When a number field's
  value differs from the saved one, an Apply button and a Cancel appear beside
  it. Enter applies, Escape cancels. An out-of-range value shows the allowed
  range under the row and disables Apply. This replaces the floating Save
  button, which cannot work once the five fields live on two pages.
- **Retention cutoff, when lowered,** also shows one line under the row before
  Apply: events older than the new cutoff are archived or deleted at the next
  sweep, according to Archive before delete.
- Default quiet period and Webhook timeout save on blur today. They move to
  the same inline Apply so that every typed number behaves alike.

The floating Save button, `isDirty` and `saveFeedback` go away.

### Links between pages

- Settings, General, Alerts group: a "Manage rules" link to the Alerts page.
- Alerts page: an "Alert defaults" link to Settings `general`. Shown to
  admins and in auth-off only.
- Settings, General, Devices group: a link to Devices, Manage Accessories.
- Devices, Manage Accessories: a link to Settings `general` for auto-scan and
  the repair schedule. Admins and auth-off only.
- Settings, Preferences, Live event toasts: the existing "Select accessories
  to watch on the Manage Accessories tab" hint becomes a link there for admins
  and in auth-off. Members cannot edit the watch list, so for them it is plain
  text saying an admin chooses which accessories are watched.
- Devices, Manage Accessories has its own "Live Toasts" button. It writes the
  household flag, which the app ignores for any signed-in user in favour of
  their own preference, so today it does nothing when auth is on. Make it read
  and write the same value as the Preferences toggle. This is the one change
  inside `MyDevicesTab.jsx` beyond adding a link.

Links into Settings use the existing `navigate('settings', { section })`.
Links to a Devices tab need `DevicesPage`'s active tab to be addressable the
same way `SettingsPage`'s section already is. How is the builder's call.

### Deferred: Alerts in the top bar

Not part of this build. The user asked where alerts would be checked once the
link is hidden, and the answer is weak: the dashboard's Alerts Summary panel
is optional and does not link to the Alerts page, so the only route left would
be a link on a Settings row. That recreates the "one thing in two places"
fault this design removes, to save one of five nav items. The design is kept
here in case it is wanted later; it would first need a second route to the
page, such as making the Alerts Summary panel's title a link.

A per-user display preference, the twin of the existing Date option.

- Hook `useAlertsNav`, modelled on `useMastheadDate`: preference key
  `showAlertsNav`, default shown, localStorage key `hc_show_alerts_nav`, same
  "anything that is not literally `false` counts as shown" rule.
- When hidden, the Alerts item is left out of `Masthead` and `FloatingNav`.
- It hides a link and nothing else. Rules keep running and the dashboard's
  Alerts Summary panel is unaffected.
- The row's description says so, and when the viewer has enabled rules it
  names the count: "Hides the Alerts link. Your 3 active rules keep running."
  The row carries an "Open Alerts" link, so the page stays reachable.
- This is not the old toggle. That one was household-wide, admin-only and
  gated the feature. This one is each person's own, defaults to shown, and
  gates nothing, so MALERT-07's intent holds. The `Masthead` test that asserts
  Alerts is always shown changes to: shown by default, hidden only by the
  viewer's own preference.

Nothing else in this design depends on it.

### Order of work

Each step leaves the app shippable.

1. Row components, then Appearance rebuilt on them. Fixes the reported screen.
2. Dissolve `SettingsTab.jsx` into group components, build the Preferences and
   General pages, the grouped rail, the member gating, the inline Apply.
3. Cross-page links.
4. A CHANGELOG entry under Unreleased.

## Left to the builder

- File names and how `SettingsTab.jsx`'s state and save logic are divided
  among the group components, provided behaviour is unchanged.
- Exact spacing, the compact segmented control's dimensions, the Toggle's
  drawing, the content column's exact maximum width.
- Final wording of labels and descriptions.
- How `DevicesPage` exposes its tab for deep links.
- Where existing tests land. Every current assertion in
  `SettingsTab.test.jsx`, `SettingsTab.blob.test.jsx`, `SettingsPage.test.jsx`,
  `AppearanceSection.test.jsx` and `AdminAdvancedSection.test.jsx` needs a
  home or a stated reason it no longer applies (inner tabs, floating Save).
- `e2e/toast-notifications.spec.js` drives the old Settings tab and a Save
  button. Update or retire it, saying which.

## Not part of the build

- The guide pages. `docs/` on main is the live docs site and publishes on
  push, so editing it now would describe a layout stable users do not have
  during the beta soak. At GA: `docs/guide/settings.md` and `appearance.md`
  follow the new structure, and `alerts.md`, `devices.md` and any other page
  naming the old tabs are corrected.
- Screenshots in `docs/screenshots/` for the changed pages. They are captured
  against production with a token the user supplies, at release time.
- `web/src/changelog.js`, which is updated at GA only.

## Calls made by the author, for the user to check

- Seven rail items with grouped pages, instead of the ten single-subject pages
  sketched in conversation.
- Members no longer see "This home" at all, instead of seeing it read-only.
- Settings opens on Appearance instead of Configuration.
- Quiet hours moves to Preferences because it is per-user and about the
  dashboard, not alerts.
- Typed numbers keep an explicit save, moved from a floating button to an
  inline Apply; the two alert-default numbers join that rule.
- Row text uses `text-sm` / `text-xs` instead of the broken hc size tokens.
- Save feedback is made uniform: failures always revert and say so, household
  saves toast, personal preference saves stay silent.
- The "Live Toasts" button on Devices, Manage Accessories is fixed to follow
  the viewer's own preference instead of being removed.
- Guide pages wait for GA instead of landing with the code.

## Known gaps left alone

- A member can switch live event toasts on but cannot choose which accessories
  are watched, because that list is household-wide and admin-only. The bell
  icons on Devices, Manage Accessories fail for members today. Making the
  watch list per-user is its own piece of work.
