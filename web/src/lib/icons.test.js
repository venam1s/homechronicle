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

// -- Matter vocabulary coverage --
//
// The listener normalizes every Matter attribute onto a HomeKit characteristic
// (listener/src/matter-normalize.js). If it emits a name describeChange does
// not know, the timeline HEADLINE degrades to "On Off: true". These two lists
// must not drift apart, so the contract is pinned from the listener's side.
describe('Matter-normalized characteristics are all phrased', () => {
  // Kept in sync with mappedCharacteristics() in matter-normalize.js. The
  // listener has its own test asserting the table produces exactly these.
  const MATTER_NORMALIZED = [
    'Active', 'ActivePower', 'AirPressure', 'Brightness', 'CarbonMonoxideDetected',
    'ColorTemperature', 'ContactSensorState', 'CurrentAmbientLightLevel', 'CurrentPosition',
    'CurrentRelativeHumidity', 'CurrentTemperature', 'Hue', 'LockCurrentState', 'On',
    'OccupancyDetected', 'PositionState', 'RotationSpeed', 'Saturation', 'SmokeDetected',
    'StatusLowBattery', 'TargetHeatingCoolingState',
  ];

  it.each(MATTER_NORMALIZED)('%s does not fall through to the raw name', (characteristic) => {
    const phrase = describeChange(characteristic, '1');
    expect(phrase).toBeTruthy();
    // The fallback branch is the only one that emits "Name: value".
    expect(phrase, `${characteristic} is unphrased — add a case to describeChange`)
      .not.toMatch(/^[A-Z][a-z]+ .*: 1$/);
  });

  it('phrases the ones the HomeKit path already emits today', () => {
    // beta currently logs 453 Saturation, 35 Hue and 31 Active events, all of
    // which were reading as "Saturation: 1" in the headline.
    expect(describeChange('Saturation', '45')).toBe('saturation 45%');
    expect(describeChange('Hue', '240')).toBe('hue 240°');
    expect(describeChange('Active', '1')).toBe('turned on');
  });

  it('reads colour temperature in Kelvin, not mireds', () => {
    expect(describeChange('ColorTemperature', '370')).toBe('2700K');
  });

  it('reads a covering position as open/closed rather than a bare number', () => {
    expect(describeChange('CurrentPosition', '0')).toBe('closed');
    expect(describeChange('CurrentPosition', '100')).toBe('open');
    expect(describeChange('CurrentPosition', '75')).toBe('75% open');
  });
});
