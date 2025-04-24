import { FullValue } from './values'
import { Notifications } from './notifications'
import { Navigation } from './navigation'
import { Communication } from './communication'
import { Environment } from './environment'
import { Design } from './design'
import { Sensors } from './sensors'

export type AidToNavigationType =
  | { id: 1, name: 'Reference Point' }
  | { id: 2, value: 'RACON' }
  | { id: 3, name: 'Fixed Structure Off Shore' }
  | { id: 4, name: 'Emergency Wreck Marking Buoy' }
  | { id: 5, name: 'Light, Without Sectors' }
  | { id: 6, name: 'Light, With Sectors' }
  | { id: 7, name: 'Leading Light Front' }
  | { id: 8, name: 'Leading Light Rear' }
  | { id: 9, name: 'Beacon, Cardinal N' }
  | { id: 10, name: 'Beacon, Cardinal E' }
  | { id: 11, name: 'Beacon, Cardinal S' }
  | { id: 12, name: 'Beacon, Cardinal W' }
  | { id: 13, name: 'Beacon, Port Hand' }
  | { id: 14, name: 'Beacon, Starboard Hand' }
  | { id: 15, name: 'Beacon, Preferred Channel Port Hand' }
  | { id: 16, name: 'Beacon, Preferred Channel Starboard Hand' }
  | { id: 17, name: 'Beacon, Isolated Danger' }
  | { id: 18, name: 'Beacon, Safe Water' }
  | { id: 19, name: 'Beacon, Special Mark' }
  | { id: 20, name: 'Cardinal Mark N' }
  | { id: 21, name: 'Cardinal Mark E' }
  | { id: 22, name: 'Cardinal Mark S' }
  | { id: 23, name: 'Cardinal Mark W' }
  | { id: 24, name: 'Port Hand Mark' }
  | { id: 25, name: 'Starboard Hand Mark' }
  | { id: 26, name: 'Preferred Channel Port Hand' }
  | { id: 27, name: 'Preferred Channel Starboard Hand' }
  | { id: 28, name: 'Isolated danger' }
  | { id: 29, name: 'Safe Water' }
  | { id: 30, name: 'Special Mark' }
  | { id: 31, name: 'Light Vessel/LANBY/Rigs' }

/**
 * This regex pattern is used for validation of an MMSI or Signal K UUID identifier for the aid to navigation. Examples: urn:mrn:imo:mmsi:991099999 urn:mrn:signalk:uuid:c0d79334-4e25-4245-8892-54e8ccc8021d
 */
export type AidToNavigation = {
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
  /**
   * The aton type
   */
  atonType?: FullValue<AidToNavigationType>
  /**
   * The aton name
   */
  name?: string
  communication?: Communication
  environment?: Environment
  navigation?: Navigation
  notifications?: Notifications
  design?: Design
  sensors?: Sensors
}
