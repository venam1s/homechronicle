import { describe, it, expect } from 'vitest';
import { isEventMuted } from './mutedDevices.js';

describe('isEventMuted', () => {
  it('matches the stored name', () => {
    expect(isEventMuted(new Set(['Neakasa · OccupancySensor']), { accessory_name: 'Neakasa · OccupancySensor' })).toBe(true);
  });

  it('keeps a mute set before the device got a display name', () => {
    const muted = new Set(['PB01009G24410010060 · OccupancySensor']);
    expect(isEventMuted(muted, {
      accessory_name: 'Neakasa · OccupancySensor',
      reported_name: 'PB01009G24410010060 · OccupancySensor',
    })).toBe(true);
  });

  it('does not match other devices', () => {
    expect(isEventMuted(new Set(['Lamp']), { accessory_name: 'Desk Lamp', reported_name: null })).toBe(false);
  });
});
