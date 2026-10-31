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
    description:
      'Boat speed predicted by the polar for the current true wind speed and angle.',
    units: 'm/s'
  },
  '/vessels/*/performance/polarSpeedRatio': {
    description:
      'Ratio of the current speed through the water to the polar speed; also called polar performance or polar percentage.',
    units: 'ratio'
  },
  '/vessels/*/performance/velocityMadeGood': {
    description:
      "VMG (velocity made good) relative to the wind: the vessel's speed toward the true wind direction, positive upwind and negative downwind.",
    units: 'm/s'
  },
  '/vessels/*/performance/velocityMadeGoodToWaypoint': {
    description:
      "Velocity made good toward the next waypoint: the part of the vessel's speed in the direction of the waypoint.",
    units: 'm/s'
  },
  '/vessels/*/performance/beatAngle': {
    description:
      'Optimal true wind angle for sailing upwind (beating) at the current true wind speed, from the polar.',
    units: 'rad'
  },
  '/vessels/*/performance/beatAngleVelocityMadeGood': {
    description: 'Upwind VMG expected when sailing at the beat angle.',
    units: 'm/s'
  },
  '/vessels/*/performance/beatAngleTargetSpeed': {
    description: 'Target boat speed when sailing at the beat angle.',
    units: 'm/s'
  },
  '/vessels/*/performance/gybeAngle': {
    description:
      'Optimal true wind angle for sailing downwind (running) at the current true wind speed, from the polar.',
    units: 'rad'
  },
  '/vessels/*/performance/gybeAngleVelocityMadeGood': {
    description: 'Downwind VMG expected when sailing at the gybe angle.',
    units: 'm/s'
  },
  '/vessels/*/performance/gybeAngleTargetSpeed': {
    description: 'Target boat speed when sailing at the gybe angle.',
    units: 'm/s'
  },
  '/vessels/*/performance/targetAngle': {
    description:
      'Target true wind angle for the best VMG on the current point of sail: the beat angle upwind or the gybe angle downwind.',
    units: 'rad'
  },
  '/vessels/*/performance/targetSpeed': {
    description:
      'Target boat speed for the best VMG on the current point of sail.',
    units: 'm/s'
  },
  '/vessels/*/performance/leeway': {
    description:
      "Leeway: the angle between the vessel's heading and its course through the water, caused by the wind.",
    units: 'rad'
  },
  '/vessels/*/performance/tackMagnetic': {
    description:
      'Magnetic heading the vessel would steer after tacking or gybing.',
    units: 'rad'
  },
  '/vessels/*/performance/tackTrue': {
    description: 'True heading the vessel would steer after tacking or gybing.',
    units: 'rad'
  }
}
