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
