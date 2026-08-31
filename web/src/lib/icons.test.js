import { describe, it, expect } from 'vitest';
import { describeChange, humanizeCharacteristic } from './icons.js';

describe('describeChange', () => {
  it.each([
    ['On', '1', 'turned on'],
    ['On', '0', 'turned off'],
    ['MotionDetected', '1', 'motion detected'],
    ['MotionDetected', '0', 'motion cleared'],
    ['CurrentRelativeHumidity', '60.4', '60% RH'],
    ['CurrentTemperature', '18.14', '18.1°C'],
  ])('%s=%s reads as "%s"', (char, value, expected) => {
    expect(describeChange(char, value)).toBe(expected);
  });

  // v0.4: these strings became the timeline HEADLINE, so characteristics that
  // previously fell through to a raw "Name: value" are now phrased properly.
  it.each([
    ['StatusLowBattery', '1', 'battery low'],
    ['StatusLowBattery', '0', 'battery normal'],
    ['BatteryLevel', '20', 'battery 20%'],
    ['LeakDetected', '1', 'leak detected'],
    ['SmokeDetected', '0', 'smoke cleared'],
    ['StatusTampered', '1', 'tampering detected'],
    ['StatusFault', '1', 'reported a fault'],
    ['OutletInUse', '0', 'outlet idle'],
  ])('%s=%s reads as "%s"', (char, value, expected) => {
    expect(describeChange(char, value)).toBe(expected);
  });

  it('phrases an unmapped characteristic as words, not an identifier', () => {
    expect(describeChange('SomeNewThing', '42')).toBe('Some new thing: 42');
    expect(describeChange('SomeNewThing', '42')).not.toContain('SomeNewThing');
  });
});

describe('humanizeCharacteristic', () => {
  it.each([
    ['StatusLowBattery', 'Status low battery'],
    ['On', 'On'],
    ['CurrentDoorState', 'Current door state'],
  ])('%s -> %s', (input, expected) => {
    expect(humanizeCharacteristic(input)).toBe(expected);
  });

  it('degrades gracefully on junk input', () => {
    expect(humanizeCharacteristic('')).toBe('Changed');
    expect(humanizeCharacteristic(null)).toBe('Changed');
    expect(humanizeCharacteristic(undefined)).toBe('Changed');
  });
});
