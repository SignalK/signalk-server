/**
 * Shared TypeBox Schema Definitions for Signal K
 *
 * Domain object schemas and common patterns used across multiple APIs.
 *
 * Metadata (descriptions, units, examples) sourced from:
 *   specification/schemas/definitions.json
 *   specification/schemas/groups/navigation.json
 */

import { Type, type Static } from '@sinclair/typebox'

// ---------------------------------------------------------------------------
// Reusable patterns
// ---------------------------------------------------------------------------

/** Signal K UUID v4 pattern (without anchors) */
export const SignalKUuidPattern =
  '[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-4[0-9A-Fa-f]{3}-[89ABab][0-9A-Fa-f]{3}-[0-9A-Fa-f]{12}'

/** ISO 8601 date-time pattern */
export const IsoTimePattern =
  '^(\\d{4})-(\\d{2})-(\\d{2})T(\\d{2}):(\\d{2}):(\\d{2}(?:\\.\\d*)?)((-(\\d{2}):(\\d{2})|Z)?)$'

// ---------------------------------------------------------------------------
// Primitive schemas
// ---------------------------------------------------------------------------

/**
 * ISO 8601 date-time string.
 * @see specification/schemas/definitions.json#/definitions/timestamp
 */
export const IsoTimeSchema = Type.String({
  $id: 'IsoTime',
  pattern: IsoTimePattern,
  description: 'ISO 8601 date-time string',
  examples: ['2022-04-22T05:02:56.484Z']
})
export type IsoTimeType = Static<typeof IsoTimeSchema>

/**
 * Signal K UUID — Maritime Resource Name.
 * Format: urn:mrn:signalk:uuid:{uuid-v4}
 * @see specification/schemas/definitions.json#/definitions/uuid
 */
export const SignalKUuidSchema = Type.String({
  $id: 'SignalKUuid',
  pattern: `^urn:mrn:signalk:uuid:${SignalKUuidPattern}$`,
  description:
    'A unique Signal K flavoured maritime resource identifier (MRN). ' +
    'Format: urn:mrn:signalk:uuid:{uuid-v4}',
  examples: ['urn:mrn:signalk:uuid:b7590868-1d62-47d9-989c-32321b349fb9']
})

/**
 * MMSI — Maritime Mobile Service Identity (vessel).
 * @see specification/schemas/definitions.json#/definitions/mmsi
 */
export const MmsiSchema = Type.String({
  $id: 'Mmsi',
  pattern: '^[2-7][0-9]{8}$',
  description:
    'Maritime Mobile Service Identity (MMSI). 9 digits, first digit 2-7.',
  examples: ['503123456']
})

// ---------------------------------------------------------------------------
// Position
// The single source of truth for geographic position across all APIs.
// @see specification/schemas/definitions.json#/definitions/position
// ---------------------------------------------------------------------------

/**
 * Geographic position with latitude, longitude, and optional altitude.
 *
 * This is THE canonical Position schema — all APIs (Course, Resources,
 * Weather, Notifications, etc.) reference this single definition.
 * The TypeScript `Position` type is derived from this schema.
 */
export const PositionSchema = Type.Object(
  {
    latitude: Type.Number({
      minimum: -90,
      maximum: 90,
      description: 'Latitude',
      units: 'deg',
      examples: [52.0987654]
    }),
    longitude: Type.Number({
      minimum: -180,
      maximum: 180,
      description: 'Longitude',
      units: 'deg',
      examples: [4.98765245]
    }),
    altitude: Type.Optional(
      Type.Number({
        description: 'Altitude',
        units: 'm',
        examples: [12.5]
      })
    )
  },
  {
    $id: 'SignalKPosition',
    description: 'The position in 3 dimensions'
  }
)

/** Geographic position type — derived from PositionSchema */
export type Position = Static<typeof PositionSchema>

/**
 * Relative position origin — a circle defined by radius and center position.
 * Used for subscription context filtering.
 */
export const RelativePositionOriginSchema = Type.Object(
  {
    radius: Type.Number({
      minimum: 0,
      description: 'Radius in meters',
      units: 'm'
    }),
    position: PositionSchema
  },
  {
    $id: 'RelativePositionOrigin',
    description: 'A circle defined by radius and center position'
  }
)

/** Relative position origin type — derived from schema */
export type RelativePositionOrigin = Static<typeof RelativePositionOriginSchema>

// ---------------------------------------------------------------------------
// GeoJSON schemas
// Used by Resources API for routes, waypoints, regions, charts.
// @see specification/schemas/definitions.json#/definitions/waypoint
// ---------------------------------------------------------------------------

/** GeoJSON Point geometry object (type + coordinates) */
export const GeoJsonPointGeometrySchema = Type.Object(
  {
    type: Type.Literal('Point'),
    coordinates: Type.Tuple([
      Type.Number({ description: 'Longitude' }),
      Type.Number({ description: 'Latitude' })
    ])
  },
  {
    $id: 'GeoJsonPointGeometry',
    description: 'GeoJSON Point geometry — [longitude, latitude]'
  }
)
export type GeoJsonPointGeometry = Static<typeof GeoJsonPointGeometrySchema>

/** GeoJSON LineString geometry object (type + coordinates) */
export const GeoJsonLinestringGeometrySchema = Type.Object(
  {
    type: Type.Literal('LineString'),
    coordinates: Type.Array(
      Type.Tuple([
        Type.Number({ description: 'Longitude' }),
        Type.Number({ description: 'Latitude' })
      ]),
      { minItems: 2 }
    )
  },
  {
    $id: 'GeoJsonLineStringGeometry',
    description: 'GeoJSON LineString geometry — array of [lon, lat] pairs'
  }
)
export type GeoJsonLinestringGeometry = Static<
  typeof GeoJsonLinestringGeometrySchema
>

/** GeoJSON Polygon geometry object (type + coordinates) */
export const GeoJsonPolygonGeometrySchema = Type.Object(
  {
    type: Type.Literal('Polygon'),
    coordinates: Type.Array(
      Type.Array(
        Type.Tuple([
          Type.Number({ description: 'Longitude' }),
          Type.Number({ description: 'Latitude' })
        ]),
        { minItems: 4 }
      )
    )
  },
  {
    $id: 'GeoJsonPolygonGeometry',
    description: 'GeoJSON Polygon geometry — array of linear rings'
  }
)
export type GeoJsonPolygonGeometry = Static<typeof GeoJsonPolygonGeometrySchema>

/** GeoJSON MultiPolygon geometry object (type + coordinates) */
export const GeoJsonMultiPolygonGeometrySchema = Type.Object(
  {
    type: Type.Literal('MultiPolygon'),
    coordinates: Type.Array(
      Type.Array(
        Type.Array(
          Type.Tuple([
            Type.Number({ description: 'Longitude' }),
            Type.Number({ description: 'Latitude' })
          ]),
          { minItems: 4 }
        )
      )
    )
  },
  {
    $id: 'GeoJsonMultiPolygonGeometry',
    description: 'GeoJSON MultiPolygon geometry'
  }
)
export type GeoJsonMultiPolygonGeometry = Static<
  typeof GeoJsonMultiPolygonGeometrySchema
>

// ---------------------------------------------------------------------------
// Common API response schemas
// Shared across all v2 API endpoints.
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
