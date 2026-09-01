/**
 * matter-controller.js — persistent matter.js CommissioningController singleton.
 *
 * Replaces the chip-tool CLI spawn pattern with an in-process TypeScript Matter
 * implementation. Provides commission, poll, subscribe, discover, and lifecycle
 * management for Matter nodes.
 */

import { Environment, StorageService, Logger, LogLevel, LogFormat, logLevelFromString } from '@matter/main';
import {
  OnOff,
  LevelControl,
  BooleanState,
  TemperatureMeasurement,
  RelativeHumidityMeasurement,
  OccupancySensing,
  ColorControl,
  DoorLock,
  WindowCovering,
  FanControl,
  Thermostat,
  PressureMeasurement,
  IlluminanceMeasurement,
  ElectricalPowerMeasurement,
  SmokeCoAlarm,
  GeneralCommissioning,
} from '@matter/main/clusters';
import { ManualPairingCodeCodec, QrPairingCodeCodec } from '@matter/main/types';
import { CommissioningController } from '@project-chip/matter.js';
import { NodeStates } from '@project-chip/matter.js/device';
import { log } from './logger.js';
import { normalizeReading } from './matter-normalize.js';

// -- matter.js Logger configuration --
// Configure the matter.js global Logger at module load (before any SDK code runs).
// Defaults to INFO/PLAIN — avoids the DEBUG firehose and ANSI codes in Docker logs.
{
  const VALID_FORMATS = ['plain', 'ansi', 'html'];
  const rawLevel = (process.env.MATTER_LOG_LEVEL ?? 'info').toLowerCase().trim();
  const rawFormat = (process.env.MATTER_LOG_FORMAT ?? 'plain').toLowerCase().trim();

  let resolvedLevel = LogLevel.INFO;
  try {
    const parsed = logLevelFromString(rawLevel);
    if (parsed !== undefined && parsed !== null) resolvedLevel = parsed;
  } catch (_) { /* bad value — fall back to INFO */ }

  const resolvedFormat = VALID_FORMATS.includes(rawFormat) ? rawFormat : LogFormat.PLAIN;

  Logger.level = resolvedLevel;
  Logger.format = resolvedFormat;

  log.info(`[matter-controller] matter.js log level=${rawLevel} format=${resolvedFormat}`);
}

const STORAGE_PATH = process.env.MATTER_STORAGE_PATH?.trim()
  || (process.env.NODE_ENV === 'production' ? '/app/data/matter-storage' : './data/matter-storage');

const SUBSCRIBE_MIN_INTERVAL_SEC = Number.parseInt(
  process.env.MATTER_SUBSCRIBE_MIN_INTERVAL_SEC ?? '1', 10,
);
const SUBSCRIBE_MAX_INTERVAL_SEC = Number.parseInt(
  process.env.MATTER_SUBSCRIBE_MAX_INTERVAL_SEC ?? '30', 10,
);

const COUNTRY_CODE = (process.env.MATTER_COUNTRY_CODE ?? 'XX').trim().toUpperCase().slice(0, 2);

/** Clusters we read/subscribe — same set that chip-tool scripts supported. */
const SUPPORTED_CLUSTERS = [
  {
    cluster: OnOff.Complete,
    id: 0x0006,
    serviceType: 'OnOff',
    attributes: [{ name: 'onOff', characteristic: 'OnOff', attributeId: 0 }],
  },
  {
    cluster: LevelControl.Complete,
    id: 0x0008,
    serviceType: 'LevelControl',
    attributes: [{ name: 'currentLevel', characteristic: 'CurrentLevel', attributeId: 0 }],
  },
  {
    cluster: BooleanState.Complete,
    id: 0x0045,
    serviceType: 'BooleanState',
    attributes: [{ name: 'stateValue', characteristic: 'StateValue', attributeId: 0 }],
  },
  {
    cluster: TemperatureMeasurement.Complete,
    id: 0x0402,
    serviceType: 'TemperatureMeasurement',
    attributes: [{ name: 'measuredValue', characteristic: 'MeasuredValue', attributeId: 0 }],
  },
  {
    cluster: RelativeHumidityMeasurement.Complete,
    id: 0x0405,
    serviceType: 'RelativeHumidityMeasurement',
    attributes: [{ name: 'measuredValue', characteristic: 'MeasuredValue', attributeId: 0 }],
  },
  {
    cluster: OccupancySensing.Complete,
    id: 0x0406,
    serviceType: 'OccupancySensing',
    attributes: [{ name: 'occupancy', characteristic: 'Occupancy', attributeId: 0 }],
  },
  {
    cluster: ColorControl.Complete,
    id: 0x0300,
    serviceType: 'ColorControl',
    attributes: [
      { name: 'currentHue', characteristic: 'CurrentHue', attributeId: 0 },
      { name: 'currentSaturation', characteristic: 'CurrentSaturation', attributeId: 1 },
      { name: 'colorTemperatureMireds', characteristic: 'ColorTemperatureMireds', attributeId: 7 },
    ],
  },
  {
    cluster: DoorLock.Complete,
    id: 0x0101,
    serviceType: 'DoorLock',
    attributes: [{ name: 'lockState', characteristic: 'LockState', attributeId: 0 }],
  },
  {
    cluster: WindowCovering.Complete,
    id: 0x0102,
    serviceType: 'WindowCovering',
    attributes: [
      { name: 'currentPositionLiftPercent100ths', characteristic: 'CurrentPosition', attributeId: 14 },
      { name: 'operationalStatus', characteristic: 'OperationalStatus', attributeId: 10 },
    ],
  },
  {
    cluster: FanControl.Complete,
    id: 0x0202,
    serviceType: 'FanControl',
    attributes: [
      { name: 'fanMode', characteristic: 'FanMode', attributeId: 0 },
      // attributeId 3, not 6 — the spec-drift test checks this against matter.js's model.
      { name: 'percentCurrent', characteristic: 'PercentCurrent', attributeId: 3 },
    ],
  },
  {
    cluster: Thermostat.Complete,
    id: 0x0201,
    serviceType: 'Thermostat',
    attributes: [
      { name: 'localTemperature', characteristic: 'LocalTemperature', attributeId: 0 },
      { name: 'systemMode', characteristic: 'SystemMode', attributeId: 28 },
    ],
  },
  {
    cluster: PressureMeasurement.Complete,
    id: 0x0403,
    serviceType: 'PressureMeasurement',
    attributes: [{ name: 'measuredValue', characteristic: 'MeasuredValue', attributeId: 0 }],
  },
  {
    cluster: IlluminanceMeasurement.Complete,
    id: 0x0400,
    serviceType: 'IlluminanceMeasurement',
    attributes: [{ name: 'measuredValue', characteristic: 'MeasuredValue', attributeId: 0 }],
  },
  {
    cluster: ElectricalPowerMeasurement.Complete,
    id: 0x0090,
    serviceType: 'ElectricalPowerMeasurement',
    attributes: [{ name: 'activePower', characteristic: 'ActivePower', attributeId: 8 }],
  },
  {
    cluster: SmokeCoAlarm.Complete,
    id: 0x005c,
    serviceType: 'SmokeCoAlarm',
    attributes: [
      { name: 'smokeState', characteristic: 'SmokeState', attributeId: 1 },
      { name: 'coState', characteristic: 'COState', attributeId: 2 },
      { name: 'batteryAlert', characteristic: 'BatteryAlert', attributeId: 3 },
    ],
  },
];

const CLUSTER_LABELS = new Map(
  SUPPORTED_CLUSTERS.map((c) => [c.id, {
    serviceType: c.serviceType,
    characteristic: c.attributes[0].characteristic,
    attributeMap: new Map(c.attributes.map((a) => [a.name, a])),
  }]),
);

let controller = null;
let controllerReady = false;

/**
 * Point matter.js's storage at `path`, and prove it took.
 *
 * Exported ONLY so a test can exercise it against the real matter.js, because
 * this line is what broke: matter.js 0.16 let you assign
 * `storageService.location = path`; 0.17 made it getter-only, so the
 * assignment throws "Cannot set property location of #<StorageService> which
 * has only a getter" and the listener crash-loops on boot. The spec-drift
 * guard did not catch it — it checked that the APIs RESOLVE, not that the
 * controller can actually initialise.
 *
 * The path must be set on the environment BEFORE the service is resolved.
 * The read-back is not ceremony: a silently-ignored path would send the
 * fabric to the wrong directory, which loses every commissioned node.
 *
 * @returns {string} the location matter.js actually adopted
 */
export function configureStorage(environment, path) {
  environment.vars.set('storage.path', path);
  const storageService = environment.get(StorageService);
  if (storageService.location !== path) {
    throw new Error(
      `[matter-controller] storage path not applied: wanted ${path}, got ${storageService.location}. `
      + 'matter.js may have changed how storage is configured again.',
    );
  }
  return storageService.location;
}

/**
 * Initialize and start the CommissioningController.
 * Call once at application startup.
 */
export async function initController() {
  if (controller) return;

  const environment = Environment.default;

  // Bind mDNS to a specific interface if configured.
  const iface = process.env.DISCOVER_IFACE?.trim() || null;
  if (iface) {
    environment.vars.set('mdns.networkInterface', iface);
    log.info(`[matter-controller] mDNS bound to interface: ${iface}`);
  }

  // Configure storage path.
  log.info(`[matter-controller] Storage: ${configureStorage(environment, STORAGE_PATH)}`);

  // Use a stable ID so the controller remembers commissioned nodes across restarts.
  // A timestamp-based ID would create a new fabric namespace on every restart,
  // making previously commissioned nodes invisible to getCommissionedNodes().
  const uniqueId = process.env.MATTER_CONTROLLER_ID?.trim() || 'homechronicle';

  controller = new CommissioningController({
    environment: {
      environment,
      id: uniqueId,
    },
    autoConnect: false,
    adminFabricLabel: 'homechronicle',
    subscribeMinIntervalFloorSeconds: Number.isFinite(SUBSCRIBE_MIN_INTERVAL_SEC) ? SUBSCRIBE_MIN_INTERVAL_SEC : 1,
    subscribeMaxIntervalCeilingSeconds: Number.isFinite(SUBSCRIBE_MAX_INTERVAL_SEC) ? SUBSCRIBE_MAX_INTERVAL_SEC : 30,
  });

  await controller.start();
  controllerReady = true;
  log.info('[matter-controller] Controller started');
}

/**
 * Commission a Matter device using a setup code.
 * @param {string} setupCode — Manual pairing code (numeric) or QR payload (MT:...)
 * @param {object} opts — Optional { address, port }
 * @returns {{ nodeId: string }} — The commissioned node's decimal nodeId.
 */
export async function commission(setupCode, opts = {}) {
  if (!controller || !controllerReady) {
    throw new Error('Matter controller not initialized');
  }

  const isQr = /^MT:/i.test(setupCode);
  let passcode;
  let discoveryData;

  if (isQr) {
    const decoded = QrPairingCodeCodec.decode(setupCode);
    passcode = decoded.passcode;
    discoveryData = { longDiscriminator: decoded.discriminator };
  } else {
    const decoded = ManualPairingCodeCodec.decode(setupCode);
    passcode = decoded.passcode;
    discoveryData = decoded.shortDiscriminator !== undefined
      ? { shortDiscriminator: decoded.shortDiscriminator }
      : {};
  }

  const commissioningOptions = {
    commissioning: {
      regulatoryLocation: GeneralCommissioning.RegulatoryLocationType.IndoorOutdoor,
      regulatoryCountryCode: COUNTRY_CODE,
    },
    discovery: {
      identifierData: discoveryData,
    },
    passcode,
  };

  // If address + port provided, use known address for direct commissioning.
  if (opts.address && opts.port) {
    commissioningOptions.discovery.knownAddress = {
      ip: opts.address,
      port: Number(opts.port),
      type: 'udp',
    };
  }

  const nodeId = await controller.commissionNode(commissioningOptions);
  log.info(`[matter-controller] Commissioned node: ${nodeId}`);
  return { nodeId: String(nodeId) };
}

/**
 * Connect to a commissioned node and read supported cluster attributes.
 * Returns an array of event objects in the same shape matter-runtime.js expects.
 */
export async function poll(nodeId) {
  if (!controller || !controllerReady) {
    throw new Error('Matter controller not initialized');
  }

  const node = await controller.getNode(BigInt(nodeId));
  if (!node) throw new Error(`Node ${nodeId} not found in controller`);

  if (!node.isConnected) {
    await node.connect();
  }
  if (!node.initialized) {
    await node.events.initializedFromRemote;
  }

  const events = [];
  const devices = node.getDevices();

  for (const device of devices) {
    const endpointId = device.number;

    for (const clusterDef of SUPPORTED_CLUSTERS) {
      let clusterClient;
      try {
        clusterClient = device.getClusterClient(clusterDef.cluster);
      } catch (err) {
        log.debug(`[matter-controller] Could not get ${clusterDef.serviceType} client on node ${nodeId} endpoint ${endpointId}: ${err.message}`);
        continue;
      }
      if (!clusterClient) continue;

      for (const attr of clusterDef.attributes) {
        let value;
        try {
          value = await clusterClient.attributes[attr.name]?.get();
        } catch (err) {
          log.debug(`[matter-controller] Failed to read ${clusterDef.serviceType}.${attr.name} on node ${nodeId} endpoint ${endpointId}: ${err.message}`);
          continue;
        }
        if (value === undefined || value === null) continue;

        // Translate to the HomeKit vocabulary and units the rest of the app
        // speaks. An unmapped attribute, or one whose value will not convert,
        // is dropped: a raw Matter integer under a Matter-only name is worse
        // than no row, because alerts and filters would silently never match it.
        const normalized = normalizeReading({
          clusterId: clusterDef.id,
          attributeId: attr.attributeId,
          value,
        });
        if (!normalized) continue;

        events.push({
          nodeId,
          endpointId,
          clusterId: clusterDef.id,
          attributeId: attr.attributeId,
          serviceType: clusterDef.serviceType,
          characteristic: normalized.characteristic,
          newValue: normalized.value,
        });
      }
    }
  }

  return events;
}

/**
 * Subscribe to attribute changes on a commissioned node.
 * Calls `callback(events)` for each attribute change.
 * Returns an object with a `stop()` method.
 */
export async function subscribe(nodeId, callback) {
  if (!controller || !controllerReady) {
    throw new Error('Matter controller not initialized');
  }

  const node = await controller.getNode(BigInt(nodeId));
  if (!node) throw new Error(`Node ${nodeId} not found in controller`);

  if (!node.isConnected) {
    await node.connect();
  }
  if (!node.initialized) {
    await node.events.initializedFromRemote;
  }

  // Subscribe to all attribute changes on this node.
  const handler = ({ path, value }) => {
    const { endpointId, clusterId, attributeName } = path;
    const labels = CLUSTER_LABELS.get(clusterId);
    if (!labels) return; // Not a cluster we track

    const attrDef = labels.attributeMap.get(attributeName);
    if (!attrDef) return; // Tracked cluster, but not an attribute we map.

    // Same normalization as the poll path — both funnel into ingestRows, so
    // they must agree on names and units or the value cache would treat one
    // reading as a change from the other.
    const normalized = normalizeReading({
      clusterId,
      attributeId: attrDef.attributeId,
      value,
    });
    if (!normalized) return;

    const event = {
      nodeId,
      endpointId,
      clusterId,
      attributeId: attrDef.attributeId,
      serviceType: labels.serviceType,
      characteristic: normalized.characteristic,
      newValue: normalized.value,
    };
    callback([event]);
  };

  node.events.attributeChanged.on(handler);

  // Also listen for connection state changes to assist with error tracking.
  const stateHandler = (state) => {
    if (state === NodeStates.Disconnected) {
      log.warn(`[matter-controller] Node ${nodeId} disconnected`);
    } else if (state === NodeStates.Reconnecting) {
      log.debug(`[matter-controller] Node ${nodeId} reconnecting...`);
    } else if (state === NodeStates.Connected) {
      log.info(`[matter-controller] Node ${nodeId} connected`);
    }
  };
  node.events.stateChanged.on(stateHandler);

  return {
    stop() {
      try {
        node.events.attributeChanged.off(handler);
        node.events.stateChanged.off(stateHandler);
      } catch (err) { log.debug('[matter-controller] cleanup error:', err.message); }
    },
  };
}

/**
 * Discover commissionable Matter devices on the network.
 * Returns an array of device descriptors.
 */
export async function discover(timeoutMs = 10_000) {
  if (!controller || !controllerReady) {
    throw new Error('Matter controller not initialized');
  }

  const found = [];

  await new Promise((resolve) => {
    const timer = setTimeout(() => {
      try {
        controller.cancelCommissionableDeviceDiscovery({});
      } catch (err) {
        log.debug('[matter] cancelDiscovery error:', err.message);
      }
      resolve();
    }, timeoutMs);

    controller.discoverCommissionableDevices(
      {},
      undefined,
      (device) => {
        found.push({
          instanceName: device.instanceId ?? null,
          hostname: device.deviceIdentifier ?? null,
          deviceName: device.DN ?? null,
          discriminator: device.D ?? null,
          vendorId: device.VP ? Number.parseInt(String(device.VP).split('+')[0], 10) : null,
          productId: device.VP ? Number.parseInt(String(device.VP).split('+')[1], 10) : null,
          deviceType: device.DT ?? null,
          address: device.addresses?.[0]?.ip ?? null,
          addresses: (device.addresses ?? []).map((a) => a.ip),
          port: device.addresses?.[0]?.port ?? null,
          commissionable: true,
        });
      },
    ).catch(() => {
      clearTimeout(timer);
      resolve();
    });
  });

  return found;
}

/**
 * Disconnect and remove a node from the controller.
 */
export async function stopNode(nodeId) {
  if (!controller || !controllerReady) return;

  try {
    const node = await controller.getNode(BigInt(nodeId));
    if (node) {
      await node.disconnect();
    }
  } catch (err) {
    log.warn(`[matter-controller] Error disconnecting node ${nodeId}: ${err.message}`);
  }
}

/**
 * Return controller status for the health endpoint.
 */
export function getStatus() {
  if (!controller || !controllerReady) {
    return { ready: false, commissionedNodes: [] };
  }

  try {
    const nodes = controller.getCommissionedNodes();
    return {
      ready: true,
      commissionedNodes: nodes.map((n) => String(n)),
    };
  } catch (err) {
    log.debug('[matter] getCommissionedNodes failed:', err.message);
    return { ready: controllerReady, commissionedNodes: [] };
  }
}
