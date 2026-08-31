/**
 * icons.js — maps HomeKit service types and characteristic names
 * to lucide-react icon component names.
 */

import {
  Lightbulb,
  Lock,
  Thermometer,
  Activity,
  ToggleLeft,
  Shield,
  Camera,
  Wind,
  Warehouse,
  Eye,
  Droplets,
  Home,
  DoorOpen,
  Bell,
  Zap,
} from 'lucide-react';

const SERVICE_ICONS = {
  Lightbulb:       Lightbulb,
  Outlet:          Zap,
  Switch:          ToggleLeft,
  Thermostat:      Thermometer,
  TemperatureSensor: Thermometer,
  HumiditySensor:  Droplets,
  MotionSensor:    Eye,
  ContactSensor:   DoorOpen,
  OccupancySensor: Eye,
  LockMechanism:   Lock,
  GarageDoorOpener: Warehouse,
  Door:            DoorOpen,
  Window:          DoorOpen,
  SecuritySystem:  Shield,
  Camera:          Camera,
  Fan:             Wind,
  AirQualitySensor: Activity,
  Doorbell:        Bell,
};

const SERVICE_LABELS = {
  Lightbulb: 'Light',
  Outlet: 'Outlet',
  Switch: 'Switch',
  Thermostat: 'Thermostat',
  TemperatureSensor: 'Temperature Sensor',
  HumiditySensor: 'Humidity Sensor',
  MotionSensor: 'Motion Sensor',
  ContactSensor: 'Contact Sensor',
  OccupancySensor: 'Occupancy Sensor',
  LockMechanism: 'Lock',
  GarageDoorOpener: 'Garage Door',
  Door: 'Door',
  Window: 'Window',
  SecuritySystem: 'Security System',
  Camera: 'Camera',
  Fan: 'Fan',
  AirQualitySensor: 'Air Quality Sensor',
  Doorbell: 'Doorbell',
};

export function getServiceIcon(serviceType) {
  return SERVICE_ICONS[serviceType] ?? Home;
}

export function getServiceLabel(serviceType) {
  if (!serviceType) return 'Accessory';
  return SERVICE_LABELS[serviceType] ?? serviceType.replace(/([a-z])([A-Z])/g, '$1 $2');
}

/**
 * Returns before → after strings for numeric/enum characteristics where
 * showing the transition adds value. Returns null when not applicable.
 */
export function describeBeforeAfter(characteristic, oldValue, newValue) {
  if (oldValue == null || oldValue === '' || String(oldValue) === String(newValue)) return null;
  switch (characteristic) {
    case 'Brightness':
    case 'Volume':
      return { from: `${Math.round(oldValue)}%`, to: `${Math.round(newValue)}%` };
    case 'Saturation':
      return { from: `${parseFloat(oldValue).toFixed(0)}%`, to: `${parseFloat(newValue).toFixed(0)}%` };
    case 'CurrentTemperature':
    case 'TargetTemperature':
      return { from: `${parseFloat(oldValue).toFixed(1)}°C`, to: `${parseFloat(newValue).toFixed(1)}°C` };
    case 'CurrentRelativeHumidity':
      return { from: `${parseFloat(oldValue).toFixed(0)}%`, to: `${parseFloat(newValue).toFixed(0)}%` };
    case 'Hue':
      return { from: `${parseFloat(oldValue).toFixed(0)}°`, to: `${parseFloat(newValue).toFixed(0)}°` };
    case 'ColorTemperature':
      return { from: `${Math.round(oldValue)} mired`, to: `${Math.round(newValue)} mired` };
    default:
      return null;
  }
}

/**
 * Formats a millisecond gap into a human-readable string.
 * Returns null for gaps under 2 minutes (not worth displaying).
 */
export function formatGap(ms) {
  if (ms < 2 * 60_000) return null;
  const totalMin = Math.round(ms / 60_000);
  const h        = Math.floor(totalMin / 60);
  const m        = totalMin % 60;
  if (h === 0)  return `${m}m`;
  if (m === 0)  return `${h}h`;
  return `${h}h ${m}m`;
}

/** Returns a human-readable description of a characteristic change */
export function describeChange(characteristic, newValue) {
  switch (characteristic) {
    case 'On':
      return newValue === 'true' || newValue === '1' ? 'turned on' : 'turned off';
    case 'MotionDetected':
      return newValue === 'true' || newValue === '1' ? 'motion detected' : 'motion cleared';
    case 'ContactSensorState':
      return newValue === '0' ? 'contact closed' : 'contact opened';
    case 'OccupancyDetected':
      return newValue === '1' ? 'occupancy detected' : 'no occupancy';
    case 'CurrentDoorState':
    case 'TargetDoorState': {
      const states = ['open', 'closed', 'opening', 'closing', 'stopped'];
      return states[parseInt(newValue, 10)] ?? `state ${newValue}`;
    }
    case 'LockCurrentState':
    case 'LockTargetState': {
      const states = ['unsecured', 'secured', 'jammed', 'unknown'];
      return states[parseInt(newValue, 10)] ?? `state ${newValue}`;
    }
    case 'SecuritySystemCurrentState':
    case 'SecuritySystemTargetState': {
      const states = ['stay arm', 'away arm', 'night arm', 'disarmed', 'alarm triggered'];
      return states[parseInt(newValue, 10)] ?? `state ${newValue}`;
    }
    case 'CurrentTemperature':
      return `${parseFloat(newValue).toFixed(1)}°C`;
    case 'CurrentRelativeHumidity':
      return `${parseFloat(newValue).toFixed(0)}% RH`;
    case 'Brightness':
      return `brightness ${newValue}%`;
    case 'StatusLowBattery':
      return newValue === '1' || newValue === 'true' ? 'battery low' : 'battery normal';
    case 'BatteryLevel':
      return `battery ${parseInt(newValue, 10)}%`;
    case 'ChargingState': {
      const states = ['not charging', 'charging', 'not chargeable'];
      return states[parseInt(newValue, 10)] ?? `charging state ${newValue}`;
    }
    case 'StatusActive':
      return newValue === '1' || newValue === 'true' ? 'became active' : 'became inactive';
    case 'StatusTampered':
      return newValue === '1' || newValue === 'true' ? 'tampering detected' : 'tampering cleared';
    case 'StatusFault':
      return newValue === '1' || newValue === 'true' ? 'reported a fault' : 'fault cleared';
    case 'SmokeDetected':
      return newValue === '1' || newValue === 'true' ? 'smoke detected' : 'smoke cleared';
    case 'LeakDetected':
      return newValue === '1' || newValue === 'true' ? 'leak detected' : 'leak cleared';
    case 'CurrentAmbientLightLevel':
      return `${parseFloat(newValue).toFixed(0)} lux`;
    case 'OutletInUse':
      return newValue === '1' || newValue === 'true' ? 'outlet in use' : 'outlet idle';

    // -- Colour, covering, fan, thermostat and power --
    //
    // Hue, Saturation, ColorTemperature and Active are produced by the HomeKit
    // path TODAY and were reading as "Saturation: 1" in the headline. The rest
    // arrive with the Matter normalization (see listener/src/matter-normalize.js),
    // which now reports Matter attributes under these HomeKit names.
    case 'Hue':
      return `hue ${parseFloat(newValue).toFixed(0)}\u00b0`;
    case 'Saturation':
      return `saturation ${parseFloat(newValue).toFixed(0)}%`;
    case 'ColorTemperature': {
      // HomeKit stores mireds; Kelvin is what anyone actually reads a colour
      // temperature in.
      const mireds = parseFloat(newValue);
      if (!Number.isFinite(mireds) || mireds <= 0) return `colour temperature ${newValue}`;
      return `${Math.round(1e6 / mireds / 50) * 50}K`;
    }
    case 'Active':
      return newValue === '1' || newValue === 'true' ? 'turned on' : 'turned off';
    case 'RotationSpeed':
      return `speed ${parseFloat(newValue).toFixed(0)}%`;
    case 'CurrentPosition':
    case 'TargetPosition': {
      const pct = parseFloat(newValue);
      if (!Number.isFinite(pct)) return `position ${newValue}`;
      if (pct === 0) return 'closed';
      if (pct === 100) return 'open';
      return `${pct.toFixed(0)}% open`;
    }
    case 'PositionState': {
      const states = ['closing', 'opening', 'stopped'];
      return states[parseInt(newValue, 10)] ?? `position state ${newValue}`;
    }
    case 'TargetHeatingCoolingState':
    case 'CurrentHeatingCoolingState': {
      const states = ['off', 'heating', 'cooling', 'auto'];
      return states[parseInt(newValue, 10)] ?? `mode ${newValue}`;
    }
    case 'CarbonMonoxideDetected':
      return newValue === '1' || newValue === 'true' ? 'carbon monoxide detected' : 'carbon monoxide cleared';
    case 'CarbonDioxideDetected':
      return newValue === '1' || newValue === 'true' ? 'carbon dioxide detected' : 'carbon dioxide cleared';
    case 'AirPressure':
      return `${parseFloat(newValue).toFixed(1)} kPa`;
    case 'ActivePower':
      return `${parseFloat(newValue).toFixed(1)} W`;
    default:
      // v0.4: this string is now the timeline HEADLINE, not body text, so a raw
      // characteristic name is far more visible than it used to be. Split the
      // PascalCase name into words so an unmapped characteristic still reads as
      // language ("Status Low Battery: 1") rather than an identifier.
      return `${humanizeCharacteristic(characteristic)}: ${newValue}`;
  }
}

/** `StatusLowBattery` -> `Status low battery`. */
export function humanizeCharacteristic(characteristic) {
  if (typeof characteristic !== 'string' || characteristic.length === 0) return 'Changed';
  const words = characteristic
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}
