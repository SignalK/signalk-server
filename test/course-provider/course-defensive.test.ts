import { expect } from 'chai'
import { resetModuleCache } from './helpers'

// Force-reload the course module so this suite gets a fresh closure; the
// require cache may already hold a copy loaded (and mocked) by an earlier
// suite.
resetModuleCache('../../packages/course-provider-plugin/src/lib/course')

const courseModule =
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('../../packages/course-provider-plugin/src/lib/course') as {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    parseSKPaths: (src: any) => boolean
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vmg: (src: any) => number | null
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vmc: (src: any, brg: number) => number | null
    timeCalcs: (
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      src: any,
      distance: number,
      vmc: number,
      passedPerp: boolean
    ) => {
      nextPoint: { ttg: number | null; eta: string | null }
      route: { ttg: number | null; eta: string | null; dtg: number | null }
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    targetSpeed: (src: any, distance: number) => number | null
  }

const { parseSKPaths, vmg, vmc, timeCalcs, targetSpeed } = courseModule

describe('course calculations defensive guards', () => {
  it('parseSKPaths returns false when required positions are missing', () => {
    const src = {
      'navigation.course.nextPoint': {
        position: { latitude: 1, longitude: 2 }
      },
      'navigation.course.previousPoint': {
        position: { latitude: 1, longitude: 2 }
      }
    }

    expect(parseSKPaths(src)).to.equal(false)
  })

  it('parseSKPaths returns true when position and both course points are present', () => {
    const src = {
      'navigation.position': { latitude: 0, longitude: 0 },
      'navigation.course.nextPoint': {
        position: { latitude: 1, longitude: 2 }
      },
      'navigation.course.previousPoint': {
        position: { latitude: 3, longitude: 4 }
      }
    }

    expect(parseSKPaths(src)).to.equal(true)
  })

  it('parseSKPaths returns false when previousPoint is missing', () => {
    const src = {
      'navigation.position': { latitude: 0, longitude: 0 },
      'navigation.course.nextPoint': {
        position: { latitude: 1, longitude: 2 }
      }
    }

    expect(parseSKPaths(src)).to.equal(false)
  })

  it('parseSKPaths returns false when nextPoint is missing', () => {
    const src = {
      'navigation.position': { latitude: 0, longitude: 0 },
      'navigation.course.previousPoint': {
        position: { latitude: 3, longitude: 4 }
      }
    }

    expect(parseSKPaths(src)).to.equal(false)
  })

  it('vmg returns null when wind or speed is missing', () => {
    const srcMissingWind = { 'navigation.speedOverGround': 3 }
    const srcMissingSpeed = { 'environment.wind.angleTrueGround': 0.5 }

    expect(vmg(srcMissingWind)).to.be.null
    expect(vmg(srcMissingSpeed)).to.be.null
  })

  it('vmc returns null when course or speed is missing', () => {
    const srcMissingCog = { 'navigation.speedOverGround': 3 }
    const srcMissingSpeed = { 'navigation.courseOverGroundTrue': 1.2 }

    expect(vmc(srcMissingCog, 1.5)).to.be.null
    expect(vmc(srcMissingSpeed, 1.5)).to.be.null
  })

  it('timeCalcs returns empty results when vmc is non-positive', () => {
    const src = {
      'navigation.datetime': '2020-01-01T00:00:00.000Z'
    }
    const result = timeCalcs(src, 100, -1, false)

    expect(result.nextPoint.ttg).to.be.null
    expect(result.nextPoint.eta).to.be.null
  })

  it('timeCalcs returns empty results when vmc is zero', () => {
    const src = {
      'navigation.datetime': '2020-01-01T00:00:00.000Z'
    }
    const result = timeCalcs(src, 100, 0, false)

    expect(result.nextPoint.ttg).to.be.null
    expect(result.nextPoint.eta).to.be.null
  })

  it('timeCalcs still reports route.dtg when vmc is non-positive (DTG is pure geometry)', () => {
    // The vessel has just rounded a mark: vmc is momentarily negative, but
    // the remaining route distance has not changed and must still be
    // reported. TTG/ETA remain null — they are undefined without a
    // positive closing speed.
    const src = {
      'navigation.datetime': '2020-01-01T00:00:00.000Z',
      activeRoute: {
        waypoints: [
          [0, 0],
          [1, 0],
          [2, 0]
        ],
        pointIndex: 0,
        reverse: false
      }
    }
    const result = timeCalcs(src, 500, -1, false)

    expect(result.nextPoint.ttg).to.be.null
    expect(result.nextPoint.eta).to.be.null
    expect(result.route.ttg).to.be.null
    expect(result.route.eta).to.be.null
    expect(result.route.dtg).to.be.a('number')
    expect(result.route.dtg).to.be.greaterThan(500)
  })

  it('targetSpeed returns null for invalid targetArrivalTime', () => {
    const src = {
      'navigation.datetime': '2020-01-01T00:00:00.000Z',
      'navigation.course.targetArrivalTime': 'invalid'
    }

    expect(targetSpeed(src, 100)).to.be.null
  })
})

describe('timeCalcs / targetSpeed positive paths', () => {
  // Pins the arithmetic so the Date-allocation refactor can't change
  // observable outputs (TTG seconds, ETA ISO string, targetSpeed).

  it('timeCalcs derives TTG and ETA from an ISO datetime', () => {
    // 1000 m at 10 m/s = 100 s -> ETA = base + 100 s
    const src = { 'navigation.datetime': '2020-01-01T00:00:00.000Z' }
    const result = timeCalcs(src, 1000, 10, false)

    expect(result.nextPoint.ttg).to.equal(100)
    expect(result.nextPoint.eta).to.equal('2020-01-01T00:01:40.000Z')
    expect(result.route.ttg).to.be.null
    expect(result.route.eta).to.be.null
  })

  it('timeCalcs accepts numeric epoch-ms datetime (legacy tolerance)', () => {
    // 2020-01-01T00:00:00.000Z = 1577836800000 ms
    const src = { 'navigation.datetime': 1577836800000 }
    const result = timeCalcs(src, 500, 5, false)

    expect(result.nextPoint.ttg).to.equal(100)
    expect(result.nextPoint.eta).to.equal('2020-01-01T00:01:40.000Z')
  })

  it('timeCalcs falls back to current time when datetime is missing', () => {
    const before = Date.now()
    const result = timeCalcs({}, 200, 10, false)
    const after = Date.now()

    expect(result.nextPoint.ttg).to.equal(20)
    expect(result.nextPoint.eta).to.not.be.null
    const etaMs = Date.parse(result.nextPoint.eta as string)
    // ETA should land in [before+20s, after+20s]
    expect(etaMs).to.be.at.least(before + 20_000)
    expect(etaMs).to.be.at.most(after + 20_000)
  })

  it('targetSpeed computes average speed from time-to-arrival window', () => {
    // 1000 m over 500 s -> 2 m/s
    const src = {
      'navigation.datetime': '2020-01-01T00:00:00.000Z',
      'navigation.course.targetArrivalTime': '2020-01-01T00:08:20.000Z'
    }
    expect(targetSpeed(src, 1000)).to.equal(2)
  })

  it('targetSpeed accepts numeric epoch-ms datetime and TAT', () => {
    const base = 1577836800000
    const src = {
      'navigation.datetime': base,
      'navigation.course.targetArrivalTime': base + 500_000
    }
    expect(targetSpeed(src, 1000)).to.equal(2)
  })

  it('targetSpeed returns null when current time is past targetArrivalTime', () => {
    const src = {
      'navigation.datetime': '2020-01-01T00:10:00.000Z',
      'navigation.course.targetArrivalTime': '2020-01-01T00:05:00.000Z'
    }
    expect(targetSpeed(src, 1000)).to.be.null
  })
})
