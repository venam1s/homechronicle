import { serviceSplitId } from './utils.js';

const SERVICE_TYPE_LABELS = new Map([
  ['43', 'Lightbulb'],
  ['49', 'Switch'],
  ['47', 'Outlet'],
  ['40', 'Fan'],
  ['B7', 'Fan'],
  ['41', 'GarageDoorOpener'],
  ['45', 'LockMechanism'],
  ['4A', 'Thermostat'],
  ['7E', 'SecuritySystem'],
  ['85', 'MotionSensor'],
  ['80', 'ContactSensor'],
  ['86', 'OccupancySensor'],
  ['8A', 'TemperatureSensor'],
  ['82', 'HumiditySensor'],
  ['84', 'LightSensor'],
  ['8D', 'AirQualitySensor'],
  ['83', 'LeakSensor'],
  ['87', 'SmokeSensor'],
  ['7F', 'CarbonMonoxideSensor'],
  ['97', 'CarbonDioxideSensor'],
  ['81', 'Door'],
  ['8B', 'Window'],
  ['8C', 'WindowCovering'],
  ['BB', 'AirPurifier'],
  ['BC', 'HeaterCooler'],
  ['BD', 'HumidifierDehumidifier'],
  ['CF', 'IrrigationSystem'],
  ['D0', 'Valve'],
  ['96', 'Battery'],
  ['110', 'Camera'],
  ['121', 'Doorbell'],
  ['D8', 'Television'],
  ['BA', 'FilterMaintenance'],
]);

// Short HAP UUIDs (0000XXXX-0000-1000-8000-0026BB765291). Verified against
// hap-controller's characteristic table in test/accessory-metadata.test.js.
const WATCHED_CHARACTERISTICS = new Map([
  ['25', 'On'],
  ['E', 'CurrentDoorState'],
  ['32', 'TargetDoorState'],
  ['1D', 'LockCurrentState'],
  ['1E', 'LockTargetState'],
  ['22', 'MotionDetected'],
  ['6A', 'ContactSensorState'],
  ['71', 'OccupancyDetected'],
  ['76', 'SmokeDetected'],
  ['11', 'CurrentTemperature'],
  ['10', 'CurrentRelativeHumidity'],
  ['F', 'CurrentHeatingCoolingState'],
  ['6D', 'CurrentPosition'],
  ['66', 'SecuritySystemCurrentState'],
  ['67', 'SecuritySystemTargetState'],
  ['8', 'Brightness'],
  ['CE', 'ColorTemperature'],
  ['13', 'Hue'],
  ['2F', 'Saturation'],
  ['B0', 'Active'],
  ['75', 'StatusActive'],
  ['AB', 'FilterLifeLevel'],
  ['95', 'AirQuality'],
  ['C8', 'VOCDensity'],
  ['C6', 'PM2_5Density'],
  ['6B', 'CurrentAmbientLightLevel'],
  ['79', 'StatusLowBattery'],
  ['68', 'BatteryLevel'],
  ['70', 'LeakDetected'],
  ['AC', 'FilterChangeIndication'],
]);

const identityCache = new Map();
const capabilitiesCache = new Map();

function copyOrNull(value) {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  return text || null;
}

function getInfoCharacteristicValue(infoService, shortType) {
  const match = infoService?.characteristics?.find((c) => shortUuid(c.type) === shortType);
  return copyOrNull(match?.value);
}

/**
 * aid.iid of the top-level accessory's own Name characteristic (aid 1
 * AccessoryInformation.Name), or null. Answered by the HAP server itself, so
 * it is a cheap liveness probe.
 */
export function nameCharacteristicKey(accessories) {
  const acc = (accessories?.accessories ?? []).find((a) => a.aid === 1);
  for (const service of acc?.services ?? []) {
    if (shortUuid(service.type) !== '3E') continue; // AccessoryInformation
    const name = service.characteristics?.find((c) => shortUuid(c.type) === '23');
    if (name?.iid != null) return `1.${name.iid}`;
  }
  return null;
}

export function shortUuid(uuid = '') {
  const match = uuid.match(/^0*([0-9A-Fa-f]+)-/);
  return match ? match[1].toUpperCase() : uuid.toUpperCase();
}

function serviceOwnName(service) {
  // ConfiguredName (E3) is the name the user gave it in the Home app; Name (23)
  // is the one the accessory (or Homebridge plugin) publishes for the service.
  for (const code of ['E3', '23']) {
    const match = service.characteristics?.find((c) => shortUuid(c.type) === code);
    const text = copyOrNull(match?.value);
    if (text) return text;
  }
  return null;
}

function hasWatchedCharacteristic(service) {
  return (service.characteristics ?? []).some((c) => WATCHED_CHARACTERISTICS.has(shortUuid(c.type)));
}

function describeService(service) {
  const serviceTypeShort = shortUuid(service.type);
  const serviceLabel = SERVICE_TYPE_LABELS.get(serviceTypeShort) ?? serviceTypeShort;
  const characteristics = [];
  const watchedNames = new Set();
  for (const char of service.characteristics ?? []) {
    const charTypeShort = shortUuid(char.type);
    const watchedLabel = WATCHED_CHARACTERISTICS.get(charTypeShort);
    if (watchedLabel) watchedNames.add(watchedLabel);
    characteristics.push({
      iid: char.iid ?? null,
      type: charTypeShort,
      label: watchedLabel ?? char.description ?? charTypeShort,
      format: char.format ?? null,
      unit: char.unit ?? null,
      min_value: char.minValue ?? null,
      max_value: char.maxValue ?? null,
      min_step: char.minStep ?? null,
      perms: Array.isArray(char.perms) ? char.perms : [],
    });
  }
  return {
    summary: { iid: service.iid ?? null, type: serviceTypeShort, label: serviceLabel, characteristics },
    watchedNames,
  };
}

// accessoryId → display name, for naming split services after their accessory
// as the user sees it. Set by index.js from the display names store.
let parentDisplayNameFor = () => null;

/** Supply the display names split-service names are built from. */
export function setParentDisplayNameLookup(fn) {
  parentDisplayNameFor = typeof fn === 'function' ? fn : () => null;
}

/**
 * A service's name without a live reading some plugins append to it
 * (homebridge-weather-plus: "Wind Speedː 11.5 mph", "UV Indexː 1"), so the
 * device name stays the same from one connection to the next.
 */
export function stableServiceName(name) {
  const text = copyOrNull(name);
  if (!text) return null;
  const stripped = text
    .replace(/\s*\u02D0.*$/, '') // "ː <anything>": a separator, never part of a name
    .replace(/\s*:\s*[-+]?\d.*$/, '') // ": <number…>"
    .trim();
  return stripped || null;
}

/**
 * Services to log as entities of their own: watched services whose type occurs
 * more than once on a bridged accessory (a two-outlet plug published by a
 * Homebridge plugin as one accessory with two Outlet services).
 *
 * Each is named "<accessory> <service>", the accessory being its display name
 * when one is set: plugins name services after their function ("Clean",
 * "Status"), which says nothing without the device. A service name that
 * already contains the accessory's name is used as is. When the services have
 * no names of their own, or share one, they are "<accessory> <n>" in order.
 *
 * @returns {Map<object, string>} service → name
 */
function findSplitServices(acc, childName, accessoryId) {
  const split = new Map();
  // Bridged accessories only (Homebridge and the like): their per-device
  // settings live under the bridge's children, where the services are listed.
  // A directly paired device has no such place yet, so it stays one entity.
  if (!(acc.aid > 1)) return split;
  const byType = new Map();
  for (const service of acc.services ?? []) {
    if (!hasWatchedCharacteristic(service)) continue;
    const type = shortUuid(service.type);
    if (!byType.has(type)) byType.set(type, []);
    byType.get(type).push(service);
  }
  const displayName = copyOrNull(parentDisplayNameFor(accessoryId));
  for (const [type, services] of byType) {
    if (services.length < 2) continue;
    const base = displayName ?? childName ?? SERVICE_TYPE_LABELS.get(type) ?? type;
    const reported = childName?.toLowerCase();
    const named = services.map((service) => {
      const own = stableServiceName(serviceOwnName(service));
      if (!own) return null;
      const lower = own.toLowerCase();
      if (lower === reported || lower === base.toLowerCase()) return null;
      if (lower.includes(base.toLowerCase())) return own;
      // "Holiday Outlet Left" under a display name: swap the reported prefix.
      if (reported && lower.startsWith(reported)) return `${base}${own.slice(childName.length)}`;
      return `${base} ${own}`;
    });
    const distinct = named.every((name, i) => name
      && named.findIndex((other) => other?.toLowerCase() === name.toLowerCase()) === i);
    services.forEach((service, i) => {
      split.set(service, distinct ? named[i] : `${base} ${i + 1}`);
    });
  }
  return split;
}

export function extractAccessoryMetadata({ deviceId, pairingName = null, accessories }) {
  const iidMetaMap = new Map();
  const identitiesByAccessoryId = new Map();
  const capabilitiesByAccessoryId = new Map();
  // Split services: one entry per service logged as its own entity.
  const serviceSplits = [];
  const nowIso = new Date().toISOString();

  for (const acc of accessories?.accessories ?? []) {
    const infoService = acc.services?.find((s) => shortUuid(s.type) === '3E');
    const childName = getInfoCharacteristicValue(infoService, '23')
      ?? (acc.aid === 1 ? copyOrNull(pairingName) : null);
    const manufacturer = getInfoCharacteristicValue(infoService, '20');
    const model = getInfoCharacteristicValue(infoService, '21');
    const serialNumber = getInfoCharacteristicValue(infoService, '30');
    const firmwareRevision = getInfoCharacteristicValue(infoService, '52');
    const hardwareRevision = getInfoCharacteristicValue(infoService, '53');
    const effectiveId = acc.aid > 1 ? `${deviceId}:${acc.aid}` : deviceId;
    const identity = {
      manufacturer,
      model,
      serial_number: serialNumber,
      firmware_revision: firmwareRevision,
      hardware_revision: hardwareRevision,
      metadata_updated_at: nowIso,
    };
    const capabilityBase = {
      parent_device_id: deviceId,
      aid: acc.aid,
      manufacturer,
      model,
      serial_number: serialNumber,
      firmware_revision: firmwareRevision,
      hardware_revision: hardwareRevision,
    };

    const splitServices = findSplitServices(acc, childName, effectiveId);

    // The accessory itself keeps every service that is not split off.
    const watchedServiceTypes = new Set();
    const watchedCharacteristicNames = new Set();
    const services = [];
    let characteristicCount = 0;

    for (const service of acc.services ?? []) {
      if (splitServices.has(service)) continue;
      const { summary, watchedNames } = describeService(service);
      if (watchedNames.size > 0) watchedServiceTypes.add(summary.label);
      for (const name of watchedNames) watchedCharacteristicNames.add(name);
      characteristicCount += summary.characteristics.length;
      services.push(summary);
    }

    // Counted over every watched service, split ones included, so a sensor
    // next to a split pair keeps the "<name> · <service>" name it had before.
    const allWatchedTypes = new Set((acc.services ?? [])
      .filter(hasWatchedCharacteristic)
      .map((s) => shortUuid(s.type)));
    const shouldDisambiguateByService = allWatchedTypes.size > 1;

    for (const service of acc.services ?? []) {
      const serviceTypeShort = shortUuid(service.type);
      const serviceType = SERVICE_TYPE_LABELS.get(serviceTypeShort) ?? serviceTypeShort;
      const splitName = splitServices.get(service);
      const accessoryId = splitName ? serviceSplitId(deviceId, acc.aid, service.iid) : effectiveId;
      for (const char of service.characteristics ?? []) {
        const charType = shortUuid(char.type);
        const charName = WATCHED_CHARACTERISTICS.get(charType) ?? null;
        if (!charName) continue;
        let componentName = childName;
        if (splitName) componentName = splitName;
        else if (shouldDisambiguateByService && childName) componentName = `${childName} · ${serviceType}`;
        iidMetaMap.set(`${acc.aid}.${char.iid}`, {
          accessoryId,
          parentAccessoryId: effectiveId,
          ...(splitName ? { parentDisplayName: copyOrNull(parentDisplayNameFor(effectiveId)) } : {}),
          serviceType,
          characteristicName: charName,
          childName,
          componentName,
        });
      }
    }

    // Identity and firmware belong to the accessory, split or not: one
    // firmware change is one event, not one per outlet.
    identitiesByAccessoryId.set(effectiveId, identity);

    for (const [service, name] of splitServices) {
      const { summary, watchedNames } = describeService(service);
      const accessoryId = serviceSplitId(deviceId, acc.aid, service.iid);
      serviceSplits.push({
        accessoryId,
        parentAccessoryId: effectiveId,
        name,
        serviceType: summary.label,
        iids: summary.characteristics
          .filter((c) => WATCHED_CHARACTERISTICS.has(c.type) && c.iid != null)
          .map((c) => c.iid),
      });
      capabilitiesByAccessoryId.set(accessoryId, {
        accessory_id: accessoryId,
        ...capabilityBase,
        service_iid: service.iid ?? null,
        accessory_name: name,
        parent_accessory_id: effectiveId,
        parent_accessory_name: childName,
        service_count: 1,
        characteristic_count: summary.characteristics.length,
        watched_service_types: [summary.label],
        watched_characteristics: [...watchedNames],
        watched_characteristic_count: watchedNames.size,
        services: [summary],
        metadata_updated_at: nowIso,
      });
    }

    // A fully split accessory has no entity of its own left to list: listing
    // it would show a device that never logs anything next to its services.
    if (splitServices.size > 0 && watchedServiceTypes.size === 0) continue;

    capabilitiesByAccessoryId.set(effectiveId, {
      accessory_id: effectiveId,
      ...capabilityBase,
      accessory_name: childName,
      service_count: services.length,
      characteristic_count: characteristicCount,
      watched_service_types: [...watchedServiceTypes],
      watched_characteristics: [...watchedCharacteristicNames],
      watched_characteristic_count: watchedCharacteristicNames.size,
      services,
      metadata_updated_at: nowIso,
    });
  }

  return { iidMetaMap, identitiesByAccessoryId, capabilitiesByAccessoryId, serviceSplits };
}

export function cacheAccessoryMetadata({ deviceId, pairingName = null, accessories }) {
  const parsed = extractAccessoryMetadata({ deviceId, pairingName, accessories });
  clearAccessoryMetadata(deviceId);

  for (const [accessoryId, identity] of parsed.identitiesByAccessoryId.entries()) {
    identityCache.set(accessoryId, identity);
  }
  // A split service shows its accessory's make, model and firmware.
  for (const split of parsed.serviceSplits) {
    const identity = parsed.identitiesByAccessoryId.get(split.parentAccessoryId);
    if (identity) identityCache.set(split.accessoryId, identity);
  }
  for (const [accessoryId, capability] of parsed.capabilitiesByAccessoryId.entries()) {
    capabilitiesCache.set(accessoryId, capability);
  }

  return parsed;
}

export function getAccessoryIdentity(accessoryId) {
  return identityCache.get(accessoryId) ?? null;
}

export function getAccessoryCapabilities(accessoryId) {
  return capabilitiesCache.get(accessoryId) ?? null;
}

export function getAllDiscoveredAccessories() {
  return [...capabilitiesCache.values()];
}

export function clearAccessoryMetadata(deviceId) {
  for (const key of identityCache.keys()) {
    if (key === deviceId || key.startsWith(`${deviceId}:`)) identityCache.delete(key);
  }
  for (const key of capabilitiesCache.keys()) {
    if (key === deviceId || key.startsWith(`${deviceId}:`)) capabilitiesCache.delete(key);
  }
}

export { SERVICE_TYPE_LABELS, WATCHED_CHARACTERISTICS };
