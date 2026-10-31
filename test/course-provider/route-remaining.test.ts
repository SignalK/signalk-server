import { expect } from 'chai'
import { mockModule, resetModuleCache } from './helpers'

const TO_RAD = Math.PI / 180

// Stub the two course-math distance helpers that routeRemaining calls.
// They receive radian scalars; the fixtures below use whole-degree
// waypoints, so the stub recovers the integer-degree delta (rounding away
// the deg→rad→deg round-trip error) and maps it to a predictable value:
//
//   greatCircleDistance = hypot(ΔlatDeg, ΔlonDeg) * 1000   (m)
//   rhumbDistance       = greatCircleDistance + 0.5         (m)
//
// `callCounts` is reset between tests to assert how often each helper is
// called per cache hit / miss.
const callCounts = {
  greatCircle: 0,
  rhumb: 0
}

function segmentMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const dLatRaw = (lat2 - lat1) / TO_RAD
  const dLonRaw = (lon2 - lon1) / TO_RAD
  const dLat = Math.round(dLatRaw)
  const dLon = Math.round(dLonRaw)
  // The fixtures use whole-degree waypoints; the rounding above only
  // absorbs deg→rad→deg float error. Fail loudly if a fixture ever uses a
  // fractional coordinate, since rounding would otherwise mask a wrong total.
  if (Math.abs(dLatRaw - dLat) > 1e-6 || Math.abs(dLonRaw - dLon) > 1e-6) {
    throw new Error('route-remaining fixtures must use whole-degree waypoints')
  }
  return Math.hypot(dLat, dLon) * 1000
}

function stubGreatCircleDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  callCounts.greatCircle++
  return segmentMeters(lat1, lon1, lat2, lon2)
}

function stubRhumbDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  callCounts.rhumb++
  // +0.5 per segment so the rhumb total is distinguishable from the gc one.
  return segmentMeters(lat1, lon1, lat2, lon2) + 0.5
}

let restoreCourseMath: () => void = () => {}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function loadRouteRemaining(): (src: any, useRhumbLine: boolean) => number {
  resetModuleCache('../../packages/course-provider-plugin/src/course')

  const mod =
    // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any
    require('../../packages/course-provider-plugin/src/course') as any
  return mod.routeRemaining
}

// A 4-waypoint route along the equator: 1deg + 1deg + 1deg = 3deg, which
// the stub maps to 3 * 1000 = 3000 m. Each call returns a fresh waypoints
// array, so the routeRemaining cache (keyed on array reference identity)
// invalidates between calls unless the same `routeSrc()` return value is
// reused.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function routeSrc(): Record<string, any> {
  return {
    activeRoute: {
      waypoints: [
        [0, 0],
        [1, 0],
        [2, 0],
        [3, 0]
      ] as Array<[number, number]>,
      pointIndex: 0,
      reverse: false
    }
  }
}

describe('routeRemaining cache and segment summation', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let routeRemaining: (src: any, useRhumbLine: boolean) => number

  before(() => {
    // Preserve the real exports (calcs needs computeCourseGeometry) and
    // override only the two distance helpers with counting stubs.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const realCourseMath = require('../../packages/course-provider-plugin/src/course-math')
    restoreCourseMath = mockModule(
      '../../packages/course-provider-plugin/src/course-math',
      {
        ...realCourseMath,
        greatCircleDistance: stubGreatCircleDistance,
        rhumbDistance: stubRhumbDistance
      }
    )
  })

  after(() => {
    restoreCourseMath()
    resetModuleCache('../../packages/course-provider-plugin/src/course')
  })

  beforeEach(() => {
    routeRemaining = loadRouteRemaining()
    callCounts.greatCircle = 0
    callCounts.rhumb = 0
  })

  it('returns the great-circle total of remaining segments', () => {
    expect(routeRemaining(routeSrc(), false)).to.equal(3000)
  })

  it('returns the rhumb-line total of remaining segments', () => {
    // Stub adds 0.5 per segment to differentiate from gc; 3 segments -> +1.5.
    expect(routeRemaining(routeSrc(), true)).to.equal(3001.5)
  })

  it('serves both flavours from cache after a single computation pass', () => {
    const src = routeSrc()
    const gcFirst = routeRemaining(src, false)

    // After the first call, both gc and rl totals are cached. Subsequent
    // calls in either flavour must not recompute.
    callCounts.greatCircle = 0
    callCounts.rhumb = 0
    const gcSecond = routeRemaining(src, false)
    const rlAfterGc = routeRemaining(src, true)

    expect(gcSecond).to.equal(gcFirst)
    expect(rlAfterGc).to.equal(3001.5)
    expect(callCounts.greatCircle).to.equal(0)
    expect(callCounts.rhumb).to.equal(0)
  })

  it('runs exactly one distance call per segment per flavour', () => {
    routeRemaining(routeSrc(), false)
    // 4 waypoints, fromIndex 0, toIndex 3 -> 3 segments. Both flavours are
    // computed in one pass: 3 greatCircleDistance + 3 rhumbDistance.
    expect(callCounts.greatCircle).to.equal(3)
    expect(callCounts.rhumb).to.equal(3)
  })

  it('invalidates when waypoints array reference changes', () => {
    routeRemaining(routeSrc(), false)

    // routeSrc() returns a fresh waypoints array each call, mirroring
    // the main thread's `srcPaths['activeRoute'].waypoints = waypoints`
    // reassignment in handleRouteUpdate / handleActiveRoute.
    const replaced = routeSrc()
    replaced.activeRoute.waypoints[3] = [4, 0] // last segment now 2deg
    callCounts.greatCircle = 0
    const total = routeRemaining(replaced, false)

    expect(callCounts.greatCircle).to.be.greaterThan(0)
    expect(total).to.equal(4000)
  })

  it('invalidates when pointIndex advances', () => {
    const src = routeSrc()
    const fromStart = routeRemaining(src, false)

    src.activeRoute.pointIndex = 2
    const fromMid = routeRemaining(src, false)

    expect(fromStart).to.equal(3000)
    // Only the last segment remains: 1 * 1000 = 1000 m.
    expect(fromMid).to.equal(1000)
  })

  it('invalidates when reverse flag changes', () => {
    const src = routeSrc()
    src.activeRoute.pointIndex = 1
    routeRemaining(src, false)

    // Reset counter; flipping `reverse` must force a recompute even though
    // the waypoints array reference and pointIndex are unchanged.
    callCounts.greatCircle = 0
    src.activeRoute.reverse = true
    routeRemaining(src, false)

    expect(callCounts.greatCircle).to.be.greaterThan(0)
  })

  it('returns 0 in reverse when pointIndex equals lastIndex', () => {
    const src = routeSrc()
    src.activeRoute.pointIndex = 3 // = lastIndex
    src.activeRoute.reverse = true
    // Reverse early-return: fromIndex 0, toIndex = lastIndex - lastIndex = 0.
    expect(routeRemaining(src, false)).to.equal(0)
  })

  it('returns 0 when fewer than two waypoints remain', () => {
    const src = {
      activeRoute: {
        waypoints: [
          [0, 0],
          [1, 0]
        ],
        pointIndex: 1,
        reverse: false
      }
    }
    expect(routeRemaining(src, false)).to.equal(0)
  })

  it('returns 0 when pointIndex is null', () => {
    const src = {
      activeRoute: {
        waypoints: [
          [0, 0],
          [1, 0]
        ],
        pointIndex: null,
        reverse: false
      }
    }
    expect(routeRemaining(src, false)).to.equal(0)
  })

  it('resetCaches() forces a recompute on the next call', () => {
    const src = routeSrc()
    routeRemaining(src, false) // populate the cache

    // Same src (same waypoints reference, pointIndex, reverse) normally
    // hits the cache and does zero distance calls.
    callCounts.greatCircle = 0
    routeRemaining(src, false)
    expect(callCounts.greatCircle).to.equal(0)

    // resetCaches() (called by the plugin on each startup) must clear the
    // cache so the very same inputs recompute afterwards.

    const { resetCaches } =
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      require('../../packages/course-provider-plugin/src/course') as {
        resetCaches: () => void
      }
    resetCaches()
    callCounts.greatCircle = 0
    routeRemaining(src, false)
    expect(callCounts.greatCircle).to.be.greaterThan(0)
  })
})
