/**
 * roomColors.js — deterministic, stable color assignments for room names.
 * The same room name always maps to the same color across all components.
 */

const PALETTE = [
  { bg: '#dbeafe', text: '#1e40af', dot: '#3b82f6' }, // blue
  { bg: '#fee2e2', text: '#991b1b', dot: '#ef4444' }, // red
  { bg: '#d1fae5', text: '#065f46', dot: '#10b981' }, // emerald
  { bg: '#fef3c7', text: '#92400e', dot: '#f59e0b' }, // amber
  { bg: '#ede9fe', text: '#5b21b6', dot: '#8b5cf6' }, // violet
  { bg: '#fce7f3', text: '#9d174d', dot: '#ec4899' }, // pink
  { bg: '#fff7ed', text: '#7c2d12', dot: '#f97316' }, // orange
  { bg: '#ccfbf1', text: '#115e59', dot: '#14b8a6' }, // teal
  { bg: '#fdf4ff', text: '#701a75', dot: '#d946ef' }, // fuchsia
  { bg: '#fef9c3', text: '#713f12', dot: '#eab308' }, // yellow
  { bg: '#e0e7ff', text: '#3730a3', dot: '#6366f1' }, // indigo
  { bg: '#fecdd3', text: '#881337', dot: '#f43f5e' }, // rose
];

export function getRoomColor(roomName) {
  if (!roomName) return null;
  let hash = 0;
  for (let i = 0; i < roomName.length; i++) {
    hash = (hash * 31 + roomName.charCodeAt(i)) >>> 0;
  }
  return PALETTE[hash % PALETTE.length];
}
