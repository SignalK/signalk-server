import { Position } from './index.js'

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

export interface Waypoint {
  name?: string
  description?: string
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

export interface Note {
  name?: string
  description?: string
  href?: string
  position?: Position
  geohash?: string
  mimeType?: string
  url?: string
}

export interface Region {
  name?: string
  description?: string
  feature: Polygon | MultiPolygon
}

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
