import { describe, it, expect, vi, afterEach } from 'vitest';
import { utcHourToLocal, localHourToUtc, rotateUtcHoursToLocal, formatHour12 } from './hours.js';

// getTimezoneOffset() is minutes BEHIND UTC: EDT is +240, IST (UTC+5:30) is -330.
function inZone(offsetMinutes) {
  vi.spyOn(Date.prototype, 'getTimezoneOffset').mockReturnValue(offsetMinutes);
}

describe('hour helpers', () => {
  afterEach(() => { vi.restoreAllMocks(); });

  describe('in EDT (UTC-4)', () => {
    it('maps a local hour to the UTC hour it falls in', () => {
      inZone(240);
      expect(localHourToUtc(0)).toBe(4);
      expect(localHourToUtc(20)).toBe(0);
      expect(utcHourToLocal(localHourToUtc(9))).toBe(9);
    });

    // Today's Rhythm and the Timeline heatmap used to plot UTC slots against
    // local labels, so 8 AM activity appeared at noon.
    it('re-indexes a UTC series so slot h is local hour h', () => {
      inZone(240);
      const utc = new Array(24).fill(0);
      utc[12] = 7; // 12:00 UTC = 8 AM EDT
      const local = rotateUtcHoursToLocal(utc);
      expect(local[8]).toBe(7);
      expect(local.reduce((a, b) => a + b, 0)).toBe(7);
    });
  });

  describe('in IST (UTC+5:30)', () => {
    it('floors to the UTC hour the local hour starts in', () => {
      inZone(-330);
      // 06:00 IST = 00:30 UTC
      expect(localHourToUtc(6)).toBe(0);
      // 05:00 IST = 23:30 UTC the day before
      expect(localHourToUtc(5)).toBe(23);
    });

    it('keeps every UTC slot exactly once', () => {
      inZone(-330);
      const utc = Array.from({ length: 24 }, (_, h) => h + 1);
      const local = rotateUtcHoursToLocal(utc);
      expect([...local].sort((a, b) => a - b)).toEqual(utc);
    });
  });

  it('treats missing slots as zero', () => {
    inZone(0);
    expect(rotateUtcHoursToLocal([])).toEqual(new Array(24).fill(0));
  });

  it('formats 12-hour labels', () => {
    expect(formatHour12(0)).toBe('12 AM');
    expect(formatHour12(13)).toBe('1 PM');
  });
});
