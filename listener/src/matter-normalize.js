/**
 * matter-normalize.js — translate raw Matter attribute reports into the
 * HomeKit vocabulary and units the rest of the app already speaks.
 *
 * WHY THIS EXISTS
 *
 * Every consumer downstream of the event log keys off `characteristic`:
 *   - alerts.js matches rules by exact characteristic name
 *   - events-router filters `WHERE characteristic = $n`
 *   - web/src/lib/episodes.js groups episodes by characteristic
 *   - web/src/lib/icons.js phrases the timeline headline from it
 *
 * The Matter path used to emit its own names and RAW cluster values, so a
 * Matter device produced rows nothing understood:
 *
 *   before: characteristic='OnOff'          value='true'   -> "On Off: true"
 *   after:  characteristic='On'             value='true'   -> "turned on"
 *   before: characteristic='MeasuredValue'  value='2350'   -> "Measured Value: 2350"
 *   after:  characteristic='CurrentTemperature' value='23.5' -> "23.5°C"
 *
 * It was also ambiguous on its own terms: TemperatureMeasurement,
 * RelativeHumidityMeasurement, PressureMeasurement and IlluminanceMeasurement
 * ALL reported as `MeasuredValue`, so no rule or filter could tell a
 * temperature from a humidity reading. Keying the table on
 * (clusterId, attributeId) rather than on the attribute name fixes that.
 *
 * UNITS. Matter transmits fixed-point integers; HomeKit uses natural units.
 * Conversions below cite the Matter cluster spec that defines the encoding.
 *
 * ⚠ SEMANTIC INVERSIONS. Four mappings invert or re-order enum values because
 * the two protocols disagree about what the numbers mean. These are derived
 * from the specifications and are NOT verified against physical hardware —
 * this repo has never had a Matter device commissioned. They are marked
 * `unverified: true` and listed by `unverifiedMappings()` so they can be
 * checked against a real device before anyone trusts them. See:
 *   - BooleanState  -> ContactSensorState  (true means CLOSED in Matter)
 *   - DoorLock      -> LockCurrentState    (different enum ordering)
 *   - WindowCovering-> CurrentPosition     (0 is OPEN in Matter, CLOSED in HAP)
 *   - Thermostat    -> TargetHeatingCoolingState (different enum ordering)
 */

/** Clamp to a range, tolerating junk. */
function clamp(n, min, max) {
  if (!Number.isFinite(n)) return null;
  return Math.min(max, Math.max(min, n));
}

/** Round to `places` decimals and drop a trailing `.0`. */
function round(n, places = 0) {
  if (!Number.isFinite(n)) return null;
  const f = 10 ** places;
  return Math.round(n * f) / f;
}

/** Matter booleans arrive as real booleans; be liberal about what counts. */
function asBool(v) {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v !== 0;
  const s = String(v ?? '').trim().toLowerCase();
  return s === 'true' || s === '1';
}

function asNumber(v) {
  if (typeof v === 'number') return v;
  const n = Number(String(v ?? '').trim());
  return Number.isFinite(n) ? n : null;
}

// -- The mapping table ------------------------------------------------------
//
// Keyed `clusterId:attributeId`. Each entry gives the HomeKit characteristic
// name and a converter from the raw Matter value to the HomeKit-native value.
// A converter returning null drops the reading rather than logging nonsense.

const MAPPINGS = [
  // --- On/Off (0x0006) ---
  {
    clusterId: 0x0006, attributeId: 0x0000, from: 'OnOff',
    characteristic: 'On',
    convert: (v) => asBool(v),
  },

  // --- Level Control (0x0008). currentLevel is 0-254; HAP Brightness is 0-100%.
  {
    clusterId: 0x0008, attributeId: 0x0000, from: 'CurrentLevel',
    characteristic: 'Brightness',
    convert: (v) => {
      const n = asNumber(v);
      return n === null ? null : clamp(Math.round((n / 254) * 100), 0, 100);
    },
  },

  // --- Boolean State (0x0045) ---
  // Matter: stateValue TRUE means the contact is CLOSED.
  // HAP ContactSensorState: 0 = contact detected (closed), 1 = not detected.
  {
    clusterId: 0x0045, attributeId: 0x0000, from: 'StateValue',
    characteristic: 'ContactSensorState',
    convert: (v) => (asBool(v) ? 0 : 1),
    unverified: 'Matter stateValue=true means CLOSED, which is HAP 0. Inverted.',
  },

  // --- Temperature Measurement (0x0402). Signed 0.01 °C.
  {
    clusterId: 0x0402, attributeId: 0x0000, from: 'MeasuredValue',
    characteristic: 'CurrentTemperature',
    convert: (v) => {
      const n = asNumber(v);
      return n === null ? null : round(n / 100, 1);
    },
  },

  // --- Relative Humidity (0x0405). 0.01 %.
  {
    clusterId: 0x0405, attributeId: 0x0000, from: 'MeasuredValue',
    characteristic: 'CurrentRelativeHumidity',
    convert: (v) => {
      const n = asNumber(v);
      return n === null ? null : clamp(round(n / 100, 1), 0, 100);
    },
  },

  // --- Pressure Measurement (0x0403). 0.1 kPa. HomeKit has no pressure
  // characteristic, so this keeps a descriptive name of its own rather than
  // being forced into an unrelated one.
  {
    clusterId: 0x0403, attributeId: 0x0000, from: 'MeasuredValue',
    characteristic: 'AirPressure',
    convert: (v) => {
      const n = asNumber(v);
      return n === null ? null : round(n / 10, 1);
    },
  },

  // --- Illuminance Measurement (0x0400) ---
  // Matter stores a LOG encoding: measuredValue = 10000 * log10(lux) + 1.
  // Logging it raw would have been off by orders of magnitude.
  // 0 is a defined sentinel meaning "unknown", not zero lux.
  {
    clusterId: 0x0400, attributeId: 0x0000, from: 'MeasuredValue',
    characteristic: 'CurrentAmbientLightLevel',
    convert: (v) => {
      const n = asNumber(v);
      if (n === null || n <= 0) return null;
      return round(10 ** ((n - 1) / 10000), 1);
    },
  },

  // --- Occupancy Sensing (0x0406). Bitmap; bit 0 is "occupied".
  {
    clusterId: 0x0406, attributeId: 0x0000, from: 'Occupancy',
    characteristic: 'OccupancyDetected',
    convert: (v) => {
      if (typeof v === 'object' && v !== null && 'occupied' in v) return v.occupied ? 1 : 0;
      const n = asNumber(v);
      return n === null ? (asBool(v) ? 1 : 0) : (n & 1 ? 1 : 0);
    },
  },

  // --- Color Control (0x0300) ---
  {
    clusterId: 0x0300, attributeId: 0x0000, from: 'CurrentHue',
    characteristic: 'Hue',
    convert: (v) => {
      const n = asNumber(v);
      return n === null ? null : clamp(round((n / 254) * 360, 0), 0, 360);
    },
  },
  {
    clusterId: 0x0300, attributeId: 0x0001, from: 'CurrentSaturation',
    characteristic: 'Saturation',
    convert: (v) => {
      const n = asNumber(v);
      return n === null ? null : clamp(round((n / 254) * 100, 0), 0, 100);
    },
  },
  {
    // Both protocols use mireds here, so the value passes through unchanged.
    clusterId: 0x0300, attributeId: 0x0007, from: 'ColorTemperatureMireds',
    characteristic: 'ColorTemperature',
    convert: (v) => asNumber(v),
  },

  // --- Door Lock (0x0101) ---
  // Matter lockState: 0 NotFullyLocked, 1 Locked, 2 Unlocked, null Unknown.
  // HAP LockCurrentState: 0 Unsecured, 1 Secured, 2 Jammed, 3 Unknown.
  {
    clusterId: 0x0101, attributeId: 0x0000, from: 'LockState',
    characteristic: 'LockCurrentState',
    convert: (v) => {
      const n = asNumber(v);
      if (n === 1) return 1;   // Locked   -> Secured
      if (n === 2) return 0;   // Unlocked -> Unsecured
      if (n === 0) return 3;   // NotFullyLocked -> Unknown
      return 3;
    },
    unverified: 'Enum orderings differ between the two protocols.',
  },

  // --- Window Covering (0x0102) ---
  // Matter currentPositionLiftPercent100ths: 0 = fully OPEN, 10000 = fully CLOSED.
  // HAP CurrentPosition: 0 = CLOSED, 100 = OPEN. Both scaled AND inverted.
  {
    clusterId: 0x0102, attributeId: 0x000e, from: 'CurrentPosition',
    characteristic: 'CurrentPosition',
    convert: (v) => {
      const n = asNumber(v);
      return n === null ? null : clamp(100 - Math.round(n / 100), 0, 100);
    },
    unverified: 'Matter 0 = open; HAP 0 = closed. Scaled and inverted.',
  },
  {
    // Matter operationalStatus bits 0-1: 0 stopped, 1 opening, 2 closing.
    // HAP PositionState: 0 decreasing, 1 increasing, 2 stopped.
    clusterId: 0x0102, attributeId: 0x000a, from: 'OperationalStatus',
    characteristic: 'PositionState',
    convert: (v) => {
      const raw = typeof v === 'object' && v !== null ? asNumber(v.global) : asNumber(v);
      const n = raw === null ? null : raw & 0b11;
      if (n === 1) return 1;   // opening   -> increasing
      if (n === 2) return 0;   // closing   -> decreasing
      return 2;                // stopped
    },
  },

  // --- Fan Control (0x0202) ---
  {
    clusterId: 0x0202, attributeId: 0x0000, from: 'FanMode',
    characteristic: 'Active',
    convert: (v) => {
      const n = asNumber(v);
      return n === null ? null : (n === 0 ? 0 : 1);   // 0 = Off
    },
  },
  {
    clusterId: 0x0202, attributeId: 0x0006, from: 'PercentCurrent',
    characteristic: 'RotationSpeed',
    convert: (v) => {
      const n = asNumber(v);
      return n === null ? null : clamp(round(n, 0), 0, 100);
    },
  },

  // --- Thermostat (0x0201) ---
  {
    clusterId: 0x0201, attributeId: 0x0000, from: 'LocalTemperature',
    characteristic: 'CurrentTemperature',
    convert: (v) => {
      const n = asNumber(v);
      return n === null ? null : round(n / 100, 1);
    },
  },
  {
    // Matter systemMode: 0 Off, 1 Auto, 3 Cool, 4 Heat, 5 EmergencyHeat, ...
    // HAP TargetHeatingCoolingState: 0 Off, 1 Heat, 2 Cool, 3 Auto.
    clusterId: 0x0201, attributeId: 0x001c, from: 'SystemMode',
    characteristic: 'TargetHeatingCoolingState',
    convert: (v) => {
      const n = asNumber(v);
      if (n === 0) return 0;              // Off
      if (n === 1) return 3;              // Auto
      if (n === 3) return 2;              // Cool
      if (n === 4 || n === 5) return 1;   // Heat / EmergencyHeat
      return null;
    },
    unverified: 'Enum orderings differ between the two protocols.',
  },

  // --- Electrical Power Measurement (0x0090). activePower is milliwatts.
  // HomeKit has no power characteristic; keep a descriptive name, in watts.
  {
    clusterId: 0x0090, attributeId: 0x0008, from: 'ActivePower',
    characteristic: 'ActivePower',
    convert: (v) => {
      const n = asNumber(v);
      return n === null ? null : round(n / 1000, 2);
    },
  },

  // --- Smoke/CO Alarm (0x005c) ---
  // Matter alarm states: 0 Normal, 1 Warning, 2 Critical.
  // HAP detectors are binary: 0 not detected, 1 detected.
  {
    clusterId: 0x005c, attributeId: 0x0001, from: 'SmokeState',
    characteristic: 'SmokeDetected',
    convert: (v) => {
      const n = asNumber(v);
      return n === null ? null : (n >= 1 ? 1 : 0);
    },
  },
  {
    clusterId: 0x005c, attributeId: 0x0002, from: 'COState',
    characteristic: 'CarbonMonoxideDetected',
    convert: (v) => {
      const n = asNumber(v);
      return n === null ? null : (n >= 1 ? 1 : 0);
    },
  },
  {
    clusterId: 0x005c, attributeId: 0x000e, from: 'BatteryAlert',
    characteristic: 'StatusLowBattery',
    convert: (v) => {
      const n = asNumber(v);
      return n === null ? null : (n >= 1 ? 1 : 0);
    },
  },
];

const BY_KEY = new Map(MAPPINGS.map((m) => [`${m.clusterId}:${m.attributeId}`, m]));

/**
 * Normalize one Matter attribute report.
 *
 * @param {object} reading
 * @param {number} reading.clusterId
 * @param {number} reading.attributeId
 * @param {*} reading.value - the raw value as matter.js delivered it
 * @returns {{characteristic: string, value: *}|null}
 *   null when the attribute is unmapped, or when the value cannot be
 *   converted — in both cases logging the raw number would be misleading,
 *   so the reading is dropped instead.
 */
export function normalizeReading({ clusterId, attributeId, value }) {
  const mapping = BY_KEY.get(`${clusterId}:${attributeId}`);
  if (!mapping) return null;

  const converted = mapping.convert(value);
  if (converted === null || converted === undefined) return null;

  return { characteristic: mapping.characteristic, value: converted };
}

/** Every HomeKit characteristic this module can emit. */
export function mappedCharacteristics() {
  return [...new Set(MAPPINGS.map((m) => m.characteristic))].sort();
}

/**
 * The mappings whose value semantics were derived from the specifications but
 * never checked against a physical device. Surfaced so they can be verified
 * deliberately rather than discovered in the field.
 */
export function unverifiedMappings() {
  return MAPPINGS
    .filter((m) => m.unverified)
    .map((m) => ({
      cluster: `0x${m.clusterId.toString(16).padStart(4, '0')}`,
      from: m.from,
      characteristic: m.characteristic,
      why: m.unverified,
    }));
}

export const __TABLE_FOR_TESTS = MAPPINGS;
