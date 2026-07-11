import { Position } from '@signalk/server-api'

const EARTH_RADIUS_M = 6371000
const XTE_ZERO_EPSILON_M = 1

const toRadians = (degrees: number) => (degrees * Math.PI) / 180
const toDegrees = (radians: number) => (radians * 180) / Math.PI

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value)

const angularDistance = (a: Position, b: Position) => {
  const lat1 = toRadians(a.latitude)
  const lat2 = toRadians(b.latitude)
  const deltaLat = lat2 - lat1
  const deltaLon = toRadians(b.longitude - a.longitude)
  const sinDeltaLat = Math.sin(deltaLat / 2)
  const sinDeltaLon = Math.sin(deltaLon / 2)
  return (
    2 *
    Math.asin(
      Math.sqrt(
        sinDeltaLat * sinDeltaLat +
          Math.cos(lat1) * Math.cos(lat2) * sinDeltaLon * sinDeltaLon
      )
    )
  )
}

const initialBearing = (a: Position, b: Position) => {
  const lat1 = toRadians(a.latitude)
  const lat2 = toRadians(b.latitude)
  const deltaLon = toRadians(b.longitude - a.longitude)
  return Math.atan2(
    Math.sin(deltaLon) * Math.cos(lat2),
    Math.cos(lat1) * Math.sin(lat2) -
      Math.sin(lat1) * Math.cos(lat2) * Math.cos(deltaLon)
  )
}

export const crossTrackDistance = (
  position: Position,
  start: Position,
  destination: Position
): number | undefined => {
  const distanceStartToPosition = angularDistance(start, position)
  const bearingStartToPosition = initialBearing(start, position)
  const bearingStartToDestination = initialBearing(start, destination)
  const value =
    Math.asin(
      Math.sin(distanceStartToPosition) *
        Math.sin(bearingStartToPosition - bearingStartToDestination)
    ) * EARTH_RADIUS_M
  return Number.isFinite(value) ? value : undefined
}

const localPoint = (
  position: Position,
  origin: Position
): { x: number; y: number } => {
  const lat0 = toRadians(origin.latitude)
  const lat = toRadians(position.latitude)
  return {
    x:
      toRadians(position.longitude - origin.longitude) *
      EARTH_RADIUS_M *
      Math.cos((lat + lat0) / 2),
    y: (lat - lat0) * EARTH_RADIUS_M
  }
}

const geographicPoint = (
  point: { x: number; y: number },
  origin: Position
): Position => {
  const lat = toRadians(origin.latitude)
  const latitude = lat + point.y / EARTH_RADIUS_M
  return {
    latitude: toDegrees(latitude),
    longitude:
      origin.longitude +
      toDegrees(point.x / (EARTH_RADIUS_M * Math.cos((latitude + lat) / 2)))
  }
}

const candidateStartFromTangent = (
  vesselPosition: Position,
  destination: Position,
  xteRadius: number,
  side: 1 | -1
): Position | undefined => {
  const destinationLocal = localPoint(destination, vesselPosition)
  const distanceSquared =
    destinationLocal.x * destinationLocal.x +
    destinationLocal.y * destinationLocal.y
  const radiusSquared = xteRadius * xteRadius

  if (distanceSquared <= radiusSquared) {
    return undefined
  }

  const scale = radiusSquared / distanceSquared
  const offset =
    (side * xteRadius * Math.sqrt(distanceSquared - radiusSquared)) /
    distanceSquared
  const tangent = {
    x: scale * destinationLocal.x - offset * destinationLocal.y,
    y: scale * destinationLocal.y + offset * destinationLocal.x
  }
  const dx = tangent.x - destinationLocal.x
  const dy = tangent.y - destinationLocal.y
  const length = Math.hypot(dx, dy)

  if (!Number.isFinite(length) || length === 0) {
    return undefined
  }

  const extension = xteRadius
  return geographicPoint(
    {
      x: tangent.x + (dx / length) * extension,
      y: tangent.y + (dy / length) * extension
    },
    vesselPosition
  )
}

export const rebasePreviousPointFromXte = (
  vesselPosition: Position,
  destination: Position,
  xte: number
): Position | undefined => {
  if (Math.abs(xte) <= XTE_ZERO_EPSILON_M) {
    return vesselPosition
  }

  const radius = Math.abs(xte)
  const candidates = (
    [
      candidateStartFromTangent(vesselPosition, destination, radius, 1),
      candidateStartFromTangent(vesselPosition, destination, radius, -1)
    ] as Array<Position | undefined>
  ).filter((candidate): candidate is Position => candidate !== undefined)

  return candidates
    .map((candidate) => ({
      candidate,
      calculatedXte: crossTrackDistance(vesselPosition, candidate, destination)
    }))
    .filter((item): item is { candidate: Position; calculatedXte: number } =>
      isFiniteNumber(item.calculatedXte)
    )
    .sort(
      (a, b) =>
        Math.abs(a.calculatedXte - xte) - Math.abs(b.calculatedXte - xte)
    )[0]?.candidate
}
