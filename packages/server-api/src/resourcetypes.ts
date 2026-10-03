import { Position } from '.'

/** A resource returned from the API will always have these fields
 * @hidden
 */
export type Resource<T> = T & {
  timestamp: string
  $source: string
}

/** @category  Resources API */
export interface Route {
  name?: string
  description?: string
  distance?: number
  start?: string
  end?: string
  feature: {
    type: 'Feature'
    geometry: {
      type: 'LineString'
      coordinates: GeoJsonLinestring
    }
    properties?: object
    id?: string
  }
}

/** @category  Resources API */
export interface Waypoint {
  name?: string
  description?: string
  type?: string
  feature: {
    type: 'Feature'
    geometry: {
      type: 'Point'
      coordinates: GeoJsonPoint
    }
    properties?: object
    id?: string
  }
}

/** @category  Resources API */
export interface Note {
  name?: string
  description?: string
  href?: string
  position?: Position
  geohash?: string
  mimeType?: string
  url?: string
}

/** @category  Resources API */
export interface Region {
  name?: string
  description?: string
  feature: Polygon | MultiPolygon
}

/** @category  Resources API */
export interface Chart {
  name: string
  identifier: string
  description?: string
  tilemapUrl?: string
  chartUrl?: string
  geohash?: string
  region?: string
  scale?: number
  chartLayers?: string[]
  bounds?: [[number, number], [number, number]]
  chartFormat: string
}

/** A Signal K path observation carried in a log entry, in the flattened delta
 * pathvalue form used by delta updates and the History API responses: values
 * are Signal K SI and follow the specification's value shapes. Beyond `path`
 * and `value` the pathvalue may carry the delta value members `$source` and
 * `timestamp` — both are data about where and when the value was sampled and
 * are preserved verbatim. The same path may appear more than once, each
 * pathvalue with its own `$source`.
 * @category  Resources API */
export interface LogEntryTelemetryValue {
  path: string
  value: unknown
  $source?: string
  timestamp?: string
  [key: string]: unknown
}

/** A log entry resource — a line in the vessel's logbook, time-anchored by
 * `datetime` and carrying an optional snapshot of Signal K paths observed at
 * that moment. Open content model: consumers must ignore unknown fields and
 * providers must preserve them on write; extension fields should be
 * namespaced by the writing application (e.g. `x-stylusapp-ink`).
 * @category  Resources API */
export interface LogEntry {
  /** Entry UUID. Equals the resource id; the resource id is canonical. */
  id?: string
  /** RFC 3339 UTC datetime of the entry, the chronological sort key.
   * Defaults to now on create and is preserved on replace. */
  datetime?: string
  /** The log line itself. */
  text: string
  /** Snapshot of Signal K paths observed at the entry datetime. */
  telemetry?: LogEntryTelemetryValue[]
  /** true marks the end of a voyage — trip end, never day end. */
  end?: boolean
  /** Crew member the line is attributed to. Free text, not an audit
   * identity: delegation is a feature. */
  author?: string
  /** How the line came to be. Open enumeration; the recommended vocabulary
   * is `manual` (typed in a UI), `auto` (trigger/hourly/notification) and
   * `agent` (machine writing on behalf of a human). */
  origin?: string
  /** Entry category. Open enumeration; the recommended vocabulary is
   * `navigation`, `engine`, `radio` and `maintenance`. */
  category?: string
  /** Reserved for future revisions of the entry schema; absent = 1. Other
   * writers must not use the name for anything else. */
  schemaVersion?: number
  [key: string]: unknown
}

/** @hidden */
export type GeoJsonPoint = [number, number, number?]
/** @hidden */
export type GeoJsonLinestring = GeoJsonPoint[]
/** @hidden */
export type GeoJsonPolygon = GeoJsonLinestring[]
/** @hidden */
export type GeoJsonMultiPolygon = GeoJsonPolygon[]

/** @hidden */
export interface Polygon {
  type: 'Feature'
  geometry: {
    type: 'Polygon'
    coordinates: GeoJsonPolygon
  }
  properties?: object
  id?: string
}

/** @hidden */
export interface MultiPolygon {
  type: 'Feature'
  geometry: {
    type: 'MultiPolygon'
    coordinates: GeoJsonMultiPolygon
  }
  properties?: object
  id?: string
}
