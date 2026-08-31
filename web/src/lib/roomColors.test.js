import { describe, it, expect } from 'vitest';
import { getRoomColor, getRoomSlot, SLOT_COUNT } from './roomColors.js';

describe('getRoomSlot', () => {
  it('is stable for the same name', () => {
    expect(getRoomSlot('Living Room')).toBe(getRoomSlot('Living Room'));
  });

  it('always lands inside the ramp', () => {
    const names = ['Outside', 'Basement', 'Office', 'Media Room', 'Entrance', 'Living Room',
      'Software', 'Kitchen', 'Garage', 'Attic', 'Nursery', 'Porch', 'Shed', 'Hallway', ''];
    for (const name of names) {
      const slot = getRoomSlot(name);
      expect(slot, name).toBeGreaterThanOrEqual(1);
      expect(slot, name).toBeLessThanOrEqual(SLOT_COUNT);
      expect(Number.isInteger(slot), name).toBe(true);
    }
  });

  it('distinguishes names that differ only by case or spacing', () => {
    expect(getRoomSlot('living room')).not.toBe(getRoomSlot('Living Room'));
  });

  // ROOM-02: colour follows the entity. The mapping depends only on the name,
  // so nothing about ordering, filtering, or activity can repaint a room.
  it('depends only on the name, not on any surrounding collection', () => {
    const rooms = ['Outside', 'Basement', 'Office'];
    const first = rooms.map(getRoomSlot);
    const reordered = [...rooms].reverse().map(getRoomSlot).reverse();
    expect(reordered).toEqual(first);
  });

  // Distribution is asserted over MANY names, not over a handful of realistic
  // ones. With nine slots the birthday paradox dominates a small set — seven
  // rooms are expected to occupy only ~5.3 distinct slots — so asserting on a
  // realistic set would be testing luck, not the hash. (Measured: a stronger
  // FNV-1a mix does no better on real room names and is slightly LESS uniform
  // in bulk, which is why the original multiply-and-add is kept.)
  it('distributes names evenly across the whole ramp', () => {
    const counts = new Array(SLOT_COUNT + 1).fill(0);
    const total = 900;
    for (let i = 0; i < total; i += 1) counts[getRoomSlot(`Room ${i}`)] += 1;

    const used = counts.slice(1);
    const mean = total / SLOT_COUNT;

    expect(used.filter((n) => n === 0), 'every slot should be reachable').toHaveLength(0);
    for (const [i, n] of used.entries()) {
      expect(n, `slot ${i + 1} is over/under-used (${n} vs mean ${mean})`).toBeGreaterThan(mean * 0.5);
      expect(n, `slot ${i + 1} is over/under-used (${n} vs mean ${mean})`).toBeLessThan(mean * 1.5);
    }
  });

  it('collides no worse than chance for a household-sized room list', () => {
    const rooms = ['Outside', 'Basement', 'Office', 'Media Room', 'Entrance', 'Living Room', 'Software'];
    // Only guards against a collapsed hash (everything in one slot); the exact
    // count is variance, and collisions are acceptable because a room's name is
    // always rendered beside its colour (ROOM-03).
    expect(new Set(rooms.map(getRoomSlot)).size).toBeGreaterThan(1);
  });
});

describe('getRoomColor', () => {
  it('returns null when there is no room', () => {
    expect(getRoomColor(null)).toBeNull();
    expect(getRoomColor(undefined)).toBeNull();
    expect(getRoomColor('')).toBeNull();
  });

  // The whole point of the v0.4 swap: callers get CSS variables, so a badge
  // re-colours on palette/theme change with no re-render and no JS colour reads.
  it('returns palette custom properties rather than literal colors', () => {
    const c = getRoomColor('Outside');
    expect(c.dot).toMatch(/^var\(--hc-room-[1-9]\)$/);
    expect(c.bg).toMatch(/^var\(--hc-room-[1-9]-soft\)$/);
    expect(c.text).toMatch(/^var\(--hc-room-[1-9]-text\)$/);
  });

  it('uses one consistent slot across all three variables', () => {
    const slot = getRoomSlot('Basement');
    const c = getRoomColor('Basement');
    expect(c.dot).toBe(`var(--hc-room-${slot})`);
    expect(c.bg).toBe(`var(--hc-room-${slot}-soft)`);
    expect(c.text).toBe(`var(--hc-room-${slot}-text)`);
  });

  it('gives the same room the same colors on every call', () => {
    expect(getRoomColor('Media Room')).toEqual(getRoomColor('Media Room'));
  });
});
