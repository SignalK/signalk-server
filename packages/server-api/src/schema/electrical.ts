import { Amperes, Kelvin, Volts } from './units'
import { FullValue, Timestamp } from './values'

/** Electrical data, each electrical device indentified by a unique name i.e. Battery_1 */
export interface Electrical {
  /** Data about the vessel's batteries */
  batteries?: Record<string, Battery>

  /** Data about the Inverter that has both DC and AC qualities */
  inverters?: Record<string, Inverter>

  /** Data about AC sourced battery charger */
  chargers?: Record<string, Charger>

  /** Data about an Alternator charging device */
  alternators?: Record<string, Alternator>

  /** Data about Solar charging device(s) */
  solar?: Record<string, Solar>

  /** AC buses */
  ac?: Record<string, ACBusKeyedByInstanceId>
}

/**  Common ID items shared by electrical items */
export interface ElectricalID {
  /** Unique ID of device (houseBattery, alternator, Generator, solar1, inverter, charger, combiner, etc.) */
  name?: string

  /** Installed location of device on vessel */
  location?: string

  /** RFC 3339 (UTC only without local offset) string representing date and time. */
  dateInstalled?: Timestamp

  manufacturer?: {
    /** Manufacturer's name */
    name?: string

    /** Model or part number */
    model?: string

    /** Web referance / URL */
    URL?: string
  }
}

/** DC common qualities */
export interface DCQualities {
  /** Name of BUS device is associated with */
  associatedBus?: string

  /** Voltage measured at or as close as possible to the device */
  voltage?: FullValue<Volts> & {

    /** DC Ripple voltage */
    ripple?: FullValue<Volts>

    meta?: {
      /** Designed 'voltage' of device (12v, 24v, 32v, 36v, 42v, 48v, 144v, etc.) */
      nominal?: Volts

      /** Upper operational voltage limit */
      warnUpper?: Volts

      /** Lower operational voltage limit */
      warnLower?: Volts

      /**Upper fault voltage limit - device may disable/disconnect */
      faultUpper?: Volts

      /** Lower fault voltage limit - device may disable/disconnect */
      faultLower?: Volts
    }
  }

  /** Current flowing out (+ve) or in (-ve) to the device */
  current?: FullValue<Amperes> & {
    meta?: {
      /** Upper operational current limit */
      warnUpper?: Amperes

      /** Lower operational current limit */
      warnLower?: Amperes

      /** Upper fault current limit - device may disable/disconnect */
      faultUpper?: Amperes

      /** Lower fault current limit - device may disable/disconnect */
      faultLower?: Amperes
    }
  }

  /** Temperature measured within or on the device */
  temperature?: FullValue<Kelvin>
}

/** Common charger qualities */
export interface ChargerQualities {
  /** Algorithm being used by the charger */
  chargingAlgorithm?: FullValue<
    | 'trickle'
    | 'two stage'
    | 'three stage'
    | 'four stage'
    | 'constant current'
    | 'constant voltage'
    | 'custom profile'
  >

  /** How is charging source configured?  Standalone, or in sync with another charger? */
  chargerRole?: FullValue<'standalone' | 'master' | 'slave' | 'standby'>

  /** Charging mode i.e. float, overcharge, etc. */
  chargingMode?: FullValue<
    | 'bulk'
    | 'acceptance'
    | 'overcharge'
    | 'float'
    | 'equalize'
    | 'unknown'
    | 'other'
  >

  /** Target regulation voltage */
  setpointVoltage?: FullValue<Volts>

  /** Target current limit */
  setpointCurrent?: FullValue<Amperes>
}

/** Batteries, one or many, within the vessel */
export type Battery = ElectricalID & DCQualities

/** DC to AC inverter, one or many, within the vessel */
export type Inverter = ElectricalID

/** Battery charger */
export type Charger = ElectricalID & DCQualities & ChargerQualities

/** Mechanically driven alternator, includes dynamos */
export type Alternator = ElectricalID & DCQualities & ChargerQualities

/** Photovoltaic charging devices */
export type Solar = ElectricalID & DCQualities & ChargerQualities

/** AC Bus, one or many, within the vessel */
export type ACBusKeyedByInstanceId = ElectricalID
