// Device categories: group devices by what they do (security, climate,
// lighting, ...) rather than by room. A device's category is resolved from
// every service type it has reported, with a per-device manual override
// stored in categories.json (accessoryId -> category id).

// Display order, and the order the UI offers them in.
export const CATEGORIES = [
  { id: 'security', label: 'Security' },
  { id: 'safety', label: 'Safety' },
  { id: 'access', label: 'Doors & locks' },
  { id: 'climate', label: 'Climate' },
  { id: 'lighting', label: 'Lighting' },
  { id: 'power', label: 'Switches & outlets' },
  { id: 'cleaning', label: 'Cleaning' },
  { id: 'other', label: 'Other' },
];

const CATEGORY_IDS = new Set(CATEGORIES.map((c) => c.id));
const CATEGORY_LABELS = new Map(CATEGORIES.map((c) => [c.id, c.label]));

// HomeKit service labels (accessory-metadata.js SERVICE_TYPE_LABELS) and
// Matter cluster names (matter-controller.js). Anything not listed — Battery,
// AccessoryInformation (firmware), a raw UUID or a Matter device-type code —
// says nothing about what the device is for and falls to 'other'. Cleaning
// has no protocol-level service (robot vacuums arrive as switches or fans),
// so it is reached only by override.
const SERVICE_TYPE_CATEGORY = new Map([
  ['MotionSensor', 'security'],
  ['OccupancySensor', 'security'],
  ['OccupancySensing', 'security'],
  ['ContactSensor', 'security'],
  ['BooleanState', 'security'],
  ['SecuritySystem', 'security'],
  ['Camera', 'security'],
  ['Doorbell', 'security'],
  ['SmokeSensor', 'safety'],
  ['CarbonMonoxideSensor', 'safety'],
  ['LeakSensor', 'safety'],
  ['SmokeCoAlarm', 'safety'],
  ['LockMechanism', 'access'],
  ['DoorLock', 'access'],
  ['GarageDoorOpener', 'access'],
  ['Door', 'access'],
  ['Window', 'access'],
  ['WindowCovering', 'access'],
  ['Thermostat', 'climate'],
  ['HeaterCooler', 'climate'],
  ['TemperatureSensor', 'climate'],
  ['TemperatureMeasurement', 'climate'],
  ['HumiditySensor', 'climate'],
  ['RelativeHumidityMeasurement', 'climate'],
  ['HumidifierDehumidifier', 'climate'],
  ['AirQualitySensor', 'climate'],
  ['CarbonDioxideSensor', 'climate'],
  ['AirPurifier', 'climate'],
  ['FilterMaintenance', 'climate'],
  ['PressureMeasurement', 'climate'],
  ['Fan', 'climate'],
  ['FanControl', 'climate'],
  ['LightSensor', 'climate'],
  ['IlluminanceMeasurement', 'climate'],
  ['Lightbulb', 'lighting'],
  ['LevelControl', 'lighting'],
  ['ColorControl', 'lighting'],
  ['Switch', 'power'],
  ['Outlet', 'power'],
  ['OnOff', 'power'],
  ['ElectricalPowerMeasurement', 'power'],
  ['Valve', 'power'],
  ['IrrigationSystem', 'power'],
  ['Television', 'power'],
]);

// When a device reports several service types, the most specific purpose
// wins: a Matter light reports OnOff (power) and LevelControl (lighting) and
// is a light; a motion sensor's Battery events must not make it 'other'.
const PRECEDENCE = ['safety', 'security', 'access', 'climate', 'lighting', 'power', 'cleaning', 'other'];

export function isValidCategory(id) {
  return CATEGORY_IDS.has(id);
}

export function categoryLabel(id) {
  return CATEGORY_LABELS.get(id) ?? CATEGORY_LABELS.get('other');
}

/** Category implied by a set (or array) of service types, ignoring overrides. */
export function autoCategory(serviceTypes) {
  let best = 'other';
  for (const serviceType of serviceTypes ?? []) {
    const category = SERVICE_TYPE_CATEGORY.get(String(serviceType ?? '')) ?? 'other';
    if (PRECEDENCE.indexOf(category) < PRECEDENCE.indexOf(best)) best = category;
  }
  return best;
}

/**
 * A device's category: its override when one is set, otherwise the category
 * its service types imply.
 *
 * @returns {{ category: string, auto: string, override: string|null }}
 */
export function resolveCategory(accessoryId, serviceTypes, overrides = {}) {
  const auto = autoCategory(serviceTypes);
  const stored = overrides?.[accessoryId];
  const override = isValidCategory(stored) ? stored : null;
  return { category: override ?? auto, auto, override };
}
