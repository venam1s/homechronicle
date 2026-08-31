/**
 * roomColors.js — deterministic, stable color assignments for room names.
 *
 * The same room name always maps to the same slot, everywhere in the app, and
 * that mapping does NOT change when filters, date ranges, or activity ranking
 * change (ROOM-02). Colour follows the room, never its rank.
 *
 * Pre-v0.4 this module owned a hardcoded twelve-entry palette of `light-dark()`
 * pairs. It now hashes into the ACTIVE palette's nine-slot categorical ramp and
 * returns CSS custom properties rather than literal colors, which means a room
 * badge re-colours on palette and theme change with no JS and no re-render.
 * See src/lib/palettes.js for the ramps and their validation.
 *
 * Room identity is never conveyed by colour alone — every call site renders the
 * room name alongside the swatch (ROOM-03).
 */

/** Number of categorical slots each palette ramp provides. */
export const SLOT_COUNT = 9;

/**
 * Stable 1-based slot for a room name.
 *
 * FNV-style multiply-and-add over the code points, forced unsigned so the
 * result is platform-independent. Exported for tests and for anything that
 * needs the slot number rather than the CSS variables.
 */
export function getRoomSlot(roomName) {
  let hash = 0;
  for (let i = 0; i < roomName.length; i += 1) {
    hash = (hash * 31 + roomName.charCodeAt(i)) >>> 0;
  }
  return (hash % SLOT_COUNT) + 1;
}

/**
 * CSS variable references for a room's swatch, badge background, and badge
 * text, or `null` when there is no room.
 *
 * Returns `var(...)` strings, not hex: callers drop them straight into inline
 * styles and the browser resolves them against whichever palette and mode are
 * active.
 */
export function getRoomColor(roomName) {
  if (!roomName) return null;
  const slot = getRoomSlot(roomName);
  return {
    dot: `var(--hc-room-${slot})`,
    bg: `var(--hc-room-${slot}-soft)`,
    text: `var(--hc-room-${slot}-text)`,
  };
}
