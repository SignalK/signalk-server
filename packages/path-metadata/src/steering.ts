import type { PathMetadataEntry } from './types'

export const steeringMetadata: Record<string, PathMetadataEntry> = {
  '/vessels/*/steering': {
    description:
      "Vessel steering data for steering controls (not Autopilot 'Nav Data')"
  },
  '/vessels/*/steering/rudderAngle': {
    description: 'Current rudder angle, positive to starboard.',
    units: 'rad'
  },
  '/vessels/*/steering/rudderAngleTarget': {
    description:
      'Rudder angle the steering system is commanded to reach, positive to starboard.',
    units: 'rad'
  },
  '/vessels/*/steering/autopilot': {
    description: 'Autopilot data'
  },
  '/vessels/*/steering/autopilot/state': {
    description:
      'Autopilot state, such as enabled or disabled (standby). Which states are available depends on the autopilot; the Autopilot API lists them. The autopilot is also called the pilot or AP.'
  },
  '/vessels/*/steering/autopilot/mode': {
    description:
      'Steering mode of the autopilot, such as compass, gps or wind. Which modes are available depends on the autopilot; the Autopilot API lists them.'
  },
  '/vessels/*/steering/autopilot/target': {
    description: 'Autopilot target'
  },
  '/vessels/*/steering/autopilot/target/windAngleApparent': {
    description:
      'Apparent wind angle the autopilot is set to hold, negative to port.',
    units: 'rad'
  },
  '/vessels/*/steering/autopilot/target/windAngleTrue': {
    description:
      'True wind angle the autopilot is set to hold, negative to port.',
    units: 'rad'
  },
  '/vessels/*/steering/autopilot/target/headingTrue': {
    description:
      "True heading the autopilot is set to steer; also called the autopilot's set heading.",
    units: 'rad'
  },
  '/vessels/*/steering/autopilot/target/headingMagnetic': {
    description:
      "Magnetic heading the autopilot is set to steer; also called the autopilot's set heading.",
    units: 'rad'
  },
  '/vessels/*/steering/autopilot/deadZone': {
    description:
      'Heading error the autopilot ignores before it moves the rudder.',
    units: 'rad'
  },
  '/vessels/*/steering/autopilot/backlash': {
    description: 'Slack in the rudder drive.',
    units: 'rad'
  },
  '/vessels/*/steering/autopilot/gain': {
    description:
      'Autopilot gain; a higher value gives more rudder for the same heading error.'
  },
  '/vessels/*/steering/autopilot/maxDriveCurrent': {
    description: 'Maximum current the autopilot uses to drive the rudder.',
    units: 'A'
  },
  '/vessels/*/steering/autopilot/maxDriveRate': {
    description: 'Maximum speed at which the autopilot turns the rudder.',
    units: 'rad/s'
  },
  '/vessels/*/steering/autopilot/portLock': {
    description: 'Rudder drive position at the port stop.',
    units: 'rad'
  },
  '/vessels/*/steering/autopilot/starboardLock': {
    description: 'Rudder drive position at the starboard stop.',
    units: 'rad'
  }
}
