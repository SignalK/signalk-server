import { expect } from 'chai'
import {
  computeCourseGeometry,
  greatCircleDistance,
  rhumbDistance,
  wrap2Pi,
  __testing
} from '../../packages/course-provider-plugin/src/course-math'

const TO_RAD = Math.PI / 180

interface Pt {
  lat: number
  lon: number
}

// Reference outputs for each scenario, captured from Chris Veness's
// LatLonSpherical library (npm: `geodesy`), which the course-math formulas
// are adapted from. That library is no longer a dependency, so the values
// are frozen here and computeCourseGeometry is checked against them. These
// goldens only catch regressions; the "independent oracles" suite below
// anchors the load-bearing quantities against a separate formula. To
// regenerate after an intentional formula change, reinstall `geodesy` and
// run each scenario's geometry through LatLonSpherical (distanceTo /
// rhumbDistanceTo / initialBearingTo / rhumbBearingTo /
// crossTrackDistanceTo) and paste the results.
interface Expected {
  distanceGc: number
  distanceRl: number
  prevDistanceGc: number
  prevDistanceRl: number
  bearingGcRad: number
  bearingRlRad: number
  trackBearingGcRad: number
  trackBearingRlRad: number
  xte: number
  passedPerpendicular: boolean
}
interface Scenario {
  name: string
  vessel: Pt
  destination: Pt
  start: Pt
  expected: Expected
}

// Representative inputs covering the realistic envelope: short coastal,
// long ocean leg, high-latitude leg, equator, southern hemisphere, and
// antimeridian crossing.
const scenarios: Scenario[] = [
  {
    name: 'coastal cruise (NW Europe)',
    vessel: { lat: 50.0, lon: 8.0 },
    destination: { lat: 50.5, lon: 8.5 },
    start: { lat: 49.9, lon: 7.9 },
    expected: {
      distanceGc: 65991.79674080657,
      distanceRl: 65991.9205213362,
      prevDistanceGc: 13222.544193446858,
      prevDistanceRl: 13222.545176846816,
      bearingGcRad: 0.5655646803722412,
      bearingRlRad: 0.5689095016253931,
      trackBearingGcRad: 0.5653744412583519,
      trackBearingRlRad: 0.5693829578765759,
      xte: 75.61569885210051,
      passedPerpendicular: false
    }
  },
  {
    name: 'long ocean leg (transatlantic)',
    vessel: { lat: 40.0, lon: -50.0 },
    destination: { lat: 50.0, lon: -10.0 },
    start: { lat: 40.5, lon: -55.0 },
    expected: {
      distanceGc: 3289922.3475552145,
      distanceRl: 3324520.6211379515,
      prevDistanceGc: 427904.66653024964,
      prevDistanceRl: 427961.3817678972,
      bearingGcRad: 0.9914516852770633,
      bearingRlRad: 1.2297545469694189,
      trackBearingGcRad: 1.00708218785001,
      trackBearingRlRad: 1.278498471234584,
      xte: 264157.97209057637,
      passedPerpendicular: false
    }
  },
  {
    name: 'high latitude (Norwegian Sea)',
    vessel: { lat: 70.0, lon: 20.0 },
    destination: { lat: 71.5, lon: 25.0 },
    start: { lat: 69.5, lon: 18.0 },
    expected: {
      distanceGc: 247690.0295855835,
      distanceRl: 247760.08841370774,
      prevDistanceGc: 94944.78776706521,
      prevDistanceRl: 94949.03073995425,
      bearingGcRad: 0.7916446553481954,
      bearingRlRad: 0.8322669084686697,
      trackBearingGcRad: 0.8059120193396372,
      trackBearingRlRad: 0.862445804879609,
      xte: 11650.587443514429,
      passedPerpendicular: false
    }
  },
  {
    name: 'equator',
    vessel: { lat: 0.0, lon: 10.0 },
    destination: { lat: 0.0, lon: 30.0 },
    start: { lat: 0.0, lon: 5.0 },
    expected: {
      distanceGc: 2223898.5328911743,
      distanceRl: 2223898.532891175,
      prevDistanceGc: 555974.6332227937,
      prevDistanceRl: 555974.6332227937,
      bearingGcRad: 1.5707963267948966,
      bearingRlRad: 1.5707963267948966,
      trackBearingGcRad: 1.5707963267948966,
      trackBearingRlRad: 1.5707963267948966,
      xte: 0,
      passedPerpendicular: false
    }
  },
  {
    name: 'southern hemisphere',
    vessel: { lat: -33.5, lon: 151.0 },
    destination: { lat: -34.0, lon: 152.0 },
    start: { lat: -33.0, lon: 150.5 },
    expected: {
      distanceGc: 107883.4951397275,
      distanceRl: 107883.91780078303,
      prevDistanceGc: 72476.6416097232,
      prevDistanceRl: 72476.71074750894,
      bearingGcRad: 2.117039911500902,
      bearingRlRad: 2.1122067805177673,
      trackBearingGcRad: 2.2524053433204783,
      trackBearingRlRad: 2.2452256066263128,
      xte: 14050.127580606477,
      passedPerpendicular: false
    }
  },
  {
    name: 'antimeridian crossing',
    vessel: { lat: 1.0, lon: 179.5 },
    destination: { lat: 1.0, lon: -179.5 },
    start: { lat: 1.0, lon: 179.0 },
    expected: {
      distanceGc: 111177.99068883245,
      distanceRl: 111177.99111865046,
      prevDistanceGc: 55588.99550559335,
      prevDistanceRl: 55588.995559323026,
      bearingGcRad: 1.5706440219524656,
      bearingRlRad: 1.5707963267948966,
      trackBearingGcRad: 1.5705678622837516,
      trackBearingRlRad: 1.5707963267948966,
      xte: 8.466849188317614,
      passedPerpendicular: false
    }
  }
]

// Floating-point tolerances: how far computeCourseGeometry may drift from
// the captured reference. course-math arranges the logs/tans of the rhumb
// formula differently from LatLonSpherical, so trailing-bit differences
// are expected; in practice the gap is sub-nanometer.
const ABS_DIST_TOL_M = 1e-3 // 1 mm
const ABS_BEARING_TOL_RAD = 1e-9
const ABS_XTE_TOL_M = 1e-3

function describeScenario(s: Scenario) {
  describe(s.name, () => {
    const v = s.vessel
    const d = s.destination
    const st = s.start
    const e = s.expected
    const out = computeCourseGeometry(
      v.lat * TO_RAD,
      v.lon * TO_RAD,
      d.lat * TO_RAD,
      d.lon * TO_RAD,
      st.lat * TO_RAD,
      st.lon * TO_RAD
    )

    it('matches the reference great-circle distance vessel→destination', () => {
      expect(out.distanceGc).to.be.closeTo(e.distanceGc, ABS_DIST_TOL_M)
    })

    it('matches the reference rhumb distance vessel→destination', () => {
      expect(out.distanceRl).to.be.closeTo(e.distanceRl, ABS_DIST_TOL_M)
    })

    it('matches the reference great-circle distance vessel→start', () => {
      expect(out.prevDistanceGc).to.be.closeTo(e.prevDistanceGc, ABS_DIST_TOL_M)
    })

    it('matches the reference rhumb distance vessel→start', () => {
      expect(out.prevDistanceRl).to.be.closeTo(e.prevDistanceRl, ABS_DIST_TOL_M)
    })

    it('matches the reference great-circle bearing vessel→destination', () => {
      expect(out.bearingGcRad).to.be.closeTo(
        e.bearingGcRad,
        ABS_BEARING_TOL_RAD
      )
    })

    it('matches the reference rhumb bearing vessel→destination', () => {
      expect(out.bearingRlRad).to.be.closeTo(
        e.bearingRlRad,
        ABS_BEARING_TOL_RAD
      )
    })

    it('matches the reference track bearing start→destination (gc)', () => {
      expect(out.trackBearingGcRad).to.be.closeTo(
        e.trackBearingGcRad,
        ABS_BEARING_TOL_RAD
      )
    })

    it('matches the reference track bearing start→destination (rl)', () => {
      expect(out.trackBearingRlRad).to.be.closeTo(
        e.trackBearingRlRad,
        ABS_BEARING_TOL_RAD
      )
    })

    it('matches the reference cross-track distance', () => {
      expect(out.xte).to.be.closeTo(e.xte, ABS_XTE_TOL_M)
    })

    it('matches the reference passedPerpendicular flag', () => {
      expect(out.passedPerpendicular).to.equal(e.passedPerpendicular)
    })
  })
}

describe('computeCourseGeometry — parity with the LatLonSpherical reference', () => {
  for (const s of scenarios) {
    describeScenario(s)
  }
})

describe('computeCourseGeometry — passedPerpendicular regression cases', () => {
  // Specific geometry: vessel is past the perpendicular if it lies on the
  // far side of the destination relative to the planned track.
  it('detects when vessel has crossed the destination line', () => {
    const out = computeCourseGeometry(
      50.6 * TO_RAD,
      8.5 * TO_RAD, // vessel slightly past destination latitude on same lon
      50.5 * TO_RAD,
      8.5 * TO_RAD, // destination
      50.0 * TO_RAD,
      8.5 * TO_RAD // start
    )
    expect(out.passedPerpendicular).to.equal(true)
  })

  it('does not flag perpendicular before vessel reaches it', () => {
    const out = computeCourseGeometry(
      50.4 * TO_RAD,
      8.5 * TO_RAD, // vessel short of destination on same lon
      50.5 * TO_RAD,
      8.5 * TO_RAD,
      50.0 * TO_RAD,
      8.5 * TO_RAD
    )
    expect(out.passedPerpendicular).to.equal(false)
  })
})

// Independent oracles. The frozen goldens above were captured from the
// same library the formulas were adapted from, so they only catch
// regressions. These checks anchor the load-bearing quantities against a
// separately-derived formula, so a change that drifts both the code and
// the goldens together still trips a test.
describe('computeCourseGeometry — independent oracles', () => {
  // Great-circle distance via the spherical law of cosines, which is
  // algebraically distinct from the haversine the implementation uses.
  function lawOfCosinesGc(a: Pt, b: Pt): number {
    const f1 = a.lat * TO_RAD
    const f2 = b.lat * TO_RAD
    const dLon = (b.lon - a.lon) * TO_RAD
    return (
      6371000 *
      Math.acos(
        Math.sin(f1) * Math.sin(f2) +
          Math.cos(f1) * Math.cos(f2) * Math.cos(dLon)
      )
    )
  }

  // Loose tolerance: this is an independence check (catch a systematic
  // formula error, which would be off by kilometres), not a precision
  // golden. The law of cosines is ill-conditioned for short legs, so a
  // metre of slack absorbs its floating-point noise.
  const ORACLE_TOL_M = 1.0

  for (const s of scenarios) {
    it(`great-circle distance agrees with the law-of-cosines oracle: ${s.name}`, () => {
      const out = computeCourseGeometry(
        s.vessel.lat * TO_RAD,
        s.vessel.lon * TO_RAD,
        s.destination.lat * TO_RAD,
        s.destination.lon * TO_RAD,
        s.start.lat * TO_RAD,
        s.start.lon * TO_RAD
      )
      expect(out.distanceGc).to.be.closeTo(
        lawOfCosinesGc(s.vessel, s.destination),
        ORACLE_TOL_M
      )
    })
  }

  // Geometric identity, independent of any distance formula: a vessel
  // exactly on the planned track has zero cross-track error.
  it('cross-track error is zero when the vessel lies on the track (meridian)', () => {
    const out = computeCourseGeometry(
      50.5 * TO_RAD,
      8.0 * TO_RAD, // vessel on the lon=8 meridian
      51.0 * TO_RAD,
      8.0 * TO_RAD, // destination, same meridian
      50.0 * TO_RAD,
      8.0 * TO_RAD // start, same meridian
    )
    expect(out.xte).to.be.closeTo(0, 1e-6)
  })

  it('cross-track error is zero when the vessel lies on the track (equator)', () => {
    const out = computeCourseGeometry(
      0,
      10 * TO_RAD,
      0,
      30 * TO_RAD,
      0,
      5 * TO_RAD
    )
    expect(out.xte).to.be.closeTo(0, 1e-6)
  })
})

// The cold-path helpers greatCircleDistance / rhumbDistance duplicate the
// haversine / rhumb formulas inlined in computeCourseGeometry. Pin the two
// copies together so they cannot silently diverge.
describe('distance helpers agree with the fused computeCourseGeometry', () => {
  for (const s of scenarios) {
    it(`vessel→destination gc and rl distances match: ${s.name}`, () => {
      const out = computeCourseGeometry(
        s.vessel.lat * TO_RAD,
        s.vessel.lon * TO_RAD,
        s.destination.lat * TO_RAD,
        s.destination.lon * TO_RAD,
        s.start.lat * TO_RAD,
        s.start.lon * TO_RAD
      )
      const gc = greatCircleDistance(
        s.vessel.lat * TO_RAD,
        s.vessel.lon * TO_RAD,
        s.destination.lat * TO_RAD,
        s.destination.lon * TO_RAD
      )
      const rl = rhumbDistance(
        s.vessel.lat * TO_RAD,
        s.vessel.lon * TO_RAD,
        s.destination.lat * TO_RAD,
        s.destination.lon * TO_RAD
      )
      expect(gc).to.be.closeTo(out.distanceGc, 1e-6)
      expect(rl).to.be.closeTo(out.distanceRl, 1e-6)
    })
  }
})

// Degenerate inputs must stay finite (no NaN) per the documented contract.
describe('computeCourseGeometry — degenerate inputs', () => {
  it('coincident vessel and destination: zero distance, zero bearing, passed=true', () => {
    const out = computeCourseGeometry(
      50.5 * TO_RAD,
      8.5 * TO_RAD, // vessel
      50.5 * TO_RAD,
      8.5 * TO_RAD, // destination (same as vessel)
      50.0 * TO_RAD,
      8.0 * TO_RAD // start
    )
    expect(out.distanceGc).to.equal(0)
    expect(out.distanceRl).to.equal(0)
    expect(out.bearingGcRad).to.equal(0)
    expect(out.bearingRlRad).to.equal(0)
    expect(Number.isFinite(out.xte)).to.equal(true)
    expect(out.passedPerpendicular).to.equal(true)
  })

  it('all three points coincident: all-zero output, passed=false', () => {
    const out = computeCourseGeometry(
      50.5 * TO_RAD,
      8.5 * TO_RAD,
      50.5 * TO_RAD,
      8.5 * TO_RAD,
      50.5 * TO_RAD,
      8.5 * TO_RAD
    )
    expect(out.distanceGc).to.equal(0)
    expect(out.prevDistanceGc).to.equal(0)
    expect(out.passedPerpendicular).to.equal(false)
  })

  it('coincident vessel and start: zero previousPoint distance, finite bearings', () => {
    const out = computeCourseGeometry(
      50.0 * TO_RAD,
      8.0 * TO_RAD, // vessel
      50.5 * TO_RAD,
      8.5 * TO_RAD, // destination
      50.0 * TO_RAD,
      8.0 * TO_RAD // start (same as vessel)
    )
    expect(out.prevDistanceGc).to.equal(0)
    expect(out.prevDistanceRl).to.equal(0)
    expect(Number.isFinite(out.bearingGcRad)).to.equal(true)
    expect(out.passedPerpendicular).to.equal(false)
  })
})

// wrap2Pi (public) and wrapDLon (internal, via __testing) are the angle
// normalisers the geometry depends on; pin their boundaries directly.
describe('angle normalisation boundaries', () => {
  it('wrap2Pi folds into [0, 2π) with an exclusive upper bound', () => {
    expect(wrap2Pi(-0.1)).to.be.closeTo(2 * Math.PI - 0.1, 1e-12)
    expect(wrap2Pi(0)).to.equal(0)
    expect(wrap2Pi(2 * Math.PI - 1e-9)).to.be.closeTo(2 * Math.PI - 1e-9, 1e-12)
    expect(wrap2Pi(2 * Math.PI)).to.equal(0)
  })

  it('wrapDLon folds into (-π, π] across the anti-meridian', () => {
    expect(__testing.wrapDLon(Math.PI)).to.be.closeTo(Math.PI, 1e-12) // +π stays
    expect(__testing.wrapDLon(Math.PI + 0.1)).to.be.closeTo(
      -Math.PI + 0.1,
      1e-12
    )
    expect(__testing.wrapDLon(-Math.PI - 0.1)).to.be.closeTo(
      Math.PI - 0.1,
      1e-12
    )
    expect(__testing.wrapDLon(0)).to.equal(0)
  })
})
