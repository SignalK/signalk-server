import { expect } from 'chai'
import { calcs } from '../../packages/course-provider-plugin/src/course'
import {
  computeCourseGeometry,
  wrap2Pi
} from '../../packages/course-provider-plugin/src/course-math'
import type { SKPaths } from '../../packages/course-provider-plugin/src/types'

const TO_RAD = Math.PI / 180

// calcs() composes the per-tick CourseData from the single-pass geometry
// (computeCourseGeometry) plus the vmg / vmc / time helpers.
// computeCourseGeometry is verified in course-math.test.ts; this suite
// pins the WIRING that maps each geometry field onto the gc / rl branches
// of CourseResult, which the dispatcher suites cannot cover (they stub
// calcs entirely). It uses computeCourseGeometry directly as the source of
// truth and asserts calcs() routes the right field to the right place.
describe('calcs() geometry-to-CourseData wiring', () => {
  const vessel = { latitude: 50.0, longitude: 8.0 }
  const dest = { latitude: 50.5, longitude: 8.5 }
  const prev = { latitude: 49.9, longitude: 7.9 }
  const magVar = 0.05 // radians

  const src: SKPaths = {
    'navigation.position': vessel,
    'navigation.course.nextPoint': { position: dest },
    'navigation.course.previousPoint': { position: prev },
    'navigation.magneticVariation': magVar,
    'navigation.courseOverGroundTrue': 0.56,
    'navigation.speedOverGround': 5,
    'environment.wind.angleTrueGround': 0.3,
    'navigation.datetime': '2024-01-01T00:00:00.000Z'
  }

  const g = computeCourseGeometry(
    vessel.latitude * TO_RAD,
    vessel.longitude * TO_RAD,
    dest.latitude * TO_RAD,
    dest.longitude * TO_RAD,
    prev.latitude * TO_RAD,
    prev.longitude * TO_RAD
  )

  const res = calcs(src)

  it('labels the two branches', () => {
    expect(res.gc.calcMethod).to.equal('GreatCircle')
    expect(res.rl.calcMethod).to.equal('Rhumbline')
  })

  it('maps great-circle geometry onto the gc branch', () => {
    expect(res.gc.distance).to.equal(g.distanceGc)
    expect(res.gc.bearingTrue).to.equal(g.bearingGcRad)
    expect(res.gc.bearingTrackTrue).to.equal(g.trackBearingGcRad)
    expect(res.gc.previousPoint?.distance).to.equal(g.prevDistanceGc)
  })

  it('maps rhumb-line geometry onto the rl branch', () => {
    expect(res.rl.distance).to.equal(g.distanceRl)
    expect(res.rl.bearingTrue).to.equal(g.bearingRlRad)
    expect(res.rl.bearingTrackTrue).to.equal(g.trackBearingRlRad)
    expect(res.rl.previousPoint?.distance).to.equal(g.prevDistanceRl)
  })

  it('applies magnetic variation to every bearing via the compass wrap', () => {
    expect(res.gc.bearingTrackMagnetic).to.equal(
      wrap2Pi(g.trackBearingGcRad - magVar)
    )
    expect(res.gc.bearingMagnetic).to.equal(wrap2Pi(g.bearingGcRad - magVar))
    expect(res.rl.bearingTrackMagnetic).to.equal(
      wrap2Pi(g.trackBearingRlRad - magVar)
    )
    expect(res.rl.bearingMagnetic).to.equal(wrap2Pi(g.bearingRlRad - magVar))
  })

  it('puts the same cross-track error on both branches', () => {
    expect(res.gc.crossTrackError).to.equal(g.xte)
    expect(res.rl.crossTrackError).to.equal(g.xte)
  })

  it('propagates passedPerpendicular from the geometry', () => {
    expect(res.passedPerpendicular).to.equal(g.passedPerpendicular)
  })

  it('shares one velocity-made-good value across both branches', () => {
    const expectedVmg = Math.cos(0.3) * 5 // cos(windAngle) * SOG
    expect(res.gc.velocityMadeGood).to.be.closeTo(expectedVmg, 1e-12)
    expect(res.rl.velocityMadeGood).to.be.closeTo(expectedVmg, 1e-12)
  })

  it('returns the cleared shape when the navigation context is incomplete', () => {
    const cleared = calcs({ 'navigation.position': vessel })
    expect(cleared.gc).to.deep.equal({})
    expect(cleared.rl).to.deep.equal({})
    expect(cleared.passedPerpendicular).to.equal(false)
  })
})
