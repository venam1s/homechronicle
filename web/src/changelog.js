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
    title: 'Performance, security hardening & accessibility',
    items: [
      'Performance: server-side TTL cache for stats endpoints (stale-while-revalidate)',
      'Performance: batch alert suppression checks into a single query',
      'Performance: new composite index on (accessory_id, timestamp) for detail views',
      'Performance: vendor chunk splitting for faster repeat page loads',
      'Performance: React.memo on timeline components, useMemo on chart data',
      'Performance: reduced accessory list polling interval',
      'Security: container resource limits (CPU/memory) on all services',
      'Security: non-root user in listener container',
      'Security: private webhook targets blocked by default (set ALERTS_ALLOW_PRIVATE_TARGETS=true to allow)',
      'Security: configurable API bind address (API_BIND_ADDRESS)',
      'Security: segmented nginx proxy timeouts (30s normal, 300s for pairing)',
      'Security: audit logging for all mutating API requests',
      'Reliability: write lock on JSON file stores to prevent race conditions',
      'Reliability: React error boundaries on all tab views',
      'Accessibility: aria-labels on icon buttons, form inputs, and pagination controls',
      'Fix: cleanup errors now logged at debug level instead of silently swallowed',
      'Fix: stable React keys replace index-based keys in charts and heatmaps',
    ],
  },
  {
    version: 'v0.1.4-beta',
    title: 'New themes, settings sections, terminology & UX polish',
    items: [
      'Themes: added Slate Grey and Alabaster skins',
      'Themes: new Bubblegum, Coral, Golden, Violet, and Teal skins replace old palette',
      'Settings: organized into Data, Alerts, Timeline, and Advanced sections',
      'Terminology: "devices" renamed to "accessories" throughout the UI',
      'Matter help modal: "See supported accessories" now opens directly to the supported devices section',
      'Room chart bars now use the accent color',
      'Listener: child accessories inherit bridge room when no room is set',
      'Dark mode: improved panel colors, dividers, and accent-soft overrides',
      'Scene & episode tuning settings and accent-themed heatmap (from earlier beta)',
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
