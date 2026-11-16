import { AutoAdvance, Position } from '@signalk/server-api'
import { getDistance, getGreatCircleBearing } from 'geolib'

export const AUTO_ADVANCE_MODES: readonly AutoAdvance[] = [
  'off',
  'arrivalCircle',
  'perpendicular',
  'either'
]

export const DEFAULT_AUTO_ADVANCE: AutoAdvance = 'either'

export const isAutoAdvance = (value: unknown): value is AutoAdvance =>
  AUTO_ADVANCE_MODES.includes(value as AutoAdvance)

const isInsideArrivalCircle = (
  position: Position,
  nextPoint: Position,
  arrivalCircle: number
) => arrivalCircle > 0 && getDistance(position, nextPoint) <= arrivalCircle

// The point is passed once it lies more than 90° off the leg's direction at the
// point, as seen from the vessel: the vessel is then beyond the line through
// the point perpendicular to the leg. On a great circle that direction differs
// from the one the leg starts in.
const hasPassedPerpendicular = (
  position: Position,
  previousPoint: Position,
  nextPoint: Position
) => {
  const legBearing =
    (getGreatCircleBearing(nextPoint, previousPoint) + 180) % 360
  const bearingToPoint = getGreatCircleBearing(position, nextPoint)
  const offLeg = Math.abs(((bearingToPoint - legBearing + 540) % 360) - 180)
  return offLeg > 90
}

export const hasArrived = (
  mode: AutoAdvance,
  position: Position,
  previousPoint: Position,
  nextPoint: Position,
  arrivalCircle: number
): boolean => {
  const circle =
    (mode === 'arrivalCircle' || mode === 'either') &&
    isInsideArrivalCircle(position, nextPoint, arrivalCircle)
  const perpendicular =
    (mode === 'perpendicular' || mode === 'either') &&
    hasPassedPerpendicular(position, previousPoint, nextPoint)
  return circle || perpendicular
}
