import { Position, Region, Route, Waypoint } from '@signalk/server-api'
import { getDistance, isValidCoordinate } from 'geolib'

const coordsType = (coords: any[]) => {
  if (!Array.isArray(coords) || coords.length === 0) {
    throw new Error('Invalid coordinates!')
  }
  if (isValidCoordinate(coords[0])) {
    return 'Line'
  }
  const ca = coords[0]
  if (Array.isArray(ca) && ca.length !== 0) {
    if (isValidCoordinate(ca[0])) {
      return 'Polygon'
    } else if (Array.isArray(ca[0])) {
      return 'MultiPolygon'
    }
  }
  return ''
}

const processRegionCoords = (coords: any[], type: string) => {
  let result = []
  if (type === 'Line') {
    const tc = transformCoords(coords)
    if (tc) {
      result = [tc]
    } else {
      throw new Error('Invalid coordinates!')
    }
  }
  if (type === 'Polygon') {
    const polygon: any[] = []
    coords.forEach(line => {
      const tc = transformCoords(line)
      if (tc) {
        polygon.push(transformCoords(line))
      } else {
        throw new Error('Invalid coordinates!')
      }
    })
    result = polygon
  }
  if (type === 'MultiPolygon') {
    const multipolygon: any[] = []
    coords.forEach(polygon => {
      const pa: any[] = []
      polygon.forEach((line: Position[]) => {
        const tc = transformCoords(line)
        if (tc) {
          pa.push(transformCoords(line))
        } else {
          throw new Error('Invalid coordinates!')
        }
      })
      multipolygon.push(pa)
    })
    result = multipolygon
  }
  return result
}

const transformCoords = (coords: Position[]) => {
  coords.forEach((p: any) => {
    if (!isValidCoordinate(p)) {
      throw new Error('Invalid coordinate value!')
    }
  })
  // ensure polygon is closed
  if (
    coords[0].latitude !== coords[coords.length - 1].latitude &&
    coords[0].longitude !== coords[coords.length - 1].longitude
  ) {
    coords.push(coords[0])
  }
  return coords.map((p: Position) => {
    return [p.longitude, p.latitude]
  })
}

const calculateDistance = (points: Position[]) => {
  let result = 0
  for (let i = points.length - 2; i >= 0; i--) {
    result += getDistance(points[i], points[i + 1])
  }
  return result
}

const FROM_POST_MAPPERS: {
  [key: string]: (data: any) => any
} = {
  waypoints: (data: any) => {
    const { name, description, position, properties = {} } = data
    const result: Waypoint = {
      feature: {
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: [position.longitude, position.latitude]
        }
      }
    }
    name && (result.name = name)
    description && (result.description = description)
    result.feature.properties = properties
    return result
  },
  routes: (data: any) => {
    const { name, description, points, properties = {} } = data
    const distance = calculateDistance(points)
    const result: Route = {
      feature: {
        type: 'Feature',
        geometry: {
          type: 'LineString',
          coordinates: points.map((p: Position) => {
            return [p.longitude, p.latitude]
          })
        }
      },
      distance
    }
    name && (result.name = name)
    description && (result.description = description)
    result.feature.properties = properties
    return result
  },
  regions: (data: any) => {
    const { name, description, points, properties = {} } = data
    const cType = coordsType(points)
    const result: Region = {
      feature: {
        type: 'Feature',
        geometry: {
          type: cType === 'MultiPolygon' ? (cType as any) : 'Polygon',
          coordinates: []
        },
        properties: {}
      }
    }

    name && (result.name = name)
    description && (result.description = description)
    result.feature.geometry.coordinates = processRegionCoords(points, cType)
    result.feature.properties = properties
    return result
  }
}
export const fromPostData = (type: string, data: any) =>
  FROM_POST_MAPPERS[type as string]
    ? FROM_POST_MAPPERS[type as string](data)
    : data
