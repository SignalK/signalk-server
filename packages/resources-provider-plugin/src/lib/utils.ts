/* eslint-disable @typescript-eslint/no-explicit-any */
// utility library functions

import {
  getCenterOfBounds,
  isPointInPolygon,
  isPointWithinRadius
} from 'geolib'
import { GeolibInputCoordinates } from 'geolib/es/types'
import ngeohash from 'ngeohash'

/** 
 * Filter the supplied Resource entry
 * @param res - Resource entry
 * @param type - Resource type
 * @params params - query string parameters
 * @returns: true if entry should be included in results 
 **/
export const passFilter = (res: any, type: string, params: any) => {

  let ok = true
  if (params.position && params.distance) {
    if(type ==='notes' && res.position) {
      ok = ok && isPointWithinRadius(res.position, params.position, params.distance)
    } else if( res.feature?.geometry?.type === 'Point') {
      ok = ok && isPointWithinRadius(
        res.feature.geometry.coordinates, 
        params.position, 
        params.distance
      );
    } else if( res.feature?.geometry?.type === 'LineString') {
      ok = ok && isLineStringWithInRadius(
        res.feature.geometry.coordinates,
        params.position, 
        params.distance
      )
    } else if( ['MultiLineString', 'Polygon'].includes(res.feature?.geometry?.type)) {
      ok = ok && isPolygonWithInRadius(
        res.feature.geometry.coordinates,
        params.position, 
        params.distance
      )
    } else if( res.feature?.geometry?.type === 'MultiPolygon') {
      ok = ok && isMultiPolygonWithInRadius(
        res.feature.geometry.coordinates,
        params.position, 
        params.distance
      )
    }
  }

  if (params.href) {
    if (typeof res.href === 'undefined' || !res.href) {
      ok = false
    } else {
      const ha = res.href.split('/')
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
    if (typeof res.group === 'undefined') {
      ok = ok && false
    } else {
      ok = ok && res.group === params.group
    }
  }

  if (params.geobounds) {
    ok = ok && isInBounds(res, type, params.geobounds)
  }
  return ok
}

/**
 * Parse query parameters
 * @param params - object containing query values
 * @returns Transformed params object
 */
export const processParameters = (params: any) => {
  if (typeof params.limit !== 'undefined') {
    params.limit = checkForNumber(params.limit)
  }

  if (typeof params.bbox !== 'undefined') {
    params.bbox = checkForNumberArray(params.bbox)
    // generate geobounds polygon from bbox
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

/**
 * check geometry is in bounds
 * @param val - Resource entry
 * @param type - Resource type
 * @param polygon - Area to test that the resource is within
 * @returns true when resource contains coordinates that are within the polygon.
 */
const isInBounds = (
  val: any,
  type: string,
  polygon: GeolibInputCoordinates[]
): boolean => {
  let ok = false
  switch (type) {
    case 'notes':
    case 'waypoints':
      if (val?.feature?.geometry?.coordinates) {
        ok = isPointInPolygon(val?.feature?.geometry?.coordinates, polygon)
      }
      if (val.position) {
        ok = isPointInPolygon(val.position, polygon)
      }
      if (val.geohash) {
        const bar = ngeohash.decode_bbox(val.geohash)
        const bounds = toPolygon([bar[1], bar[0], bar[3], bar[2]])
        const center = getCenterOfBounds(bounds)
        ok = isPointInPolygon(center, polygon)
      }
      break
    case 'routes':
      if (val.feature.geometry.coordinates) {
        val.feature.geometry.coordinates.forEach((pt: any) => {
          ok = ok || isPointInPolygon(pt, polygon)
        })
      }
      break
    case 'regions':
      if (
        val.feature.geometry.coordinates &&
        val.feature.geometry.coordinates.length > 0
      ) {
        if (val.feature.geometry.type === 'Polygon') {
          val.feature.geometry.coordinates.forEach((ls: any) => {
            ls.forEach((pt: any) => {
              ok = ok || isPointInPolygon(pt, polygon)
            })
          })
        } else if (val.feature.geometry.type === 'MultiPolygon') {
          val.feature.geometry.coordinates.forEach((polygon: any) => {
            polygon.forEach((ls: any) => {
              ls.forEach((pt: any) => {
                ok = ok || isPointInPolygon(pt, polygon)
              })
            })
          })
        }
      }
      break
  }
  return ok
}

/**
 * Test if any LineString coordinates are within the distance from the center point
 * @param coords LineString coordinates
 * @param center 
 * @param distance 
 * @returns true if any coordinate is within the radius
 */
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

/**
 * Test if any Polygon coordinates are within the distance from the center point
 * @param coords Polygon coordinates
 * @param center 
 * @param radius 
 * @returns true if any coordinate is within the radius
 */
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

/**
 * Test if any MultiPolygon coordinates are within the distance from the center point
 * @param coords MultiPolygon coordinates
 * @param center 
 * @param radius 
 * @returns true if any coordinate is within the radius
 */
const isMultiPolygonWithInRadius = (
  coords: Array<Array<GeolibInputCoordinates[]>>, 
  center: GeolibInputCoordinates,
  distance: number
): boolean => {
  let res = false
  for (let polygonNo = 0; polygonNo < coords.length; ++polygonNo) {
    const polygon = coords[polygonNo]
    for (let lineNo = 0; lineNo < polygon.length; ++lineNo) {
      if(
        isLineStringWithInRadius(
          coords[polygonNo][lineNo],
          center,
          distance
        )
      ) {
        res = true
        break
      }
    }
    if (res) {
      break
    }
  }
  return res
}

/**
 * Test for numeric value
 * @param value - Value to test 
 * @returns The supplied value if it is numeric.
 */
const checkForNumber = (value: number): number => {
  if (!Number.isFinite(Number(value))) {
    throw new Error(`Supplied value is not a number! (${value})`)
  } else {
    return Number(value)
  }
}

/**
 * Test value for an array of numbers
 * @param value - Value to test 
 * @returns The supplied value if it contains an array of numbers
 */
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

/**
 * Convert bbox string to array of points (polygon)
 * @param bbox 
 * @returns 
 */
const toPolygon = (bbox: number[]): GeolibInputCoordinates[] => {
  const polygon: GeolibInputCoordinates[] = []
  if (bbox.length === 4) {
    polygon.push([bbox[0], bbox[1]])
    polygon.push([bbox[0], bbox[3]])
    polygon.push([bbox[2], bbox[3]])
    polygon.push([bbox[2], bbox[1]])
    polygon.push([bbox[0], bbox[1]])
  } else {
    console.error(
      `*** Error: Bounding box contains invalid coordinate value (${bbox}) ***`
    )
  }
  return polygon
}
