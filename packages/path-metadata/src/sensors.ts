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
    description: 'Data should be of type number.'
  },
  '/vessels/*/sensors/RegExp/fromCenter': {
    description: 'Data should be of type number.'
  },
  '/vessels/*/sensors/RegExp/class': {
    description: 'AIS transponder class in sensors.ais.class, A or B'
  }
}
