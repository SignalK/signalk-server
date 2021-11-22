import { SignalKResourceType } from '@signalk/server-api'
import { getDistance, isValidCoordinate } from 'geolib'
import ngeohash from 'ngeohash'


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
  let isValid: boolean = true
  rData.points.forEach((p: any) => {
    if (!isValidCoordinate(p)) {
      isValid = false
    }
  })
  if (!isValid) {
    return null
  }
  rte.feature.geometry.coordinates = rData.points.map((p: any) => {
    return [p.longitude, p.latitude]
  })

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
    typeof rData.region === 'undefined' &&
    typeof rData.geohash === 'undefined'
  ) {
    return null
  }

  if (typeof rData.position !== 'undefined') {
    if (!isValidCoordinate(rData.position)) {
      return null
    }
    note.position = rData.position
  }
  if (typeof rData.region !== 'undefined') {
    note.region = rData.region
  }
  if (typeof rData.geohash !== 'undefined') {
    note.geohash = rData.geohash
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
  let coords: Array<[number, number]> = []

  if (typeof rData.name !== 'undefined') {
    reg.feature.properties.name = rData.name
  }
  if (typeof rData.description !== 'undefined') {
    reg.feature.properties.description = rData.description
  }
  if (typeof rData.attributes !== 'undefined') {
    Object.assign(reg.feature.properties, rData.attributes)
  }

  if (typeof rData.points === 'undefined' && rData.geohash === 'undefined') {
    return null
  }
  if (typeof rData.geohash !== 'undefined') {
    reg.geohash = rData.geohash

    const bounds = ngeohash.decode_bbox(rData.geohash)
    coords = [
      [bounds[1], bounds[0]],
      [bounds[3], bounds[0]],
      [bounds[3], bounds[2]],
      [bounds[1], bounds[2]],
      [bounds[1], bounds[0]]
    ]
    reg.feature.geometry.coordinates.push(coords)
  }
  if (typeof rData.points !== 'undefined' && coords.length === 0) {
    if (!Array.isArray(rData.points)) {
      return null
    }
    let isValid: boolean = true
    rData.points.forEach((p: any) => {
      if (!isValidCoordinate(p)) {
        isValid = false
      }
    })
    if (!isValid) {
      return null
    }
    if (
      rData.points[0].latitude !== rData.points[rData.points.length-1].latitude && 
      rData.points[0].longitude !== rData.points[rData.points.length-1].longitude
    ) {
      rData.points.push( rData.points[0])
    }
    coords = rData.points.map((p: any) => {
      return [p.longitude, p.latitude]
    })
    reg.feature.geometry.coordinates.push(coords)
  }

  return reg
}
