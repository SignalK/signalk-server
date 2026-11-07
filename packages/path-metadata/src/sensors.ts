import type { PathMetadataEntry } from './types'

export const sensorsMetadata: Record<string, PathMetadataEntry> = {
  '/vessels/*/sensors': {
    description: 'Sensors, their state, and data.'
  },
  '/vessels/*/sensors/RegExp': {
    description:
      "This regex pattern is used for validating the sensor's UUID identifier."
  },
  '/vessels/*/sensors/RegExp/name': {
    description: 'The common name of the sensor'
  },
  '/vessels/*/sensors/RegExp/sensorType': {
    description:
      'The datamodel definition of the sensor data. FIXME - need to create a definitions lib of sensor datamodel types'
  },
  '/vessels/*/sensors/RegExp/sensorData': {
    description:
      'The data of the sensor data. FIXME - need to ref the definitions of sensor types'
  },
  // Antenna offsets are installation geometry: they stay true until someone
  // moves the antenna, however rarely a source restates them (once at startup
  // from base data, every ~6 minutes from an AIS static report).
  '/vessels/*/sensors/RegExp/fromBow': {
    description: 'Distance of the sensor along the vessel axis from the bow',
    units: 'm',
    updateContract: 'event'
  },
  '/vessels/*/sensors/RegExp/fromCenter': {
    description:
      'Distance of the sensor across the vessel from the centreline, positive towards starboard',
    units: 'm',
    updateContract: 'event'
  },
  '/vessels/*/sensors/RegExp/class': {
    description: 'Sensor class — for an AIS transponder, A or B.'
  }
}
