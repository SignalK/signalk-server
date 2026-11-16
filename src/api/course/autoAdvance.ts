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

// Both bearings are taken at the point, so they share its meridian: the
// vessel is past the line through the point perpendicular to the leg once it
// lies more than 90° away from the direction back along the leg.
const hasPassedPerpendicular = (
  position: Position,
  previousPoint: Position,
  nextPoint: Position
) => {
  const backAlongLeg = getGreatCircleBearing(nextPoint, previousPoint)
  const toVessel = getGreatCircleBearing(nextPoint, position)
  const offLeg = Math.abs(((toVessel - backAlongLeg + 540) % 360) - 180)
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
