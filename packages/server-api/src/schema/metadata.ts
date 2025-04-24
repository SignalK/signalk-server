import { NotificationMethod, Zone } from './notifications'

/**
 * Unix style permissions, often written in `owner:group:other` form, `-rw-r--r--`
 */

export type _ModeSchema = number
/**
 * The owner of this resource.
 */
export type _OwnerSchema = string
/**
 * The group owning this resource.
 */
export type _GroupSchema = string
/**
 * gaugeType is deprecated. The type of gauge necessary to display this value.
 */
export type GaugeTypeSchema = string
/**
 * Gives details of the display scale against which the value should be displayed
 */
export type ScaleToDisplay =
  | {
    lower: unknown
    upper: unknown
  }
  | {
    lower: unknown
    upper: unknown
    type: 'linear' | 'squareroot' | 'logarithmic'
  }
  | {
    lower: unknown
    upper: unknown
    type: 'power'
    power: unknown
  }
/**
 * The timeout in (fractional) seconds after which this data is invalid.
 */
export type Timeout = number
/**
 * Filesystem specific data, e.g. security, possibly more later.
 */
export interface _AttrSchema {
  _mode?: _ModeSchema
  _owner?: _OwnerSchema
  _group?: _GroupSchema
}

/**
 * Provides meta data to enable alarm and display configuration.
 */
export interface MetaValue {
  /** A display name for this value. This is shown on the gauge and should not include units. */
  displayName?: string
  /** A long name for this value. */
  longName?: string
  /** A short name for this value. */
  shortName?: string
  /** Description of the SK path. */
  description?: string
  /** List of permissible values */
  enum?: unknown[]
  properties?: PropertiesForObjectValuedProperties
  gaugeType?: GaugeTypeSchema
  displayScale?: ScaleToDisplay
  /** The (derived) SI unit of this value. */
  units?: string
  timeout?: Timeout
  /** The method to use to raise the alert. An alert is an event that should be known */
  alertMethod?: NotificationMethod[]
  /** The method to use to raise the warning. A warning is an unexpected event that may require attention */
  warnMethod?: NotificationMethod[]
  /** The method to use to raise the alarm. An alarm requires immediate attention, eg no oil pressure */
  alarmMethod?: NotificationMethod[]
  /** The method to use to raise an emergency. An emergency is an immediate danger to life or vessel */
  emergencyMethod?: NotificationMethod[]
  /** The zones defining the range of values for this signalk value. */
  zones?: Zone[]

  /** Note: this is not included in the specification, but is used by the NodeJS server */
  supportsPut?: boolean
}
export interface PropertiesForObjectValuedProperties {
  [k: string]: {
    type?: string
    title?: string
    description?: string
    units?: string
    example?: string | number | boolean | object
  }
}
/**
 * Source of data in delta format, a record of where the data was received from. An object containing at least the properties defined in 'properties', but can contain anything beyond that.
 */

export interface Source {
  /**
   * A label to identify the source bus, eg serial-COM1, eth-local,etc . Can be anything but should follow a predicatable format
   */
  label: string
  /**
   * A human name to identify the type. NMEA0183, NMEA2000, signalk
   */
  type?: string
  /**
   * NMEA2000 src value or any similar value for encapsulating the original source of the data
   */
  src?: string
  /**
   * NMEA2000 can name of the source device
   */
  canName?: string
  /**
   * NMEA2000 pgn of the source message
   */
  pgn?: number
  /**
   * NMEA2000 instance value of the source message
   */
  instance?: string
  /**
   * Sentence type of the source NMEA0183 sentence, $GP[RMC],092750.000,A,5321.6802,N,00630.3372,W,0.02,31.66,280511,,,A*43
   */
  sentence?: string
  /**
   * Talker id of the source NMEA0183 sentence, $[GP]RMC,092750.000,A,5321.6802,N,00630.3372,W,0.02,31.66,280511,,,A*43
   */
  talker?: string
  /**
   * AIS Message Type
   */
  aisType?: number
}
