import type { PathMetadataEntry } from './types'

export const navigationMetadata: Record<string, PathMetadataEntry> = {
  '/vessels/*/navigation': {
    description:
      'Navigation data including Position, Course to next WP information, etc.'
  },
  '/vessels/*/navigation/lights': {
    description: 'Current state of the vessels navigation lights'
  },
  '/vessels/*/navigation/courseOverGroundMagnetic': {
    description: 'Course over ground (magnetic)',
    units: 'rad'
  },
  '/vessels/*/navigation/courseOverGroundTrue': {
    description: 'Course over ground (true)',
    units: 'rad'
  },
  '/vessels/*/navigation/courseRhumbline': {
    description: 'Course information computed with Rhumbline'
  },
  '/vessels/*/navigation/courseRhumbline/crossTrackError': {
    description:
      "The distance from the vessel's present position to the closest point on a line (track) between previousPoint and nextPoint. A negative number indicates that the vessel is currently to the left of this line (and thus must steer right to compensate), a positive number means the vessel is to the right of the line (steer left to compensate).",
    units: 'm'
  },
  '/vessels/*/navigation/courseRhumbline/bearingTrackTrue': {
    description:
      'The bearing of a line between previousPoint and nextPoint, relative to true north.',
    units: 'rad'
  },
  '/vessels/*/navigation/courseRhumbline/bearingTrackMagnetic': {
    description:
      'The bearing of a line between previousPoint and nextPoint, relative to magnetic north.',
    units: 'rad'
  },
  '/vessels/*/navigation/courseRhumbline/activeRoute': {
    description:
      'Data required if sailing to an active route, defined in resources.'
  },
  '/vessels/*/navigation/courseRhumbline/activeRoute/href': {
    description:
      'A reference (URL) to the presently active route, in resources.'
  },
  '/vessels/*/navigation/courseRhumbline/activeRoute/estimatedTimeOfArrival': {
    description: 'The estimated time of arrival at the end of the current route'
  },
  '/vessels/*/navigation/courseRhumbline/activeRoute/startTime': {
    description: 'The time this route was activated'
  },
  '/vessels/*/navigation/courseRhumbline/nextPoint': {
    description: "The point on earth the vessel's presently navigating towards"
  },
  '/vessels/*/navigation/courseRhumbline/previousPoint': {
    description: "The point on earth the vessel's presently navigating from",
    properties: {
      type: {
        description:
          'The type of the previous point (e.g. Waypoint, POI, Race Mark, etc)',
        type: 'string'
      },
      href: {
        description:
          'A reference (URL) to an object (under resources) this point is related to',
        type: 'string'
      }
    }
  },
  '/vessels/*/navigation/courseRhumbline/previousPoint/distance': {
    description:
      "The distance in meters between previousPoint and the vessel's present position",
    units: 'm'
  },
  '/vessels/*/navigation/courseRhumbline/previousPoint/position': {
    description: 'The position of lastPoint in two dimensions',
    properties: {
      longitude: {
        type: 'number',
        description: 'Longitude',
        units: 'deg',
        example: 4.98765245
      },
      latitude: {
        type: 'number',
        description: 'Latitude',
        units: 'deg',
        example: 52.0987654
      },
      altitude: {
        type: 'number',
        description: 'Altitude',
        units: 'm'
      }
    }
  },
  '/vessels/*/navigation/courseGreatCircle': {
    description: 'Course information computed with Great Circle'
  },
  '/vessels/*/navigation/courseGreatCircle/crossTrackError': {
    description:
      "The distance from the vessel's present position to the closest point on a line (track) between previousPoint and nextPoint. A negative number indicates that the vessel is currently to the left of this line (and thus must steer right to compensate), a positive number means the vessel is to the right of the line (steer left to compensate).",
    units: 'm'
  },
  '/vessels/*/navigation/courseGreatCircle/bearingTrackTrue': {
    description:
      'The bearing of a line between previousPoint and nextPoint, relative to true north.',
    units: 'rad'
  },
  '/vessels/*/navigation/courseGreatCircle/bearingTrackMagnetic': {
    description:
      'The bearing of a line between previousPoint and nextPoint, relative to magnetic north.',
    units: 'rad'
  },
  '/vessels/*/navigation/courseGreatCircle/activeRoute': {
    description:
      'Data required if sailing to an active route, defined in resources.'
  },
  '/vessels/*/navigation/courseGreatCircle/activeRoute/href': {
    description:
      'A reference (URL) to the presently active route, in resources.'
  },
  '/vessels/*/navigation/courseGreatCircle/activeRoute/estimatedTimeOfArrival':
    {
      description:
        'The estimated time of arrival at the end of the current route'
    },
  '/vessels/*/navigation/courseGreatCircle/activeRoute/startTime': {
    description: 'The time this route was activated'
  },
  '/vessels/*/navigation/courseGreatCircle/nextPoint': {
    description: "The point on earth the vessel's presently navigating towards"
  },
  '/vessels/*/navigation/courseGreatCircle/previousPoint': {
    description: "The point on earth the vessel's presently navigating from",
    properties: {
      type: {
        description:
          'The type of the previous point (e.g. Waypoint, POI, Race Mark, etc)',
        type: 'string'
      },
      href: {
        description:
          'A reference (URL) to an object (under resources) this point is related to',
        type: 'string'
      }
    }
  },
  '/vessels/*/navigation/courseGreatCircle/previousPoint/distance': {
    description:
      "The distance in meters between previousPoint and the vessel's present position",
    units: 'm'
  },
  '/vessels/*/navigation/courseGreatCircle/previousPoint/position': {
    description: 'The position of lastPoint in two dimensions',
    properties: {
      longitude: {
        type: 'number',
        description: 'Longitude',
        units: 'deg',
        example: 4.98765245
      },
      latitude: {
        type: 'number',
        description: 'Latitude',
        units: 'deg',
        example: 52.0987654
      },
      altitude: {
        type: 'number',
        description: 'Altitude',
        units: 'm'
      }
    }
  },
  '/vessels/*/navigation/closestApproach': {
    description: 'Calculated values for other vessels, e.g. from AIS',
    properties: {
      distance: {
        description:
          'Closest Point of Approach (CPA), distance between own vessel and other vessel, based on current speeds, headings and positions',
        type: 'number',
        units: 'm',
        example: 31.2
      },
      timeTo: {
        description:
          'Time to Closest Point of Approach (TCPA), between own vessel and other vessel, based on current speeds, headings and positions',
        type: 'number',
        units: 's',
        example: 312
      }
    }
  },
  '/vessels/*/navigation/racing': {
    description: 'Specific navigational data related to yacht racing.'
  },
  '/vessels/*/navigation/racing/startLineStb': {
    description: 'Position of starboard start mark',
    properties: {
      longitude: {
        type: 'number',
        description: 'Longitude',
        units: 'deg',
        example: 4.98765245
      },
      latitude: {
        type: 'number',
        description: 'Latitude',
        units: 'deg',
        example: 52.0987654
      },
      altitude: {
        type: 'number',
        description: 'Altitude',
        units: 'm'
      }
    }
  },
  '/vessels/*/navigation/racing/startLinePort': {
    description: 'Position of port start mark',
    properties: {
      longitude: {
        type: 'number',
        description: 'Longitude',
        units: 'deg',
        example: 4.98765245
      },
      latitude: {
        type: 'number',
        description: 'Latitude',
        units: 'deg',
        example: 52.0987654
      },
      altitude: {
        type: 'number',
        description: 'Altitude',
        units: 'm'
      }
    }
  },
  '/vessels/*/navigation/racing/distanceStartline': {
    description: 'The current distance to the start line',
    units: 'm'
  },
  '/vessels/*/navigation/racing/timeToStart': {
    description: 'Time left before start',
    units: 's'
  },
  '/vessels/*/navigation/racing/timePortDown': {
    description: 'Time to arrive at the start line on port, turning downwind',
    units: 's'
  },
  '/vessels/*/navigation/racing/timePortUp': {
    description: 'Time to arrive at the start line on port, turning upwind',
    units: 's'
  },
  '/vessels/*/navigation/racing/timeStbdDown': {
    description:
      'Time to arrive at the start line on starboard, turning downwind',
    units: 's'
  },
  '/vessels/*/navigation/racing/timeStbdUp': {
    description:
      'Time to arrive at the start line on starboard, turning upwind',
    units: 's'
  },
  '/vessels/*/navigation/racing/layline': {
    description: 'The layline crossing the current course'
  },
  '/vessels/*/navigation/racing/layline/distance': {
    description: 'The current distance to the layline',
    units: 'm'
  },
  '/vessels/*/navigation/racing/layline/time': {
    description: 'The time to the layline at current speed and heading',
    units: 's'
  },
  '/vessels/*/navigation/racing/oppositeLayline': {
    description: 'The layline parallell to current course'
  },
  '/vessels/*/navigation/racing/oppositeLayline/distance': {
    description: 'The current distance to the layline',
    units: 'm'
  },
  '/vessels/*/navigation/racing/oppositeLayline/time': {
    description: 'The time to the layline at current speed and heading',
    units: 's'
  },
  '/vessels/*/navigation/magneticVariation': {
    description:
      'The magnetic variation (declination) at the current position that must be added to the magnetic heading to derive the true heading. Easterly variations are positive and Westerly variations are negative (in Radians).',
    units: 'rad'
  },
  '/vessels/*/navigation/magneticVariationAgeOfService': {
    description:
      'Seconds since the 1st Jan 1970 that the variation calculation was made',
    units: 's'
  },
  '/vessels/*/navigation/destination': {
    description: 'The intended destination of this trip'
  },
  '/vessels/*/navigation/destination/commonName': {
    description:
      "Common name of the Destination, eg 'Fiji', also used in ais messages"
  },
  '/vessels/*/navigation/destination/eta': {
    description: 'Expected time of arrival at destination waypoint'
  },
  '/vessels/*/navigation/destination/waypoint': {
    description: 'UUID of destination waypoint'
  },
  '/vessels/*/navigation/gnss': {
    description: 'Global satellite navigation meta information'
  },
  '/vessels/*/navigation/gnss/type': {
    description: 'Fix type'
  },
  '/vessels/*/navigation/gnss/methodQuality': {
    description: 'Quality of the satellite fix'
  },
  '/vessels/*/navigation/gnss/integrity': {
    description: 'Integrity of the satellite fix'
  },
  '/vessels/*/navigation/gnss/satellites': {
    description: 'Number of satellites'
  },
  '/vessels/*/navigation/gnss/antennaAltitude': {
    description: 'Altitude of antenna',
    units: 'm'
  },
  '/vessels/*/navigation/gnss/horizontalDilution': {
    description: 'Horizontal Dilution of Precision'
  },
  '/vessels/*/navigation/gnss/positionDilution': {
    description: 'Positional Dilution of Precision'
  },
  '/vessels/*/navigation/gnss/geoidalSeparation': {
    description: 'Difference between WGS84 earth ellipsoid and mean sea level'
  },
  '/vessels/*/navigation/gnss/differentialAge': {
    description: 'Age of DGPS data',
    units: 's'
  },
  '/vessels/*/navigation/gnss/differentialReference': {
    description: 'ID of DGPS base station'
  },
  '/vessels/*/navigation/headingMagnetic': {
    description:
      "Current magnetic heading of the vessel, equals 'headingCompass adjusted for magneticDeviation'",
    units: 'rad'
  },
  '/vessels/*/navigation/magneticDeviation': {
    description:
      'Magnetic deviation of the compass at the current headingCompass',
    units: 'rad'
  },
  '/vessels/*/navigation/headingCompass': {
    description:
      'Current magnetic heading received from the compass. This is not adjusted for magneticDeviation of the compass',
    units: 'rad'
  },
  '/vessels/*/navigation/headingTrue': {
    description:
      "The current true north heading of the vessel, equals 'headingMagnetic adjusted for magneticVariation'",
    units: 'rad'
  },
  '/vessels/*/navigation/position': {
    description:
      'The position of the vessel in 2 or 3 dimensions (WGS84 datum)',
    properties: {
      longitude: {
        type: 'number',
        description: 'Longitude',
        units: 'deg',
        example: 4.98765245
      },
      latitude: {
        type: 'number',
        description: 'Latitude',
        units: 'deg',
        example: 52.0987654
      },
      altitude: {
        type: 'number',
        description: 'Altitude',
        units: 'm'
      }
    }
  },
  '/vessels/*/navigation/attitude': {
    description: 'Vessel attitude: roll, pitch and yaw',
    properties: {
      roll: {
        type: 'number',
        description: 'Vessel roll, +ve is list to starboard',
        units: 'rad'
      },
      pitch: {
        type: 'number',
        description: 'Pitch, +ve is bow up',
        units: 'rad'
      },
      yaw: {
        type: 'number',
        description: 'Yaw, +ve is heading change to starboard',
        units: 'rad'
      }
    }
  },
  '/vessels/*/navigation/maneuver': {
    description:
      'Special maneuver such as regional passing arrangement. (from ais)'
  },
  '/vessels/*/navigation/rateOfTurn': {
    description:
      'Rate of turn (+ve is change to starboard). If the value is AIS RIGHT or LEFT, set to +-0.0206 rads and add warning in notifications',
    units: 'rad/s'
  },
  '/vessels/*/navigation/speedOverGround': {
    description:
      "Vessel speed over ground. If converting from AIS 'HIGH' value, set to 102.2 (Ais max value) and add warning in notifications",
    units: 'm/s'
  },
  '/vessels/*/navigation/speedThroughWater': {
    description: 'Vessel speed through the water',
    units: 'm/s'
  },
  '/vessels/*/navigation/speedThroughWaterTransverse': {
    description: 'Transverse speed through the water (Leeway)',
    units: 'm/s'
  },
  '/vessels/*/navigation/speedThroughWaterLongitudinal': {
    description: 'Longitudinal speed through the water',
    units: 'm/s'
  },
  '/vessels/*/navigation/leewayAngle': {
    description:
      'Leeway Angle derived from the longitudinal and transverse speeds through the water',
    units: 'rad'
  },
  '/vessels/*/navigation/log': {
    description: 'Total distance traveled',
    units: 'm'
  },
  '/vessels/*/navigation/trip': {
    description: 'Trip data'
  },
  '/vessels/*/navigation/trip/log': {
    description: 'Total distance traveled on this trip / since trip reset',
    units: 'm'
  },
  '/vessels/*/navigation/trip/lastReset': {
    description: 'Trip log reset time'
  },
  '/vessels/*/navigation/state': {
    description: 'Current navigational state of the vessel'
  },
  '/vessels/*/navigation/anchor': {
    description: 'The anchor data, for anchor watch etc'
  },
  '/vessels/*/navigation/anchor/maxRadius': {
    description:
      'Radius of anchor alarm boundary. The distance from anchor to the center of the boat',
    units: 'm'
  },
  '/vessels/*/navigation/anchor/currentRadius': {
    description: 'Current distance to anchor',
    units: 'm'
  },
  '/vessels/*/navigation/anchor/position': {
    description:
      'The actual anchor position of the vessel in 3 dimensions, probably an estimate at best',
    properties: {
      longitude: {
        type: 'number',
        description: 'Longitude',
        units: 'deg',
        example: 4.98765245
      },
      latitude: {
        type: 'number',
        description: 'Latitude',
        units: 'deg',
        example: 52.0987654
      },
      altitude: {
        type: 'number',
        description: 'Altitude',
        units: 'm'
      }
    }
  },
  '/vessels/*/navigation/datetime': {
    description: 'Time and Date from the GNSS Positioning System'
  },
  '/vessels/*/navigation/datetime/gnssTimeSource': {
    description: 'Source of GNSS Date and Time',
    enum: [
      'GPS',
      'GLONASS',
      'Galileo',
      'Beidou',
      'IRNSS',
      'Radio Signal',
      'Internet',
      'Local clock'
    ]
  }
}
