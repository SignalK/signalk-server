import {
  Position,
  Route,
  SignalKResourceType,
  Waypoint
} from '@signalk/server-api'
import { getDistance, isValidCoordinate } from 'geolib'

export const buildResource = (resType: SignalKResourceType, data: any): any => {
  if (resType === 'routes') {
    return buildRoute(data)
  }
  if (resType === 'waypoints') {
    return buildWaypoint(data)
  }
  if (resType === 'notes') {
    return buildNote(data)
  }
  if (resType === 'regions') {
    return buildRegion(data)
  }
  if (resType === 'charts') {
    return buildChart(data)
  }
  return null
}

const buildRoute = (rData: any): any => {
  const rte: any = {
    feature: {
      type: 'Feature',
      geometry: {
        type: 'LineString',
        coordinates: []
      },
      properties: {}
    }
  }
  if (typeof rData.name !== 'undefined') {
    rte.name = rData.name
    rte.feature.properties.name = rData.name
  }
  if (typeof rData.description !== 'undefined') {
    rte.description = rData.description
    rte.feature.properties.description = rData.description
  }
  if (typeof rData.attributes !== 'undefined') {
    Object.assign(rte.feature.properties, rData.attributes)
  }

  if (typeof rData.points === 'undefined') {
    return null
  }
  if (!Array.isArray(rData.points)) {
    return null
  }
  const cType = coordsType(rData.points)
  if (!cType) {
    return null
  }
  const tc = transformCoords(rData.points)
  if (!tc) {
    return null
  }
  rte.feature.geometry.coordinates = tc

  rte.distance = 0
  for (let i = 0; i < rData.points.length; i++) {
    if (i !== 0) {
      rte.distance =
        rte.distance + getDistance(rData.points[i - 1], rData.points[i])
    }
  }
  return rte
}

const buildWaypoint = (rData: any): any => {
  const wpt: any = {
    position: {
      latitude: 0,
      longitude: 0
    },
    feature: {
      type: 'Feature',
      geometry: {
        type: 'Point',
        coordinates: []
      },
      properties: {}
    }
  }
  if (typeof rData.name !== 'undefined') {
    wpt.feature.properties.name = rData.name
  }
  if (typeof rData.description !== 'undefined') {
    wpt.feature.properties.description = rData.description
  }
  if (typeof rData.attributes !== 'undefined') {
    Object.assign(wpt.feature.properties, rData.attributes)
  }

  if (typeof rData.position === 'undefined') {
    return null
  }
  if (!isValidCoordinate(rData.position)) {
    return null
  }

  wpt.position = rData.position
  wpt.feature.geometry.coordinates = [
    rData.position.longitude,
    rData.position.latitude
  ]

  return wpt
}

const buildNote = (rData: any): any => {
  const note: any = {}
  if (typeof rData.title !== 'undefined') {
    note.title = rData.title
    note.feature.properties.title = rData.title
  }
  if (typeof rData.description !== 'undefined') {
    note.description = rData.description
    note.feature.properties.description = rData.description
  }
  if (
    typeof rData.position === 'undefined' &&
    typeof rData.href === 'undefined'
  ) {
    return null
  }

  if (typeof rData.position !== 'undefined') {
    if (!isValidCoordinate(rData.position)) {
      return null
    }
    note.position = rData.position
  }
  if (typeof rData.href !== 'undefined') {
    note.region = rData.href
  }
  if (typeof rData.url !== 'undefined') {
    note.url = rData.url
  }
  if (typeof rData.mimeType !== 'undefined') {
    note.mimeType = rData.mimeType
  }

  return note
}

const buildRegion = (rData: any): any => {
  const reg: any = {
    feature: {
      type: 'Feature',
      geometry: {
        type: 'Polygon',
        coordinates: []
      },
      properties: {}
    }
  }

  if (typeof rData.name !== 'undefined') {
    reg.feature.properties.name = rData.name
  }
  if (typeof rData.description !== 'undefined') {
    reg.feature.properties.description = rData.description
  }
  if (typeof rData.attributes !== 'undefined') {
    Object.assign(reg.feature.properties, rData.attributes)
  }

  if (typeof rData.points === 'undefined') {
    return null
  }
  if (!Array.isArray(rData.points)) {
    return null
  }

  const cType = coordsType(rData.points)
  if (!cType) {
    return null
  }
  if (cType === 'MultiPolygon') {
    reg.feature.geometry.type = cType
  }

  try {
    reg.feature.geometry.coordinates = processRegionCoords(rData.points, cType)
    return reg
  } catch (error) {
    return null
  }
}

const buildChart = (rData: any): any => {
  const chart: any = {
    identifier: '',
    name: '',
    description: '',
    minzoom: 1,
    maxzoom: 28,
    type: 'tilelayer',
    format: 'png',
    tilemapUrl: '',
    chartLayers: [],
    scale: 250000,
    bounds: [-180, -90, 180, 90]
  }

  if (typeof rData.identifier === 'undefined') {
    return null
  } else {
    chart.identifier = rData.identifier
  }
  if (typeof rData.url === 'undefined') {
    return null
  } else {
    chart.tilemapUrl = rData.url
  }
  if (typeof rData.name !== 'undefined') {
    chart.name = rData.name
  } else {
    chart.name = rData.identifier
  }
  if (typeof rData.description !== 'undefined') {
    chart.description = rData.description
  }
  if (typeof rData.minZoom === 'number') {
    chart.minzoom = rData.minZoom
  }
  if (typeof rData.maxZoom === 'number') {
    chart.maxzoom = rData.maxZoom
  }
  if (typeof rData.serverType !== 'undefined') {
    chart.type = rData.serverType
  }
  if (typeof rData.format !== 'undefined') {
    chart.format = rData.format
  }
  if (typeof rData.layers !== 'undefined' && Array.isArray(rData.layers)) {
    chart.chartLayers = rData.layers
  }
  if (typeof rData.scale === 'number') {
    chart.scale = rData.scale
  }
  if (typeof rData.bounds !== 'undefined' && Array.isArray(rData.bounds)) {
    chart.bounds = [
      rData.bounds[0].longitude,
      rData.bounds[0].latitude,
      rData.bounds[1].longitude,
      rData.bounds[1].latitude
    ]
  }

  return chart
}

const coordsType = (coords: any[]): string | undefined => {
  if (!Array.isArray(coords) || coords.length === 0) {
    return undefined
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
  return undefined
}

const processRegionCoords = (coords: any[], type: string) => {
  if (type === 'Line') {
    const tc = transformCoords(coords)
    if (tc) {
      return [tc]
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
    return polygon
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
    return multipolygon
  }
}

const transformCoords = (coords: Position[]) => {
  let isValid = true
  coords.forEach((p: any) => {
    if (!isValidCoordinate(p)) {
      isValid = false
    }
  })
  if (!isValid) {
    return null
  }
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
    name && (result.name = name) && (properties.name = name)
    description &&
      (result.description = description) &&
      (properties.description = description)
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
    name && (result.name = name) && (properties.name = name)
    description &&
      (result.description = description) &&
      (properties.description = description)
    result.feature.properties = properties
    return result
  }
}
export const fromPostData = (type: string, data: any) =>
  FROM_POST_MAPPERS[type as string]
    ? FROM_POST_MAPPERS[type as string](data)
    : data
