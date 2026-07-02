/* eslint-disable @typescript-eslint/no-explicit-any */
// utility library functions

import {
  getCenterOfBounds,
  isPointInPolygon,
  isPointWithinRadius
} from 'geolib'
import { GeolibInputCoordinates } from 'geolib/es/types'
import ngeohash from 'ngeohash'


export const passFilter = (resource: any, type: string, params: any) => {
  let ok = true
  if (params.position && typeof params.distance !== 'undefined') {
    if(type === 'notes' && resource.position) {
      ok = isPointWithinRadius(resource.position, params.position, params.distance)
    } else if( resource.feature?.geometry?.type === 'Point') {
      ok = isPointWithinRadius(
        resource.feature.geometry.coordinates, 
        params.position, 
        params.distance
      );
    } else if( resource.feature?.geometry?.type === 'LineString') {
      ok = isLineStringWithInRadius(
        resource.feature.geometry.coordinates,
        params.position, 
        params.distance
      )
    } else if( ['MultiLineString', 'Polygon'].includes(resource.feature?.geometry?.type)) {
      ok = isPolygonWithInRadius(
        resource.feature.geometry.coordinates,
        params.position, 
        params.distance
      )
    } else if( resource.feature?.geometry?.type === 'MultiPolygon') {
      ok = isMultiPolygonWithInRadius(
        resource.feature.geometry.coordinates,
        params.position, 
        params.distance
      )
    }
  }

  if (params.href) {
    if (typeof resource.href === 'undefined' || !resource.href) {
      ok = false
    } else {
      const ha = resource.href.split('/')
      const hType: string =
        ha.length === 1
          ? 'regions'
          : ha.length > 2
            ? ha[ha.length - 2]
            : 'regions'
      const hId = ha.length === 1 ? ha[0] : ha[ha.length - 1]

      const pa = params.href.split('/')
      const pType: string =
        pa.length === 1
          ? 'regions'
          : pa.length > 2
            ? pa[pa.length - 2]
            : 'regions'
      const pId = pa.length === 1 ? pa[0] : pa[pa.length - 1]

      ok = ok && hType === pType && hId === pId
    }
  }

  if (params.group) {
    if (typeof resource.group === 'undefined') {
      ok = ok && false
    } else {
      ok = ok && resource.group === params.group
    }
  }

  if (params.geobounds) {
    ok = ok && isInBounds(resource, type, params.geobounds)
  }
  return ok
}

export const processParameters = (params: any) => {
  if (typeof params.limit !== 'undefined') {
    params.limit = checkForNumber(params.limit)
  }

  if (typeof params.bbox !== 'undefined') {
    params.bbox = checkForNumberArray(params.bbox)
    params.geobounds = toPolygon(params.bbox)
    if (params.geobounds.length !== 5) {
      params.geobounds = null
      throw new Error(
        `Bounding box contains invalid coordinate value (${params.bbox})`
      )
    }
  } 

  if (typeof params.distance !== 'undefined') {
    params.distance = checkForNumber(params.distance)
  }

  if (params.position) {
    params.position = checkForNumberArray(params.position)
  }
  return params
}

const isInBounds = (
  resource: any,
  type: string,
  bounds: GeolibInputCoordinates[]
): boolean => {
  let ok = false
  if (type === 'notes') {
    if(resource.position) {
      ok = isPointInPolygon(resource.position, bounds)
    } else if (resource.geohash) {
      const bar = ngeohash.decode_bbox(resource.geohash)
      const p = toPolygon([bar[1], bar[0], bar[3], bar[2]])
      const center = getCenterOfBounds(p)
      ok = isPointInPolygon(center, bounds)
    }
  } else if( resource.feature?.geometry?.type === 'Point') {
    ok = isPointInPolygon(resource.feature?.geometry?.coordinates, bounds)
  } else if (resource.feature?.geometry?.type === 'LineString') {
    ok = isLineStringWithInBounds(resource.feature.geometry.coordinates, bounds)
  } else if( ['MultiLineString', 'Polygon'].includes(resource.feature?.geometry?.type)) {
    ok = isPolygonWithInBounds(resource.feature.geometry.coordinates, bounds)
  } else if( resource.feature?.geometry?.type === 'MultiPolygon') {
    ok = isMultiPolygonWithInBounds(resource.feature.geometry.coordinates, bounds)
  }
  return ok
}


const isLineStringWithInRadius = (
  coords: Array<GeolibInputCoordinates>, 
  center: GeolibInputCoordinates,
  distance: number
): boolean => {
  let res = false
  for(let i = 0; i < coords.length; ++i) {
    if( 
      isPointWithinRadius(
        coords[i], 
        center, 
        distance
      )
    ) {
      res = true
      break
    }
  }
  return res
}

const isLineStringWithInBounds = (
  coords: Array<GeolibInputCoordinates>, 
  bounds: Array<GeolibInputCoordinates>
): boolean => {
  let res = false
  for(let i = 0; i < coords.length; ++i) {
    if(
      isPointInPolygon(coords[i], bounds)
    ) {
      res = true
      break
    }
  }
  return res
}

const isPolygonWithInRadius = (
  coords: Array<GeolibInputCoordinates[]>, 
  center: GeolibInputCoordinates,
  distance: number
): boolean => {
  let res = false
  for (let lineNo = 0; lineNo < coords.length; ++lineNo) {
    if(
      isLineStringWithInRadius(
        coords[lineNo],
        center, 
        distance
      )
    ) {
      res = true
      break
    }
  }
  return res
}

const isPolygonWithInBounds = (
  coords: Array<GeolibInputCoordinates[]>, 
  bounds: Array<GeolibInputCoordinates>,
): boolean => {
  let res = false
  for (let lineNo = 0; lineNo < coords.length; ++lineNo) {
    if(
      isLineStringWithInBounds(
        coords[lineNo],
        bounds
      )
    ) {
      res = true
      break
    }
  }
  return res
}

const isMultiPolygonWithInRadius = (
  coords: Array<Array<GeolibInputCoordinates[]>>, 
  center: GeolibInputCoordinates,
  distance: number
): boolean => {
  let res = false
  for (let polygonNo = 0; polygonNo < coords.length; ++polygonNo) {
    const polygonCoords = coords[polygonNo]
    if(
      isPolygonWithInRadius(
        polygonCoords,
        center,
        distance
      )
    ) {
      res = true
      break
    }
  }
  return res
}

const isMultiPolygonWithInBounds = (
  coords: Array<Array<GeolibInputCoordinates[]>>, 
  bounds: Array<GeolibInputCoordinates>
): boolean => {
  let res = false
  for (let polygonNo = 0; polygonNo < coords.length; ++polygonNo) {
    const polygonCoords = coords[polygonNo]
    if(
      isPolygonWithInBounds(
        polygonCoords,
        bounds
      )
    ) {
      res = true
      break
    }
  }
  return res
}

const checkForNumber = (value: number): number => {
  if (!Number.isFinite(Number(value))) {
    throw new Error(`Supplied value is not a number! (${value})`)
  } else {
    return Number(value)
  }
}

const checkForNumberArray = (value: number[]): Array<number> => {
  if (!Array.isArray(value)) {
    throw new Error(`Supplied value is not valid! (Array<number>) (${value})`)
  } else {
    value = value.map( i => Number(i) )
    value.forEach((i: number) => {
      if (!Number.isFinite(i)) {
        throw new Error(
          `Supplied value is not a number array! (Array<number>) (${value})`
        )
      }
    })
    return value
  }
}

const toPolygon = (bbox: number[]): GeolibInputCoordinates[] => {
  const polygon: GeolibInputCoordinates[] = []
  if (bbox.length === 4) {
    polygon.push([bbox[0], bbox[1]])
    polygon.push([bbox[0], bbox[3]])
    polygon.push([bbox[2], bbox[3]])
    polygon.push([bbox[2], bbox[1]])
    polygon.push([bbox[0], bbox[1]])
  }
  return polygon
}
