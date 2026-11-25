import type { PathMetadataEntry } from './types'

// A watermaker's state, pressures and flows, as NMEA 2000 watermakers report
// them in PGN 130567. The Signal K specification has no watermaker group.
export const watermakerMetadata: Record<string, PathMetadataEntry> = {
  '/vessels/*/watermaker': {
    description: 'Watermakers aboard, by instance'
  },
  '/vessels/*/watermaker/RegExp': {
    description: 'One watermaker'
  },
  '/vessels/*/watermaker/RegExp/state': {
    description: 'Operating state of the watermaker',
    enum: [
      'Stopped',
      'Starting',
      'Running',
      'Stopping',
      'Flushing',
      'Rinsing',
      'Initiating',
      'Manual'
    ]
  },
  '/vessels/*/watermaker/RegExp/production': {
    description: 'Whether the watermaker is making water'
  },
  '/vessels/*/watermaker/RegExp/rinsing': {
    description: 'Whether the watermaker is rinsing'
  },
  '/vessels/*/watermaker/RegExp/flushMode': {
    description: 'Whether the watermaker is in flush mode'
  },
  '/vessels/*/watermaker/RegExp/lowPressurePump': {
    description: 'Whether the low-pressure feed pump is running'
  },
  '/vessels/*/watermaker/RegExp/highPressurePump': {
    description: 'Whether the high-pressure pump is running'
  },
  '/vessels/*/watermaker/RegExp/emergencyStop': {
    description: 'Whether the emergency stop is engaged'
  },
  '/vessels/*/watermaker/RegExp/salinity': {
    description: 'Salinity of the product water',
    units: 'ratio'
  },
  '/vessels/*/watermaker/RegExp/productWaterTemperature': {
    description: 'Temperature of the product water',
    units: 'K'
  },
  '/vessels/*/watermaker/RegExp/preFilterPressure': {
    description: 'Feed water pressure before the filter',
    units: 'Pa'
  },
  '/vessels/*/watermaker/RegExp/postFilterPressure': {
    description: 'Feed water pressure after the filter',
    units: 'Pa'
  },
  '/vessels/*/watermaker/RegExp/feedPressure': {
    description: 'Pressure of the feed water',
    units: 'Pa'
  },
  '/vessels/*/watermaker/RegExp/systemHighPressure': {
    description: 'Pressure the high-pressure pump puts on the membranes',
    units: 'Pa'
  },
  '/vessels/*/watermaker/RegExp/productWaterFlow': {
    description: 'Flow of product water',
    units: 'm3/s'
  },
  '/vessels/*/watermaker/RegExp/brineWaterFlow': {
    description: 'Flow of brine discharged',
    units: 'm3/s'
  },
  '/vessels/*/watermaker/RegExp/runTime': {
    description: 'Running time the watermaker reports',
    units: 's'
  }
}
