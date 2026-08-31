import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(__dirname, '../src/matter-controller.js'), 'utf8');

// --- Cluster configuration validation ---

test('SUPPORTED_CLUSTERS has all 15 expected clusters', () => {
  const expectedClusters = [
    'OnOff', 'LevelControl', 'BooleanState',
    'TemperatureMeasurement', 'RelativeHumidityMeasurement', 'OccupancySensing',
    'ColorControl', 'DoorLock', 'WindowCovering', 'FanControl', 'Thermostat',
    'PressureMeasurement', 'IlluminanceMeasurement', 'ElectricalPowerMeasurement', 'SmokeCoAlarm',
  ];

  for (const name of expectedClusters) {
    assert.ok(
      source.includes(`serviceType: '${name}'`),
      `Expected cluster ${name} to be in SUPPORTED_CLUSTERS`,
    );
  }
});

test('SUPPORTED_CLUSTERS entries have unique cluster IDs', () => {
  const idMatches = [...source.matchAll(/^\s+id:\s*(0x[0-9a-fA-F]+)/gm)].map((m) => m[1]);
  const uniqueIds = new Set(idMatches);
  assert.equal(idMatches.length, uniqueIds.size, 'Cluster IDs must be unique');
  assert.ok(idMatches.length >= 15, `Expected at least 15 cluster IDs, got ${idMatches.length}`);
});

test('each cluster has at least one attribute with required fields', () => {
  const serviceTypes = [...source.matchAll(/serviceType:\s*'(\w+)'/g)].map((m) => m[1]);
  const attrBlocks = [...source.matchAll(/\{ name: '(\w+)', characteristic: '(\w+)', attributeId: (\d+) \}/g)];

  assert.ok(serviceTypes.length >= 15, `Expected >= 15 clusters, got ${serviceTypes.length}`);
  assert.ok(attrBlocks.length >= 20, `Expected >= 20 total attributes, got ${attrBlocks.length}`);

  // Every attribute should have a non-empty name and characteristic
  for (const [, name, characteristic] of attrBlocks) {
    assert.ok(name.length > 0, 'Attribute name must not be empty');
    assert.ok(characteristic.length > 0, 'Characteristic must not be empty');
  }
});

test('multi-attribute clusters have unique attributeIds within each cluster', () => {
  // Extract cluster blocks from SUPPORTED_CLUSTERS array
  // Match serviceType and all attributeId values that follow before the next serviceType
  const clusterBlocks = source.split(/serviceType:\s*'/);
  for (let i = 1; i < clusterBlocks.length; i++) {
    const clusterName = clusterBlocks[i].split("'")[0];
    const attrIds = [...clusterBlocks[i].matchAll(/attributeId:\s*(\d+)/g)].map((m) => Number(m[1]));
    if (attrIds.length > 1) {
      const unique = new Set(attrIds);
      assert.equal(
        attrIds.length, unique.size,
        `Cluster ${clusterName} has duplicate attributeIds: ${attrIds}`,
      );
    }
  }
});

test('cluster IDs match official Matter spec values', () => {
  const specIds = {
    OnOff: 0x0006,
    LevelControl: 0x0008,
    BooleanState: 0x0045,
    TemperatureMeasurement: 0x0402,
    RelativeHumidityMeasurement: 0x0405,
    OccupancySensing: 0x0406,
    ColorControl: 0x0300,
    DoorLock: 0x0101,
    WindowCovering: 0x0102,
    FanControl: 0x0202,
    Thermostat: 0x0201,
    PressureMeasurement: 0x0403,
    IlluminanceMeasurement: 0x0400,
    ElectricalPowerMeasurement: 0x0090,
    SmokeCoAlarm: 0x005c,
  };

  // Split source into individual cluster blocks within SUPPORTED_CLUSTERS
  // Each block starts with "cluster:" and ends before the next "cluster:" or "];"
  const clusterBlockPattern = /\{\s*\n\s*cluster:[\s\S]*?serviceType:\s*'(\w+)'[\s\S]*?\}/g;
  const blocks = [...source.matchAll(clusterBlockPattern)];

  for (const [block, serviceType] of blocks) {
    if (!specIds[serviceType]) continue;
    const idMatch = block.match(/id:\s*(0x[0-9a-fA-F]+)/);
    assert.ok(idMatch, `Could not find id for ${serviceType}`);
    const actualId = Number.parseInt(idMatch[1], 16);
    assert.equal(
      actualId,
      specIds[serviceType],
      `${serviceType} cluster ID should be 0x${specIds[serviceType].toString(16)}, got ${idMatch[1]}`,
    );
  }
});

test('all cluster imports are present at top of file', () => {
  const requiredImports = [
    'OnOff', 'LevelControl', 'BooleanState',
    'TemperatureMeasurement', 'RelativeHumidityMeasurement', 'OccupancySensing',
    'ColorControl', 'DoorLock', 'WindowCovering', 'FanControl', 'Thermostat',
    'PressureMeasurement', 'IlluminanceMeasurement', 'ElectricalPowerMeasurement', 'SmokeCoAlarm',
    'GeneralCommissioning',
  ];

  // Extract the import block
  const importBlock = source.match(/import \{[\s\S]*?\} from '@matter\/main\/clusters'/);
  assert.ok(importBlock, 'Should have cluster imports');

  for (const name of requiredImports) {
    assert.ok(
      importBlock[0].includes(name),
      `Missing import for ${name}`,
    );
  }
});

test('CLUSTER_LABELS builds attributeMap for multi-attribute subscription handling', () => {
  assert.ok(
    source.includes('attributeMap: new Map(c.attributes.map'),
    'CLUSTER_LABELS should build attributeMap from all attributes',
  );
});

test('subscribe handler uses attributeMap for correct characteristic resolution', () => {
  assert.ok(
    source.includes('labels.attributeMap.get(attributeName)'),
    'Subscribe handler should look up attribute in attributeMap',
  );
  // The old fallbacks (`attrDef?.characteristic ?? labels.characteristic` and
  // `attrDef?.attributeId ?? 0`) were removed on purpose: an attribute of a
  // tracked cluster that we do NOT map was being logged under the cluster's
  // FIRST characteristic, so an unmapped ColorControl attribute recorded as
  // CurrentHue. Dropping the reading is correct; mislabelling it is not.
  assert.ok(
    !source.includes('attrDef?.characteristic ?? labels.characteristic'),
    'Subscribe handler must not mislabel an unmapped attribute as the primary characteristic',
  );
  assert.ok(
    source.includes('if (!attrDef) return;'),
    'Subscribe handler should drop attributes it does not map',
  );
});

test('both Matter read paths normalize to the HomeKit vocabulary', () => {
  // Poll and subscribe both feed ingestRows, which caches by characteristic —
  // if they disagreed on names or units, each reading would look like a change
  // from the other and the log would fill with phantom events.
  const calls = source.match(/normalizeReading\(/g) ?? [];
  assert.equal(calls.length, 2, 'expected exactly the poll and subscribe call sites');
  assert.ok(
    source.includes("from './matter-normalize.js'"),
    'controller should use the shared normalization table',
  );
});

test('COUNTRY_CODE is configurable via env var and defaults to XX', () => {
  assert.ok(source.includes("MATTER_COUNTRY_CODE"), 'Should read MATTER_COUNTRY_CODE env var');
  assert.ok(source.includes("'XX'"), 'Should default to XX');
  assert.ok(source.includes('regulatoryCountryCode: COUNTRY_CODE'), 'Should use COUNTRY_CODE constant');
  // Validate the sanitization
  assert.ok(source.includes('.trim().toUpperCase().slice(0, 2)'), 'Should sanitize country code');
});

test('discover function accepts configurable timeout', () => {
  assert.ok(source.includes('discover(timeoutMs'), 'discover() should accept timeoutMs');
});

test('poll logs debug messages on failures', () => {
  assert.ok(source.includes('Failed to read'), 'Should log attribute read failures');
  assert.ok(source.includes('Could not get'), 'Should log cluster client failures');
  assert.ok(source.includes('log.debug'), 'Failure logging should be at debug level');
});

test('all .Complete cluster references are used consistently', () => {
  const completeRefs = [...source.matchAll(/(\w+)\.Complete/g)].map((m) => m[1]);
  // Each should appear exactly once in SUPPORTED_CLUSTERS
  const unique = new Set(completeRefs);
  assert.equal(completeRefs.length, unique.size, 'Each cluster .Complete should appear exactly once');
  assert.equal(completeRefs.length, 15, 'Should have exactly 15 cluster .Complete references');
});
