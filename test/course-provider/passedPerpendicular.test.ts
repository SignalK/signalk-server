import { expect } from 'chai'
import { computeCourseGeometry } from '../../packages/course-provider-plugin/src/course-math'

const TO_RAD = Math.PI / 180

interface Pt {
  lat: number
  lon: number
}

// Real-world regression fixtures from prior incidents (Götenburg coastal
// + a Pacific dateline-crossing leg). Each call exercises the
// passedPerpendicular flag inside the single-pass course-math output.
function passedPerpendicular(vessel: Pt, dest: Pt, start: Pt): boolean {
  return computeCourseGeometry(
    vessel.lat * TO_RAD,
    vessel.lon * TO_RAD,
    dest.lat * TO_RAD,
    dest.lon * TO_RAD,
    start.lat * TO_RAD,
    start.lon * TO_RAD
  ).passedPerpendicular
}

describe('Passed Perpendicular', () => {
  // Götenburg coastal leg: start south, destination north (and slightly
  // west). The two TRUE cases sit past the destination on opposite sides
  // of the track, exercising both signs of the internal bearing diff.
  const startPosition = { lat: 57.58684, lon: 11.106578 }
  const destPosition = { lat: 57.61672, lon: 11.10488 }

  it('returns false when the vessel has not yet reached the perpendicular', () => {
    const vesselPosition = { lat: 57.61657, lon: 11.10054 }
    expect(passedPerpendicular(vesselPosition, destPosition, startPosition)).to
      .be.false
  })

  it('returns false for a vessel further back along the approach', () => {
    const vesselPosition = { lat: 57.61505, lon: 11.10054 }
    expect(passedPerpendicular(vesselPosition, destPosition, startPosition)).to
      .be.false
  })

  it('returns true once the vessel passes the perpendicular (west of destination)', () => {
    const vesselPosition = { lat: 57.61905, lon: 11.10306 }
    expect(passedPerpendicular(vesselPosition, destPosition, startPosition)).to
      .be.true
  })

  it('returns true once the vessel passes the perpendicular (east of destination)', () => {
    const vesselPosition = { lat: 57.61905, lon: 11.107 }
    expect(passedPerpendicular(vesselPosition, destPosition, startPosition)).to
      .be.true
  })
})

describe('Dateline crossing', () => {
  it('(E to W) should return FALSE', () => {
    const startPosition = { lat: -35.9749, lon: 179.89971 }
    const destPosition = { lat: -35.95874, lon: -179.22151 }
    const vesselPosition = { lat: -35.93179, lon: 179.933 }
    expect(passedPerpendicular(vesselPosition, destPosition, startPosition)).to
      .be.false
  })

  it('(E to W) should return TRUE', () => {
    const startPosition = { lat: -35.9749, lon: 179.89971 }
    const destPosition = { lat: -35.95874, lon: -179.22151 }
    const vesselPosition = { lat: -35.90753, lon: -179.21486 }
    expect(passedPerpendicular(vesselPosition, destPosition, startPosition)).to
      .be.true
  })

  it('(W to E) should return FALSE', () => {
    const startPosition = { lat: -35.95874, lon: -179.22151 }
    const destPosition = { lat: -35.9749, lon: 179.89971 }
    const vesselPosition = { lat: -35.93179, lon: -179.95716 }
    expect(passedPerpendicular(vesselPosition, destPosition, startPosition)).to
      .be.false
  })

  it('(W to E) should return TRUE', () => {
    const startPosition = { lat: -35.95874, lon: -179.22151 }
    const destPosition = { lat: -35.9749, lon: 179.89971 }
    const vesselPosition = { lat: -35.90753, lon: 179.87308 }
    expect(passedPerpendicular(vesselPosition, destPosition, startPosition)).to
      .be.true
  })
})
