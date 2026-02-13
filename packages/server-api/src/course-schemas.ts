/**
 * TypeBox Schema Definitions for the Signal K Course API
 */

import { Type, type Static } from '@sinclair/typebox'
import {
  PositionSchema,
  IsoTimePattern,
  IsoTimeSchema,
  SignalKUuidPattern,
  OkResponseSchema,
  ErrorResponseSchema
} from './shared-schemas'

export { IsoTimeSchema, PositionSchema, OkResponseSchema, ErrorResponseSchema }
export type { IsoTimeType } from './shared-schemas'

// ---------------------------------------------------------------------------
// Primitive schemas (Course-specific)
// ---------------------------------------------------------------------------

/** Signal K route resource href (UUID v4 format). */
export const SignalKHrefRouteSchema = Type.String({
  $id: 'SignalKHrefRoute',
  pattern: `^/resources/routes/${SignalKUuidPattern}$`,
  description: 'Pointer to route resource.',
  examples: ['/resources/routes/ac3a3b2d-07e8-4f25-92bc-98e7c92f7f1a']
})

/** Signal K waypoint resource href (UUID v4 format). */
export const SignalKHrefWaypointSchema = Type.String({
  $id: 'SignalKHrefWaypoint',
  pattern: `^/resources/waypoints/${SignalKUuidPattern}$`,
  description: 'Pointer to waypoint resource.',
  examples: ['/resources/waypoints/ac3a3b2d-07e8-4f25-92bc-98e7c92f7f1a']
})

/** Arrival circle radius in meters (non-negative). */
export const ArrivalCircleSchema = Type.Number({
  $id: 'ArrivalCircle',
  minimum: 0,
  description: 'Radius of arrival zone in meters',
  examples: [500]
})
export type ArrivalCircleType = Static<typeof ArrivalCircleSchema>

export type PositionType = Static<typeof PositionSchema>

// ---------------------------------------------------------------------------
// Course point type
// ---------------------------------------------------------------------------

/** Type of course point. */
export const CoursePointTypeSchema = Type.Union(
  [
    Type.Literal('VesselPosition'),
    Type.Literal('RoutePoint'),
    Type.Literal('Location')
  ],
  {
    $id: 'CoursePointType',
    description: 'Type of course point'
  }
)

// ---------------------------------------------------------------------------
// Destination request body schemas
// ---------------------------------------------------------------------------

/** Destination by waypoint href. */
export const HrefDestinationSchema = Type.Object(
  {
    href: Type.String({
      pattern: `^/resources/waypoints/${SignalKUuidPattern}$`,
      description:
        'Reference to a related waypoint resource. A pointer to the resource UUID.',
      examples: ['/resources/waypoints/ac3a3b2d-07e8-4f25-92bc-98e7c92f7f1a']
    })
  },
  { $id: 'HrefDestination' }
)
export type HrefDestinationType = Static<typeof HrefDestinationSchema>

/** Destination by position coordinates. */
export const PositionDestinationSchema = Type.Object(
  {
    position: PositionSchema
  },
  { $id: 'PositionDestination', description: 'Location coordinates.' }
)
export type PositionDestinationType = Static<typeof PositionDestinationSchema>

/**
 * PUT /course/destination request body.
 * Either a waypoint href or a position, optionally with an arrival circle.
 */
export const SetDestinationBodySchema = Type.Intersect(
  [
    Type.Union([HrefDestinationSchema, PositionDestinationSchema]),
    Type.Object({
      arrivalCircle: Type.Optional(ArrivalCircleSchema)
    })
  ],
  { $id: 'SetDestinationBody' }
)
export type SetDestinationBodyType = Static<typeof SetDestinationBodySchema>

/** PUT /course/activeRoute request body. */
export const RouteDestinationSchema = Type.Object(
  {
    href: SignalKHrefRouteSchema,
    pointIndex: Type.Optional(
      Type.Number({
        minimum: 0,
        default: 0,
        description:
          '0 based index of the point in the route to set as the destination'
      })
    ),
    reverse: Type.Optional(
      Type.Boolean({
        default: false,
        description:
          'Set to true to navigate the route points in reverse order.'
      })
    ),
    arrivalCircle: Type.Optional(ArrivalCircleSchema)
  },
  { $id: 'RouteDestination' }
)
export type RouteDestinationType = Static<typeof RouteDestinationSchema>

// ---------------------------------------------------------------------------
// Endpoint-specific request body schemas
// ---------------------------------------------------------------------------

/** PUT /course/arrivalCircle request body */
export const ArrivalCircleBodySchema = Type.Object(
  {
    value: ArrivalCircleSchema
  },
  { $id: 'ArrivalCircleBody' }
)
export type ArrivalCircleBodyType = Static<typeof ArrivalCircleBodySchema>

/** PUT /course/targetArrivalTime request body */
export const TargetArrivalTimeBodySchema = Type.Object(
  {
    value: Type.Union([
      Type.String({
        pattern: IsoTimePattern,
        description: 'ISO 8601 date-time string'
      }),
      Type.Null()
    ])
  },
  { $id: 'TargetArrivalTimeBody' }
)
export type TargetArrivalTimeBodyType = Static<
  typeof TargetArrivalTimeBodySchema
>

/** PUT /course/activeRoute/nextPoint request body */
export const NextPointBodySchema = Type.Object(
  {
    value: Type.Optional(
      Type.Number({
        default: 1,
        description: 'Index offset of point in route (-ve = previous)'
      })
    )
  },
  { $id: 'NextPointBody' }
)
export type NextPointBodyType = Static<typeof NextPointBodySchema>

/** PUT /course/activeRoute/pointIndex request body */
export const PointIndexBodySchema = Type.Object(
  {
    value: Type.Number({
      minimum: 0,
      description: 'Index of point in route to set as destination.',
      examples: [2]
    })
  },
  { $id: 'PointIndexBody' }
)
export type PointIndexBodyType = Static<typeof PointIndexBodySchema>

/** PUT /course/activeRoute/reverse request body */
export const ReverseBodySchema = Type.Object(
  {
    pointIndex: Type.Optional(
      Type.Number({
        minimum: 0,
        description: 'Index of point in route to set as destination.',
        examples: [2]
      })
    )
  },
  { $id: 'ReverseBody' }
)
export type ReverseBodyType = Static<typeof ReverseBodySchema>

// ---------------------------------------------------------------------------
// Response model schemas
// ---------------------------------------------------------------------------

/** Active route state. */
export const ActiveRouteSchema = Type.Object(
  {
    href: SignalKHrefRouteSchema,
    name: Type.String({
      description: 'Name of route.',
      examples: ['Here to eternity.']
    }),
    pointIndex: Type.Number({
      minimum: 0,
      description:
        '0 based index of the point in the route that is the current destination'
    }),
    pointTotal: Type.Number({
      description: 'Total number of points in the route'
    }),
    reverse: Type.Boolean({
      description:
        'When true indicates the route points are being navigated in reverse order.'
    })
  },
  { $id: 'ActiveRoute' }
)
export type ActiveRouteType = Static<typeof ActiveRouteSchema>

/** Navigation point (next or previous). */
export const NextPreviousPointSchema = Type.Object(
  {
    href: Type.Optional(
      Type.String({ description: 'Reference to a waypoint resource.' })
    ),
    type: Type.String({
      description:
        "Type of point. Known values: VesselPosition (vessel's current location), RoutePoint (a point on the active route), Location (an arbitrary geographic position).",
      examples: ['RoutePoint', 'Location', 'VesselPosition']
    }),
    position: PositionSchema
  },
  { $id: 'NextPreviousPoint' }
)
export type NextPreviousPointType = Static<typeof NextPreviousPointSchema>

/** Full course state response. */
export const CourseInfoSchema = Type.Object(
  {
    startTime: Type.Union(
      [Type.String({ pattern: IsoTimePattern }), Type.Null()],
      {
        description:
          'ISO 8601 timestamp when the course was set, or null when no course is active'
      }
    ),
    targetArrivalTime: Type.Union(
      [Type.String({ pattern: IsoTimePattern }), Type.Null()],
      {
        description: 'ISO 8601 target arrival time, or null when not set'
      }
    ),
    arrivalCircle: Type.Number({
      minimum: 0,
      description: 'Radius of arrival zone in meters',
      units: 'm'
    }),
    activeRoute: Type.Union([ActiveRouteSchema, Type.Null()], {
      description: 'The active route, or null when navigating to a point'
    }),
    nextPoint: Type.Union([NextPreviousPointSchema, Type.Null()], {
      description: 'The next navigation point, or null when no course is set'
    }),
    previousPoint: Type.Union([NextPreviousPointSchema, Type.Null()], {
      description:
        'The previous navigation point (departure point or last waypoint passed), or null when no course is set'
    })
  },
  {
    $id: 'CourseInfo',
    description: 'Course state including active route and navigation points.'
  }
)
export type CourseInfoType = Static<typeof CourseInfoSchema>

// ---------------------------------------------------------------------------
// Course calculations
// ---------------------------------------------------------------------------

/**
 * Calculated course values derived from vessel position and destination.
 */
export const CourseCalculationsSchema = Type.Object(
  {
    calcMethod: Type.Union(
      [Type.Literal('GreatCircle'), Type.Literal('Rhumbline')],
      {
        description: 'Calculation method by which values are derived.',
        default: 'GreatCircle',
        examples: ['Rhumbline']
      }
    ),
    crossTrackError: Type.Optional(
      Type.Number({
        description:
          "The distance from the vessel's present position to the closest point on a line (track) between previousPoint and nextPoint. A negative number indicates that the vessel is currently to the left of this line (and thus must steer right to compensate), a positive number means the vessel is to the right of the line (steer left to compensate).",
        units: 'm',
        examples: [458.784]
      })
    ),
    bearingTrackTrue: Type.Optional(
      Type.Number({
        minimum: 0,
        description:
          'The bearing of a line between previousPoint and nextPoint, relative to true north',
        units: 'rad',
        examples: [4.58491]
      })
    ),
    bearingTrackMagnetic: Type.Optional(
      Type.Number({
        minimum: 0,
        description:
          'The bearing of a line between previousPoint and nextPoint, relative to magnetic north',
        units: 'rad',
        examples: [4.51234]
      })
    ),
    estimatedTimeOfArrival: Type.Optional(
      Type.String({
        pattern: IsoTimePattern,
        description: 'The estimated time of arrival at nextPoint position.'
      })
    ),
    distance: Type.Optional(
      Type.Number({
        minimum: 0,
        description:
          "The distance between the vessel's present position and the nextPoint",
        units: 'm',
        examples: [10157]
      })
    ),
    bearingTrue: Type.Optional(
      Type.Number({
        minimum: 0,
        description:
          "The bearing of a line between the vessel's current position and nextPoint, relative to true north",
        units: 'rad',
        examples: [4.58491]
      })
    ),
    bearingMagnetic: Type.Optional(
      Type.Number({
        minimum: 0,
        description:
          "The bearing of a line between the vessel's current position and nextPoint, relative to magnetic north",
        units: 'rad',
        examples: [4.51234]
      })
    ),
    velocityMadeGood: Type.Optional(
      Type.Number({
        description:
          'The velocity component of the vessel towards the nextPoint',
        units: 'm/s',
        examples: [7.2653]
      })
    ),
    timeToGo: Type.Optional(
      Type.Number({
        minimum: 0,
        description:
          "Time to reach nextPoint's perpendicular with current speed and direction",
        units: 's',
        examples: [8491]
      })
    ),
    targetSpeed: Type.Optional(
      Type.Number({
        description:
          'The average velocity required to reach the destination at the targetArrivalTime',
        units: 'm/s',
        examples: [2.2653]
      })
    ),
    previousPoint: Type.Optional(
      Type.Object({
        distance: Type.Optional(
          Type.Number({
            minimum: 0,
            description:
              "The distance between the vessel's present position and the start point",
            units: 'm',
            examples: [10157]
          })
        )
      })
    ),
    route: Type.Optional(
      Type.Object({
        distance: Type.Optional(
          Type.Number({
            minimum: 0,
            description: 'The distance along the route to the last point',
            units: 'm',
            examples: [15936]
          })
        ),
        timeToGo: Type.Optional(
          Type.Number({
            minimum: 0,
            description:
              'Time to reach perpendicular of last point in route with current speed and direction',
            units: 's',
            examples: [10452]
          })
        ),
        estimatedTimeOfArrival: Type.Optional(
          Type.String({
            pattern: IsoTimePattern,
            description: 'The estimated time of arrival at last point in route.'
          })
        )
      })
    )
  },
  {
    $id: 'CourseCalculations',
    description: 'Calculated course data values.'
  }
)
export type CourseCalculationsType = Static<typeof CourseCalculationsSchema>

// ---------------------------------------------------------------------------
// Delta event schemas (for AsyncAPI WebSocket documentation)
// ---------------------------------------------------------------------------

/**
 * v2 course delta paths emitted on navigation.course.*
 * Emitted via handleMessage() with SKVersion.v2
 */
export const CourseDeltaV2Schema = Type.Object(
  {
    startTime: Type.Union([
      Type.String({ pattern: IsoTimePattern }),
      Type.Null()
    ]),
    targetArrivalTime: Type.Union([
      Type.String({ pattern: IsoTimePattern }),
      Type.Null()
    ]),
    activeRoute: Type.Union([ActiveRouteSchema, Type.Null()]),
    arrivalCircle: Type.Number({
      minimum: 0,
      description: 'Radius of arrival zone in meters',
      units: 'm'
    }),
    previousPoint: Type.Union([NextPreviousPointSchema, Type.Null()]),
    nextPoint: Type.Union([NextPreviousPointSchema, Type.Null()])
  },
  {
    $id: 'CourseDeltaV2',
    description:
      'Course delta values emitted under navigation.course.* (Signal K v2)'
  }
)

/**
 * v1 course delta paths emitted on courseGreatCircle.* / courseRhumbline.*
 * Emitted via handleMessage() with SKVersion.v1
 */
export const CourseDeltaV1Schema = Type.Object(
  {
    'activeRoute.href': Type.Union([Type.String(), Type.Null()]),
    'activeRoute.startTime': Type.Union([
      Type.String({ pattern: IsoTimePattern }),
      Type.Null()
    ]),
    'nextPoint.value.href': Type.Union([Type.String(), Type.Null()]),
    'nextPoint.value.type': Type.Union([Type.String(), Type.Null()]),
    'nextPoint.position': Type.Union([PositionSchema, Type.Null()]),
    'nextPoint.arrivalCircle': Type.Number({
      minimum: 0,
      description: 'Radius of arrival zone in meters',
      units: 'm'
    }),
    'previousPoint.position': Type.Union([PositionSchema, Type.Null()]),
    'previousPoint.value.type': Type.Union([Type.String(), Type.Null()])
  },
  {
    $id: 'CourseDeltaV1',
    description:
      'Course delta values emitted under navigation.courseGreatCircle.* and navigation.courseRhumbline.* (Signal K v1)'
  }
)

// ---------------------------------------------------------------------------
// Course-specific API response schemas
// ---------------------------------------------------------------------------

/** API config response */
export const CourseConfigSchema = Type.Object(
  {
    apiOnly: Type.Boolean({
      description:
        'When true, course data is only available via the API and not emitted as v1 deltas'
    })
  },
  { $id: 'CourseConfig', description: 'Course API configuration' }
)
