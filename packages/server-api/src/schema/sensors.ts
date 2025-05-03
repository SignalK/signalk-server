import { FullValue } from './values'

/**
 * Sensors, their state, and data.
 */
export interface Sensors {
  [k: string]: Sensor
}
/**
 * This regex pattern is used for validation UUID identifier for the sensor
 */
export interface Sensor {
  /**
   * The common name of the sensor
   */
  name?: string
  /**
   * The datamodel definition of the sensor data. FIXME - need to create a definitions lib of sensor datamodel types
   */
  sensorType?: string
  /**
   * The data of the sensor data. FIXME - need to ref the definitions of sensor types
   */
  sensorData?: string
  fromBow?: FullValue<number>
  fromCenter?: FullValue<number>
  class?: FullValue<string>
}
