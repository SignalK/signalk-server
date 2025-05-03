import { Notifications } from './notifications'
import { Navigation } from './navigation'
import { Communication } from './communication'
import { Environment } from './environment'
import { Design } from './design'
import { Sensors } from './sensors'

/**
 * This regex pattern is used for validation of an MMSI or Signal K UUID identifier for the aircraft. Examples: urn:mrn:imo:mmsi:111099999 urn:mrn:signalk:uuid:c0d79334-4e25-4245-8892-54e8ccc8021d
 */
export type Aircraft = {
  [k: string]: unknown
} & {
  /**
   * URL based identity of the aircraft, if available.
   */
  url?: string
  /**
   * MMSI number of the aircraft, if available.
   */
  mmsi?: string
  /**
   * A unique Signal K flavoured maritime resource identifier, assigned by the server.
   */
  uuid?: string
  /**
   * The country of aircraft registration, or flag state of the aircraft
   */
  flag?: string
  /**
   * The home base of the aircraft
   */
  base?: string
  /**
   * The various registrations of the aircraft.
   */
  registrations?: {
    /**
     * The IMO number of the aircraft.
     */
    imo?: string
    /**
     * The national registration number of the aircraft.
     */
    national?: {
      /**
       * This regex pattern is used for validating the identifier for the registration
       */
      [k: string]: {
        /**
         * The ISO 3166-2 country code.
         */
        country?: string
        /**
         * The registration code
         */
        registration?: string
        /**
         * The registration description
         */
        description?: string
      }
    }
    /**
     * Other registration or permits for the aircraft.
     */
    other?: {
      /**
       * This regex pattern is used for validating the identifier for the registration
       */
      [k: string]: {
        /**
         * The registration code
         */
        registration?: string
        /**
         * The registration description
         */
        description?: string
      }
    }
  }
  communication?: Communication
  environment?: Environment
  navigation?: Navigation
  notifications?: Notifications
  design?: Design
  sensors?: Sensors
}
