/**
 * TypeBox Schema Definitions for the Signal K Resources API
 *
 * Covers routes, waypoints, regions, notes, and charts.
 */

import { Type, type Static } from '@sinclair/typebox'
import {
  PositionSchema,
  SignalKUuidPattern,
  GeoJsonPointGeometrySchema,
  GeoJsonLinestringGeometrySchema,
  GeoJsonPolygonGeometrySchema,
  GeoJsonMultiPolygonGeometrySchema
} from './shared-schemas'

// ---------------------------------------------------------------------------
// Resource href
// ---------------------------------------------------------------------------

/**
 * Signal K resource href — generic pointer to any resource type by UUID.
 */
export const SignalKHrefSchema = Type.String({
  $id: 'SignalKHref',
  pattern: `^/resources/(\\w*)/${SignalKUuidPattern}$`,
  description:
    'Reference to a related resource. A pointer to the resource UUID.'
})

// ---------------------------------------------------------------------------
// Common resource attributes
// ---------------------------------------------------------------------------

/** Href attribute — used to link a note to another resource */
export const HrefAttributeSchema = Type.Object(
  {
    href: SignalKHrefSchema
  },
  { $id: 'HrefAttribute' }
)

/** Position attribute — used to give a note a geographic position */
export const PositionAttributeSchema = Type.Object(
  {
    position: PositionSchema
  },
  { $id: 'ResourcePositionAttribute', description: 'Resource location.' }
)

// ---------------------------------------------------------------------------
// Base response model — timestamp and $source metadata
// ---------------------------------------------------------------------------

export const BaseResponseModelSchema = Type.Object(
  {
    timestamp: Type.String({
      description: 'ISO 8601 timestamp of when the resource was last modified',
      examples: ['2024-01-15T12:30:00.000Z']
    }),
    $source: Type.String({
      description:
        'Dot-separated identifier of the source that provided this resource (e.g. the resource provider plugin)',
      examples: ['resources-provider']
    })
  },
  {
    $id: 'BaseResponseModel',
    description: 'Metadata fields included in resource responses'
  }
)

// ---------------------------------------------------------------------------
// Route
// ---------------------------------------------------------------------------

/** Route point metadata */
export const RoutePointMetaSchema = Type.Object(
  {
    name: Type.String({ description: 'Point name / identifier' })
  },
  {
    $id: 'RoutePointMeta',
    additionalProperties: true
  }
)

/** Route resource */
export const RouteSchema = Type.Object(
  {
    name: Type.Optional(Type.String({ description: "Route's common name" })),
    description: Type.Optional(
      Type.String({ description: 'A description of the route' })
    ),
    distance: Type.Optional(
      Type.Number({
        description: 'Total distance from start to end in meters',
        units: 'm',
        minimum: 0
      })
    ),
    feature: Type.Object({
      geometry: GeoJsonLinestringGeometrySchema,
      properties: Type.Optional(
        Type.Object(
          {
            coordinatesMeta: Type.Optional(
              Type.Array(
                Type.Union([RoutePointMetaSchema, HrefAttributeSchema]),
                {
                  description: 'Metadata for each point within the route'
                }
              )
            )
          },
          { additionalProperties: true }
        )
      )
    })
  },
  {
    $id: 'Route',
    description: 'A route resource'
  }
)
export type RouteResource = Static<typeof RouteSchema>

// ---------------------------------------------------------------------------
// Waypoint
// ---------------------------------------------------------------------------

/** Waypoint resource */
export const WaypointSchema = Type.Object(
  {
    name: Type.Optional(Type.String({ description: "Waypoint's common name" })),
    description: Type.Optional(
      Type.String({ description: 'A description of the waypoint' })
    ),
    type: Type.Optional(
      Type.String({
        description: 'The type of point (e.g. Waypoint, PoI, Race Mark, etc)'
      })
    ),
    feature: Type.Object({
      geometry: GeoJsonPointGeometrySchema,
      properties: Type.Optional(
        Type.Object(
          {},
          {
            additionalProperties: true,
            description: 'Additional feature properties'
          }
        )
      )
    })
  },
  {
    $id: 'Waypoint',
    description: 'A waypoint resource'
  }
)
export type WaypointResource = Static<typeof WaypointSchema>

// ---------------------------------------------------------------------------
// Region
// ---------------------------------------------------------------------------

/** Region resource */
export const RegionSchema = Type.Object(
  {
    name: Type.Optional(Type.String({ description: "Region's common name" })),
    description: Type.Optional(
      Type.String({ description: 'A description of the region' })
    ),
    feature: Type.Object({
      geometry: Type.Union([
        GeoJsonPolygonGeometrySchema,
        GeoJsonMultiPolygonGeometrySchema
      ]),
      properties: Type.Optional(
        Type.Object(
          {},
          {
            additionalProperties: true,
            description: 'Additional feature properties'
          }
        )
      )
    })
  },
  {
    $id: 'Region',
    description: 'A region resource'
  }
)
export type RegionResource = Static<typeof RegionSchema>

// ---------------------------------------------------------------------------
// Note
// ---------------------------------------------------------------------------

/** Note base model */
export const NoteBaseModelSchema = Type.Object(
  {
    title: Type.Optional(Type.String({ description: 'Title of note' })),
    description: Type.Optional(
      Type.String({ description: 'Text describing note' })
    ),
    mimeType: Type.Optional(
      Type.String({
        description: 'MIME type of the note content',
        examples: ['text/plain', 'text/html', 'application/pdf']
      })
    ),
    url: Type.Optional(Type.String({ description: 'Location of the note' })),
    properties: Type.Optional(
      Type.Object(
        {},
        {
          additionalProperties: true,
          description: 'Additional user defined note properties'
        }
      )
    )
  },
  { $id: 'NoteBaseModel' }
)

/** Note resource — a note linked to either an href or a position */
export const NoteSchema = Type.Intersect(
  [
    NoteBaseModelSchema,
    Type.Partial(
      Type.Object({
        href: SignalKHrefSchema,
        position: PositionSchema
      })
    )
  ],
  {
    $id: 'Note',
    description: 'A note resource — linked to either an href or a position'
  }
)
export type NoteResource = Static<typeof NoteSchema>

// ---------------------------------------------------------------------------
// Chart
// ---------------------------------------------------------------------------

/** Tile layer source */
export const TileLayerSourceSchema = Type.Object(
  {
    type: Type.Literal('tilelayer'),
    bounds: Type.Optional(
      Type.Array(Type.Number(), {
        minItems: 4,
        maxItems: 4,
        description:
          'Geographic bounding box in [west, south, east, north] order (longitude, latitude, longitude, latitude) in degrees'
      })
    ),
    format: Type.Optional(
      Type.Union(
        [
          Type.Literal('jpg'),
          Type.Literal('pbf'),
          Type.Literal('png'),
          Type.Literal('webp')
        ],
        { description: 'Tile image format' }
      )
    ),
    maxzoom: Type.Optional(
      Type.Number({
        minimum: 0,
        maximum: 30,
        default: 0,
        description: 'Maximum zoom level available'
      })
    ),
    minzoom: Type.Optional(
      Type.Number({
        minimum: 0,
        maximum: 30,
        default: 0,
        description: 'Minimum zoom level available'
      })
    ),
    scale: Type.Optional(
      Type.Number({
        minimum: 1,
        default: 250000,
        description: 'Chart scale denominator (e.g. 250000 for 1:250000)'
      })
    )
  },
  {
    $id: 'TileLayerSource',
    description: 'A tile layer chart source (XYZ/TMS tiles)'
  }
)

/** Map server source */
export const MapServerSourceSchema = Type.Object(
  {
    type: Type.Union([
      Type.Literal('tileJSON'),
      Type.Literal('WMS'),
      Type.Literal('WMTS'),
      Type.Literal('mapstyleJSON'),
      Type.Literal('S-57')
    ])
  },
  {
    $id: 'MapServerSource',
    description:
      'A map server chart source (WMS, WMTS, tileJSON, mapstyleJSON, or S-57)'
  }
)

/** Chart resource */
export const ChartSchema = Type.Intersect(
  [
    Type.Object({
      identifier: Type.Optional(
        Type.String({ description: 'Chart identifier / number' })
      ),
      name: Type.Optional(Type.String({ description: 'Chart name' })),
      description: Type.Optional(
        Type.String({ description: 'A text description of the chart' })
      ),
      url: Type.Optional(
        Type.String({ description: 'URL to tile / map source' })
      ),
      layers: Type.Optional(
        Type.Array(Type.String(), {
          description: 'List of chart layer ids'
        })
      )
    }),
    Type.Union([TileLayerSourceSchema, MapServerSourceSchema])
  ],
  {
    $id: 'Chart',
    description: 'A chart resource'
  }
)
export type ChartResource = Static<typeof ChartSchema>

// ---------------------------------------------------------------------------
// Resources API action responses
// ---------------------------------------------------------------------------

/**
 * 200 success response with resource ID.
 */
export const ResourceActionOkResponseSchema = Type.Object(
  {
    state: Type.Literal('COMPLETED'),
    statusCode: Type.Literal(200),
    id: Type.String({
      pattern: `${SignalKUuidPattern}$`,
      description: 'Resource UUID'
    })
  },
  { $id: 'ResourceActionOkResponse' }
)

/**
 * 201 created response with resource ID.
 */
export const ResourceActionCreatedResponseSchema = Type.Object(
  {
    state: Type.Literal('COMPLETED'),
    statusCode: Type.Literal(201),
    id: Type.String({
      pattern: `${SignalKUuidPattern}$`,
      description: 'Resource UUID'
    })
  },
  { $id: 'ResourceActionCreatedResponse' }
)
