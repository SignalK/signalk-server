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
      'Autopilot state. For example standby, auto, wind or route; the autopilot is also called the pilot or AP.'
  },
  '/vessels/*/steering/autopilot/mode': {
    description: 'Operational mode'
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
    description: 'Data should be of type number.',
    units: 'rad'
  },
  '/vessels/*/steering/autopilot/backlash': {
    description: 'Data should be of type number.',
    units: 'rad'
  },
  '/vessels/*/steering/autopilot/gain': {
    description: 'Data should be of type number.'
  },
  '/vessels/*/steering/autopilot/maxDriveCurrent': {
    description: 'Data should be of type number.',
    units: 'A'
  },
  '/vessels/*/steering/autopilot/maxDriveRate': {
    description: 'Data should be of type number.',
    units: 'rad/s'
  },
  '/vessels/*/steering/autopilot/portLock': {
    description: 'Data should be of type number.',
    units: 'rad'
  },
  '/vessels/*/steering/autopilot/starboardLock': {
    description: 'Data should be of type number.',
    units: 'rad'
  }
}
