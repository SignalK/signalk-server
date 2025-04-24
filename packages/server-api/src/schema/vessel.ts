import { Performance } from './performance.js'
import { Sails } from './sails.js'
import { Tanks } from './tanks.js'
import { Steering } from './steering.js'
import { Notifications } from './notifications.js'
import { Electrical } from './electrical.js'
import { Navigation } from './navigation.js'
import { Communication } from './communication.js'
import { Environment } from './environment.js'
import { Design } from './design.js'
import { Sensors } from './sensors.js'
import { Propulsion } from './propulsion.js'

/** This regex pattern is used for validation of an MMSI or Signal K UUID identifier for the vessel. Examples: urn:mrn:imo:mmsi:230099999 urn:mrn:signalk:uuid:c0d79334-4e25-4245-8892-54e8ccc8021d */
export type Vessel = {
  /** URL based identity of the vessel, if available. */
  url?: string

  /** MMSI number of the vessel, if available. */
  mmsi?: string

  /** MMSI number of the mothership of this vessel, if available. */
  mothershipMmsi?: string

  /** A unique Signal K flavoured maritime resource identifier, assigned by the server. */
  uuid?: string

  /** The common name of the vessel */
  name?: string

  /** The country of ship registration, or flag state of the vessel */
  flag?: string

  /** The home port of the vessel */
  port?: string

  /** The various registrations of the vessel. */
  registrations?: {

    /** The IMO number of the vessel. */
    imo?: string

    /** The national registration number of the vessel. */
    national?: {
      /** This regex pattern is used for validating the identifier for the registration */
      [k: string]: {

        /** The ISO 3166-2 country code. */
        country?: string

        /** The registration code */
        registration?: string

        /** The registration description */
        description?: string
      }
    }

    /** A local or state registration number of the vessel. */
    local?: {
      /** This regex pattern is used for validating the identifier for the registration */
      [k: string]: {
        /** The registration code */
        registration?: string

        /** The registration description */
        description?: string
      }
    }

    /** Other registration or permits for the vessel. */
    other?: {
      /** This regex pattern is used for validating the identifier for the registration */
      [k: string]: {
        /** The registration code */
        registration?: string

        /** The registration description */
        description?: string
      }
    }
  }
  communication?: Communication
  environment?: Environment
  navigation?: Navigation
  propulsion?: Propulsion
  electrical?: Electrical
  notifications?: Notifications
  steering?: Steering
  tanks?: Tanks
  design?: Design
  sails?: Sails
  sensors?: Sensors
  performance?: Performance
}
