export * from './aircraft.js'
export * from './aton.js'
export * from './communication.js'
export * from './course.js'
export * from './design.js'
export * from './electrical.js'
export * from './environment.js'
export * from './index.js'
export * from './metadata.js'
export * from './navigation.js'
export * from './notifications.js'
export * from './performance.js'
export * from './propulsion.js'
export * from './resources.js'
export * from './sails.js'
export * from './sar.js'
export * from './sensors.js'
export * from './sources.js'
export * from './steering.js'
export * from './tanks.js'
export * from './values.js'
export * from './vessel.js'

import { AidToNavigation } from './aton.js'
import { Aircraft } from './aircraft.js'
import { Resources } from './resources.js'
import { Vessel } from './vessel.js'
import { Sources } from './sources.js'
import { SearchAndRescueBeacons } from './sar.js'

/** Root schema of Signal K. Contains the list of vessels plus a reference to the local boat (also contained in the vessels list). */
export type SignalK = {
  /** This holds the context (prefix + UUID, MMSI or URL in dot notation) of the server's self object. */
  self: string

  /** A wrapper object for vessel objects, each describing vessels in range, including this vessel. */
  vessels?: Record<string, Vessel>

  /** A wrapper object for aircraft, primarily intended for SAR aircraft in relation to marine search and rescue. For clarity about seaplanes etc, if it CAN fly, its an aircraft. */
  aircraft?: Record<string, Aircraft>

  /** A wrapper object for Aids to Navigation (aton's) */
  aton?: Record<string, AidToNavigation>

  /** A wrapper object for Search And Rescue (SAR) MMSI's usied in transponders. MOB, EPIRBS etc */
  sar?: Record<string, SearchAndRescueBeacons>

  /** Metadata about the data sources; physical interface, address, protocol, etc. */
  sources?: Sources

  /** Resources to aid in navigation and operation of the vessel including waypoints, routes, notes, etc. */
  resources?: Resources

  /** Version of the schema and APIs that this data is using in Canonical format i.e. V1.5.0. */
  version: string
}
