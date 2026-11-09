# Temperature units (°C / °F) — design

**Date:** 2026-11-08
**Status:** approved design, not yet planned
**Origin:** GitLab issue #3 (US user asked for a Celsius / Fahrenheit setting)

## Intent

Let each user read and type temperatures in the unit they think in. A US household
member who picks Fahrenheit should never see a Celsius number anywhere in the app,
in the files it gives them, or in the emails it sends them. Nothing about how
temperatures are captured or stored changes.

## Goals

- A per-user setting, Celsius or Fahrenheit, that syncs across the user's devices.
- Every human-facing temperature follows that setting: Timeline, device pages,
  dashboard panels, live toasts, alert rule forms and lists, alert emails, and the
  Timeline CSV/JSON export.
- Existing data, existing alert rules, and every other household member's view are
  unaffected by one user flipping the setting.

## Non-goals

- Changing what is stored. Events and alert thresholds stay in Celsius in PostgreSQL.
- Any other unit or locale preference (12/24-hour clock, date format, language).
  Those belong to the parked localization design
  (`2026-10-17-localization-design.md`); this feature should not block or
  pre-empt it.
- Converting the webhook payload. Webhooks feed machines; they keep the raw
  Celsius values.
- Honouring the HomeKit `TemperatureDisplayUnits` characteristic (a device-side
  thermostat display setting). It is unrelated to what the user wants to read.
- Guessing the unit from browser locale.

## Anti-goals

- A member who sets °F must not change what an admin or another member sees.
- An alert rule created in °F must not fire at a different reading than the same
  rule created in °C. Rounding on save must be tight enough that the threshold
  round-trips (see *Precision* below).
- Colour temperature (`ColorTemperature`, in mireds) must never be converted.

## Constraints

- Self-hosted, single instance, must work with `AUTH_ENABLED=false` (no user
  account) exactly as theme and palette do today: the preference then lives only
  in that browser's localStorage.
- No database migration.
- Backward compatible API: new query parameters are optional and default to the
  current behaviour.

## What the user sees

### The setting

Settings › Appearance gets a third card, **Units**, under Theme and Palette, with a
two-way segmented control: **Celsius (°C)** and **Fahrenheit (°F)**. Hint text under
it: "Applies everywhere you read or type a temperature, including alert rules,
alert emails and exports. Readings are stored in °C." Default is Celsius, so no
existing user sees a change until they choose.

### Readings

Everywhere a temperature characteristic is rendered it is converted and shown with
one decimal and the unit symbol, e.g. `23.5 °C` → `74.3 °F`. The temperature
characteristics are exactly:

- `CurrentTemperature`
- `TargetTemperature`
- `HeatingThresholdTemperature`
- `CoolingThresholdTemperature`

Only `CurrentTemperature` is captured today (HomeKit's watched list has no
thermostat setpoints and the Matter normaliser has no Thermostat mapping). The
other three names are supported so a future capture change needs no UI work, but
the docs must not promise that thermostat setpoints follow the unit.

Names are matched case-insensitively, because the listener matches alert
characteristic filters case-insensitively and the alert form's characteristic box
is free text.

The intent is "never a Celsius number anywhere", so the list of render sites is
the code as it stands, not a cap. Places that render temperatures today and must
go through the shared formatter:

- Timeline event rows: the headline description and the before → after text
  (`web/src/lib/icons.js` `describeChange` / `describeBeforeAfter`, used by
  `EventRow.jsx`).
- Device page (`AccessoryDetail.jsx`): the current-state tiles, the recent
  history rows including their raw `old → new` line, the **Characteristic
  trend** chart (plotted values, Y axis and tooltip), and the min / avg / max
  **Characteristic summary** table rows for temperature characteristics.
- Dashboard **Activity feed** panel (`ActivityFeed.jsx`), which prints raw
  `old → new`.
- Dashboard **Sensor environment** panel (`SensorEnvironmentPanel.jsx`), which
  currently prints the raw number with a bare `°`.
- Live event toasts (`useLiveEventToasts.js`), which currently print the raw
  stored string.

Humidity, brightness and every other characteristic are untouched.

**Sensor environment scaling fix (pre-existing bug, fixed here because the panel
is in scope).** `GET /api/stats/sensor-environment` divides every Matter row by
100. That was right when Matter rows were raw `MeasuredValue` centi-units, but
since the 0.4.0 Matter normalisation new rows are stored as `CurrentTemperature` /
`CurrentRelativeHumidity` already in real units, so a normalised 23.5 shows as
0.2 today. The endpoint divides by 100 only for legacy rows (characteristic is
not one of the two normalised names).

### Alert rules

In the alert rule form (`web/src/components/Alerts.jsx`), when the rule is a
threshold (rises above / drops below) the value box is labelled with the user's
unit and the hint reads "Temperatures are in °F" (or °C). The user types in their
unit; the client converts to Celsius before calling the API. When editing an
existing rule the stored Celsius value is shown back in the user's unit. The rule
list shows thresholds the same way, e.g. "rises above 75 °F".

The rule's effective characteristic is the **Characteristic filter** box, or, when
that is blank and the scope type is *Characteristic*, the scope value (the
listener accepts threshold rules in either shape). The unit label and conversion
apply only when that effective characteristic is one of the four temperature
characteristics **and** the operator is *rises above* or *drops below*. For any
other characteristic the box is unlabelled and the value passes through
unchanged, as today.

*Equals*, *not equals* and *contains* on a temperature characteristic compare the
stored Celsius text and are left alone: no conversion, the list shows the raw
value, and the form shows the hint "Compared against the stored reading, which is
in °C." Converting text comparisons would change which rules fire; refusing them
would break existing rules.

Because the stored value is Celsius:

- existing rules keep firing at the same reading,
- two household members with different units see the same rule, each in their own
  unit,
- the listener's threshold evaluation (`alerts.js`) does not change.

### Alert emails

Threshold and match alert emails show temperatures in the **rule owner's** unit.
The subject becomes e.g. `[HomeChronicle] Kitchen Sensor CurrentTemperature =
74.3 °F` and the body's `Change:` line shows both old and new readings converted,
e.g. `Change: 73.4 °F → 74.3 °F`. For non-temperature characteristics the email is
unchanged.

The owner is `alert_rules.user_id`; their unit is read from
`user_preferences.prefs` the same way the quiet-hours endpoint reads a user's blob
today (`stats-router.js`). Legacy rules with no owner (`user_id IS NULL`) use
Celsius. A missing or invalid preference means Celsius.

Webhook payloads (`buildAlertPayload`) are not changed.

### Export

`GET /api/events/export` accepts an optional `unit` query parameter, `c` (default)
or `f`. With `unit=f`, the `old_value` and `new_value` columns of rows whose
`characteristic` is one of the four temperature characteristics are converted to
Fahrenheit, one decimal, written as plain numbers (no symbol) so spreadsheets still
treat them as numbers. All other rows are untouched. The web client
(`web/src/lib/exportEvents.js`) adds `unit` from the current preference to both the
export URL and the pre-flight `/events/export/check` URL (the check ignores it; it
is added so the two URLs stay symmetric). Passing it as a query parameter rather
than reading the session's preferences on the server keeps the export working in
`AUTH_ENABLED=false` mode, where there is no user.

## Mechanics

### Preference

- Blob key `temperatureUnit`, values `'c'` | `'f'`; localStorage key
  `hc_temperature_unit`; read and written through the existing `usePreference`
  hook exactly like `theme` (authenticated: server blob plus localStorage mirror;
  anonymous: localStorage only). A new `useTemperatureUnit()` hook returns
  `{ unit, setUnit }` and is the only way components learn the unit.
- The listener's `PUT /api/me/preferences` already merges arbitrary keys; no
  server change is needed to store it.

### Shared formatter (web)

One module, `web/src/lib/temperature.js`:

- `isTemperatureCharacteristic(name)` — the four names above, case-insensitive.
- `celsiusToUnit(c, unit)` / `unitToCelsius(v, unit)` — pure numeric conversion.
- `formatTemperature(celsiusValue, unit)` → `"74.3 °F"`; returns the same
  fallback the current code returns for non-numeric input.

`icons.js`'s `describeChange` and `describeBeforeAfter` gain a trailing `options`
argument carrying `{ temperatureUnit }`; callers pass the hook's value. Components
that render raw values directly (sensor panel, toasts) call `formatTemperature`.

### Shared conversion (listener)

`listener/src/temperature.js` with the same `isTemperatureCharacteristic`,
`celsiusToUnit` and a `formatTemperature` used by the email body and the export.
The web and listener copies are kept identical by a test fixture of known
conversions rather than by sharing code across the two packages (there is no
shared package today).

### Precision

- Display: one decimal in either unit.
- Alert threshold on save: convert the typed °F value to °C and round to **two**
  decimals before sending. 75 °F → 23.89 °C; shown back as 75.0 °F. One decimal
  would make 75 °F round-trip as 75.2 °F, which users would read as a bug.
- The API already accepts any numeric string for `matchValue`; two decimals need
  no server change.

## Documentation and release notes

- `docs/guide/settings.md` (Appearance section): the Units card.
- `docs/guide/alerts.md`: threshold hint now follows the unit; stored in °C.
- `docs/guide/api-reference.md`: `unit` parameter on `/api/events/export`; note on
  alert emails.
- `CHANGELOG.md` `### Added` and `web/src/changelog.js` at the next GA, plus a
  reply on issue #3 after it ships (test on a real sensor first, per the project's
  issue-reply rule).

## Decisions made after the builder review

A reviewer read this document as a builder and raised three gaps. Settled here,
not by the user:

1. Effective characteristic for alert rules = filter box, else scope value when
   the scope type is *Characteristic*; matched case-insensitively. Text operators
   on a temperature characteristic are not converted (see *Alert rules*).
2. "Everywhere" governs over the original four-site list: Activity feed, the
   trend chart, the raw history line and the summary table are in scope.
3. The sensor-environment ÷100 bug for normalised Matter rows is fixed as part of
   this work.

## Left to the builder

- Exact segmented-control markup, reusing the Theme control's styling.
- Where the per-component unit is threaded (prop vs hook call inside each
  component), as long as `useTemperatureUnit()` is the single source.
- Test layout, following the existing `*.test.js` / `*.test.jsx` conventions,
  including: formatter round-trips, the form's °F → °C save path, email body with
  an °F owner and with a legacy rule, export with and without `unit=f`.
