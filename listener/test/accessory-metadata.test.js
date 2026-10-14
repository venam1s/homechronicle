import test from 'node:test';
import assert from 'node:assert/strict';
import hapController from 'hap-controller';
import {
  WATCHED_CHARACTERISTICS,
  extractAccessoryMetadata,
  shortUuid,
} from '../src/accessory-metadata.js';

const { Characteristic } = hapController;

// Every watched label, keyed to hap-controller's canonical public name. The
// short codes in WATCHED_CHARACTERISTICS must resolve to exactly these — a
// wrong code silently drops (or mislabels) a whole characteristic type.
const EXPECTED_HAP_NAMES = {
  On: 'on',
  CurrentDoorState: 'door-state.current',
  TargetDoorState: 'door-state.target',
  LockCurrentState: 'lock-mechanism.current-state',
  LockTargetState: 'lock-mechanism.target-state',
  MotionDetected: 'motion-detected',
  ContactSensorState: 'contact-state',
  OccupancyDetected: 'occupancy-detected',
  SmokeDetected: 'smoke-detected',
  CurrentTemperature: 'temperature.current',
  CurrentRelativeHumidity: 'relative-humidity.current',
  CurrentHeatingCoolingState: 'heating-cooling.current',
  CurrentPosition: 'position.current',
  SecuritySystemCurrentState: 'security-system-state.current',
  SecuritySystemTargetState: 'security-system-state.target',
  Brightness: 'brightness',
  ColorTemperature: 'color-temperature',
  Hue: 'hue',
  Saturation: 'saturation',
  Active: 'active',
  StatusActive: 'status-active',
  FilterLifeLevel: 'filter.life-level',
  AirQuality: 'air-quality',
  VOCDensity: 'density.voc',
  PM2_5Density: 'density.pm25',
  CurrentAmbientLightLevel: 'light-level.current',
  StatusLowBattery: 'status-lo-batt',
  BatteryLevel: 'battery-level',
  LeakDetected: 'leak-detected',
  FilterChangeIndication: 'filter.change-indication',
};

const fullUuid = (short) => `${short.padStart(8, '0')}-0000-1000-8000-0026BB765291`;

test('WATCHED_CHARACTERISTICS: every short code matches the HAP UUID for its label', () => {
  for (const [code, label] of WATCHED_CHARACTERISTICS) {
    const hapName = EXPECTED_HAP_NAMES[label];
    assert.ok(hapName, `no expected HAP name recorded for ${label}`);
    const uuid = Characteristic.uuidFromCharacteristic(`public.hap.characteristic.${hapName}`);
    assert.equal(code, shortUuid(uuid), `${label} should be ${shortUuid(uuid)}, not ${code}`);
  }
});

test('WATCHED_CHARACTERISTICS: every expected label is watched exactly once', () => {
  const labels = [...WATCHED_CHARACTERISTICS.values()];
  assert.equal(new Set(labels).size, labels.length, 'duplicate label in map');
  assert.deepEqual([...labels].sort(), Object.keys(EXPECTED_HAP_NAMES).sort());
});

test('ContactSensorState (6A) is watched; CurrentPosition (6D) is not mislabeled as contact', () => {
  assert.equal(WATCHED_CHARACTERISTICS.get('6A'), 'ContactSensorState');
  assert.equal(WATCHED_CHARACTERISTICS.get('6D'), 'CurrentPosition');
});

test('extractAccessoryMetadata: AccessoryInformation characteristics are not watched', () => {
  const accessories = {
    accessories: [{
      aid: 1,
      services: [
        {
          iid: 1,
          type: fullUuid('3E'),
          characteristics: [
            { iid: 2, type: fullUuid('23'), value: 'Hall Light' },
            { iid: 3, type: fullUuid('30'), value: 'SN123' },
          ],
        },
        {
          iid: 8,
          type: fullUuid('43'),
          characteristics: [{ iid: 9, type: fullUuid('25'), value: true }],
        },
      ],
    }],
  };

  const { iidMetaMap, capabilitiesByAccessoryId } = extractAccessoryMetadata({ deviceId: 'AA:BB', accessories });

  // Only the Lightbulb's On characteristic — SerialNumber (30) must not be subscribed.
  assert.deepEqual([...iidMetaMap.keys()], ['1.9']);
  // Single watched service → plain accessory name, no " · Service" suffix.
  assert.equal(iidMetaMap.get('1.9').componentName, 'Hall Light');
  assert.deepEqual(capabilitiesByAccessoryId.get('AA:BB').watched_service_types, ['Lightbulb']);
});

test('extractAccessoryMetadata: contact sensor state is watched', () => {
  const accessories = {
    accessories: [{
      aid: 1,
      services: [
        {
          iid: 1,
          type: fullUuid('3E'),
          characteristics: [{ iid: 2, type: fullUuid('23'), value: 'Front Door' }],
        },
        {
          iid: 10,
          type: fullUuid('80'),
          characteristics: [{ iid: 11, type: fullUuid('6A'), value: 1 }],
        },
      ],
    }],
  };

  const { iidMetaMap } = extractAccessoryMetadata({ deviceId: 'CC:DD', accessories });

  assert.deepEqual(iidMetaMap.get('1.11'), {
    serviceType: 'ContactSensor',
    characteristicName: 'ContactSensorState',
    childName: 'Front Door',
    componentName: 'Front Door',
  });
});
