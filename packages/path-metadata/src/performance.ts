import type { PathMetadataEntry } from './types'

export const performanceMetadata: Record<string, PathMetadataEntry> = {
  '/vessels/*/performance': {
    description:
      'Performance Sailing data including VMG, Polar Speed, tack angle, etc.'
  },
  '/vessels/*/performance/polars': {
    description: 'Polar objects'
  },
  '/vessels/*/performance/polars/RegExp': {
    description: '[missing]'
  },
  '/vessels/*/performance/polars/RegExp/id': {
    description: '[missing]'
  },
  '/vessels/*/performance/polars/RegExp/name': {
    description: '[missing]'
  },
  '/vessels/*/performance/polars/RegExp/description': {
    description: '[missing]'
  },
  '/vessels/*/performance/polars/RegExp/windData': {
    description: '[missing]'
  },
  '/vessels/*/performance/activePolar': {
    description: 'The UUID of the active polar table'
  },
  '/vessels/*/performance/activePolarData': {
    description: "The 'polar' object belonging to the selected 'activePolar'"
  },
  '/vessels/*/performance/activePolarData/id': {
    description: '[missing]'
  },
  '/vessels/*/performance/activePolarData/name': {
    description: '[missing]'
  },
  '/vessels/*/performance/activePolarData/description': {
    description: '[missing]'
  },
  '/vessels/*/performance/activePolarData/windData': {
    description: '[missing]'
  },
  '/vessels/*/performance/polarSpeed': {
    description: 'Data should be of type number.',
    units: 'm/s'
  },
  '/vessels/*/performance/polarSpeedRatio': {
    description: 'Data should be of type number.',
    units: 'ratio'
  },
  '/vessels/*/performance/velocityMadeGood': {
    description: 'Data should be of type number.',
    units: 'm/s'
  },
  '/vessels/*/performance/velocityMadeGoodToWaypoint': {
    description: 'Data should be of type number.',
    units: 'm/s'
  },
  '/vessels/*/performance/beatAngle': {
    description: 'Data should be of type number.',
    units: 'rad'
  },
  '/vessels/*/performance/beatAngleVelocityMadeGood': {
    description: 'Data should be of type number.',
    units: 'm/s'
  },
  '/vessels/*/performance/beatAngleTargetSpeed': {
    description: 'Data should be of type number.',
    units: 'm/s'
  },
  '/vessels/*/performance/gybeAngle': {
    description: 'Data should be of type number.',
    units: 'rad'
  },
  '/vessels/*/performance/gybeAngleVelocityMadeGood': {
    description: 'Data should be of type number.',
    units: 'm/s'
  },
  '/vessels/*/performance/gybeAngleTargetSpeed': {
    description: 'Data should be of type number.',
    units: 'm/s'
  },
  '/vessels/*/performance/targetAngle': {
    description: 'Data should be of type number.',
    units: 'rad'
  },
  '/vessels/*/performance/targetSpeed': {
    description: 'Data should be of type number.',
    units: 'm/s'
  },
  '/vessels/*/performance/leeway': {
    description: 'Data should be of type number.',
    units: 'rad'
  },
  '/vessels/*/performance/tackMagnetic': {
    description: 'Data should be of type number.',
    units: 'rad'
  },
  '/vessels/*/performance/tackTrue': {
    description: 'Data should be of type number.',
    units: 'rad'
  }
}
