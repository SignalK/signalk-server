import type { PathMetadataEntry } from './types'

export const sensorsMetadata: Record<string, PathMetadataEntry> = {
  '/vessels/*/sensors': {
    description: 'Sensors, their state, and data.'
  },
  '/vessels/*/sensors/RegExp': {
    description:
      'This regex pattern is used for validation UUID identifier for the sensor'
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
  '/vessels/*/sensors/RegExp/fromBow': {
    description: 'Distance of the sensor along the vessel axis from the bow',
    units: 'm'
  },
  '/vessels/*/sensors/RegExp/fromCenter': {
    description:
      'Distance of the sensor across the vessel from the centreline, positive towards starboard',
    units: 'm'
  },
  '/vessels/*/sensors/RegExp/class': {
    description: 'AIS transponder class in sensors.ais.class, A or B'
  }
}
