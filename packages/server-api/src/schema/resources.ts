import { Source } from './metadata'
import { Timestamp } from './values'

/** Resources to aid in navigation and operation of the vessel including waypoints, routes, notes, etc. */
export interface Resources {
  /**
   * A holder for charts, each named with their chart code
   */
  charts?: Record<string, Chart>

  /**
   * A holder for routes, each named with a UUID
   */
  routes?: Record<string, Route>

  /**
   * A holder for notes about regions, each named with a UUID. Notes might include navigation or cruising info, images, or anything
   */
  notes?: Record<string, Note>

  /**
   * A holder for regions, each named with UUID
   */
  regions?: Record<string, Region>

  /**
   * A holder for waypoints, each named with a UUID
   */
  waypoints?: Record<string, Waypoint>
}

export interface Chart {
  /**
   * Chart common name
   */
  name?: string
  /**
   * Chart number
   */
  identifier?: string
  /**
   * A description of the chart
   */
  description?: string
  /**
   * A url to the tilemap of the chart for use in TMS chartplotting apps
   */
  tilemapUrl?: string
  /**
   * Region related to note. A pointer to a region UUID. Alternative to geohash
   */
  region?: string
  /**
   * Position related to chart. Alternative to region
   */
  geohash?: string
  /**
   * A url to the chart file's storage location
   */
  chartUrl?: string
  /**
   * The scale of the chart, the larger number from 1:200000
   */
  scale?: number
  /**
   * If the chart format is WMS, the layers enabled for the chart.
   */
  chartLayers?: string[]
  /**
   * The bounds of the chart. An array containing the position of the upper left corner, and the lower right corner. Useful when the chart isn't inherently geo-referenced.
   */
  bounds?: [[number, number], [number, number]]
  /**
   * The format of the chart
   */
  chartFormat?:
  | 'gif'
  | 'geotiff'
  | 'kap'
  | 'png'
  | 'jpg'
  | 'kml'
  | 'wkt'
  | 'topojson'
  | 'geojson'
  | 'gpx'
  | 'tms'
  | 'wms'
  | 'S-57'
  | 'S-63'
  | 'svg'
  | 'other'
  timestamp?: Timestamp
  source?: Source
}

export interface Route {
  /**
   * Route's common name
   */
  name?: string
  /**
   * A description of the route
   */
  description?: string
  /**
   * Total distance from start to end
   */
  distance?: number
  /**
   * The waypoint UUID at the start of the route
   */
  start?: string
  /**
   * The waypoint UUID at the end of the route
   */
  end?: string
  feature?: Feature
  /**
   * RFC 3339 (UTC only without local offset) string representing date and time.
   */
  timestamp?: Timestamp
  source?: Source
}

/**
 * A Geo JSON feature object which describes the route between the waypoints
 */
export interface Feature {
  type?: 'Feature'
  geometry: LineString
  /**
   * Additional data of any type
   */
  properties?: Record<string, unknown>
  id?: string
}

export interface LineString {
  type?: 'LineString'
  /**
   * An array of two or more positions
   */
  coordinates: GeoJsonLinestring
}

/**
 * A note about a region, named with a UUID. Notes might include navigation or cruising info, images, or anything
 */
export interface Note {
  /**
   * Note's common name
   */
  title?: string
  /**
   * A textual description of the note
   */
  description?: string
  /**
   * Region related to note. A pointer to a region UUID. Alternative to position or geohash
   */
  region?: string
  position?: Position
  /**
   * Position related to note. Alternative to region or position
   */
  geohash?: string
  /**
   * MIME type of the note
   */
  mimeType?: string
  /**
   * Location of the note
   */
  url?: string
  /**
   * RFC 3339 (UTC only without local offset) string representing date and time.
   */
  timestamp?: Timestamp
  source?: Source
}

/**
 * A region of interest, each named with a UUID
 */
export interface Region {
  name?: string
  description?: string
  feature: Polygon | MultiPolygon

  /**
   * geohash of the approximate boundary of this region
   */
  geohash?: {
    [k: string]: unknown
  }

  /**
   * RFC 3339 (UTC only without local offset) string representing date and time.
   */
  timestamp?: Timestamp
  source?: Source
}

/**
 * A waypoint, named with a UUID
 */
export interface Waypoint {
  name?: string
  description?: string
  position?: Position
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

export interface Point {
  type?: 'Point'
  /**
   * A single position, in x,y order (Lon, Lat)
   *
   * @minItems 2
   */
  coordinates?: [number, number]
}

export interface Note {
  name?: string
  description?: string
  href?: string
  position?: Position
  geohash?: string
  mimeType?: string
  url?: string
}

export type GeoJsonPoint = [number, number, number?]
export type GeoJsonLinestring = GeoJsonPoint[]
export type GeoJsonPolygon = GeoJsonLinestring[]
export type GeoJsonMultiPolygon = GeoJsonPolygon[]

export interface Polygon {
  type: 'Feature'
  geometry: {
    type: 'Polygon'
    coordinates: GeoJsonPolygon
  }
  properties?: object
  id?: string
}

export interface MultiPolygon {
  type: 'Feature'
  geometry: {
    type: 'MultiPolygon'
    coordinates: GeoJsonMultiPolygon
  }
  properties?: object
  id?: string
}
export interface Position {
  latitude: number
  longitude: number
  altitude?: number
}
