import { Source } from './metadata'
import { Kelvin, MetersPerSecond, Radians } from './units'
import { FullValue, Timestamp } from './values'

/**
 * Environmental data measured locally including Depth, Wind, Temp, etc.
 */
export interface Environment {
  /**
   * Environmental conditions outside of the vessel's hull
   */
  outside?: {
    temperature?: FullValue<Kelvin>
    dewPointTemperature?: FullValue<number>
    apparentWindChillTemperature?: FullValue<number>
    theoreticalWindChillTemperature?: FullValue<number>
    heatIndexTemperature?: FullValue<number>
    pressure?: FullValue<number>
    humidity?: FullValue<number>
    relativeHumidity?: FullValue<number>
    airDensity?: FullValue<number>
    illuminance?: FullValue<number>
  }
  /** Environmental conditions inside the vessel's hull */
  inside?: {
    [k: string]: ZoneObject
  } & ZoneObject
  /** Environmental conditions of the water that the vessel is sailing in */
  water?: {
    temperature?: FullValue<number>
    salinity?: FullValue<number>
  }
  depth?: {
    belowKeel?: FullValue<number>
    belowTransducer?: FullValue<number>
    belowSurface?: FullValue<number>
    transducerToKeel?: FullValue<number>
    surfaceToTransducer?: FullValue<number>
  }
  current?: FullValue<{
    /** The speed component of the water current vector */
    drift?: number
    /** The direction component of the water current vector referenced to true (geographic) north */
    setTrue?: number
    /** The direction component of the water current vector referenced to magnetic north */
    setMagnetic?: number
  }>
  tide?: {
    /** Next high tide height  relative to lowest astronomical tide (LAT/Chart Datum) */
    heightHigh?: FullValue<number>
    /** The current tide height  relative to lowest astronomical tide (LAT/Chart Datum) */
    heightNow?: FullValue<number>
    /** The next low tide height relative to lowest astronomical tide (LAT/Chart Datum) */
    heightLow?: FullValue<number>
    /** Time of the next low tide in UTC */
    timeLow?: Timestamp
    /** Time of next high tide in UTC */
    timeHigh?: Timestamp
  }
  heave?: FullValue<number>

  wind?: {
    /** Apparent wind angle, negative to port */
    angleApparent?: FullValue<Radians>
    /** True wind angle based on speed over ground, negative to port */
    angleTrueGround?: FullValue<Radians>
    /** True wind angle based on speed through water, negative to port */
    angleTrueWater?: FullValue<Radians>
    directionChangeAlarm?: FullValue<Radians>
    directionTrue?: FullValue<Radians>
    directionMagnetic?: FullValue<Radians>
    speedTrue?: FullValue<MetersPerSecond>
    speedOverGround?: FullValue<MetersPerSecond>
    speedApparent?: FullValue<MetersPerSecond>
  }

  /**
   * A time reference for the vessel. All clocks on the vessel dispaying local time should use the timezone offset here. If a timezoneRegion is supplied the timezone must also be supplied. If timezoneRegion is supplied that should be displayed by UIs in preference to simply timezone. ie 12:05 (Europe/London) should be displayed in preference to 12:05 (UTC+01:00)
   */
  time?: {
    /**
     * Milliseconds since the UNIX epoch (1970-01-01 00:00:00)
     */
    millis?: number
    /**
     * Onboard timezone offset from UTC in hours and minutes (-)hhmm. +ve means east of Greenwich. For use by UIs
     */
    timezoneOffset?: number
    /**
     * Onboard timezone offset as listed in the IANA timezone database (tz database)
     */
    timezoneRegion?: string
    /**
     * RFC 3339 (UTC only without local offset) string representing date and time.
     */
    timestamp?: Timestamp
    source?: Source
  }
  /**
   * Mode of the vessel based on the current conditions. Can be combined with navigation.state to control vessel signals eg switch to night mode for instrumentation and lights, or make sound signals for fog.
   */
  mode?: FullValue<'day' | 'night' | 'restricted visibility'>
}

/**
 * This regex pattern is used for validation of the identifier for the environmental zone, eg. engineRoom, mainCabin, refrigerator
 */
export interface ZoneObject {
  temperature?: FullValue<number>
  heatIndexTemperature?: FullValue<number>
  pressure?: FullValue<number>
  relativeHumidity?: FullValue<number>
  dewPoint?: FullValue<number>
  dewPointTemperature?: FullValue<number>
  airDensity?: FullValue<number>
  illuminance?: FullValue<number>
}
/**
 * Direction and strength of current affecting the vessel
 */
