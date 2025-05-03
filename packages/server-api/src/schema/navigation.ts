import { Source } from './metadata'
import { Timestamp, FullValue } from './values'
import { Course, Destination } from './course'
import { Position } from './resources'
import { Meters, MetersPerSecond, Radians, RadiansPerSecond, Seconds } from './units'

/**  Navigation data including Position, Course to next WP information, etc. */
export interface Navigation {
  /** Current state of the vessels navigation lights */
  lights?: FullValue<
    | 'off'
    | 'fault'
    | 'anchored'
    | 'sailing'
    | 'motoring'
    | 'towing < 200m'
    | 'towing > 200m'
    | 'pushing'
    | 'fishing'
    | 'fishing-hampered'
    | 'trawling'
    | 'trawling-shooting'
    | 'trawling-hauling'
    | 'pilotage'
    | 'not-under-way'
    | 'aground'
    | 'restricted manouverability'
    | 'restricted manouverability towing < 200m'
    | 'restricted manouverability towing > 200m'
    | 'restricted manouverability underwater operations'
    | 'constrained by draft'
    | 'mine clearance'
  >

  /** Course over ground (magnetic) */
  courseOverGroundMagnetic?: FullValue<Radians>

  /** Course over ground (true) */
  courseOverGroundTrue?: FullValue<Radians>

  /** Course information computed with Rhumbline */
  courseRhumbline?: Course

  /** Course information computed with Great Circle */
  courseGreatCircle?: Course

  /** Calculated values for other vessels, e.g. from AIS */
  closestApproach?: FullValue<{
    /** Closest Point of Approach (CPA), distance between own vessel and other vessel, based on current speeds, headings and positions */
    distance?: Meters

    /** Time to Closest Point of Approach (TCPA), between own vessel and other vessel, based on current speeds, headings and positions */
    timeTo?: Seconds
  }>

  /** Specific navigational data related to yacht racing. */
  racing?: {
    /** Position of starboard start mark */
    startLineStb?: FullValue<Position>

    /** Position of port start mark */
    startLinePort?: FullValue<Position>

    /** The current distance to the start line */
    distanceStartline?: FullValue<Meters>

    /** Time left before start */
    timeToStart?: FullValue<Seconds>

    /** Time to arrive at the start line on port, turning downwind */
    timePortDown?: FullValue<Seconds>

    /** Time to arrive at the start line on port, turning upwind */
    timePortUp?: FullValue<Seconds>

    /** Time to arrive at the start line on starboard, turning downwind */
    timeStbdDown?: FullValue<Seconds>

    /** Time to arrive at the start line on starboard, turning upwind */
    timeStbdUp?: FullValue<Seconds>

    /** The layline crossing the current course */
    layline?: {
      /** The current distance to the layline */
      distance?: FullValue<Meters>

      /** The time to the layline at current speed and heading */
      time?: FullValue<Seconds>
    }

    /** The layline parallell to current course */
    oppositeLayline?: {
      /** The current distance to the layline */
      distance?: FullValue<Meters>

      /** The time to the layline at current speed and heading */
      time?: FullValue<Seconds>
    }
  }

  /** The magnetic variation (declination) at the current position that must be added to the magnetic heading to derive the true heading. Easterly variations are positive and Westerly variations are negative (in Radians). */
  magneticVariation?: FullValue<Radians>

  /** Seconds since the 1st Jan 1970 that the variation calculation was made */
  magneticVariationAgeOfService?: FullValue<Seconds>

  /** The intended destination of this trip */
  destination?: Destination

  /** Global satellite navigation meta information */
  gnss?: Gnss

  /** Current magnetic heading of the vessel, equals 'headingCompass adjusted for magneticDeviation' */
  headingMagnetic?: FullValue<Radians>

  /** Magnetic deviation of the compass at the current headingCompass */
  magneticDeviation?: FullValue<Radians>

  /** Current magnetic heading received from the compass. This is not adjusted for magneticDeviation of the compass */
  headingCompass?: FullValue<Radians>

  /** The current true north heading of the vessel, equals 'headingMagnetic adjusted for magneticVariation' */
  headingTrue?: FullValue<Radians>

  /** The position of the vessel in 2 or 3 dimensions (WGS84 datum) */
  position?: FullValue<Position>

  /** Vessel attitude: roll, pitch and yaw */
  attitude?: FullValue<Attitude>

  /** Special maneuver such as regional passing arrangement. (from ais) */
  maneuver?: FullValue<
    | "Not available"
    | "No special maneuver"
    | "Special maneuver"
  >

  /** Rate of turn (+ve is change to starboard). If the value is AIS RIGHT or LEFT, set to +-0.0206 rads and add warning in notifications */
  rateOfTurn?: FullValue<RadiansPerSecond>

  /** Vessel speed over ground. If converting from AIS 'HIGH' value, set to 102.2 (Ais max value) and add warning in notifications */
  speedOverGround?: FullValue<MetersPerSecond>

  /** Vessel speed through the water */
  speedThroughWater?: FullValue<MetersPerSecond>

  /** Transverse speed through the water (Leeway) */
  speedThroughWaterTransverse?: FullValue<MetersPerSecond>

  /** Longitudinal speed through the water */
  speedThroughWaterLongitudinal?: FullValue<MetersPerSecond>

  /** Leeway Angle derived from the longitudinal and transverse speeds through the water */
  leewayAngle?: FullValue<Radians>

  /** Total distance traveled */
  log?: FullValue<Meters>

  /** Trip data */
  trip?: {
    /** Total distance traveled on this trip / since trip reset */
    log?: FullValue<Meters>

    /** Trip log reset time */
    lastReset?: FullValue<Timestamp>
  }

  /** Current navigational state of the vessel */
  state?: FullValue<
    | 'not under command'
    | 'anchored'
    | 'moored'
    | 'sailing'
    | 'motoring'
    | 'towing < 200m'
    | 'towing > 200m'
    | 'pushing'
    | 'fishing'
    | 'fishing-hampered'
    | 'trawling'
    | 'trawling-shooting'
    | 'trawling-hauling'
    | 'pilotage'
    | 'not-under-way'
    | 'aground'
    | 'restricted manouverability'
    | 'restricted manouverability towing < 200m'
    | 'restricted manouverability towing > 200m'
    | 'restricted manouverability underwater operations'
    | 'constrained by draft'
    | 'mine clearance'
    | 'Reserved for future amendment of Navigational Status for HSC'
    | 'Reserved for future amendment of Navigational Status for WIG'
    | 'Reserved for future use-11'
    | 'Reserved for future use-12'
    | 'Reserved for future use-13'
    | 'Reserved for future use-14'
    | 'not defined (example)'
  >

  /** The anchor data, for anchor watch etc */
  anchor?: {
    /** Source of this data */
    source?: Source

    /** Timestamp of the last update to this data */
    timestamp?: Timestamp

    /** Radius of anchor alarm boundary. The distance from anchor to the center of the boat */
    maxRadius?: FullValue<Meters>

    /** Current distance to anchor */
    currentRadius?: FullValue<Meters>

    /** The actual anchor position of the vessel in 3 dimensions, probably an estimate at best */
    position?: FullValue<Position>
  }

  /** Time and Date from the GNSS Positioning System */
  datetime?: FullValue<Timestamp> & {
    /** Source of GNSS Date and Time */
    gnssTimeSource?:
    | 'GPS'
    | 'GLONASS'
    | 'Galileo'
    | 'Beidou'
    | 'IRNSS'
    | 'Radio Signal'
    | 'Internet'
    | 'Local clock'
  }
}

/**  Global satellite navigation meta information */
export interface Gnss {
  /** Fix type */
  type?: FullValue<
    | "Undefined"
    | "GPS"
    | "GLONASS"
    | "Combined GPS/GLONASS"
    | "Loran-C"
    | "Chayka"
    | "Integrated navigation system"
    | "Surveyed"
    | "Galileo"
  >
  /** Quality of the satellite fix */
  methodQuality?: FullValue<
    | "no GPS"
    | "GNSS Fix"
    | "DGNSS fix"
    | "Precise GNSS"
    | "RTK fixed integer"
    | "RTK float"
    | "Estimated (DR) mode"
    | "Manual input"
    | "Simulator mode"
    | "Error"
  >

  /** Integrity of the satellite fix */
  integrity?: FullValue<
    | "no Integrity checking"
    | "Safe"
    | "Caution"
    | "Unsafe"
  >

  /** Number of satellites */
  satellites?: FullValue<number>

  /** Altitude of antenna */
  antennaAltitude?: FullValue<Meters>

  /** Horizontal Dilution of Precision */
  horizontalDilution?: FullValue<number>

  /** Positional Dilution of Precision */
  positionDilution?: FullValue<number>

  /** Difference between WGS84 earth ellipsoid and mean sea level */
  geoidalSeparation?: FullValue<number>

  /** Age of DGPS data */
  differentialAge?: FullValue<Seconds>

  /** ID of DGPS base station */
  differentialReference?: FullValue<number>
}

/**  Vessel attitude: roll, pitch and yaw */
export type Attitude = {
  /** Vessel roll, +ve is list to starboard */
  roll?: Radians
  /** Pitch, +ve is bow up */
  pitch?: Radians
  /** Yaw, +ve is heading change to starboard */
  yaw?: Radians
}
