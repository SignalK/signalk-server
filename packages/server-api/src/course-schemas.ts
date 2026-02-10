/**
 * TypeBox Schema Definitions for the Signal K Course API
 *
 * Single source of truth for Course API types, validation, and documentation.
 * Schemas are used to:
 *   1. Derive TypeScript types via Static<typeof Schema>
 *   2. Validate request bodies at runtime via Value.Check()
 *   3. Generate OpenAPI 3.0 component schemas (TypeBox produces JSON Schema)
 *   4. Generate AsyncAPI channel payloads for WebSocket delta documentation
 *
 * Each schema includes $id for OpenAPI component registration and reference
 * comments to the canonical Signal K specification definitions.
 *
 * @see typebox-schema-proposal-v3.md
 * @see https://github.com/sinclairzx81/typebox
 */

import { Type, type Static } from '@sinclair/typebox'

// ---------------------------------------------------------------------------
// Reusable patterns
// ---------------------------------------------------------------------------

const SignalKUuidPattern =
  '[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-4[0-9A-Fa-f]{3}-[89ABab][0-9A-Fa-f]{3}-[0-9A-Fa-f]{12}'

const IsoTimePattern =
  '^(\\d{4})-(\\d{2})-(\\d{2})T(\\d{2}):(\\d{2}):(\\d{2}(?:\\.\\d*)?)((-(\\d{2}):(\\d{2})|Z)?)$'

// ---------------------------------------------------------------------------
// Primitive schemas
// ---------------------------------------------------------------------------

/**
 * ISO 8601 date-time string.
 * Aligned with openApi.json#/components/schemas/IsoTime
 */
export const IsoTimeSchema = Type.String({
  $id: 'IsoTime',
  pattern: IsoTimePattern,
  description: 'ISO 8601 date-time string',
  examples: ['2022-04-22T05:02:56.484Z']
})
export type IsoTimeType = Static<typeof IsoTimeSchema>

/**
 * Signal K route resource href (UUID v4 format).
 * Aligned with openApi.json#/components/schemas/SignalKHrefRoute
 */
export const SignalKHrefRouteSchema = Type.String({
  $id: 'SignalKHrefRoute',
  pattern: `^/resources/routes/${SignalKUuidPattern}$`,
  description: 'Pointer to route resource.',
  examples: ['/resources/routes/ac3a3b2d-07e8-4f25-92bc-98e7c92f7f1a']
})

/**
 * Signal K waypoint resource href (UUID v4 format).
 * Aligned with openApi.json#/components/schemas/HrefWaypointAttribute.href
 */
export const SignalKHrefWaypointSchema = Type.String({
  $id: 'SignalKHrefWaypoint',
  pattern: `^/resources/waypoints/${SignalKUuidPattern}$`,
  description: 'Pointer to waypoint resource.',
  examples: ['/resources/waypoints/ac3a3b2d-07e8-4f25-92bc-98e7c92f7f1a']
})

/**
 * Arrival circle radius in meters (non-negative).
 * Aligned with openApi.json#/components/schemas/ArrivalCircle
 */
export const ArrivalCircleSchema = Type.Number({
  $id: 'ArrivalCircle',
  minimum: 0,
  description: 'Radius of arrival zone in meters',
  examples: [500]
})
export type ArrivalCircleType = Static<typeof ArrivalCircleSchema>

// ---------------------------------------------------------------------------
// Position
// Aligned with specification/schemas/definitions.json#/definitions/position
// (the value shape: { latitude, longitude, altitude? })
// ---------------------------------------------------------------------------

/**
 * Geographic position with latitude, longitude, and optional altitude.
 * Aligned with specification/schemas/definitions.json#/definitions/position
 */
export const PositionSchema = Type.Object(
  {
    latitude: Type.Number({
      minimum: -90,
      maximum: 90,
      description: 'Latitude',
      examples: [52.0987654]
    }),
    longitude: Type.Number({
      minimum: -180,
      maximum: 180,
      description: 'Longitude',
      examples: [4.98765245]
    }),
    altitude: Type.Optional(
      Type.Number({
        description: 'Altitude',
        examples: [12.5]
      })
    )
  },
  {
    $id: 'SignalKPosition',
    description: 'The position in 3 dimensions'
  }
)
export type PositionType = Static<typeof PositionSchema>

// ---------------------------------------------------------------------------
// Course point type
// ---------------------------------------------------------------------------

/**
 * Type of course point (enum of known values).
 * Used for runtime validation; the TypeScript type uses Brand<string> for
 * nominal typing at compile time.
 */
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

/**
 * Destination by waypoint href.
 * Aligned with openApi.json#/components/schemas/HrefWaypointAttribute
 */
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

/**
 * Destination by position coordinates.
 * Aligned with openApi.json#/components/schemas/PositionAttribute
 */
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
 * Aligned with openApi.json PUT /course/destination requestBody
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

/**
 * PUT /course/activeRoute request body.
 * Aligned with openApi.json PUT /course/activeRoute requestBody
 */
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

/**
 * Active route state.
 * Aligned with openApi.json#/components/schemas/ActiveRouteModel
 */
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

/**
 * Navigation point (next or previous).
 * Aligned with openApi.json#/components/schemas/PointModel
 */
export const NextPreviousPointSchema = Type.Object(
  {
    href: Type.Optional(
      Type.String({ description: 'Reference to a waypoint resource.' })
    ),
    type: Type.String({ description: 'Type of point.' }),
    position: PositionSchema
  },
  { $id: 'NextPreviousPoint' }
)
export type NextPreviousPointType = Static<typeof NextPreviousPointSchema>

/**
 * Full course state response.
 * Aligned with openApi.json#/components/responses/CourseResponse
 */
export const CourseInfoSchema = Type.Object(
  {
    startTime: Type.Union([
      Type.String({ pattern: IsoTimePattern }),
      Type.Null()
    ]),
    targetArrivalTime: Type.Union([
      Type.String({ pattern: IsoTimePattern }),
      Type.Null()
    ]),
    arrivalCircle: Type.Number({ minimum: 0 }),
    activeRoute: Type.Union([ActiveRouteSchema, Type.Null()]),
    nextPoint: Type.Union([NextPreviousPointSchema, Type.Null()]),
    previousPoint: Type.Union([NextPreviousPointSchema, Type.Null()])
  },
  {
    $id: 'CourseInfo',
    description: 'Course state including active route and navigation points.'
  }
)
export type CourseInfoType = Static<typeof CourseInfoSchema>

// ---------------------------------------------------------------------------
// Course calculations
// Aligned with openApi.json#/components/schemas/CourseCalculationsModel
// and specification/schemas/groups/navigation.json#/definitions/course
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
          "The distance in meters from the vessel's present position to the closest point on a line (track) between previousPoint and nextPoint. A negative number indicates that the vessel is currently to the left of this line (and thus must steer right to compensate), a positive number means the vessel is to the right of the line (steer left to compensate).",
        examples: [458.784]
      })
    ),
    bearingTrackTrue: Type.Optional(
      Type.Number({
        minimum: 0,
        description:
          'The bearing of a line between previousPoint and nextPoint, relative to true north. (angle in radians)',
        examples: [4.58491]
      })
    ),
    bearingTrackMagnetic: Type.Optional(
      Type.Number({
        minimum: 0,
        description:
          'The bearing of a line between previousPoint and nextPoint, relative to magnetic north. (angle in radians)',
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
          "The distance in meters between the vessel's present position and the nextPoint.",
        examples: [10157]
      })
    ),
    bearingTrue: Type.Optional(
      Type.Number({
        minimum: 0,
        description:
          "The bearing of a line between the vessel's current position and nextPoint, relative to true north. (angle in radians)",
        examples: [4.58491]
      })
    ),
    bearingMagnetic: Type.Optional(
      Type.Number({
        minimum: 0,
        description:
          "The bearing of a line between the vessel's current position and nextPoint, relative to magnetic north. (angle in radians)",
        examples: [4.51234]
      })
    ),
    velocityMadeGood: Type.Optional(
      Type.Number({
        description:
          'The velocity component of the vessel towards the nextPoint in m/s',
        examples: [7.2653]
      })
    ),
    timeToGo: Type.Optional(
      Type.Number({
        minimum: 0,
        description:
          "Time in seconds to reach nextPoint's perpendicular with current speed & direction.",
        examples: [8491]
      })
    ),
    targetSpeed: Type.Optional(
      Type.Number({
        description:
          'The average velocity required to reach the destination at the value of targetArrivalTime in m/s',
        examples: [2.2653]
      })
    ),
    previousPoint: Type.Optional(
      Type.Object({
        distance: Type.Optional(
          Type.Number({
            minimum: 0,
            description:
              "The distance in meters between the vessel's present position and the start point.",
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
            description:
              'The distance in meters along the route to the last point.',
            examples: [15936]
          })
        ),
        timeToGo: Type.Optional(
          Type.Number({
            minimum: 0,
            description:
              'Time in seconds to reach perpendicular of last point in route with current speed & direction.',
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
    arrivalCircle: Type.Number({ minimum: 0 }),
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
    'nextPoint.arrivalCircle': Type.Number({ minimum: 0 }),
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
// API response schemas
// ---------------------------------------------------------------------------

/** Standard success response */
export const OkResponseSchema = Type.Object(
  {
    state: Type.Literal('COMPLETED'),
    statusCode: Type.Literal(200)
  },
  { $id: 'OkResponse' }
)

/** Standard error response */
export const ErrorResponseSchema = Type.Object(
  {
    state: Type.Literal('FAILED'),
    statusCode: Type.Number(),
    message: Type.String()
  },
  { $id: 'ErrorResponse', description: 'Request error response' }
)

/** API config response */
export const CourseConfigSchema = Type.Object(
  {
    apiOnly: Type.Boolean()
  },
  { $id: 'CourseConfig' }
)
