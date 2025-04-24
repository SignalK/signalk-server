import { Notifications } from './notifications'
import { Navigation } from './navigation'
import { Communication } from './communication'

/**
 * This regex pattern is used for validation of an MMSI or Signal K UUID identifier for the aid to navigation. Examples: urn:mrn:imo:mmsi:972099999 urn:mrn:signalk:uuid:c0d79334-4e25-4245-8892-54e8ccc8021d
 */
export type SearchAndRescueBeacons = {
  [k: string]: unknown
} & {
  /**
   * URL based identity of the aid to navigation, if available.
   */
  url?: string
  /**
   * MMSI number of the aid to navigation, if available.
   */
  mmsi?: string
  /**
   * A unique Signal K flavoured maritime resource identifier, assigned by the server.
   */
  uuid?: string
  communication?: Communication
  navigation?: Navigation
  notifications?: Notifications
}
