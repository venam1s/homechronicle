/**
 * roomColors.js — deterministic, stable color assignments for room names.
 * The same room name always maps to the same color across all components.
 *
 * Uses CSS light-dark() so inline styles automatically adapt to dark mode
 * (requires color-scheme to be set on :root, which useTheme handles).
 */

const RAW_PALETTE = [
  { bg: '#fee2e2', darkBg: '#450a0a', text: '#991b1b', darkText: '#fca5a5', dot: '#f87171' }, // red
  { bg: '#dbeafe', darkBg: '#172554', text: '#1e40af', darkText: '#93c5fd', dot: '#60a5fa' }, // blue
  { bg: '#fef3c7', darkBg: '#451a03', text: '#92400e', darkText: '#fcd34d', dot: '#f59e0b' }, // amber
  { bg: '#ede9fe', darkBg: '#2e1065', text: '#5b21b6', darkText: '#c4b5fd', dot: '#a78bfa' }, // violet
  { bg: '#d1fae5', darkBg: '#022c22', text: '#065f46', darkText: '#6ee7b7', dot: '#34d399' }, // emerald
  { bg: '#fce7f3', darkBg: '#500724', text: '#9d174d', darkText: '#f9a8d4', dot: '#f472b6' }, // pink
  { bg: '#fff7ed', darkBg: '#431407', text: '#7c2d12', darkText: '#fdba74', dot: '#fb923c' }, // orange
  { bg: '#e0f2fe', darkBg: '#0c4a6e', text: '#075985', darkText: '#7dd3fc', dot: '#38bdf8' }, // sky
  { bg: '#f5f3ff', darkBg: '#1e1b4b', text: '#4c1d95', darkText: '#a5b4fc', dot: '#8b5cf6' }, // purple
  { bg: '#ecfdf5', darkBg: '#022c22', text: '#064e3b', darkText: '#6ee7b7', dot: '#6ee7b7' }, // teal
  { bg: '#fdf4ff', darkBg: '#4a044e', text: '#701a75', darkText: '#f0abfc', dot: '#e879f9' }, // fuchsia
  { bg: '#f0fdf4', darkBg: '#052e16', text: '#14532d', darkText: '#86efac', dot: '#86efac' }, // green
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
