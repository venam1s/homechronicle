// Shared class strings for settings controls.
export const FOCUS_RING = 'focus-visible:outline-2 focus-visible:outline-hc-focus-ring focus-visible:outline-offset-2';

// A button that reads as a text link, e.g. a link from Settings to another page.
export const LINK_CLASS = `text-xs text-hc-accent-strong hover:underline ${FOCUS_RING}`;

export const SELECT_CLASS = 'text-sm border border-hc-border-strong rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-hc-focus-ring bg-hc-panel text-hc-fg-strong disabled:opacity-60 disabled:cursor-not-allowed';

export const INPUT_CLASS = `w-24 ${SELECT_CLASS}`;
