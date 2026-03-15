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
    version: 'v0.1.4-beta',
    title: 'Scene & episode tuning, accent-themed heatmap',
    items: [
      'Settings: scene grouping window (seconds) \u2014 control how tightly events are clustered into scenes',
      'Settings: episode minimum event count \u2014 set the threshold for promoting scene clusters to episodes',
      'Heatmap: cells now use the accent color instead of hardcoded emerald',
      'Room color palette reordered for better visual distinction',
      'Fix: placeholder text contrast on room/note inputs',
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
