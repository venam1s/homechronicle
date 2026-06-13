---
phase: quick-260613-nwt
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - web/src/pages/SettingsPage.jsx
  - web/src/components/setup/SettingsTab.jsx
  - web/src/components/setup/AdminAdvancedSection.jsx
  - web/src/components/setup/SettingsTab.test.jsx
  - web/src/components/setup/AdminAdvancedSection.test.jsx
autonomous: true
requirements: []
must_haves:
  truths:
    - "On opening Settings, the Configuration sub-section is selected first for every role (admin and non-admin)."
    - "Inside Configuration, content is split across 4 tabs (About, Device Management, Data management, Toast) with About selected by default."
    - "Tabs are keyboard-accessible (Enter/Space) and reuse existing --hc-* theme tokens; light/dark mode unaffected."
    - "Log level + Danger Zone (remove pairings, remove all, delete accessory data, wipe all) appear ONLY in the admin-only Advanced area, never in Configuration."
    - "Non-admins never see Log level or Danger Zone anywhere; they cannot delete devices or data."
    - "Every existing handler (auto-save debounce, retention manual Save, repair/alerts toggles, toast config, delete confirmations, remove-all progress) still works."
  artifacts:
    - path: "web/src/components/setup/AdminAdvancedSection.jsx"
      provides: "Admin-only Log level + Danger Zone, consuming the shared setup object"
      contains: "export default function AdminAdvancedSection"
    - path: "web/src/components/setup/AdminAdvancedSection.test.jsx"
      provides: "Coverage for moved Danger Zone + log level"
    - path: "web/src/components/setup/SettingsTab.jsx"
      provides: "Tabbed Configuration (About/Device Management/Data management/Toast), no Advanced/Danger Zone"
      contains: "About"
    - path: "web/src/pages/SettingsPage.jsx"
      provides: "Default section 'configuration'; AdminAdvancedSection rendered in admin block"
      contains: "AdminAdvancedSection"
  key_links:
    - from: "web/src/pages/SettingsPage.jsx"
      to: "web/src/components/setup/AdminAdvancedSection.jsx"
      via: "render <AdminAdvancedSection setup={setup} /> inside activeSection === 'admin' && isAdmin"
      pattern: "AdminAdvancedSection setup=\\{setup\\}"
    - from: "web/src/components/setup/AdminAdvancedSection.jsx"
      to: "saveLogLevelMutation / deletePairingMutation / deleteAccessoryMutation / deleteMatterPairingMutation"
      via: "consumed from the setup prop"
      pattern: "setup"
---

<objective>
Restructure the Settings UI (web/) without changing behavior except for one intentional access-control move. Three locked changes:

1. SettingsPage default sub-section becomes `'configuration'` for all roles (login landing page unchanged — still Dashboard).
2. Configuration (SettingsTab) becomes a 4-tab layout (About / Device Management / Data management / Toast), default tab About.
3. Log level + Danger Zone move out of SettingsTab into a new admin-only `AdminAdvancedSection`, rendered in the Admin section after UsersPanel + SMTPConfigSection.

Purpose: Cleaner Settings IA and enforce "members cannot delete devices/data" (Danger Zone is the only deletion UI in the app).
Output: 1 new component + 1 new test file; 3 existing files edited.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
</execution_context>

<context>
@web/src/pages/SettingsPage.jsx
@web/src/components/setup/SettingsTab.jsx
@web/src/components/setup/SettingsTab.test.jsx
@web/src/components/Card.jsx
@web/src/hooks/useSetup.js

<interfaces>
<!-- Confirmed mutation contracts from useSetup.js — the executor must NOT re-derive these. -->

saveLogLevelMutation.mutateAsync(level: string)  // takes a bare string, NOT an object.
  onSuccess only does queryClient.setQueryData(['setup','log-level'], next).
  It does NOT toast and does NOT invalidate on error — in the OLD code those lived in
  SettingsTab.flushAutoSave. AdminAdvancedSection must reproduce them itself:
    success → addToast('Setting saved', 'success') when toasts enabled
    error   → addToast('Failed to save setting', 'error') + queryClient.invalidateQueries(['setup','log-level'])

deletePairingMutation.mutate(deviceId)            // self-invalidates cache in onSuccess
deleteMatterPairingMutation.mutate(nodeId)        // self-invalidates cache in onSuccess
deleteAccessoryMutation.mutate(accessoryId)       // self-invalidates cache in onSuccess
  Component only adds optional toast on accessory delete success (gated on retentionConfig?.toastsEnabled !== false).

Wipe-all uses a direct fetchJson('/api/data/all', { method:'DELETE', body: {confirm:'DELETE ALL'} }) then window.location.reload().
</interfaces>

Existing SettingsPage left-rail pattern to mirror for tabs:
  NAV_ACTIVE / NAV_INACTIVE class constants; role="button" tabIndex={0}
  onKeyDown checking e.key === 'Enter' || e.key === ' '.

Tailwind spacing set in use: {4,8,16,24,32,48,64} (px-4, py-2, gap-1, mb-6, etc).
Theme tokens: --hc-* only (bg-hc-panel, text-hc-fg, border-hc-panel-border, bg-hc-panel-mid, border-hc-accent-strong, hover:bg-hc-panel-hover, text-hc-muted, etc). No hardcoded colors except the pre-existing red-* Danger Zone classes carried verbatim.
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Create AdminAdvancedSection.jsx (Log level + Danger Zone) with its own toast/error wiring</name>
  <files>web/src/components/setup/AdminAdvancedSection.jsx, web/src/components/setup/AdminAdvancedSection.test.jsx</files>
  <behavior>
    - Renders a "Log level" control: a select of error/warn/info/debug; changing it calls saveLogLevelMutation.mutateAsync(value).
    - On log-level save success → addToast('Setting saved','success') (only when retentionConfig?.toastsEnabled !== false).
    - On log-level save failure → addToast('Failed to save setting','error') AND queryClient.invalidateQueries(['setup','log-level']). On error also shows saveLogLevelMutation.isError message block (carried from old markup).
    - Renders the Danger Zone collapsible: "Remove pairings" list (HomeKit + Matter, per-row confirm + Trash2), "Remove all pairings" with DELETE-confirm input and running progress, "Delete accessory data" list with all/paired/unpaired filter + per-row confirm, "Wipe all event data" with DELETE-confirm input.
    - Matter delete error surfaces per-node via matterDeleteError state.
    - Accessory delete success toasts only when retentionConfig?.toastsEnabled !== false.
    - With empty paired/matterPairings/dbAccessories, shows the "No paired accessories." / "No accessory data in the database." empty states and no remove-all block.
  </behavior>
  <action>
Create `web/src/components/setup/AdminAdvancedSection.jsx` as `export default function AdminAdvancedSection({ setup })`. Destructure from setup ONLY what it needs: logLevelConfig, saveLogLevelMutation, dbAccessories, deleteAccessoryMutation, paired, matterPairings, deletePairingMutation, deleteMatterPairingMutation, retentionConfig.

MOVE — do not rewrite — the following from SettingsTab.jsx verbatim into this component:
- The LOG_LEVELS constant (module-level).
- All Danger Zone state: dangerOpen, dangerPairFilter, confirmDeleteAccessory, wipeConfirmText, wipePending, confirmDeletePairing, removeAllState, removeAllConfirmText, matterDeleteError; plus logLevelInput and its sync useEffect.
- The derived values: logLevelCurrent (= logLevelConfig?.level ?? 'info'; the logLevelInput sync effect depends on it), dangerPairedCount, dangerUnpairedCount, visibleDangerAccessories.
- handleRemoveAll (useCallback, identical body), handleWipeAll (identical body).
- The JSX: the "— Advanced —" heading, the Log level block, and the entire Danger Zone `<section>` — copied byte-for-byte including the pre-existing red-* classes and the `removeAllConfirmText === '_'` sentinel (do NOT "clean up" the sentinel).

CHANGE for log level only (because the old toast/error path lived in SettingsTab.flushAutoSave, which is NOT moving): wire `useToast()` (addToast) and `useQueryClient()` in this component. Replace the old `autoSave({ level: v }, 'logLevel')` onChange with an async handler that calls `saveLogLevelMutation.mutateAsync(v)`; on success addToast('Setting saved','success') gated on `retentionConfig?.toastsEnabled !== false`; on error addToast('Failed to save setting','error') and `queryClient.invalidateQueries({ queryKey: ['setup','log-level'] })`. Keep the `saveLogLevelMutation.isError` message block. Do NOT port the debounce/queue refs — a single select needs no debounce; a direct mutateAsync is behaviorally equivalent.

Imports needed: useState, useEffect, useCallback from 'react' (useEffect is required by the moved logLevelInput sync effect); AlertTriangle, ChevronDown, Loader, Loader2, Trash2 from 'lucide-react'; useQueryClient from '@tanstack/react-query'; clsx; useToast from '../Toast.jsx'. (formatDistanceToNow, Card, fetchJson/API_BASE etc are NOT needed here — wipeHandler uses the dynamic import('../../lib/api.js') already in handleWipeAll.) Match existing style: single quotes, 2-space indent, trailing commas, semicolons.

Create `web/src/components/setup/AdminAdvancedSection.test.jsx` mirroring SettingsTab.test.jsx scaffolding (vi.mock '../../lib/api.js', QueryClientProvider + ToastProvider wrapper, a makeSetup() helper providing the destructured fields). Cover: (1) Log level select renders with current value; changing it calls saveLogLevelMutation.mutateAsync with the chosen level string. (2) Danger Zone heading renders; clicking it expands; "No paired accessories." and "No accessory data in the database." empty states show with empty arrays. (3) With one paired HomeKit accessory: FIRST click the "Danger Zone" header to expand (the zone is collapsed by default — dangerOpen=false — so the rows are not in the DOM until expanded), THEN click the accessory's trash → confirm → "Yes, remove" calls deletePairingMutation.mutate with the id.
  </action>
  <verify>
    <automated>cd web && npm test -- src/components/setup/AdminAdvancedSection.test.jsx</automated>
  </verify>
  <done>AdminAdvancedSection.jsx exports the component; its test file is green; log-level success path toasts and error path invalidates ['setup','log-level'].</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Convert SettingsTab.jsx to 4 tabs and strip Advanced/Danger Zone</name>
  <files>web/src/components/setup/SettingsTab.jsx, web/src/components/setup/SettingsTab.test.jsx</files>
  <behavior>
    - SettingsTab renders a top tab bar with 4 tabs: About, Device Management, Data management, Toast; About active by default.
    - Tab buttons are keyboard-accessible (Enter/Space) and use aria-selected, reusing --hc-* tokens and the {4,8,16,24,32,48,64} spacing set.
    - About tab shows the Documentation + Report an issue links by default.
    - Device Management tab shows HomeKit auto-scan + Scheduled Repair card.
    - Data management tab shows Retention cutoff, Archive before delete, Stale accessory threshold, Alerts & Quiet Hours, and Timeline grouping sections.
    - Toast tab shows the Toast Notifications card.
    - Log level and Danger Zone NO LONGER render anywhere in SettingsTab.
    - The floating Save button stays mounted at the SettingsTab root (fixed, visible regardless of active tab when inputs are dirty).
  </behavior>
  <action>
Edit `web/src/components/setup/SettingsTab.jsx`:

1) DELETE the moved code (now in AdminAdvancedSection): the LOG_LEVELS constant; the logLevelConfig, saveLogLevelMutation entries from the destructure; logLevelInput state + its sync useEffect + the logLevelCurrent derived value; all Danger Zone state (dangerOpen, dangerPairFilter, confirmDeleteAccessory, wipeConfirmText, wipePending, confirmDeletePairing, removeAllState, removeAllConfirmText, matterDeleteError); dangerPairedCount/dangerUnpairedCount/visibleDangerAccessories derived values; handleRemoveAll; handleWipeAll; and the JSX for the "— Advanced —" heading, the Log level block, and the entire Danger Zone `<section>`. Also remove dbAccessories, paired, matterPairings, deletePairingMutation, deleteMatterPairingMutation, deleteAccessoryMutation from the destructure IF nothing remaining references them (note: `paired` and `dbAccessories` are still referenced by the quiet-hours excluded-accessories label lookup at the old lines ~715; keep those in the destructure if still used — re-check references before removing each).

2) REMOVE the `kind === 'logLevel'` branch from flushAutoSave, and drop saveLogLevelMutation from flushAutoSave's dependency array and from the `invalidateQueries(['setup','log-level'])` error revert (the retention revert line stays). flushAutoSave now only handles the retention path. Verify no remaining reference to saveLogLevelMutation or logLevelInput in the file.

3) Introduce tabs. Add `const [tab, setTab] = useState('about');` and a TABS array `[{id:'about',label:'About'},{id:'device',label:'Device Management'},{id:'data',label:'Data management'},{id:'toast',label:'Toast'}]`. Render a horizontal tab bar above the content using a `role="tablist"` wrapper and per-tab `<button role="tab" aria-selected={tab===id} tabIndex={0}>` with onClick + onKeyDown (Enter/Space) calling setTab(id). Style with --hc-* tokens mirroring NAV_ACTIVE/NAV_INACTIVE intent: active = border-b-2 border-hc-accent-strong text-hc-fg-strong font-semibold; inactive = text-hc-muted hover:text-hc-fg. Use spacing from the allowed set (e.g. px-4 py-2, gap-4 or gap-8). Wrap each section group in `{tab === '<id>' && ( ... )}`:
   - 'about' → the About `<Card>`.
   - 'device' → the Device Management heading + HomeKit auto-scan block + Scheduled Repair `<Card>`.
   - 'data' → the Data Management `<Card>` (Retention cutoff, Archive before delete + download, Stale threshold, saveRetentionMutation error) PLUS the Alerts & Quiet Hours sections PLUS the Timeline sections. Fold all of these into this one tab. The Archive download stays here (it is part of Data management, NOT Advanced).
   - 'toast' → the Toast Notifications `<Card>`.

4) KEEP the floating Save button block at the component root, OUTSIDE the per-tab conditionals, so it remains `fixed` and visible on every tab while inputs are dirty.

Preserve every onChange/autoSave/mutation call exactly. Match existing style.

Update `web/src/components/setup/SettingsTab.test.jsx`:
- The existing "Scheduled Repair section" describe block asserts content that now lives in the non-default Device Management tab. For each test in that block, FIRST render then click the "Device Management" tab (e.g. `await userEvent.click(screen.getByRole('tab', { name: 'Device Management' }))`) before the existing assertions. Update getRepairCard accordingly (after the tab click). Drop logLevelConfig/saveLogLevelMutation from makeSetup if unused, or leave them harmlessly — but remove any assertion that depends on log level being in SettingsTab.
- Add tests: About content (Documentation link) visible by default; clicking the Data management tab reveals "Retention cutoff"; "Log level" text is NOT present anywhere in SettingsTab; "Danger Zone" text is NOT present anywhere in SettingsTab.
  </action>
  <verify>
    <automated>cd web && npm test -- src/components/setup/SettingsTab.test.jsx</automated>
  </verify>
  <done>SettingsTab renders 4 keyboard-accessible tabs (About default); Log level and Danger Zone absent from SettingsTab; floating Save button at root; all SettingsTab tests green.</done>
</task>

<task type="auto">
  <name>Task 3: Wire SettingsPage — default 'configuration' + render AdminAdvancedSection in admin block</name>
  <files>web/src/pages/SettingsPage.jsx</files>
  <action>
Edit `web/src/pages/SettingsPage.jsx`:

1) Change the section default to 'configuration' for ALL roles: `const [section, setSection] = useState('configuration');` (replace the role-conditional initializer). The existing non-admin redirect guard `const activeSection = (!isAdmin && section === 'admin') ? 'account' : section;` stays unchanged — it still protects against a non-admin reaching 'admin'. Since the default is now 'configuration' (valid for all roles), no non-admin lands on 'admin' by default. Do NOT change the app login landing page (Dashboard) — this only affects the Settings sub-section.

2) Import AdminAdvancedSection: `import AdminAdvancedSection from '../components/setup/AdminAdvancedSection.jsx';`.

3) Inside the `activeSection === 'admin' && isAdmin` block, render `<AdminAdvancedSection setup={setup} />` AFTER `<UsersPanel />` and `<SMTPConfigSection />`.

Note: `web/src/App.smoke.test.jsx` mocks SettingsPage entirely (stub div) and does NOT assert the default section or Danger Zone location — no test changes needed there. No other test asserts the old admin-default section (verified by grep).

Match existing style.
  </action>
  <verify>
    <automated>cd web && npm test</automated>
  </verify>
  <done>SettingsPage default section is 'configuration'; AdminAdvancedSection rendered admin-only after UsersPanel + SMTPConfigSection; full web suite green.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| browser UI → listener API | Delete/wipe endpoints are mutating; this change gates the deletion UI behind admin-only rendering |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-nwt-01 | Elevation of Privilege | Danger Zone deletion UI | mitigate | AdminAdvancedSection rendered only inside `activeSection === 'admin' && isAdmin`; non-admins never receive the markup. NOTE: this is UI gating only — server-side authorization on /api/data/* and /api/setup/pairing DELETE is the real enforcement and is out of scope for this reorganization (pre-existing). |
| T-nwt-02 | Tampering | npm installs | mitigate | No new packages installed; reuses existing lucide-react, clsx, @tanstack/react-query, vitest. No package.json changes. |
</threat_model>

<verification>
- `cd web && npm test` is fully green.
- `grep -n "Danger Zone\|deletePairing\|LOG_LEVELS\|Log level" web/src/components/setup/SettingsTab.jsx` returns NO matches (moved out).
- `grep -n "AdminAdvancedSection" web/src/pages/SettingsPage.jsx` shows import + render.
- `grep -rn "Danger Zone" web/src/components/setup/` shows it ONLY in AdminAdvancedSection.jsx (exactly-once, no duplication, no loss).
- No new hardcoded hex colors introduced (only carried-forward red-* Danger Zone classes remain).
</verification>

<success_criteria>
- Settings opens on Configuration for all roles; login landing unchanged (Dashboard).
- Configuration shows 4 keyboard-accessible tabs, About default; each tab shows its specified content.
- Log level + Danger Zone render only in the admin Advanced area, after UsersPanel + SMTPConfigSection; absent for non-admins and absent from Configuration.
- All existing behavior (auto-save, manual Save, toggles, toast config, delete flows, remove-all progress, log-level toast/error) preserved.
- Light and dark mode unaffected (only --hc-* + carried red-* classes).
- `cd web && npm test` green.
</success_criteria>

<output>
Create `.planning/quick/260613-nwt-restructure-settings-ui-tabbed-configura/260613-nwt-SUMMARY.md` when done.
</output>
