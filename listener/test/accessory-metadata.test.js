import test from 'node:test';
import assert from 'node:assert/strict';
import hapController from 'hap-controller';
import {
  WATCHED_CHARACTERISTICS,
  cacheAccessoryMetadata,
  extractAccessoryMetadata,
  getAccessoryCapabilities,
  getAccessoryIdentity,
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
    accessoryId: 'CC:DD',
    parentAccessoryId: 'CC:DD',
    serviceType: 'ContactSensor',
    characteristicName: 'ContactSensorState',
    childName: 'Front Door',
    componentName: 'Front Door',
  });
});

// -- Service split (issue #4) --

const MAC = 'AA:BB:CC:DD:EE:FF';

function info(iid, name, extra = []) {
  return {
    iid,
    type: fullUuid('3E'),
    characteristics: [
      { iid: iid + 1, type: fullUuid('23'), value: name },
      { iid: iid + 2, type: fullUuid('20'), value: 'TP-Link' },
      { iid: iid + 3, type: fullUuid('21'), value: 'EP40A' },
      { iid: iid + 4, type: fullUuid('52'), value: '1.0.4' },
      ...extra,
    ],
  };
}

function outlet(iid, name) {
  const characteristics = [{ iid: iid + 1, type: fullUuid('25'), value: false }];
  if (name !== undefined) characteristics.push({ iid: iid + 2, type: fullUuid('23'), value: name });
  return { iid, type: fullUuid('47'), characteristics };
}

// Shaped like homebridge-kasa-python: one bridged accessory, one Outlet service
// per socket, each named after the socket's alias.
const kasaBridge = (names = ['Tree', 'Garland']) => ({
  accessories: [
    { aid: 1, services: [info(1, 'Homebridge')] },
    { aid: 7, services: [info(1, 'Holiday Outlet'), outlet(10, names[0]), outlet(20, names[1])] },
  ],
});

test('service split: two Outlet services on one accessory become two entities', () => {
  const { iidMetaMap, capabilitiesByAccessoryId, identitiesByAccessoryId, serviceSplits } =
    extractAccessoryMetadata({ deviceId: MAC, accessories: kasaBridge() });

  assert.deepEqual(iidMetaMap.get('7.11'), {
    accessoryId: `${MAC}:7:10`,
    parentAccessoryId: `${MAC}:7`,
    serviceType: 'Outlet',
    characteristicName: 'On',
    childName: 'Holiday Outlet',
    componentName: 'Tree',
  });
  assert.equal(iidMetaMap.get('7.21').accessoryId, `${MAC}:7:20`);
  assert.equal(iidMetaMap.get('7.21').componentName, 'Garland');

  assert.deepEqual(serviceSplits, [
    { accessoryId: `${MAC}:7:10`, parentAccessoryId: `${MAC}:7`, name: 'Tree', serviceType: 'Outlet', iids: [11] },
    { accessoryId: `${MAC}:7:20`, parentAccessoryId: `${MAC}:7`, name: 'Garland', serviceType: 'Outlet', iids: [21] },
  ]);

  // The fully split accessory is not listed itself; each outlet is.
  assert.equal(capabilitiesByAccessoryId.has(`${MAC}:7`), false);
  const tree = capabilitiesByAccessoryId.get(`${MAC}:7:10`);
  assert.equal(tree.accessory_name, 'Tree');
  assert.equal(tree.parent_device_id, MAC);
  assert.equal(tree.parent_accessory_id, `${MAC}:7`);
  assert.equal(tree.parent_accessory_name, 'Holiday Outlet');
  assert.deepEqual(tree.watched_service_types, ['Outlet']);
  assert.equal(tree.services.length, 1);
  assert.equal(tree.model, 'EP40A');

  // Identity (and so firmware-change events) stays with the accessory only.
  assert.deepEqual([...identitiesByAccessoryId.keys()], [MAC, `${MAC}:7`]);
});

test('service split: shared or missing service names fall back to "<accessory> <n>"', () => {
  for (const names of [[undefined, undefined], ['Holiday Outlet', 'Holiday Outlet'], ['Plug', 'plug'], ['Tree', undefined]]) {
    const { iidMetaMap } = extractAccessoryMetadata({ deviceId: MAC, accessories: kasaBridge(names) });
    assert.equal(iidMetaMap.get('7.11').componentName, 'Holiday Outlet 1', String(names));
    assert.equal(iidMetaMap.get('7.21').componentName, 'Holiday Outlet 2', String(names));
  }
});

test('service split: ConfiguredName wins over the published Name', () => {
  const accessories = kasaBridge();
  accessories.accessories[1].services[1].characteristics.push({ iid: 13, type: fullUuid('E3'), value: 'Porch' });
  const { iidMetaMap } = extractAccessoryMetadata({ deviceId: MAC, accessories });
  assert.equal(iidMetaMap.get('7.11').componentName, 'Porch');
});

test('service split: a directly paired device (aid 1) is not split', () => {
  const accessories = { accessories: [{ aid: 1, services: [info(1, 'Strip'), outlet(10, 'A'), outlet(20, 'B')] }] };
  const { iidMetaMap, capabilitiesByAccessoryId, serviceSplits } = extractAccessoryMetadata({ deviceId: MAC, accessories });
  assert.deepEqual(serviceSplits, []);
  assert.equal(iidMetaMap.get('1.11').accessoryId, MAC);
  assert.equal(iidMetaMap.get('1.21').accessoryId, MAC);
  assert.equal(iidMetaMap.get('1.11').componentName, 'Strip');
  assert.equal(capabilitiesByAccessoryId.has(MAC), true);
});

test('service split: a sensor next to a split pair stays on the accessory with its old name', () => {
  const accessories = kasaBridge();
  accessories.accessories[1].services.push({
    iid: 30, type: fullUuid('8A'), characteristics: [{ iid: 31, type: fullUuid('11'), value: 21 }],
  });
  const { iidMetaMap, capabilitiesByAccessoryId } = extractAccessoryMetadata({ deviceId: MAC, accessories });
  assert.equal(iidMetaMap.get('7.31').accessoryId, `${MAC}:7`);
  assert.equal(iidMetaMap.get('7.31').componentName, 'Holiday Outlet · TemperatureSensor');
  assert.deepEqual(capabilitiesByAccessoryId.get(`${MAC}:7`).watched_service_types, ['TemperatureSensor']);
  assert.equal(iidMetaMap.get('7.11').accessoryId, `${MAC}:7:10`);
});

test('no split: separate accessories (Meross-style) and switch+sensor keep today\'s ids and names', () => {
  const meross = {
    accessories: [
      { aid: 2, services: [info(1, 'Left Bed'), { iid: 10, type: fullUuid('49'), characteristics: [{ iid: 11, type: fullUuid('25'), value: false }] }] },
      { aid: 3, services: [info(1, 'Right Bed'), { iid: 10, type: fullUuid('49'), characteristics: [{ iid: 11, type: fullUuid('25'), value: false }] }] },
      {
        aid: 4,
        services: [
          info(1, 'Combo'),
          { iid: 10, type: fullUuid('49'), characteristics: [{ iid: 11, type: fullUuid('25'), value: false }] },
          { iid: 20, type: fullUuid('85'), characteristics: [{ iid: 21, type: fullUuid('22'), value: false }] },
        ],
      },
    ],
  };
  const { iidMetaMap, serviceSplits, capabilitiesByAccessoryId } = extractAccessoryMetadata({ deviceId: MAC, accessories: meross });
  assert.deepEqual(serviceSplits, []);
  assert.equal(iidMetaMap.get('2.11').accessoryId, `${MAC}:2`);
  assert.equal(iidMetaMap.get('2.11').componentName, 'Left Bed');
  assert.equal(iidMetaMap.get('3.11').accessoryId, `${MAC}:3`);
  assert.equal(iidMetaMap.get('4.11').accessoryId, `${MAC}:4`);
  assert.equal(iidMetaMap.get('4.11').componentName, 'Combo · Switch');
  assert.equal(iidMetaMap.get('4.21').componentName, 'Combo · MotionSensor');
  assert.deepEqual([...capabilitiesByAccessoryId.keys()], [`${MAC}:2`, `${MAC}:3`, `${MAC}:4`]);
});

test('cacheAccessoryMetadata: a split service shows its accessory\'s identity', () => {
  cacheAccessoryMetadata({ deviceId: MAC, accessories: kasaBridge() });
  assert.equal(getAccessoryIdentity(`${MAC}:7:10`)?.model, 'EP40A');
  assert.equal(getAccessoryCapabilities(`${MAC}:7:20`)?.accessory_name, 'Garland');
  assert.equal(getAccessoryCapabilities(`${MAC}:7`), null);
});
