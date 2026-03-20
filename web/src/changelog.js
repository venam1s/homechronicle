/**
 * changelog.js — release notes shown to users after an update.
 *
 * Add new entries at the TOP of the array. Each entry needs:
 *   version  — release tag (e.g. "v0.1.3") or "v0.1.3-beta" for pre-releases
 *   title    — one-line summary for this release
 *   items    — array of bullet points
 *
 * Beta builds are combined under a single "-beta" tag.
 * Final releases use the version number (e.g. "v0.1.3").
 */
const CHANGELOG = [
  {
    version: 'v0.1.4',
    title: 'Themes, dark mode, accessories overhaul & standalone Docker image',
    items: [
      'Standalone Docker image: single container with PostgreSQL, listener, and web UI',
      'Themes: Slate Grey, Alabaster, Bubblegum, Coral, Golden, Violet, and Teal skins',
      'Dark mode: consistent CSS variable theming, chart/tooltip visibility fixes',
      'Accessories: show all discovered bridge children, including those without standard HomeKit characteristics',
      'Accessories: show bridge names instead of MAC addresses, protocol badges (Matter / HomeKit)',
      'Accessories: poll current values on connect so idle accessories appear immediately',
      'Dashboard: stat card labels, quiet hours panel backed by real API, dark mode fixes',
      'Settings: reorganized into Data, Alerts, Timeline, and Advanced sections',
      'Listener: add LeakDetected, FilterChangeIndication, and FilterMaintenance to watched types',
      'Performance: server-side TTL cache, batch alert checks, composite indexes, vendor chunk splitting',
      'Security: container resource limits, non-root listener, private webhook targets blocked, configurable API bind address',
      'Reliability: write lock on JSON stores, React error boundaries on all tabs',
      'Accessibility: aria-labels on icon buttons, form inputs, and pagination controls',
      'Terminology: "devices" renamed to "accessories" throughout the UI',
      'Room colors: improved hash for more even, distinct color distribution',
      'License changed from MIT to AGPL-3.0',
      'Fix: initial poll no longer floods timeline with duplicate events',
      'Fix: standalone devices with no events were incorrectly hidden as bridges',
    ],
  },
  {
    version: 'v0.1.3',
    title: 'Dark mode, episodes, quiet hours, device notes & docs site',
    items: [
      'Dark mode polish across all components',
      'Timeline: related events grouped into collapsible episodes',
      'Quiet hours: suppress alert notifications during configured time windows',
      'Device notes via API and UI',
      'Documentation site served at /guide/',
      'Bridge device grouping in accessories list',
      'Update available indicator in footer',
      'Fix: stale web cache, accessories back navigation, modal close button',
    ],
  },
  {
    version: 'v0.1.3-beta',
    title: 'Archive toggle, device notes backend & settings improvements',
    items: [
      'Settings: archive before delete toggle \u2014 control whether expired events are copied to the archive table or permanently removed',
      'Fix: device notes now persist to the backend (previously the API endpoints were missing)',
      'Bridge grouping, display names, dark mode polish & fixes from earlier betas',
    ],
  },
  {
    version: 'v0.1.2-beta',
    title: 'Quiet hours, timeline episodes, device notes & Matter improvements',
    items: [
      'Quiet hours: flag unexpected device activity during a defined time window',
      'Timeline: related events grouped into collapsible episodes',
      'Timeline: accessory names link to detail page',
      'Device notes and dashboard accent colors',
      'Matter: help modal, device deletion with endpoint cleanup',
      'Fix: pairing keys preserved during rescans; Matter device deletion fixed',
      'App footer with version, changelog, and issue link',
    ],
  },
];

export default CHANGELOG;
