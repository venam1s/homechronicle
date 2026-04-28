/**
 * roomColors.js — deterministic, stable color assignments for room names.
 * The same room name always maps to the same color across all components.
 *
 * Uses CSS light-dark() so inline styles automatically adapt to dark mode
 * (requires color-scheme to be set on :root, which useTheme handles).
 */

const RAW_PALETTE = [
  { bg: '#fee2e2', darkBg: '#450a0a', text: '#7f1d1d', darkText: '#fecaca', dot: '#f87171' }, // red
  { bg: '#dbeafe', darkBg: '#172554', text: '#1e3a8a', darkText: '#bfdbfe', dot: '#60a5fa' }, // blue
  { bg: '#fef3c7', darkBg: '#451a03', text: '#78350f', darkText: '#fde68a', dot: '#f59e0b' }, // amber
  { bg: '#ede9fe', darkBg: '#2e1065', text: '#4c1d95', darkText: '#ddd6fe', dot: '#a78bfa' }, // violet
  { bg: '#d1fae5', darkBg: '#022c22', text: '#064e3b', darkText: '#a7f3d0', dot: '#34d399' }, // emerald
  { bg: '#fce7f3', darkBg: '#500724', text: '#831843', darkText: '#fbcfe8', dot: '#f472b6' }, // pink
  { bg: '#fff7ed', darkBg: '#431407', text: '#7c2d12', darkText: '#fed7aa', dot: '#fb923c' }, // orange
  { bg: '#e0f2fe', darkBg: '#0c4a6e', text: '#0c4a6e', darkText: '#bae6fd', dot: '#38bdf8' }, // sky
  { bg: '#f5f3ff', darkBg: '#1e1b4b', text: '#3b0764', darkText: '#c7d2fe', dot: '#8b5cf6' }, // purple
  { bg: '#ecfdf5', darkBg: '#022c22', text: '#064e3b', darkText: '#a7f3d0', dot: '#6ee7b7' }, // teal
  { bg: '#fdf4ff', darkBg: '#4a044e', text: '#701a75', darkText: '#f5d0fe', dot: '#e879f9' }, // fuchsia
  { bg: '#f0fdf4', darkBg: '#052e16', text: '#14532d', darkText: '#bbf7d0', dot: '#86efac' }, // green
];

const PALETTE = RAW_PALETTE.map(({ bg, darkBg, text, darkText, dot }) => ({
  bg: `light-dark(${bg}, ${darkBg})`,
  text: `light-dark(${text}, ${darkText})`,
  dot,
}));

export function getRoomColor(roomName) {
  if (!roomName) return null;
  let hash = 0;
  for (let i = 0; i < roomName.length; i++) {
    hash = (hash * 31 + roomName.charCodeAt(i)) >>> 0;
  }
  return PALETTE[hash % PALETTE.length];
}
