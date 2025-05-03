import { Amperes, Radians, RadiansPerSecond } from './units'
import { FullValue } from './values'

/** Vessel steering data for steering controls (not Autopilot 'Nav Data') */
export interface Steering {
  /** Current rudder angle, +ve is rudder to Starboard */
  rudderAngle?: FullValue<Radians>

  /** The angle the rudder should move to, +ve is rudder to Starboard */
  rudderAngleTarget?: FullValue<Radians>

  /** Autopilot data */
  autopilot?: Autopilot
}

/** Autopilot data */
export interface Autopilot {
  /** Autopilot state */
  state?: FullValue<
    | 'auto'
    | 'standby'
    | 'alarm'
    | 'noDrift'
    | 'wind'
    | 'depthContour'
    | 'route'
    | 'directControl'
  >

  /** Operational mode */
  mode?: FullValue<'powersave' | 'normal' | 'accurate'>

  target?: AutopilotTarget

  /** Dead zone to ignore for rudder corrections */
  deadZone?: FullValue<Radians>

  /** Slack in the rudder drive mechanism */
  backlash?: FullValue<Radians>

  /** Auto-pilot gain, higher number equals more rudder movement for a given turn */
  gain?: FullValue<number>

  /** Maximum current to use to drive servo */
  maxDriveCurrent?: FullValue<Amperes>

  /** Maximum rudder rotation speed */
  maxDriveRate?: FullValue<RadiansPerSecond>

  /** Position of servo on port lock */
  portLock?: FullValue<Radians>

  /** Position of servo on starboard lock */
  starboardLock?: FullValue<Radians>
}

/** Autopilot target */
export interface AutopilotTarget {
  /** Target angle to steer, relative to Apparent wind +port -starboard */
  windAngleApparent?: FullValue<Radians>

  /** Target angle to steer, relative to true wind +port -starboard */
  windAngleTrue?: FullValue<Radians>

  /** Target heading for autopilot, relative to North */
  headingTrue?: FullValue<Radians>

  /** Target heading for autopilot, relative to Magnetic North */
  headingMagnetic?: FullValue<Radians>
}
