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

/**
 * Signal K resource href — generic pointer to any resource type by UUID.
 */
export const SignalKHrefSchema = Type.String({
  $id: 'SignalKHref',
  pattern: `^/resources/(\\w*)/${SignalKUuidPattern}$`,
  description:
    'Reference to a related resource. A pointer to the resource UUID.'
})

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

/** Log entry telemetry pathvalue — a flattened delta pathvalue observed at
 * the entry datetime. Unknown members are preserved verbatim. */
export const LogEntryTelemetryValueSchema = Type.Object(
  {
    path: Type.String({ description: 'Signal K path of the observed value' }),
    value: Type.Unknown({
      description:
        'Value of the path, in Signal K SI units and the specification value shapes'
    }),
    $source: Type.Optional(
      Type.String({
        description: 'Source the value was sampled from (a sourceRef)'
      })
    ),
    timestamp: Type.Optional(
      Type.String({
        format: 'date-time',
        description: 'When the value was sampled'
      })
    )
  },
  {
    $id: 'LogEntryTelemetryValue',
    additionalProperties: true,
    description:
      'A flattened delta pathvalue observed at the entry datetime. The same path may appear more than once, each pathvalue with its own $source.'
  }
)
export type LogEntryTelemetryValueType = Static<
  typeof LogEntryTelemetryValueSchema
>

/** Log entry resource — a line in the vessel's logbook, time-anchored by
 * `datetime` and carrying an optional snapshot of Signal K paths observed at
 * that moment.
 *
 * Open content model: consumers must ignore unknown fields and providers must
 * preserve them on write; top-level extension fields should be prefixed with
 * the writing application's namespace (e.g. `x-stylusapp-ink`), and telemetry
 * extension paths should use a namespaced root segment. `origin` and
 * `category` are open enumerations: the listed values are the recommended
 * vocabulary, unknown values must not be rejected. */
export const LogEntrySchema = Type.Object(
  {
    id: Type.Optional(
      Type.String({
        pattern: `^${SignalKUuidPattern}$`,
        description:
          'Entry UUID. Equals the resource id; the resource id is canonical.'
      })
    ),
    datetime: Type.Optional(
      Type.String({
        format: 'date-time',
        description:
          'RFC 3339 UTC datetime of the entry, the chronological sort key. Defaults to now on create and is preserved on replace.'
      })
    ),
    text: Type.String({ description: 'The log line itself' }),
    telemetry: Type.Optional(
      Type.Array(LogEntryTelemetryValueSchema, {
        description:
          'Snapshot of Signal K paths observed at the entry datetime: vessel state, engines, radio and crew context alike. Absent when nothing was captured.'
      })
    ),
    end: Type.Optional(
      Type.Boolean({
        description: 'true marks the end of a voyage — trip end, never day end'
      })
    ),
    author: Type.Optional(
      Type.String({
        description:
          'Crew member the line is attributed to. Free text, not an audit identity: delegation is a feature.'
      })
    ),
    origin: Type.Optional(
      Type.String({
        description:
          'How the line came to be. Open enumeration; the recommended vocabulary is manual (typed in a UI), auto (trigger/hourly/notification) and agent (machine writing on behalf of a human).',
        examples: ['manual', 'auto', 'agent']
      })
    ),
    category: Type.Optional(
      Type.String({
        description:
          'Entry category. Open enumeration; the recommended vocabulary is navigation, engine, radio and maintenance.',
        examples: ['navigation', 'engine', 'radio', 'maintenance']
      })
    ),
    schemaVersion: Type.Optional(
      Type.Integer({
        minimum: 1,
        description:
          'Reserved for future revisions of the entry schema; absent = 1. Other writers must not use the name for anything else.'
      })
    )
  },
  {
    $id: 'LogEntry',
    additionalProperties: true,
    description: 'A log entry resource'
  }
)
export type LogEntryResource = Static<typeof LogEntrySchema>

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
