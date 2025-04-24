import { Position } from './resources'
import { Meters, MetersPerSecond, Radians, Seconds } from './units'
import { Timestamp, FullValue } from './values'

/** Course information computed with Rhumbline */
export interface Course {
  /** The distance from the vessel's present position to the closest point on a line (track) between previousPoint and nextPoint. A negative number indicates that the vessel is currently to the left of this line (and thus must steer right to compensate), a positive number means the vessel is to the right of the line (steer left to compensate). */
  crossTrackError?: FullValue<Meters>

  /** The bearing of a line between previousPoint and nextPoint, relative to true north. */
  bearingTrackTrue?: FullValue<Radians>

  /** The bearing of a line between previousPoint and nextPoint, relative to magnetic north. */
  bearingTrackMagnetic?: FullValue<Radians>

  /** Data required if sailing to an active route, defined in resources. */
  activeRoute?: {
    /** A reference (URL) to the presently active route, in resources. */
    href?: string

    /** The estimated time of arrival at the end of the current route */
    estimatedTimeOfArrival?: FullValue<Timestamp>

    /** The time this route was activated */
    startTime?: FullValue<Timestamp>
  }

  /** The point on earth the vessel's presently navigating towards */
  nextPoint?: FullValue<{
    /** The type of the next point (e.g. Waypoint, POI, Race Mark, etc) */
    type?: string

    /** A reference (URL) to an object (under resources) this point is related to */
    href?: string
  }> & {
    /** The distance in meters between the vessel's present position and the nextPoint */
    distance?: FullValue<Meters>

    /** The bearing of a line between the vessel's current position and nextPoint, relative to true north */
    bearingTrue?: FullValue<Radians>

    /** The bearing of a line between the vessel's current position and nextPoint, relative to magnetic north */
    bearingMagnetic?: FullValue<Radians>

    /** The velocity component of the vessel towards the nextPoint */
    velocityMadeGood?: FullValue<MetersPerSecond>

    /** Time in seconds to reach nextPoint's perpendicular) with current speed & direction */
    timeToGo?: FullValue<Seconds>

    /** The position of nextPoint in two dimensions */
    position?: FullValue<Position>

    /** The estimated time of arrival at nextPoint position */
    estimatedTimeOfArrival?: FullValue<Timestamp>
  }

  /** The point on earth the vessel's presently navigating from */
  previousPoint?: FullValue<{
    /** The type of the previous point (e.g. Waypoint, POI, Race Mark, etc) */
    type?: string

    /** A reference (URL) to an object (under resources) this point is related to */
    href?: string
  }> & {
    /** The distance in meters between previousPoint and the vessel's present position */
    distance?: FullValue<Meters>

    /** The position of lastPoint in two dimensions */
    position?: FullValue<Position>
  }
}

/** The intended destination of this trip */
export interface Destination {
  /** Common name of the Destination, eg 'Fiji', also used in ais messages */
  commonName?: FullValue<string>

  /** Expected time of arrival at destination waypoint */
  eta?: FullValue<Timestamp>

  /** UUID of destination waypoint */
  waypoint?: FullValue<string>
}
