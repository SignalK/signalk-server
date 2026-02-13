import type { PathMetadataEntry } from './types'

export const propulsionMetadata: Record<string, PathMetadataEntry> = {
  '/vessels/*/propulsion': {
    description:
      'Engine data, each engine identified by a unique name i.e. Port_Engine'
  },
  '/vessels/*/propulsion/RegExp': {
    description:
      'This regex pattern is used for validation of the identifier for the propulsion unit'
  },
  '/vessels/*/propulsion/RegExp/label': {
    description: 'Human readable label for the propulsion unit'
  },
  '/vessels/*/propulsion/RegExp/state': {
    description: 'The current state of the engine'
  },
  '/vessels/*/propulsion/RegExp/revolutions': {
    description: 'Engine revolutions (x60 for RPM)',
    units: 'Hz'
  },
  '/vessels/*/propulsion/RegExp/temperature': {
    description: 'Engine temperature',
    units: 'K'
  },
  '/vessels/*/propulsion/RegExp/oilTemperature': {
    description: 'Oil temperature',
    units: 'K'
  },
  '/vessels/*/propulsion/RegExp/oilPressure': {
    description: 'Oil pressure',
    units: 'Pa'
  },
  '/vessels/*/propulsion/RegExp/alternatorVoltage': {
    description: 'Alternator voltage',
    units: 'V'
  },
  '/vessels/*/propulsion/RegExp/runTime': {
    description: 'Total running time for engine (Engine Hours in seconds)',
    units: 's'
  },
  '/vessels/*/propulsion/RegExp/coolantTemperature': {
    description: 'Coolant temperature',
    units: 'K'
  },
  '/vessels/*/propulsion/RegExp/coolantPressure': {
    description: 'Coolant pressure',
    units: 'Pa'
  },
  '/vessels/*/propulsion/RegExp/boostPressure': {
    description: 'Engine boost (turbo, supercharger) pressure',
    units: 'Pa'
  },
  '/vessels/*/propulsion/RegExp/intakeManifoldTemperature': {
    description: 'Intake manifold temperature',
    units: 'K'
  },
  '/vessels/*/propulsion/RegExp/engineLoad': {
    description: 'Engine load ratio, 0<=ratio<=1, 1 is 100%',
    units: 'ratio'
  },
  '/vessels/*/propulsion/RegExp/engineTorque': {
    description: 'Engine torque ratio, 0<=ratio<=1, 1 is 100%',
    units: 'ratio'
  },
  '/vessels/*/propulsion/RegExp/transmission': {
    description: 'The transmission (gear box) of the named engine'
  },
  '/vessels/*/propulsion/RegExp/transmission/gear': {
    description:
      'Currently selected gear the engine is in i.e. Forward, Reverse, etc.'
  },
  '/vessels/*/propulsion/RegExp/transmission/gearRatio': {
    description: 'Gear ratio, engine rotations per propeller shaft rotation',
    units: 'ratio'
  },
  '/vessels/*/propulsion/RegExp/transmission/oilTemperature': {
    description: 'Oil temperature',
    units: 'K'
  },
  '/vessels/*/propulsion/RegExp/transmission/oilPressure': {
    description: 'Oil pressure',
    units: 'Pa'
  },
  '/vessels/*/propulsion/RegExp/drive': {
    description: "Data about the engine's drive."
  },
  '/vessels/*/propulsion/RegExp/drive/type': {
    description:
      'The type of drive the boat has i.e Outboard, shaft, jet, etc.',
    enum: ['saildrive', 'shaft', 'outboard', 'jet', 'pod', 'other']
  },
  '/vessels/*/propulsion/RegExp/drive/trimState': {
    description: 'Trim/tilt state, 0<=ratio<=1, 1 is 100% up',
    units: 'ratio'
  },
  '/vessels/*/propulsion/RegExp/drive/thrustAngle': {
    description:
      'Current thrust angle for steerable drives, +ve is thrust to Starboard',
    units: 'rad'
  },
  '/vessels/*/propulsion/RegExp/drive/propeller': {
    description: "Data about the drive's propeller (pitch and slip)"
  },
  '/vessels/*/propulsion/RegExp/fuel': {
    description: "Data about the engine's Fuel Supply"
  },
  '/vessels/*/propulsion/RegExp/fuel/type': {
    description: 'Fuel type',
    enum: ['diesel', 'petrol', 'electric', 'coal/wood', 'other']
  },
  '/vessels/*/propulsion/RegExp/fuel/used': {
    description: 'Used fuel since last reset. Resetting is at user discretion',
    units: 'm3'
  },
  '/vessels/*/propulsion/RegExp/fuel/pressure': {
    description: 'Fuel pressure',
    units: 'Pa'
  },
  '/vessels/*/propulsion/RegExp/fuel/rate': {
    description: 'Fuel rate  of consumption',
    units: 'm3/s'
  },
  '/vessels/*/propulsion/RegExp/fuel/economyRate': {
    description: 'Economy fuel rate of consumption',
    units: 'm3/s'
  },
  '/vessels/*/propulsion/RegExp/fuel/averageRate': {
    description: 'Average fuel rate of consumption',
    units: 'm3/s'
  },
  '/vessels/*/propulsion/RegExp/exhaustTemperature': {
    description: 'Exhaust temperature',
    units: 'K'
  }
}
