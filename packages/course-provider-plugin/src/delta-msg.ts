import { Path, PathValue } from '@signalk/server-api'
import { CourseData } from './types'

export type CalcMethod = 'GreatCircle' | 'Rhumbline'

const BASE = 'navigation.course.calcValues'

const PATH_CALC_METHOD = `${BASE}.calcMethod`
const PATH_BEARING_TRACK_TRUE = `${BASE}.bearingTrackTrue`
const PATH_BEARING_TRACK_MAG = `${BASE}.bearingTrackMagnetic`
const PATH_XTE = `${BASE}.crossTrackError`
const PATH_PREV_POINT_DISTANCE = `${BASE}.previousPoint.distance`
const PATH_DISTANCE = `${BASE}.distance`
const PATH_BEARING_TRUE = `${BASE}.bearingTrue`
const PATH_BEARING_MAG = `${BASE}.bearingMagnetic`
const PATH_VMG = `${BASE}.velocityMadeGood`
const PATH_PERF_VMG_WAYPOINT = 'performance.velocityMadeGoodToWaypoint'
const PATH_TTG = `${BASE}.timeToGo`
const PATH_ETA = `${BASE}.estimatedTimeOfArrival`
const PATH_ROUTE_TTG = `${BASE}.route.timeToGo`
const PATH_ROUTE_ETA = `${BASE}.route.estimatedTimeOfArrival`
const PATH_ROUTE_DISTANCE = `${BASE}.route.distance`
const PATH_TARGET_SPEED = `${BASE}.targetSpeed`

const VALUES_LENGTH = 16

/**
 * Build a SignalK v2 delta message for the course calcValues subtree.
 *
 * Note the intentional quirk: `velocityMadeGood` (and the performance
 * mirror) publish `source.velocityMadeGoodToCourse`, not `velocityMadeGood`,
 * because existing subscribers expect these paths to carry the VMC value.
 */
export function buildDeltaMsg(course: CourseData, method: CalcMethod) {
  const source = method === 'Rhumbline' ? course.rl : course.gc
  const values: PathValue[] = new Array(VALUES_LENGTH)

  values[0] = { path: PATH_CALC_METHOD as Path, value: method }
  values[1] = {
    path: PATH_BEARING_TRACK_TRUE as Path,
    value: source.bearingTrackTrue ?? null
  }
  values[2] = {
    path: PATH_BEARING_TRACK_MAG as Path,
    value: source.bearingTrackMagnetic ?? null
  }
  values[3] = { path: PATH_XTE as Path, value: source.crossTrackError ?? null }
  values[4] = {
    path: PATH_PREV_POINT_DISTANCE as Path,
    value: source.previousPoint?.distance ?? null
  }
  values[5] = { path: PATH_DISTANCE as Path, value: source.distance ?? null }
  values[6] = {
    path: PATH_BEARING_TRUE as Path,
    value: source.bearingTrue ?? null
  }
  values[7] = {
    path: PATH_BEARING_MAG as Path,
    value: source.bearingMagnetic ?? null
  }
  values[8] = {
    path: PATH_VMG as Path,
    value: source.velocityMadeGoodToCourse ?? null
  }
  values[9] = {
    path: PATH_PERF_VMG_WAYPOINT as Path,
    value: source.velocityMadeGoodToCourse ?? null
  }
  values[10] = { path: PATH_TTG as Path, value: source.timeToGo ?? null }
  values[11] = {
    path: PATH_ETA as Path,
    value: source.estimatedTimeOfArrival ?? null
  }
  values[12] = {
    path: PATH_ROUTE_TTG as Path,
    value: source.route?.timeToGo ?? null
  }
  values[13] = {
    path: PATH_ROUTE_ETA as Path,
    value: source.route?.estimatedTimeOfArrival ?? null
  }
  values[14] = {
    path: PATH_ROUTE_DISTANCE as Path,
    value: source.route?.distance ?? null
  }
  values[15] = {
    path: PATH_TARGET_SPEED as Path,
    value: source.targetSpeed ?? null
  }

  return { updates: [{ values }] }
}
