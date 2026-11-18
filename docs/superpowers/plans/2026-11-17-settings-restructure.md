# Settings Restructure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every setting one shared row design and one obvious home, by rebuilding Appearance on new row components and dissolving Settings › Configuration into grouped rail pages.

**Architecture:** New presentational components in `web/src/components/settings/` (group, row, toggle, segmented control, number field) carry the look. A small save layer (`patchQueue` + two hooks) carries uniform save behaviour. `SettingsTab.jsx` (1,046 lines) is split into six group components mounted by two new pages, Preferences and General, and `SettingsPage.jsx` gets a grouped rail with role-based visibility. No API, storage or listener change.

**Tech Stack:** React 19, Vite 8, Tailwind v4, TanStack Query 5, Vitest 4 + Testing Library (jsdom), lucide-react, clsx.

**Spec:** `docs/superpowers/specs/2026-11-17-settings-restructure-design.md`. Read it before starting. The "Deferred: Alerts in the top bar" section is NOT part of this plan.

## Global Constraints

- Web only. Nothing under `listener/` changes. No endpoint, payload key, preference key or localStorage key changes.
- No new npm dependencies.
- ES modules; relative imports with explicit `.js` / `.jsx` extensions; no barrel files; 2-space indent; single quotes; semicolons; trailing commas in multi-line literals.
- Row components use `text-sm` (label) and `text-xs` (description, footnote). Do NOT use `text-hc-label`, `text-hc-body` or `text-hc-caption` in new code: those classes produce no font size (spec, Constraints).
- Colours come only from existing `hc-*` colour tokens. No new colours, no room colours in settings.
- Every control has an accessible name equal to its row label, passed as `ariaLabel`.
- Typed numbers never save without an explicit Apply. Toggles, segmented controls and selects save on change.
- Do not edit anything under `docs/guide/` or `docs/screenshots/`, or `web/src/changelog.js`. Those change at GA.
- Commits: stage by explicit path and commit with `git commit --only <paths>`. Never `git add -A` or `git add .`. No `Co-Authored-By` or any AI attribution. Another session may share this checkout; files you did not touch are not yours.
- Test command: from `web/`, `npm test` (whole suite) or `npx vitest run <path>` (one file). Build check: `npm run build`.
- A test that uses fake timers together with user-event must create its user with `userEvent.setup({ advanceTimers: vi.advanceTimersByTime })`, or clicks will hang. Household saves are debounced 300ms, so most group tests need this.
- After the last code task, run `graphify update .` from the repo root.

## Review Focus

Failure modes the spec implies that are most likely to reach a user. Each is pinned by a test in the task named.

1. **A save fails** (403 for a demoted admin, 500, network drop): the control must return to the saved value and an error toast must show. Task 3.
2. **Two controls change within 300ms, or one changes while a request is in flight:** both changes must reach the server. Task 3.
3. **Junk in a number field** (empty, `abc`, `3.5`, `-1`, `0` where the minimum is 1, a value above the maximum): Apply is disabled and nothing is sent. Task 4.
4. **Server value changes under a half-typed number** (refetch, another tab): the draft is not clobbered; a clean field follows the new value. Task 4.
5. **A member holds a household section id** (state left over from before a role change, or a deep link to `general`): Settings falls back to Appearance and renders no household control. Task 7.

## File Structure

Created:

| File | Responsibility |
|---|---|
| `web/src/components/settings/fieldStyles.js` | `FOCUS_RING`, `SELECT_CLASS`, `INPUT_CLASS` class constants |
| `web/src/components/settings/SettingsGroup.jsx` | Card + header + hairline-separated rows |
| `web/src/components/settings/SettingsRow.jsx` | One setting: label, description, control, dependents, footnote |
| `web/src/components/settings/Toggle.jsx` | `role="switch"` button |
| `web/src/components/settings/Segmented.jsx` | Compact radio-group control |
| `web/src/components/settings/NumberField.jsx` | Typed number with inline Apply / Cancel |
| `web/src/components/settings/hourOptions.js` | `HOURS_OPTIONS` (moved out of `SettingsTab.jsx`) |
| `web/src/lib/patchQueue.js` | Debounced, merging, serialised patch sender |
| `web/src/hooks/useSettingSaver.js` | Patch queue around a mutation, with toasts |
| `web/src/hooks/useSetting.js` | Optimistic value that reverts on failed save |
| `web/src/hooks/useCanManageHome.js` | `!authEnabled \|\| role === 'admin'` |
| `web/src/hooks/useToastPrefs.js` | Effective toast prefs + setters (blob when signed in, household otherwise) |
| `web/src/components/settings/DevicesGroup.jsx` | Auto-scan, Scheduled Repair |
| `web/src/components/settings/DataGroup.jsx` | Retention, archive, stale threshold |
| `web/src/components/settings/AlertDefaultsGroup.jsx` | Default quiet period, webhook timeout |
| `web/src/components/settings/NotificationsGroup.jsx` | Five toast rows + test toast |
| `web/src/components/settings/TimelineGroup.jsx` | Three grouping numbers |
| `web/src/components/settings/QuietHoursGroup.jsx` | Quiet hours + start/end + excluded chips |
| `web/src/components/settings/GeneralSection.jsx` | Mounts Devices, Data, AlertDefaults groups |
| `web/src/components/settings/PreferencesSection.jsx` | Mounts Notifications, Timeline, QuietHours groups |

Each created component gets a sibling `*.test.jsx`.

Modified: `AppearanceSection.jsx` (+ test), `SettingsPage.jsx` (+ test), `App.jsx`, `setup/AdminAdvancedSection.jsx` (+ test), `pages/DevicesPage.jsx` (+ test), `setup/MyDevicesTab.jsx` (+ test), `pages/AlertsPage.jsx`, `CHANGELOG.md`.

Deleted in Task 7: `setup/SettingsTab.jsx`, `setup/SettingsTab.test.jsx`, `setup/SettingsTab.blob.test.jsx`, `e2e/toast-notifications.spec.js`.

All paths below are relative to `web/src/` unless they start with another top-level directory.

---

### Task 1: Row components

**Files:**
- Create: `components/settings/fieldStyles.js`, `SettingsGroup.jsx`, `SettingsRow.jsx`, `Toggle.jsx`, `Segmented.jsx`
- Test: `components/settings/SettingsRow.test.jsx`, `Toggle.test.jsx`, `Segmented.test.jsx`

**Interfaces:**
- Produces:
  - `fieldStyles.js`: `export const FOCUS_RING`, `SELECT_CLASS`, `INPUT_CLASS` (strings). `FOCUS_RING` is the value currently duplicated in `AppearanceSection.jsx` and `AboutSection.jsx`. `SELECT_CLASS` is the select class string used throughout `setup/SettingsTab.jsx` (line 439). `INPUT_CLASS` is the same plus `w-24`.
  - `SettingsGroup({ title, children })`: default export. A `Card` with `Card.Header title={title} headingLevel={2}` and a body `div` with classes `divide-y divide-hc-panel-border` and no padding of its own.
  - `SettingsRow({ label, description, control, children, footnote, disabled })`: default export. All but `label` optional. `children` are dependent rows.
  - `Toggle({ checked, onChange, ariaLabel, disabled })`: default export. `onChange(next: boolean)`.
  - `Segmented({ options, value, onChange, ariaLabel })`: default export. `options: Array<{ id: string, label: string, icon?: LucideIcon }>`; `onChange(id: string)`.

- [ ] **Step 1: Write the failing tests**

```jsx
// SettingsRow.test.jsx
it('puts the description under the label and the control beside them', () => {
  render(<SettingsRow label="Theme" description="Follows this device." control={<button>ctl</button>} />);
  const label = screen.getByText('Theme');
  const desc = screen.getByText('Follows this device.');
  expect(label.compareDocumentPosition(desc) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(screen.getByRole('button', { name: 'ctl' })).toBeInTheDocument();
});
it('renders dependents and footnote when given, and neither when not', () => {
  const { rerender } = render(<SettingsRow label="A" control={<i />} />);
  expect(screen.queryByTestId('settings-row-dependents')).toBeNull();
  rerender(<SettingsRow label="A" control={<i />} footnote="Last run 3h ago"><p>child</p></SettingsRow>);
  expect(screen.getByTestId('settings-row-dependents')).toHaveTextContent('child');
  expect(screen.getByText('Last run 3h ago')).toBeInTheDocument();
});
it('marks a disabled row inert', () => {
  render(<SettingsRow label="A" control={<i />} disabled />);
  expect(screen.getByTestId('settings-row')).toHaveClass('opacity-50', 'pointer-events-none');
});

// Toggle.test.jsx
it('is a switch named by ariaLabel that reports the flipped value', async () => {
  const onChange = vi.fn();
  render(<Toggle checked={false} onChange={onChange} ariaLabel="HomeKit auto-scan" />);
  const sw = screen.getByRole('switch', { name: 'HomeKit auto-scan' });
  expect(sw).toHaveAttribute('aria-checked', 'false');
  await userEvent.click(sw);
  expect(onChange).toHaveBeenCalledWith(true);
});
it('does nothing when disabled', async () => {
  const onChange = vi.fn();
  render(<Toggle checked onChange={onChange} ariaLabel="X" disabled />);
  await userEvent.click(screen.getByRole('switch'));
  expect(onChange).not.toHaveBeenCalled();
});

// Segmented.test.jsx
it('is a radiogroup with one checked radio and reports the clicked id', async () => {
  const onChange = vi.fn();
  render(<Segmented ariaLabel="Theme" value="dark" onChange={onChange}
    options={[{ id: 'light', label: 'Light' }, { id: 'dark', label: 'Dark' }]} />);
  expect(screen.getByRole('radiogroup', { name: 'Theme' })).toBeInTheDocument();
  expect(screen.getByRole('radio', { name: 'Dark' })).toHaveAttribute('aria-checked', 'true');
  await userEvent.click(screen.getByRole('radio', { name: 'Light' }));
  expect(onChange).toHaveBeenCalledWith('light');
});
```

- [ ] **Step 2: Run them and confirm they fail**

Run: `npx vitest run src/components/settings`
Expected: FAIL, modules not found.

- [ ] **Step 3: Implement the five files**

Layout decisions the tests do not fix:
- `SettingsRow` root: `data-testid="settings-row"`, `px-4 py-3`. Top line is `flex items-center justify-between gap-4 flex-wrap` so the control drops under the text on narrow screens. Text block `min-w-0`; description capped with `max-w-prose`.
- Label `text-sm font-medium text-hc-fg`; description `text-xs text-hc-muted mt-0.5`; footnote `text-xs text-hc-muted mt-2`.
- Dependents wrapper: `data-testid="settings-row-dependents"`, `mt-3 pl-4 space-y-3`, no hairlines.
- `Segmented` buttons `px-3 py-1.5 text-sm`, icon size 14, selected/unselected colours copied from the existing control in `AppearanceSection.jsx`.
- `Toggle` is a `<button type="button" role="switch">`; track uses `bg-hc-accent-strong` when on and `bg-hc-panel-mid` with `border-hc-border-strong` when off; knob `bg-hc-panel`.

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `npx vitest run src/components/settings`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src/components/settings
git commit --only web/src/components/settings -m "feat(settings): shared row, group, toggle and segmented components"
```

---

### Task 2: Appearance on the new rows

**Files:**
- Modify: `components/AppearanceSection.jsx`, `components/AppearanceSection.test.jsx`, `pages/SettingsPage.jsx` (content column width only)

**Interfaces:**
- Consumes: Task 1 components.
- Produces: `AppearanceSection` renders exactly two cards: a `SettingsGroup title="Appearance"` with three rows, then the existing Palette card.

Row copy (exact):

| Label | Control `ariaLabel` | Options | Description |
|---|---|---|---|
| Theme | `Theme` | Light, Dark, System (existing icons) | the existing per-option hint, plus the existing "Currently showing the **{resolvedTheme}** palette." when System |
| Temperature | `Temperature unit` | `°C`, `°F` (no icon) | `Applies everywhere you read or type a temperature, including alert rules, alert emails and exports. Readings are stored in °C.` |
| Date in top bar | `Date in the top bar` | Show, Hide (existing icons) | `Today's date at the right of the top bar on wide screens. Hiding it changes nothing else.` |

- [ ] **Step 1: Update the tests first**

Keep every existing behavioural assertion in `AppearanceSection.test.jsx` (selection calls the right setter, the checked radio follows the hook value, the System hint names the resolved theme, palette selection). Change queries only where a label changed (`Celsius (°C)` to `°C`, `Fahrenheit (°F)` to `°F`). Add:

```jsx
it('shows Theme, Temperature and Date as rows of one card, plus Palette', () => {
  renderSection();
  expect(screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent))
    .toEqual(['Appearance', 'Palette']);
  expect(screen.getAllByTestId('settings-row')).toHaveLength(3);
});
```

- [ ] **Step 2: Run and confirm the new test fails**

Run: `npx vitest run src/components/AppearanceSection.test.jsx`
Expected: FAIL, headings are `['Theme', 'Units', 'Date', 'Palette']`.

- [ ] **Step 3: Rebuild the section**

Replace the three single-control cards with one `SettingsGroup`. Delete the local `FOCUS_RING` and import it from `fieldStyles.js`. The Palette card keeps its markup; change its two `text-hc-label` / `text-hc-caption` usages to `text-sm` / `text-xs` so the page's type is consistent.

In `SettingsPage.jsx`, change the content area from `flex-1 min-w-0 space-y-4` to `flex-1 min-w-0 max-w-[720px] space-y-4`. Do not switch `PageContainer` to `narrow`.

- [ ] **Step 4: Run tests and build**

Run: `npx vitest run src/components/AppearanceSection.test.jsx src/pages/SettingsPage.test.jsx && npm run build`
Expected: PASS, build succeeds.

- [ ] **Step 5: Commit**

```bash
git add web/src/components/AppearanceSection.jsx web/src/components/AppearanceSection.test.jsx web/src/pages/SettingsPage.jsx
git commit --only web/src/components/AppearanceSection.jsx web/src/components/AppearanceSection.test.jsx web/src/pages/SettingsPage.jsx -m "feat(settings): Appearance as one card of rows"
```

---

### Task 3: Save layer

**Files:**
- Create: `lib/patchQueue.js`, `hooks/useSettingSaver.js`, `hooks/useSetting.js`
- Test: `lib/patchQueue.test.js`, `hooks/useSettingSaver.test.jsx`, `hooks/useSetting.test.jsx`

**Interfaces:**
- Produces:
  - `createPatchQueue({ send, delayMs = 300 })` returns `{ push(patch): Promise<any>, dispose(): void }`. `send(patch): Promise<any>`. Patches pushed within `delayMs` of each other are shallow-merged (later keys win) into one `send`. Only one `send` is in flight; patches pushed meanwhile form the next batch. Every `push` promise settles with the result or error of the `send` that carried it. `dispose()` cancels the pending timer.
  - `useSettingSaver(mutation, { toastsEnabled = true, onSaved } = {})` returns a stable `save(patch): Promise<any>`. On success: calls `onSaved?.(result, patch)`, then `addToast('Setting saved', 'success')` when `(patch.toastsEnabled ?? toastsEnabled)` is true. On failure: `addToast('Failed to save setting', 'error')` always, then rejects. Sends via `mutation.mutateAsync`.
  - `useSetting(saved, commit)` returns `[value, change]`. `value` is the pending override if there is one, else `saved`. `change(next)` sets the override and awaits `commit(next)` (may be sync). If `commit` rejects or throws, the override is cleared at once so `value` returns to `saved`. If it resolves, the override stays until `saved` changes, then clears.

- [ ] **Step 1: Write the failing tests**

```js
// patchQueue.test.js  (vi.useFakeTimers())
it('merges patches pushed inside the delay into one send', async () => {
  const send = vi.fn().mockResolvedValue({ ok: 1 });
  const q = createPatchQueue({ send });
  const a = q.push({ autoScanHomeKit: false });
  const b = q.push({ archiveBeforeDelete: false });
  await vi.advanceTimersByTimeAsync(300);
  expect(send).toHaveBeenCalledTimes(1);
  expect(send).toHaveBeenCalledWith({ autoScanHomeKit: false, archiveBeforeDelete: false });
  await expect(a).resolves.toEqual({ ok: 1 });
  await expect(b).resolves.toEqual({ ok: 1 });
});
it('later value wins for the same key', async () => {
  const send = vi.fn().mockResolvedValue({});
  const q = createPatchQueue({ send });
  q.push({ x: 1 }); q.push({ x: 2 });
  await vi.advanceTimersByTimeAsync(300);
  expect(send).toHaveBeenCalledWith({ x: 2 });
});
it('holds patches pushed during a send and sends them next, in order', async () => {
  let release;
  const send = vi.fn()
    .mockImplementationOnce(() => new Promise((r) => { release = r; }))
    .mockResolvedValue({});
  const q = createPatchQueue({ send });
  q.push({ a: 1 });
  await vi.advanceTimersByTimeAsync(300);
  q.push({ b: 2 });
  await vi.advanceTimersByTimeAsync(300);
  expect(send).toHaveBeenCalledTimes(1);
  release({});
  await vi.advanceTimersByTimeAsync(0);
  expect(send).toHaveBeenNthCalledWith(2, { b: 2 });
});
it('rejects every push carried by a failed send, and keeps working after', async () => {
  const send = vi.fn().mockRejectedValueOnce(new Error('403')).mockResolvedValue({});
  const q = createPatchQueue({ send });
  const a = q.push({ a: 1 }); const b = q.push({ b: 2 });
  a.catch(() => {}); b.catch(() => {});
  await vi.advanceTimersByTimeAsync(300);
  await expect(a).rejects.toThrow('403');
  await expect(b).rejects.toThrow('403');
  const c = q.push({ c: 3 });
  await vi.advanceTimersByTimeAsync(300);
  await expect(c).resolves.toEqual({});
});
it('dispose cancels a pending send', async () => {
  const send = vi.fn();
  const q = createPatchQueue({ send });
  q.push({ a: 1 }).catch(() => {});
  q.dispose();
  await vi.advanceTimersByTimeAsync(300);
  expect(send).not.toHaveBeenCalled();
});
```

```jsx
// useSetting.test.jsx
it('shows the new value at once and returns to the saved value when commit rejects', async () => {
  const commit = vi.fn().mockRejectedValue(new Error('nope'));
  const { result } = renderHook(() => useSetting(true, commit));
  await act(async () => { await result.current[1](false).catch(() => {}); });
  expect(commit).toHaveBeenCalledWith(false);
  expect(result.current[0]).toBe(true);
});
it('keeps the new value after success until saved catches up', async () => {
  const commit = vi.fn().mockResolvedValue({});
  const { result, rerender } = renderHook(({ s }) => useSetting(s, commit), { initialProps: { s: true } });
  await act(async () => { await result.current[1](false); });
  expect(result.current[0]).toBe(false);
  rerender({ s: false });
  expect(result.current[0]).toBe(false);
  rerender({ s: true });
  expect(result.current[0]).toBe(true);
});

// useSettingSaver.test.jsx  (wrap in ToastProvider; fake timers; advance 300ms)
it('toasts "Setting saved" on success and calls onSaved first', ...);
  // assert onSaved called with (result, patch) and screen.getByText('Setting saved')
it('stays silent on success when toastsEnabled is false', ...);
it('stays silent on success when the patch itself turns toasts off', ...);
  // save({ toastsEnabled: false }) with toastsEnabled: true -> no 'Setting saved'
it('toasts "Failed to save setting" and rejects on failure, even when toastsEnabled is false', ...);
```

- [ ] **Step 2: Run and confirm they fail**

Run: `npx vitest run src/lib/patchQueue.test.js src/hooks/useSetting.test.jsx src/hooks/useSettingSaver.test.jsx`
Expected: FAIL, modules not found.

- [ ] **Step 3: Implement the three modules**

`useSettingSaver` builds one queue per hook instance in a ref, reads the latest `mutation`, `toastsEnabled` and `onSaved` through refs so `save` stays stable, and calls `dispose()` on unmount.

- [ ] **Step 4: Run and confirm they pass**

Same command. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/patchQueue.js web/src/lib/patchQueue.test.js web/src/hooks/useSettingSaver.js web/src/hooks/useSettingSaver.test.jsx web/src/hooks/useSetting.js web/src/hooks/useSetting.test.jsx
git commit --only web/src/lib/patchQueue.js web/src/lib/patchQueue.test.js web/src/hooks/useSettingSaver.js web/src/hooks/useSettingSaver.test.jsx web/src/hooks/useSetting.js web/src/hooks/useSetting.test.jsx -m "feat(settings): one save path that merges changes and reverts on failure"
```

---

### Task 4: NumberField

**Files:**
- Create: `components/settings/NumberField.jsx`
- Test: `components/settings/NumberField.test.jsx`

**Interfaces:**
- Consumes: `INPUT_CLASS`, `FOCUS_RING` from Task 1.
- Produces: `NumberField({ value, min, max, step = 1, unit, ariaLabel, onApply, warning, disabled })`, default export. `value: number` is the saved value. `onApply(n: number): Promise<any> | void`. `warning?: (n: number) => string | null` is called with the valid draft while dirty.

Behaviour:
- Holds a draft string. Valid means: matches `/^\d+$/` after trim, and `min <= n <= max`.
- Dirty means the draft, parsed, differs from `value`, or the draft is not valid.
- While dirty, an `Apply` button and a `Cancel` button render after the input. Not dirty: neither renders.
- Invalid draft: Apply is disabled and the text `Enter a whole number from {min} to {max}.` shows (`role="alert"`).
- Valid dirty draft with `warning(n)` returning a string: that string shows (`text-hc-warning-text`).
- Enter in the input applies when valid. Escape, or Cancel, resets the draft to `value`.
- While `onApply`'s promise is pending, input and buttons are disabled. If it rejects, the draft is kept so the user can retry.
- When `value` changes and the field is not dirty, the draft follows it. When dirty, the draft is left alone.

- [ ] **Step 1: Write the failing tests**

```jsx
const setup = (props = {}) => {
  const onApply = vi.fn().mockResolvedValue({});
  const utils = render(<NumberField value={365} min={1} max={3650} unit="days"
    ariaLabel="Retention cutoff" onApply={onApply} {...props} />);
  return { onApply, input: screen.getByRole('spinbutton', { name: 'Retention cutoff' }), ...utils };
};

it('shows no Apply until the value differs', async () => {
  const { input } = setup();
  expect(screen.queryByRole('button', { name: 'Apply' })).toBeNull();
  await userEvent.clear(input); await userEvent.type(input, '30');
  expect(screen.getByRole('button', { name: 'Apply' })).toBeEnabled();
});
it('never saves on blur', async () => {
  const { input, onApply } = setup();
  await userEvent.clear(input); await userEvent.type(input, '3');
  await userEvent.tab();
  expect(onApply).not.toHaveBeenCalled();
});
it.each(['', 'abc', '3.5', '-1', '0', '3651'])('refuses %j', async (junk) => {
  const { input, onApply } = setup();
  await userEvent.clear(input);
  if (junk) await userEvent.type(input, junk);
  expect(screen.getByRole('button', { name: 'Apply' })).toBeDisabled();
  expect(screen.getByRole('alert')).toHaveTextContent('Enter a whole number from 1 to 3650.');
  await userEvent.keyboard('{Enter}');
  expect(onApply).not.toHaveBeenCalled();
});
it('applies on click and on Enter with a number', async () => {
  const { input, onApply } = setup();
  await userEvent.clear(input); await userEvent.type(input, '30{Enter}');
  expect(onApply).toHaveBeenCalledWith(30);
});
it('Escape and Cancel restore the saved value', async () => {
  const { input } = setup();
  await userEvent.clear(input); await userEvent.type(input, '30{Escape}');
  expect(input).toHaveValue(365);
  await userEvent.clear(input); await userEvent.type(input, '40');
  await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(input).toHaveValue(365);
});
it('shows the warning for a valid dirty draft only', async () => {
  const { input } = setup({ warning: (n) => (n < 365 ? 'will delete' : null) });
  await userEvent.clear(input); await userEvent.type(input, '30');
  expect(screen.getByText('will delete')).toBeInTheDocument();
  await userEvent.clear(input); await userEvent.type(input, '400');
  expect(screen.queryByText('will delete')).toBeNull();
});
it('follows a new saved value when clean, keeps the draft when dirty', async () => {
  const { input, rerender, onApply } = setup();
  rerender(<NumberField value={400} min={1} max={3650} ariaLabel="Retention cutoff" onApply={onApply} />);
  expect(input).toHaveValue(400);
  await userEvent.clear(input); await userEvent.type(input, '30');
  rerender(<NumberField value={500} min={1} max={3650} ariaLabel="Retention cutoff" onApply={onApply} />);
  expect(input).toHaveValue(30);
});
it('keeps the draft when apply fails', async () => {
  const { input } = setup({ onApply: vi.fn().mockRejectedValue(new Error('x')) });
  await userEvent.clear(input); await userEvent.type(input, '30{Enter}');
  await waitFor(() => expect(input).toBeEnabled());
  expect(input).toHaveValue(30);
});
```

- [ ] **Step 2: Run and confirm they fail**

Run: `npx vitest run src/components/settings/NumberField.test.jsx`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement `NumberField`**

`<input type="number" inputMode="numeric">` with `INPUT_CLASS`; unit as `text-xs text-hc-muted` after it; Apply styled as the accent button, Cancel as a text button; messages on their own line under the controls, right-aligned with them.

- [ ] **Step 4: Run and confirm they pass**

Same command. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src/components/settings/NumberField.jsx web/src/components/settings/NumberField.test.jsx
git commit --only web/src/components/settings/NumberField.jsx web/src/components/settings/NumberField.test.jsx -m "feat(settings): number field with inline Apply"
```

---

### Task 5: General page (household settings)

**Files:**
- Create: `hooks/useCanManageHome.js`, `components/settings/hourOptions.js`, `DevicesGroup.jsx`, `DataGroup.jsx`, `AlertDefaultsGroup.jsx`, `GeneralSection.jsx`
- Test: `components/settings/DevicesGroup.test.jsx`, `DataGroup.test.jsx`, `AlertDefaultsGroup.test.jsx`
- Read, do not modify yet: `components/setup/SettingsTab.jsx` lines 384-647, `SettingsTab.test.jsx` lines 66-152

**Interfaces:**
- Consumes: Tasks 1, 3, 4. `setup` is the object returned by `useSetup()`; keys used here: `retentionConfig`, `saveRetentionMutation`, `repairConfig`, `saveRepairMutation`, `alertsConfig`, `saveAlertsMutation`.
- Produces:
  - `useCanManageHome(): boolean` = `!authEnabled || user?.role === 'admin'` (from `useAuthConfig`, `useAuth`).
  - `hourOptions.js`: `export const HOURS_OPTIONS` moved verbatim from `SettingsTab.jsx` lines 15-19. Hour conversion comes from `lib/hours.js` (`localHourToUtc`, `utcHourToLocal`); confirm they match `SettingsTab.jsx`'s local copies (lines 21-29) before deleting reliance on those.
  - `DevicesGroup({ setup, onNavigate })`, `DataGroup({ setup })`, `AlertDefaultsGroup({ setup, onNavigate })`, `GeneralSection({ setup, onNavigate })`. All default exports. `onNavigate` is optional here and unused until Task 8.

Every household save in these groups goes through `useSettingSaver(mutation, { toastsEnabled: retentionConfig?.toastsEnabled ?? true })`, one saver per mutation, and every toggle/select value through `useSetting(saved, (v) => save({ key: v }))`. That includes repair, which today calls its mutation bare.

Rows (labels exact; descriptions are today's text unless given):

**Devices**
| Label | Control | Save |
|---|---|---|
| HomeKit auto-scan | `Toggle` | retention `{ autoScanHomeKit }` |
| Scheduled Repair | `Toggle` | repair `{ enabled }` |
| dependent: Repair hour | `<select aria-label="Repair hour">` of `HOURS_OPTIONS` | repair `{ hour: localHourToUtc(v) }` |

Auto-scan description: `Scan for HomeKit accessories every hour in the background. Manual scans from Add Accessories still work when this is off.` Scheduled Repair description is today's two sentences, now under the label. Repair hour and the last-run line render only while Scheduled Repair is on; the last-run line is the row `footnote`, text unchanged (`No runs yet` / `Last run: … · N repaired, M failed`).

**Data**
| Label | Control | Save |
|---|---|---|
| Retention cutoff | `NumberField` min 1, max 3650, unit `days` | retention `{ retentionDays }` |
| Archive before delete | `Toggle` | retention `{ archiveBeforeDelete }` |
| Stale accessory threshold | `NumberField` min 1, max 720, unit `hours` | retention `{ staleThresholdHours }` |

Retention `warning(n)`: when `n < retentionConfig.retentionDays`, return `Events older than ${n} days will be archived at the next sweep.` if archive-before-delete is on, else `Events older than ${n} days will be permanently deleted at the next sweep.`; otherwise `null`. The Download archive button, its count query (`['archive','count']`) and `handleDownloadArchive` move here unchanged, shown as the Archive row's `footnote` when the count is above 0.

**Alerts**
| Label | Control | Save |
|---|---|---|
| Default quiet period | `NumberField` min 0, max 10080, unit `min` | alerts `{ defaultQuietMinutes }` |
| Webhook timeout | `NumberField` min 1000, max 30000, step 500, unit `ms`, `disabled` when `alertsConfig.webhookTimeoutFromEnv` | alerts `{ webhookTimeoutMs }` |

Webhook timeout description: `Set by ALERTS_WEBHOOK_TIMEOUT_MS in .env.` when from env, else `Max wait time for webhook delivery.`

- [ ] **Step 1: Write the tests**

Port the nine tests under `describe('Scheduled Repair section')` from `SettingsTab.test.jsx` into `DevicesGroup.test.jsx`. Keep each assertion; render `<DevicesGroup setup={makeSetup(...)} />` in the same providers; drop the `openDeviceTab()` calls; query the control as `getByRole('switch', { name: 'Scheduled Repair' })` with `aria-checked`. The "calls saveRepairMutation.mutate with { enabled: true }" test becomes: advance fake timers 300ms, expect `saveRepairMutation.mutateAsync` called with `{ enabled: true }`.

Add:

```jsx
// DevicesGroup.test.jsx
it('returns the repair switch to off and reports it when the save fails', async () => {
  const setup = makeSetup({ saveRepairMutation: { mutateAsync: vi.fn().mockRejectedValue(new Error('403')) } });
  renderGroup(setup);
  await userEvent.click(screen.getByRole('switch', { name: 'Scheduled Repair' }));
  await act(() => vi.advanceTimersByTimeAsync(300));
  expect(screen.getByRole('switch', { name: 'Scheduled Repair' })).toHaveAttribute('aria-checked', 'false');
  expect(screen.getByText('Failed to save setting')).toBeInTheDocument();
});
it('saves the repair hour as UTC', ...);  // select '5 AM' -> mutateAsync({ hour: localHourToUtc(5) })

// DataGroup.test.jsx
it('warns "archived" when lowering retention with archive on, "permanently deleted" with it off, nothing when raising', ...);
it('sends retentionDays only after Apply', ...);            // type 30, blur -> not called; click Apply -> { retentionDays: 30 }
it('shows Download archive only when the archive count is above 0', ...);

// AlertDefaultsGroup.test.jsx
it('disables Webhook timeout and names the env var when set by env', ...);
it('sends defaultQuietMinutes on Apply, not on blur', ...);
it('accepts 0 for Default quiet period', ...);
```

- [ ] **Step 2: Run and confirm they fail**

Run: `npx vitest run src/components/settings/DevicesGroup.test.jsx src/components/settings/DataGroup.test.jsx src/components/settings/AlertDefaultsGroup.test.jsx`
Expected: FAIL, modules not found.

- [ ] **Step 3: Implement the hook, the three groups and `GeneralSection`**

`GeneralSection` renders the three groups in the order Devices, Data, Alerts inside a fragment. Do not mount it anywhere yet.

- [ ] **Step 4: Run and confirm they pass; run the whole suite**

Run: `npm test`
Expected: PASS, including the untouched `SettingsTab` tests.

- [ ] **Step 5: Commit**

```bash
git add web/src/hooks/useCanManageHome.js web/src/components/settings
git commit --only web/src/hooks/useCanManageHome.js web/src/components/settings -m "feat(settings): General page groups for devices, data and alert defaults"
```

---

### Task 6: Preferences page (personal settings)

**Files:**
- Create: `hooks/useToastPrefs.js`, `components/settings/NotificationsGroup.jsx`, `TimelineGroup.jsx`, `QuietHoursGroup.jsx`, `PreferencesSection.jsx`
- Test: `components/settings/NotificationsGroup.test.jsx`, `NotificationsGroup.blob.test.jsx`, `TimelineGroup.test.jsx`, `QuietHoursGroup.blob.test.jsx`
- Read, do not modify yet: `components/setup/SettingsTab.jsx` lines 57-83, 188-217, 646-776, 779-1006; `SettingsTab.blob.test.jsx`; `SettingsTab.test.jsx` lines 242-270

**Interfaces:**
- Consumes: Tasks 1, 3, 4, `useCanManageHome` and `HOURS_OPTIONS` from Task 5.
- Produces:
  - `useToastPrefs(setup)` returns `{ toastsEnabled, liveEventToastsEnabled, position, duration, maxVisible, set }` where `set(key, value)` takes one of `'toastsEnabled' | 'liveEventToastsEnabled' | 'toastPosition' | 'toastDuration' | 'toastMaxVisible'`. Signed in (`useAuth().user` truthy): values and writes use the existing `usePreference` calls copied from `SettingsTab.jsx` lines 60-64, same keys, defaults and `hc_pref_*` localStorage keys; `set` returns nothing and never toasts. Signed out: values come from `setup.retentionConfig` with the same defaults, and `set` returns the promise from a `useSettingSaver(setup.saveRetentionMutation, { toastsEnabled, onSaved })` save, where `onSaved(result)` calls `configureToasts({ position: result.toastPosition, duration: result.toastDuration, maxVisible: result.toastMaxVisible })`.
  - `NotificationsGroup({ setup, onNavigate })`, `TimelineGroup({ setup })`, `QuietHoursGroup({ setup })`, `PreferencesSection({ setup, onNavigate })`. Default exports.

Rows (labels and option lists exactly as today):

**Notifications**: Toast notifications (`Toggle`), Live event toasts (`Toggle`), Toast position (`select`), Toast duration (`select`), Max visible toasts (`select`). The four rows after the first are `disabled` rows while Toast notifications is off. The Test toast button and its behaviour (`showTestToast`, lines 196-204) move here as the Toast position row's `footnote` action, disabled while toasts are off. The existing warning (`Select accessories to watch on the Manage Accessories tab.`) shows under Live event toasts on the same condition as today; Task 8 turns it into a link.

**Timeline**: Episode capture interval (min 1, max 30, unit `min`), Scene grouping window (min 1, max 30, unit `sec`), Episode minimum events (min 1, max 20, unit `events`). Each is a `NumberField`. Signed in: `onApply` calls the matching blob setter (`usePreference` lines 65-67). Signed out: household saver with `{ episodeWindowMinutes }`, `{ sceneWindowSeconds }`, `{ episodeMinEventCount }`.

**Quiet hours**: Quiet hours (`Toggle`), dependents Start and End (`select` of `HOURS_OPTIONS`, `aria-label` `Quiet hours start` / `Quiet hours end`), and the excluded-accessory chips. Move the logic unchanged: the `blobHasQh` presence predicate, the effective-value derivation, the four-key grouped `setPrefsBlob` write on every signed-in change (QH-08), UTC conversion, and the `['stats','quiet-hours']` invalidation on chip removal. Start, End and the chips show only while Quiet hours is on. Signed out, changes go through the household saver.

- [ ] **Step 1: Write the tests**

Port, keeping each test's harness (the module mocks at the top of `SettingsTab.blob.test.jsx`) and assertions, changing only the rendered component and the control queries (`getByRole('switch', { name })` in place of the checkbox lookups):

| From `SettingsTab.blob.test.jsx` | To |
|---|---|
| A. Authed path, three tests | `NotificationsGroup.blob.test.jsx` |
| B. Anon path, two tests | `NotificationsGroup.blob.test.jsx` |
| D. Quiet-hours anon path | `QuietHoursGroup.blob.test.jsx` |
| E. Quiet-hours authed four-key write | `QuietHoursGroup.blob.test.jsx` |
| F. Quiet-hours prefill, no write on mount | `QuietHoursGroup.blob.test.jsx` |

Leave test C where it is for now; Task 7 moves it. Port the two `describe('Test toast button')` tests from `SettingsTab.test.jsx` to `NotificationsGroup.test.jsx`.

Add:

```jsx
// NotificationsGroup.test.jsx
it('dims the four dependent rows when Toast notifications is off', ...);
  // retentionConfig.toastsEnabled false, signed out -> 4 of 5 settings-row elements have opacity-50

// TimelineGroup.test.jsx
it('signed in: Apply writes the blob setter and not the household mutation', ...);
it('signed out: Apply sends { episodeWindowMinutes: 5 } to the household mutation', ...);
it('refuses 31 for Episode capture interval and 21 for Episode minimum events', ...);

// QuietHoursGroup.blob.test.jsx
it('hides Start, End and the chips while Quiet hours is off', ...);
```

- [ ] **Step 2: Run and confirm they fail**

Run: `npx vitest run src/components/settings/NotificationsGroup.test.jsx src/components/settings/NotificationsGroup.blob.test.jsx src/components/settings/TimelineGroup.test.jsx src/components/settings/QuietHoursGroup.blob.test.jsx`
Expected: FAIL, modules not found.

- [ ] **Step 3: Implement the hook, the three groups and `PreferencesSection`**

`PreferencesSection` renders Notifications, Timeline, Quiet hours in that order. Do not mount it yet.

- [ ] **Step 4: Run the whole suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src/hooks/useToastPrefs.js web/src/components/settings
git commit --only web/src/hooks/useToastPrefs.js web/src/components/settings -m "feat(settings): Preferences page groups for notifications, timeline and quiet hours"
```

---

### Task 7: Grouped rail, visibility, and removal of Configuration

**Files:**
- Modify: `pages/SettingsPage.jsx`, `pages/SettingsPage.test.jsx`, `App.jsx` (line 31), `components/setup/AdminAdvancedSection.jsx`, `components/setup/AdminAdvancedSection.test.jsx`
- Create: `hooks/useUserPreferences.seed.test.jsx`
- Delete: `components/setup/SettingsTab.jsx`, `components/setup/SettingsTab.test.jsx`, `components/setup/SettingsTab.blob.test.jsx`, `e2e/toast-notifications.spec.js`

**Interfaces:**
- Consumes: `GeneralSection`, `PreferencesSection`, `useCanManageHome`, `SettingsGroup`, `SettingsRow`, `SELECT_CLASS`.
- Produces: `SettingsPage` accepts one new optional prop, `onNavigate(page, options)`, passed to `GeneralSection` and `PreferencesSection`. Section ids: `appearance`, `preferences`, `account`, `general`, `admin`, `advanced`, `about`.

Rail:

| Group heading | Item (id, label) | Shown when |
|---|---|---|
| `You` | `appearance` Appearance | always |
| | `preferences` Preferences | always |
| | `account` Account | `authEnabled` |
| `This home` | `general` General | `canManageHome` |
| | `admin` Users & email | `authEnabled && isAdmin` |
| | `advanced` Advanced | `canManageHome` |
| (no heading) | `about` About | always |

`DEFAULT_SECTION = 'appearance'`. A section id that is not currently visible resolves to the default. A group with no visible items renders no heading. Desktop: headings are `text-xs font-semibold uppercase tracking-wider text-hc-muted` above their items. Phone: the `<select>` wraps each group's options in `<optgroup label>`; About is a bare `<option>`.

- [ ] **Step 1: Update `SettingsPage.test.jsx`**

Keep every existing test whose behaviour still exists (controlled/uncontrolled section, deep link to `appearance`, About props, Account only with auth, Users/SMTP only for admins), updating ids and labels. Remove tests that assert the Configuration item or its inner tabs, and name each removed test in the commit body. Add:

```jsx
it('auth off: shows Appearance, Preferences, General, Advanced, About', ...);
it('admin: shows all seven items under You / This home', ...);
it('member: shows Appearance, Preferences, Account, About and no "This home" heading', ...);
it('opens on Appearance', ...);
it.each(['general', 'advanced', 'admin', 'configuration', 'nonsense'])(
  'member holding section %j lands on Appearance with no household control', (section) => {
    renderPage({ auth: 'member', section, onSectionChange: vi.fn() });
    expect(screen.getByRole('heading', { level: 2, name: 'Appearance' })).toBeInTheDocument();
    expect(screen.queryByText('Retention cutoff')).toBeNull();
    expect(screen.queryByText('Log level')).toBeNull();
    expect(screen.queryByText('Scheduled Repair')).toBeNull();
  });
it('renders no tablist anywhere in Settings', () => {
  renderPage({ auth: 'admin', section: 'general', onSectionChange: vi.fn() });
  expect(screen.queryByRole('tablist')).toBeNull();
});
it('General shows the Devices, Data and Alerts groups; Preferences shows Notifications, Timeline and Quiet hours', ...);
it('phone: the select groups options under You and This home', ...);
```

In `AdminAdvancedSection.test.jsx`, keep all nine tests; the Log level select is now found with `getByRole('combobox', { name: 'Log level' })`.

- [ ] **Step 2: Run and confirm the new tests fail**

Run: `npx vitest run src/pages/SettingsPage.test.jsx`
Expected: FAIL on the new rail tests.

- [ ] **Step 3: Rebuild `SettingsPage.jsx`**

Replace `navItems` with the grouped structure above; mount `PreferencesSection`, `GeneralSection` and `AdminAdvancedSection setup={setup}` for their ids; remove the `SettingsTab` import and the `showAdvanced` variable. Update the stale comments about Configuration. In `App.jsx` change the initial `settingsSection` from `'configuration'` to `'appearance'` and pass `onNavigate={navigate}` to `SettingsPage`.

- [ ] **Step 4: Convert Log level in `AdminAdvancedSection.jsx`**

Wrap the Advanced card's Log level in `SettingsGroup title="Advanced"` + `SettingsRow label="Log level"` with the existing select (`aria-label="Log level"`, `SELECT_CLASS`), description unchanged, the existing error line as `footnote`. Route the change through `useSetting` + `useSettingSaver(saveLogLevelMutation, …)` so a failed save reverts. Leave the Danger Zone markup alone.

- [ ] **Step 5: Move test C, then delete the old files**

Move `describe('C. seedIfEmpty assembles full D-12 snapshot …')` and the mocks it needs from `SettingsTab.blob.test.jsx` into `hooks/useUserPreferences.seed.test.jsx`, fixing relative import paths only. Run it and confirm it passes before deleting anything.

Before deleting `SettingsTab.test.jsx` and `SettingsTab.blob.test.jsx`, list every `it(` title in both and check each against this table. Any title not accounted for stops the task.

| Old test group | New home |
|---|---|
| Scheduled Repair section (9) | `DevicesGroup.test.jsx` (Task 5) |
| Tabbed Configuration (5) | gone with the tabs; "Log level / Danger Zone not in non-admin view" is covered by the member tests above |
| Advanced tab gating (7) | `SettingsPage.test.jsx` rail visibility tests |
| Test toast button (2) | `NotificationsGroup.test.jsx` (Task 6) |
| Blob A, B, D, E, F | Task 6 files |
| Blob C | `useUserPreferences.seed.test.jsx` |

Then `git rm` the four files. `e2e/toast-notifications.spec.js` is retired, not updated: it clicks a "Settings sub-tab" and a Save button that no longer exist, CI does not run it, and what it checked is now covered by `NotificationsGroup.test.jsx` and `useSettingSaver.test.jsx`.

Confirm nothing else imports the deleted component: `grep -rn "SettingsTab" web/src e2e scripts` must return nothing. If `scripts/capture-screenshots.mjs` drives the old tabs, leave it and record that in the commit body; screenshots are release-time work.

- [ ] **Step 6: Run everything**

Run: `npm test && npm run build`
Expected: PASS, build succeeds.

- [ ] **Step 7: Commit**

```bash
git add web/src/pages/SettingsPage.jsx web/src/pages/SettingsPage.test.jsx web/src/App.jsx web/src/components/setup/AdminAdvancedSection.jsx web/src/components/setup/AdminAdvancedSection.test.jsx web/src/hooks/useUserPreferences.seed.test.jsx
git rm web/src/components/setup/SettingsTab.jsx web/src/components/setup/SettingsTab.test.jsx web/src/components/setup/SettingsTab.blob.test.jsx e2e/toast-notifications.spec.js
git diff --cached --stat   # must list exactly these ten paths
git commit -m "feat(settings): grouped rail by owner; Configuration and its tabs removed" -m "<removed tests and why>"
```

Use plain `git commit` here only after `git diff --cached --stat` shows exactly the ten paths; if anything else is staged, stop and ask.

---

### Task 8: Links between pages and the Live Toasts button

**Files:**
- Modify: `App.jsx`, `pages/DevicesPage.jsx`, `pages/DevicesPage.test.jsx`, `pages/AlertsPage.jsx`, `components/setup/MyDevicesTab.jsx`, `components/setup/MyDevicesTab.test.jsx`, `components/settings/AlertDefaultsGroup.jsx`, `DevicesGroup.jsx`, `NotificationsGroup.jsx` and their tests
- Create: `pages/AlertsPage.test.jsx`

**Interfaces:**
- Consumes: `onNavigate(page, options)` (already `navigate` in `App.jsx`), `useCanManageHome`, `useToastPrefs`.
- Produces:
  - `navigate('devices', { tab })` with `tab` one of `'browse' | 'add' | 'devices'`. `App.jsx` holds `devicesTab` state (initial `'browse'`) exactly as it holds `settingsSection`, and passes `tab` / `onTabChange` to `DevicesPage`.
  - `DevicesPage({ onSelectAccessory, onNavigate, tab, onTabChange })`: `tab`/`onTabChange` make the active tab controlled, with the same fall-back-to-own-state rule `SettingsPage` uses for `section`. `onNavigate` is passed to `MyDevicesTab`.
  - `AlertsPage({ onNavigate })`.

Links (exact text; all are `<button type="button">` styled as text links, `text-xs text-hc-accent-strong hover:underline` + `FOCUS_RING`):

| Where | Text | Action | Shown to |
|---|---|---|---|
| General › Alerts group, under the rows | `Manage rules on the Alerts page` | `onNavigate('alerts')` | whoever sees the group |
| General › Devices group, under the rows | `Manage accessories` | `onNavigate('devices', { tab: 'devices' })` | whoever sees the group |
| Alerts page, above the Alert Rules card, right-aligned | `Alert defaults` | `onNavigate('settings', { section: 'general' })` | `useCanManageHome()` |
| Devices › Manage Accessories, beside Repair All | `Auto-scan and repair schedule` | `onNavigate('settings', { section: 'general' })` | `useCanManageHome()` |
| Preferences › Live event toasts warning | `Select accessories to watch in Manage Accessories` | `onNavigate('devices', { tab: 'devices' })` | `useCanManageHome()` |

For a member, the Live event toasts warning is plain text: `An admin chooses which accessories are watched.`

Live Toasts button in `MyDevicesTab.jsx` (lines 289-300): replace its read of `retentionConfig?.liveEventToastsEnabled` and its `saveRetentionMutation.mutate({ liveEventToastsEnabled })` with `useToastPrefs(setup)`: read `liveEventToastsEnabled`, write `set('liveEventToastsEnabled', next)`. Keep its label, styling and its own "Live toasts enabled / disabled" toast.

- [ ] **Step 1: Write the failing tests**

```jsx
// DevicesPage.test.jsx
it('opens the tab given by the tab prop and reports changes', ...);   // tab="devices" -> Manage Accessories selected; click Browse -> onTabChange('browse')
it('owns its tab when rendered without tab/onTabChange', ...);

// MyDevicesTab.test.jsx
it('signed in: Live Toasts reads and writes the personal preference, not the household setting', async () => {
  // mock useAuth -> { user: { role: 'admin' } }; mock usePreference for 'liveEventToastsEnabled' -> [false, setBlob]
  // retentionConfig.liveEventToastsEnabled = true (deliberately disagreeing)
  // button shows the OFF state; click -> setBlob(true); saveRetentionMutation.mutate / mutateAsync not called
});
it('auth off: Live Toasts writes the household setting', ...);
it('shows "Auto-scan and repair schedule" to an admin and navigates to Settings general', ...);
it('hides "Auto-scan and repair schedule" from a member', ...);

// AlertsPage.test.jsx
it('shows "Alert defaults" to an admin and navigates to Settings general; hides it from a member', ...);

// NotificationsGroup.test.jsx
it('admin: the watch-list hint is a link to Manage Accessories', ...);
it('member: the watch-list hint is plain text naming an admin', ...);

// AlertDefaultsGroup.test.jsx / DevicesGroup.test.jsx
it('links to the Alerts page', ...);            // click -> onNavigate('alerts')
it('links to Manage Accessories', ...);         // click -> onNavigate('devices', { tab: 'devices' })
```

- [ ] **Step 2: Run and confirm they fail**

Run: `npx vitest run src/pages src/components/setup/MyDevicesTab.test.jsx src/components/settings`
Expected: FAIL on the new tests only.

- [ ] **Step 3: Implement**

In `App.jsx`: add `devicesTab` state; in `navigate`, `if (page === 'devices') setDevicesTab(options?.tab ?? 'browse');`; pass `onNavigate={navigate}` to `DevicesPage` and `AlertsPage`. The existing `onViewDeviceRepair={() => setActivePage('devices')}` on the dashboard is left as it is.

- [ ] **Step 4: Run everything**

Run: `npm test && npm run build`
Expected: PASS.

- [ ] **Step 5: Commit**

Stage each modified and created path from the Files list explicitly, check `git diff --cached --stat` lists only those, then:

```bash
git commit --only <those paths> -m "feat(settings): links between Settings, Alerts and Devices; Live Toasts follows your own preference"
```

---

### Task 9: Changelog and visual verification

**Files:**
- Modify: `CHANGELOG.md` (the `## [0.6.1] — Unreleased` section only; if that heading has changed, use whichever section is marked Unreleased)

- [ ] **Step 1: Add changelog entries**

Under the Unreleased section, matching the surrounding style. Do not consolidate or reorder existing entries.

- Under `### Changed` (create the heading after `### Added` if absent):
  - `**Settings reorganised:** Settings is grouped into **You** (Appearance, Preferences, Account) and **This home** (General, Users & email, Advanced). Configuration and its inner tabs are gone: toasts, timeline grouping and quiet hours are under **Preferences**; device, data and alert defaults are under **General**. Every setting now uses the same row layout.`
  - `**Number settings apply on the row:** retention, thresholds and timeouts show an **Apply** button beside the field in place of the floating Save button. Lowering retention says what the next sweep will remove before you apply it.`
  - `**Members no longer see household settings** they could not change.`
- Under `### Fixed`:
  - `A setting whose save failed could keep showing the new value. It now returns to the saved value and says so. Scheduled Repair changes used to fail without any message.`
  - `Changing two settings in quick succession could save only the second.`
  - `**Live Toasts** on Devices › Manage Accessories did nothing when signed in; it now follows your own notification preference.`
- Under `### Upgrade notes`: `**Settings moved:** see Changed. No setting was renamed or reset.`

- [ ] **Step 2: Verify in the running app**

Start the app (`./scripts/dev-local.sh`, or the web dev server against an available listener; check Docker availability first). For each of Appearance, Preferences, General, Advanced, About, plus Devices › Manage and Alerts:

- Light and dark theme, and at least one non-default palette.
- 1280px wide and 390px wide.
- Auth off, and auth on as admin. As a member if a member account is available; if not, say so in the report rather than claiming it.

Check: no box inside a box; label and description at 14px / 12px; control beside its label on desktop and under it on phone; rail headings present; phone select grouped; every link lands where its text says; a number field shows Apply only when changed; lowering retention shows the warning; a toggle save shows "Setting saved".

Report what was checked and what was not. Fix anything found under the task that owns the file, with a test where one applies.

- [ ] **Step 3: Update the graph and commit**

```bash
graphify update .
git add CHANGELOG.md
git commit --only CHANGELOG.md -m "docs(changelog): settings restructure"
```

If `graphify update .` changed tracked files under `graphify-out/`, commit them separately by explicit path.

- [ ] **Step 4: Do not push or deploy**

Pushing `main` and beta deployment are the user's call. Report the commit list and stop.
