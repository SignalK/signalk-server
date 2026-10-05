import { CourseData, CourseResult, SKPaths } from './types'
import {
  computeCourseGeometry,
  greatCircleDistance,
  rhumbDistance,
  wrap2Pi
} from './course-math'
import { ActiveRoute, NextPreviousPoint, Position } from '@signalk/server-api'

export function parseSKPaths(src: SKPaths): boolean {
  return src['navigation.position'] &&
    (src['navigation.course.nextPoint'] as NextPreviousPoint)?.position &&
    (src['navigation.course.previousPoint'] as NextPreviousPoint)?.position
    ? true
    : false
}

const TO_RAD = Math.PI / 180

// The empty/cleared CourseData shape, published when the navigation
// context is incomplete (no position/destination, or a just-cleared
// route) so subscribers see cleared values. passedPerpendicular is a
// required field on CourseData and must always be present.
export function emptyCourseData(): CourseData {
  return { gc: {}, rl: {}, passedPerpendicular: false }
}

// course calculations.
//
// Per-tick geometry comes from `computeCourseGeometry` in
// `course-math.ts`: distance, bearing, xte, track bearing and
// passedPerpendicular in one pass over pre-converted radian scalars, with
// no allocations on the hot path.
export function calcs(src: SKPaths): CourseData {
  const pos = src['navigation.position'] as Position
  const next = src['navigation.course.nextPoint'] as NextPreviousPoint
  const prev = src['navigation.course.previousPoint'] as NextPreviousPoint

  const res: CourseData = emptyCourseData()
  if (!pos || !next?.position || !prev?.position) {
    return res
  }

  const g = computeCourseGeometry(
    pos.latitude * TO_RAD,
    pos.longitude * TO_RAD,
    next.position.latitude * TO_RAD,
    next.position.longitude * TO_RAD,
    prev.position.latitude * TO_RAD,
    prev.position.longitude * TO_RAD
  )

  const magVar = Number(src['navigation.magneticVariation']) ?? 0.0
  const vmgValue = vmg(src)

  // GreatCircle
  const bearingTrackTrue = g.trackBearingGcRad
  const bearingTrue = g.bearingGcRad
  const bearingTrackMagnetic = wrap2Pi(bearingTrackTrue - magVar)
  const bearingMagnetic = wrap2Pi(bearingTrue - magVar)
  const gcDistance = g.distanceGc
  const gcVmc = vmc(src, bearingTrue, 'true') // for ETA, TTG - prefer 'true' values
  const gcTime = timeCalcs(src, gcDistance, gcVmc as number, false)

  const gcResult: CourseResult = {
    calcMethod: 'GreatCircle',
    bearingTrackTrue,
    bearingTrackMagnetic,
    crossTrackError: g.xte,
    distance: gcDistance,
    bearingTrue,
    bearingMagnetic,
    velocityMadeGood: vmgValue,
    velocityMadeGoodToCourse: gcVmc,
    timeToGo: gcTime.nextPoint.ttg,
    estimatedTimeOfArrival: gcTime.nextPoint.eta,
    previousPoint: { distance: g.prevDistanceGc },
    route: {
      timeToGo: gcTime.route.ttg,
      estimatedTimeOfArrival: gcTime.route.eta,
      distance: gcTime.route.dtg
    },
    targetSpeed: targetSpeed(src, gcDistance)
  }
  res.gc = gcResult

  // Rhumbline
  const rlBearingTrackTrue = g.trackBearingRlRad
  const rlBearingTrue = g.bearingRlRad
  const rlBearingTrackMagnetic = wrap2Pi(rlBearingTrackTrue - magVar)
  const rlBearingMagnetic = wrap2Pi(rlBearingTrue - magVar)
  const rlDistance = g.distanceRl
  const rlVmc = vmc(src, rlBearingTrue, 'true')
  const rlTime = timeCalcs(src, rlDistance, rlVmc as number, true)

  const rlResult: CourseResult = {
    calcMethod: 'Rhumbline',
    bearingTrackTrue: rlBearingTrackTrue,
    bearingTrackMagnetic: rlBearingTrackMagnetic,
    crossTrackError: g.xte,
    distance: rlDistance,
    bearingTrue: rlBearingTrue,
    bearingMagnetic: rlBearingMagnetic,
    velocityMadeGood: vmgValue,
    velocityMadeGoodToCourse: rlVmc,
    timeToGo: rlTime.nextPoint.ttg,
    estimatedTimeOfArrival: rlTime.nextPoint.eta,
    previousPoint: { distance: g.prevDistanceRl },
    route: {
      timeToGo: rlTime.route.ttg,
      estimatedTimeOfArrival: rlTime.route.eta,
      distance: rlTime.route.dtg
    },
    targetSpeed: targetSpeed(src, rlDistance, true)
  }
  res.rl = rlResult

  res.passedPerpendicular = g.passedPerpendicular

  return res
}

// Velocity Made Good to wind
export function vmg(src: SKPaths): number | null {
  if (
    typeof src['environment.wind.angleTrueGround'] !== 'number' ||
    typeof src['navigation.speedOverGround'] !== 'number'
  ) {
    return null
  }
  return (
    Math.cos(src['environment.wind.angleTrueGround']) *
    src['navigation.speedOverGround']
  )
}

// Velocity Made Good to Course (used for ETA / TTG calcs)
export function vmc(
  src: SKPaths,
  bearing: number,
  bearingType: 'true' | 'magnetic' = 'true'
): number | null {
  const cog =
    bearingType === 'true'
      ? src['navigation.courseOverGroundTrue']
      : src['navigation.courseOverGroundMagnetic']
  if (
    typeof cog !== 'number' ||
    typeof src['navigation.speedOverGround'] !== 'number'
  ) {
    return null
  }
  return (
    Math.cos(Math.abs(Angle.difference(bearing, cog))) *
    src['navigation.speedOverGround']
  )
}

interface CourseTimes {
  nextPoint: {
    ttg: number | null
    eta: string | null
  }
  route: {
    ttg: number | null
    eta: string | null
    dtg: number | null
  }
}

/**
 * Resolve the millisecond timestamp from a SignalK datetime-like field.
 * Accepts:
 *   - ISO 8601 string (per SignalK spec)
 *   - number (epoch-ms, legacy tolerance)
 *   - undefined / null -> current time
 * Returns NaN on an unparseable string; callers must check Number.isFinite.
 */
function resolveDateMsec(raw: unknown): number {
  if (raw === undefined || raw === null) return Date.now()
  if (typeof raw === 'number') return raw
  return Date.parse(raw as string)
}

// Time to Go & Estimated time of arrival at the nextPoint / route destination
export function timeCalcs(
  src: SKPaths,
  distance: number,
  vmc: number,
  rhumbLine: boolean
): CourseTimes {
  const isRoute =
    Array.isArray((src['activeRoute'] as ActiveRoute)?.waypoints) &&
    (src['activeRoute'] as ActiveRoute)?.waypoints?.length !== 0

  const result: CourseTimes = {
    nextPoint: { ttg: null, eta: null },
    route: { ttg: null, eta: null, dtg: null }
  }

  if (typeof distance !== 'number' || !Number.isFinite(distance)) {
    return result
  }

  // Route-remaining distance is pure geometry, independent of velocity: it
  // must not blink to null just because the vessel isn't currently closing
  // on the next waypoint (e.g. right after rounding a mark, or while
  // tacking upwind — both routine sail-trim states with vmc <= 0).
  const routeDistance = isRoute
    ? distance + routeRemaining(src, rhumbLine)
    : null
  result.route.dtg = routeDistance

  if (typeof vmc !== 'number' || !Number.isFinite(vmc) || vmc <= 0) {
    return result
  }

  const dateMsec = resolveDateMsec(src['navigation.datetime'])
  if (!Number.isFinite(dateMsec)) {
    return result
  }

  const nextTtgMsec = Math.floor((distance / vmc) * 1000)
  const nextEtaMsec = dateMsec + nextTtgMsec
  result.nextPoint.ttg = nextTtgMsec / 1000
  result.nextPoint.eta = new Date(nextEtaMsec).toISOString()

  if (routeDistance !== null) {
    const routeTtgMsec = Math.floor((routeDistance / vmc) * 1000)
    const routeEtaMsec = dateMsec + routeTtgMsec
    result.route.ttg = routeTtgMsec / 1000
    result.route.eta = new Date(routeEtaMsec).toISOString()
  }
  return result
}

// Avg speed required to arrive at destination at targetArrivalTime
export function targetSpeed(
  src: SKPaths,
  distance: number,
  rhumbLine?: boolean
): number | null {
  if (
    typeof distance !== 'number' ||
    !Number.isFinite(distance) ||
    !src['navigation.course.targetArrivalTime']
  ) {
    return null
  }

  // if route totalDistance = distance plus + length of remaining route segments
  if ((src['activeRoute'] as ActiveRoute)?.waypoints) {
    distance += routeRemaining(src, rhumbLine)
  }

  const dateMsec = resolveDateMsec(src['navigation.datetime'])
  if (!Number.isFinite(dateMsec)) {
    return null
  }

  const tatMsec = resolveDateMsec(src['navigation.course.targetArrivalTime'])
  if (!Number.isFinite(tatMsec)) {
    return null
  }
  if (tatMsec <= dateMsec) {
    // current time is after targetArrivalTime
    return null
  }
  const tDiffSec = (tatMsec - dateMsec) / 1000
  return distance / tDiffSec
}

// Route remaining distance cache. The total only changes when waypoints,
// pointIndex, or reverse flag change, but the function is called four times
// per tick (gc/rl × timeCalcs/targetSpeed). Both flavours share the same
// key inputs and are computed together in one cursor pass on miss.
//
// The cache keys on the waypoints array reference. `srcPaths` is passed to
// calcs() by reference, and `srcPaths['activeRoute'].waypoints` is only
// reassigned on a route change (`getPaths`, `handleRouteUpdate`,
// `handleActiveRoute`), so the reference stays stable across ticks and the
// key holds.
interface RouteRemainingCache {
  waypoints: Array<[number, number]>
  pointIndex: number
  reverse: boolean
  totalGc: number
  totalRl: number
}
let routeRemainingCache: RouteRemainingCache | null = null

// Reset the module-scoped cache. The plugin calls this on startup so a
// stop/start cycle within the same server process begins from clean
// state; the cache otherwise outlives a single plugin instance.
export function resetCaches(): void {
  routeRemainingCache = null
}

// total distance in meters of remaining route segments
export function routeRemaining(src: SKPaths, rhumbLine?: boolean): number {
  const srcActiveRoute = src['activeRoute'] as ActiveRoute
  if (
    srcActiveRoute?.pointIndex === null ||
    !Array.isArray(srcActiveRoute?.waypoints)
  ) {
    return 0
  }
  const waypoints = srcActiveRoute.waypoints as Array<[number, number]>
  if (waypoints.length < 2) {
    return 0
  }

  const reverse = !!srcActiveRoute.reverse
  const lastIndex = waypoints.length - 1
  const rawIndex = srcActiveRoute.pointIndex ?? 0
  const validIndex = Number.isInteger(rawIndex) && rawIndex >= 0 ? rawIndex : 0
  const ptIndex = Math.min(validIndex, lastIndex)
  const useRhumbLine = !!rhumbLine

  // determine segments to sum
  let fromIndex: number
  let toIndex: number
  if (reverse) {
    fromIndex = 0
    toIndex = lastIndex - ptIndex
    if (toIndex === fromIndex) {
      return 0
    }
  } else {
    if (ptIndex === lastIndex) {
      return 0
    }
    fromIndex = ptIndex
    toIndex = lastIndex
  }

  const cache = routeRemainingCache
  if (
    cache &&
    cache.waypoints === waypoints &&
    cache.pointIndex === ptIndex &&
    cache.reverse === reverse
  ) {
    return useRhumbLine ? cache.totalRl : cache.totalGc
  }

  // Sum segment lengths for both flavours in a single pass, advancing the
  // running point as radian scalars (waypoints are [lon, lat] in degrees)
  // so the loop allocates nothing.
  const fromWp = waypoints[fromIndex]!
  let lat = fromWp[1] * TO_RAD
  let lon = fromWp[0] * TO_RAD
  let totalGc = 0
  let totalRl = 0
  for (let idx = fromIndex; idx < toIndex; idx++) {
    const wp = waypoints[idx + 1]!
    const nextLat = wp[1] * TO_RAD
    const nextLon = wp[0] * TO_RAD
    totalGc += greatCircleDistance(lat, lon, nextLat, nextLon)
    totalRl += rhumbDistance(lat, lon, nextLat, nextLon)
    lat = nextLat
    lon = nextLon
  }

  routeRemainingCache = {
    waypoints,
    pointIndex: ptIndex,
    reverse,
    totalGc,
    totalRl
  }
  return useRhumbLine ? totalRl : totalGc
}

// Helper used by `vmc` to fold the |bearing - cog| difference into [0, π].
class Angle {
  /** Signed angle difference (radians); negative result means port. */
  static difference(h: number, b: number): number {
    const d = Math.PI * 2 - b
    const hd = h + d
    const a = wrap2Pi(hd)
    return a < Math.PI ? 0 - a : Math.PI * 2 - a
  }
}
