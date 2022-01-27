import { Position } from '../../types'

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
  position?: Position
  feature: {
    type: 'Feature'
    geometry: {
      type: 'Point'
      coords: GeoJsonPoint
    }
    properties?: object
    id?: string
  }
}

export interface Note {
  title?: string
  description?: string
  region?: string
  position?: Position
  geohash?: string
  mimeType?: string
  url?: string
}

export interface Region {
  geohash?: string
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

type GeoJsonPoint = [number, number, number?]
type GeoJsonLinestring = GeoJsonPoint[]
type GeoJsonPolygon = GeoJsonLinestring[]
type GeoJsonMultiPolygon = GeoJsonPolygon[]

interface Polygon {
  type: 'Feature'
  geometry: {
    type: 'Polygon'
    coordinates: GeoJsonPolygon
  }
  properties?: object
  id?: string
}

interface MultiPolygon {
  type: 'Feature'
  geometry: {
    type: 'MultiPolygon'
    coordinates: GeoJsonMultiPolygon
  }
  properties?: object
  id?: string
}
