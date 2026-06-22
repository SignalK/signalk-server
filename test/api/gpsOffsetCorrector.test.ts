import { expect } from 'chai'
import { EventEmitter } from 'node:events'
import { correctPosition } from '../../src/api/gpsOffsetCorrector/leverArm'
import { GpsOffsetCorrector } from '../../src/api/gpsOffsetCorrector'
import type { Delta } from '@signalk/server-api'

const SELF = 'vessels.self'
const R = 6_378_137

// Build a minimal Delta for navigation.position carrying the given source.
function positionDelta(opts: {
  sourceRef: string
  latitude: number
  longitude: number
  altitude?: number
  context?: string
}): Delta {
  return {
    context: (opts.context ?? SELF) as unknown as Delta['context'],
    updates: [
      {
        $source: opts.sourceRef as unknown as never,
        timestamp: '2026-05-31T00:00:00.000Z' as unknown as never,
        values: [
          {
            path: 'navigation.position' as unknown as never,
            value: {
              latitude: opts.latitude,
              longitude: opts.longitude,
              altitude: opts.altitude
            }
          }
        ]
      }
    ]
  }
}

interface AppEnvOptions {
  // Values to expose under app.signalk.self, keyed by dotted path
  // (e.g. 'design.length.value' or 'navigation.headingTrue.value').
  selfPaths?: Record<string, unknown>
  gpsSensors?: Array<{
    sensorId: string
    sourceRef: string
    fromBow: number | null
    fromCenter: number | null
  }>
}

// Build a nested object from a {dottedPath: value} map so lodash `get`
// resolves the same way it would against the real FullSignalK tree.
function inflateSelfPaths(paths: Record<string, unknown>): object {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const out: any = {}
  for (const [path, value] of Object.entries(paths)) {
    const parts = path.split('.')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let cursor: any = out
    for (let i = 0; i < parts.length - 1; i++) {
      const key = parts[i]
      if (cursor[key] === undefined || typeof cursor[key] !== 'object') {
        cursor[key] = {}
      }
      cursor = cursor[key]
    }
    cursor[parts[parts.length - 1]] = value
  }
  return out
}

function makeApp(opts: AppEnvOptions = {}) {
  const bus = new EventEmitter()
  let registeredHandler:
    | ((delta: Delta, next: (d: Delta) => void) => void)
    | undefined
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const app: any = bus
  app.selfContext = SELF
  app.config = {
    settings: opts.gpsSensors ? { gpsSensors: opts.gpsSensors } : {}
  }
  app.signalk = { self: inflateSelfPaths(opts.selfPaths ?? {}) }
  app.registerDeltaInputHandler = (
    handler: (delta: Delta, next: (d: Delta) => void) => void
  ) => {
    registeredHandler = handler
  }
  return {
    app,
    bus,
    process(delta: Delta): Delta {
      // Mirror the chain's invocation pattern: handler calls next(delta).
      // next() in the real chain forwards to the next handler; here we
      // capture the final delta and return it.
      let out: Delta = delta
      registeredHandler?.(delta, (d: Delta) => {
        out = d
      })
      return out
    }
  }
}

describe('leverArm.correctPosition', function () {
  it('antenna at the bow, vessel pointing north: CCRP is 10m south', function () {
    // length=20, antenna at fromBow=0 (the bow), heading north.
    // Physically: bow=north, antenna at the bow, CCRP at midships
    // (10m astern). So CCRP is 10m south of the antenna -> corrected
    // latitude decreases by 10/R degrees.
    const out = correctPosition(
      { latitude: 60, longitude: 24 },
      { fromBow: 0, fromCenter: 0 },
      20,
      0
    )
    const expectedDLat = ((-10 / R) * 180) / Math.PI
    expect(out.latitude).to.be.closeTo(60 + expectedDLat, 1e-9)
    expect(out.longitude).to.equal(24)
  })

  it('antenna at the bow, vessel pointing east: CCRP is 10m west', function () {
    // length=20, antenna at fromBow=0, heading east (pi/2).
    // Physically: bow=east, antenna at the bow, CCRP at midships
    // (10m astern = 10m west). longitude decreases by 10/(R cos lat).
    const out = correctPosition(
      { latitude: 60, longitude: 24 },
      { fromBow: 0, fromCenter: 0 },
      20,
      Math.PI / 2
    )
    const latRad = (60 * Math.PI) / 180
    const expectedDLon = ((-10 / (R * Math.cos(latRad))) * 180) / Math.PI
    expect(out.longitude).to.be.closeTo(24 + expectedDLon, 1e-9)
    expect(out.latitude).to.be.closeTo(60, 1e-9)
  })

  it('port-side antenna at midships, vessel pointing north: CCRP is to the east', function () {
    // antenna at midships (fromBow = length/2 = 10) with fromCenter=2
    // (2m to port of centerline). Physically: heading north -> port
    // is west, so the antenna sits 2m west of the centerline; the
    // CCRP is on the centerline (2m east of antenna). Longitude
    // increases by 2/(R cos lat).
    const out = correctPosition(
      { latitude: 60, longitude: 24 },
      { fromBow: 10, fromCenter: 2 },
      20,
      0
    )
    const latRad = (60 * Math.PI) / 180
    const expectedDLon = ((2 / (R * Math.cos(latRad))) * 180) / Math.PI
    expect(out.longitude).to.be.closeTo(24 + expectedDLon, 1e-9)
    expect(out.latitude).to.be.closeTo(60, 1e-9)
  })

  it('starboard-side antenna at midships, vessel pointing north: CCRP is to the west', function () {
    // Mirror of the previous case: fromCenter=-2 (starboard) ->
    // antenna 2m east of centerline at heading north -> CCRP 2m west.
    const out = correctPosition(
      { latitude: 60, longitude: 24 },
      { fromBow: 10, fromCenter: -2 },
      20,
      0
    )
    const latRad = (60 * Math.PI) / 180
    const expectedDLon = ((-2 / (R * Math.cos(latRad))) * 180) / Math.PI
    expect(out.longitude).to.be.closeTo(24 + expectedDLon, 1e-9)
  })

  it('antenna exactly at CCRP yields identity', function () {
    // fromBow=length/2, fromCenter=0 -> body_x=0, body_y=0 -> zero shift.
    const out = correctPosition(
      { latitude: 60, longitude: 24, altitude: 5 },
      { fromBow: 10, fromCenter: 0 },
      20,
      Math.PI / 3
    )
    expect(out.latitude).to.be.closeTo(60, 1e-12)
    expect(out.longitude).to.be.closeTo(24, 1e-12)
    expect(out.altitude).to.equal(5)
  })

  it('preserves altitude through correction', function () {
    const out = correctPosition(
      { latitude: 60, longitude: 24, altitude: 12.5 },
      { fromBow: 0, fromCenter: 0 },
      20,
      0
    )
    expect(out.altitude).to.equal(12.5)
  })

  it('handles negative latitude (southern hemisphere)', function () {
    // Antenna at bow, vessel pointing east at lat=-45: CCRP 10m west.
    const out = correctPosition(
      { latitude: -45, longitude: 170 },
      { fromBow: 0, fromCenter: 0 },
      20,
      Math.PI / 2
    )
    const latRad = (-45 * Math.PI) / 180
    const expectedDLon = ((-10 / (R * Math.cos(latRad))) * 180) / Math.PI
    expect(out.longitude).to.be.closeTo(170 + expectedDLon, 1e-9)
  })

  it('wraps longitude across the antimeridian (eastward)', function () {
    // Antenna just west of +180 longitude at the equator, vessel pointing
    // west (heading 3pi/2). At the bow with length=20 the CCRP sits 10m
    // east of the antenna. The raw sum 179.9999... + 10/R*180/pi exceeds
    // +180 and must wrap to a small negative longitude near -180.
    const out = correctPosition(
      { latitude: 0, longitude: 179.99999 },
      { fromBow: 0, fromCenter: 0 },
      20,
      (3 * Math.PI) / 2
    )
    const rawLon = 179.99999 + ((10 / R) * 180) / Math.PI
    const expectedLon = ((((rawLon + 180) % 360) + 360) % 360) - 180
    expect(out.longitude).to.be.closeTo(expectedLon, 1e-9)
    // Sanity: the wrap really did cross the antimeridian (raw > 180).
    expect(rawLon).to.be.greaterThan(180)
    expect(expectedLon).to.be.lessThan(0)
  })

  it('wraps longitude across the antimeridian (westward)', function () {
    // Mirror case: antenna just east of -180 longitude, heading east
    // (pi/2). At the bow the CCRP is 10m west; raw sum drops below
    // -180 and must wrap up to a value near +180.
    const out = correctPosition(
      { latitude: 0, longitude: -179.99999 },
      { fromBow: 0, fromCenter: 0 },
      20,
      Math.PI / 2
    )
    const rawLon = -179.99999 + ((-10 / R) * 180) / Math.PI
    const expectedLon = ((((rawLon + 180) % 360) + 360) % 360) - 180
    expect(out.longitude).to.be.closeTo(expectedLon, 1e-9)
    // Sanity: the wrap really did cross the antimeridian (raw < -180).
    expect(rawLon).to.be.lessThan(-180)
    expect(expectedLon).to.be.greaterThan(0)
  })
})

describe('GpsOffsetCorrector handler', function () {
  it('rewrites navigation.position and adds meta when sensor matches', async function () {
    const { app, process } = makeApp({
      selfPaths: {
        'design.length.value': { overall: 20 },
        'navigation.headingTrue.value': 0
      },
      gpsSensors: [
        { sensorId: 'gps1', sourceRef: 'n2k.0.5', fromBow: 0, fromCenter: 0 }
      ]
    })
    const corrector = new GpsOffsetCorrector(app)
    await corrector.start()
    const delta = positionDelta({
      sourceRef: 'n2k.0.5',
      latitude: 60,
      longitude: 24
    })
    const out = process(delta)
    const update = out.updates[0] as never as {
      values: { value: { latitude: number; longitude: number } }[]
      meta?: {
        value: {
          gpsOffsetCorrection?: {
            sensorId: string
            fromBow: number
            fromCenter: number
            lengthOverall: number
            headingTrue: number
            rawValue: { latitude: number; longitude: number }
          }
        }
      }[]
    }
    const expectedDLat = ((-10 / R) * 180) / Math.PI
    expect(update.values[0].value.latitude).to.be.closeTo(
      60 + expectedDLat,
      1e-9
    )
    expect(update.meta).to.have.length(1)
    expect(update.meta![0].value.gpsOffsetCorrection).to.deep.equal({
      sensorId: 'gps1',
      fromBow: 0,
      fromCenter: 0,
      lengthOverall: 20,
      headingTrue: 0,
      rawValue: { latitude: 60, longitude: 24, altitude: undefined }
    })
  })

  it('passes through unchanged when sourceRef is not configured', async function () {
    const { app, process } = makeApp({
      selfPaths: {
        'design.length.value': { overall: 20 },
        'navigation.headingTrue.value': 0
      },
      gpsSensors: [
        { sensorId: 'gps1', sourceRef: 'n2k.0.5', fromBow: 5, fromCenter: 0 }
      ]
    })
    const corrector = new GpsOffsetCorrector(app)
    await corrector.start()
    const delta = positionDelta({
      sourceRef: 'gp.GP',
      latitude: 60,
      longitude: 24
    })
    const out = process(delta)
    const update = out.updates[0] as never as {
      values: { value: { latitude: number; longitude: number } }[]
      meta?: unknown[]
    }
    expect(update.values[0].value.latitude).to.equal(60)
    expect(update.values[0].value.longitude).to.equal(24)
    expect(update.meta).to.equal(undefined)
  })

  it('ignores rows with an empty sourceRef (no wildcard hijack)', async function () {
    // A partially-edited row (offset set, sourceRef still blank) must not
    // act as a catch-all for every position delta. Otherwise filling in
    // an offset before assigning a source would silently apply that
    // correction to whatever stream wins next.
    const { app, process } = makeApp({
      selfPaths: {
        'design.length.value': { overall: 20 },
        'navigation.headingTrue.value': 0
      },
      gpsSensors: [
        { sensorId: 'gps0', sourceRef: '', fromBow: 5, fromCenter: 0 }
      ]
    })
    const corrector = new GpsOffsetCorrector(app)
    await corrector.start()
    const delta = positionDelta({
      sourceRef: 'anything.really',
      latitude: 60,
      longitude: 24
    })
    const out = process(delta)
    const update = out.updates[0] as never as {
      values: { value: { latitude: number; longitude: number } }[]
      meta?: unknown[]
    }
    expect(update.values[0].value.latitude).to.equal(60)
    expect(update.values[0].value.longitude).to.equal(24)
    expect(update.meta).to.equal(undefined)
  })

  it('ignores rows where one axis is still null (no zero-fill correction)', async function () {
    // gpsSensors row schema allows null offsets to mean "not configured
    // yet". Coercing null to 0 in the correction would silently fabricate
    // geometry for a half-edited row; the handler skips such rows so the
    // delta passes through unmodified until the user finishes the row.
    const { app, process } = makeApp({
      selfPaths: {
        'design.length.value': { overall: 20 },
        'navigation.headingTrue.value': 0
      },
      gpsSensors: [
        {
          sensorId: 'gps1',
          sourceRef: 'n2k.0.5',
          fromBow: 5,
          fromCenter: null
        }
      ]
    })
    const corrector = new GpsOffsetCorrector(app)
    await corrector.start()
    const delta = positionDelta({
      sourceRef: 'n2k.0.5',
      latitude: 60,
      longitude: 24
    })
    const out = process(delta)
    const update = out.updates[0] as never as {
      values: { value: { latitude: number; longitude: number } }[]
      meta?: unknown[]
    }
    expect(update.values[0].value.latitude).to.equal(60)
    expect(update.values[0].value.longitude).to.equal(24)
    expect(update.meta).to.equal(undefined)
  })

  it('passes through when heading is unavailable', async function () {
    const { app, process } = makeApp({
      selfPaths: { 'design.length.value': { overall: 20 } },
      gpsSensors: [
        { sensorId: 'gps1', sourceRef: 'n2k.0.5', fromBow: 0, fromCenter: 0 }
      ]
    })
    const corrector = new GpsOffsetCorrector(app)
    await corrector.start()
    const delta = positionDelta({
      sourceRef: 'n2k.0.5',
      latitude: 60,
      longitude: 24
    })
    const out = process(delta)
    const update = out.updates[0] as never as {
      values: { value: { latitude: number; longitude: number } }[]
      meta?: unknown[]
    }
    expect(update.values[0].value.latitude).to.equal(60)
    expect(update.values[0].value.longitude).to.equal(24)
    expect(update.meta).to.equal(undefined)
  })

  it('passes through when design.length.overall is unset', async function () {
    const { app, process } = makeApp({
      selfPaths: { 'navigation.headingTrue.value': 0 },
      gpsSensors: [
        { sensorId: 'gps1', sourceRef: 'n2k.0.5', fromBow: 0, fromCenter: 0 }
      ]
    })
    const corrector = new GpsOffsetCorrector(app)
    await corrector.start()
    const delta = positionDelta({
      sourceRef: 'n2k.0.5',
      latitude: 60,
      longitude: 24
    })
    const out = process(delta)
    const update = out.updates[0] as never as {
      values: { value: { latitude: number; longitude: number } }[]
      meta?: unknown[]
    }
    expect(update.values[0].value.latitude).to.equal(60)
    expect(update.meta).to.equal(undefined)
  })

  it('accepts plain-number design.length.value (legacy SK shape)', async function () {
    // design.length.value may be stored as either { overall: N } (new
    // shape) or a bare number (legacy single-value shape). The corrector
    // must handle both so users with older defaults files still get
    // lever-arm correction without rewriting their base deltas.
    const { app, process } = makeApp({
      selfPaths: {
        'design.length.value': 20,
        'navigation.headingTrue.value': 0
      },
      gpsSensors: [
        { sensorId: 'gps1', sourceRef: 'n2k.0.5', fromBow: 0, fromCenter: 0 }
      ]
    })
    const corrector = new GpsOffsetCorrector(app)
    await corrector.start()
    const delta = positionDelta({
      sourceRef: 'n2k.0.5',
      latitude: 60,
      longitude: 24
    })
    const out = process(delta)
    const update = out.updates[0] as never as {
      values: { value: { latitude: number; longitude: number } }[]
      meta: {
        value: { gpsOffsetCorrection: { lengthOverall: number } }
      }[]
    }
    const expectedDLat = ((-10 / R) * 180) / Math.PI
    expect(update.values[0].value.latitude).to.be.closeTo(
      60 + expectedDLat,
      1e-9
    )
    expect(update.meta[0].value.gpsOffsetCorrection.lengthOverall).to.equal(20)
  })

  it('falls back to headingMagnetic + magneticVariation when headingTrue is unset', async function () {
    const { app, process } = makeApp({
      selfPaths: {
        'design.length.value': { overall: 20 },
        'navigation.headingMagnetic.value': Math.PI / 2 - 0.1,
        'navigation.magneticVariation.value': 0.1
      },
      gpsSensors: [
        { sensorId: 'gps1', sourceRef: 'n2k.0.5', fromBow: 0, fromCenter: 0 }
      ]
    })
    const corrector = new GpsOffsetCorrector(app)
    await corrector.start()
    const delta = positionDelta({
      sourceRef: 'n2k.0.5',
      latitude: 60,
      longitude: 24
    })
    const out = process(delta)
    const update = out.updates[0] as never as {
      meta: {
        value: { gpsOffsetCorrection: { headingTrue: number } }
      }[]
    }
    expect(update.meta[0].value.gpsOffsetCorrection.headingTrue).to.be.closeTo(
      Math.PI / 2,
      1e-12
    )
  })

  it('passes through deltas from non-self contexts', async function () {
    const { app, process } = makeApp({
      selfPaths: {
        'design.length.value': { overall: 20 },
        'navigation.headingTrue.value': 0
      },
      gpsSensors: [
        { sensorId: 'gps1', sourceRef: 'n2k.0.5', fromBow: 0, fromCenter: 0 }
      ]
    })
    const corrector = new GpsOffsetCorrector(app)
    await corrector.start()
    const delta = positionDelta({
      sourceRef: 'n2k.0.5',
      latitude: 60,
      longitude: 24,
      context: 'vessels.urn:mrn:imo:mmsi:999'
    })
    const out = process(delta)
    const update = out.updates[0] as never as {
      values: { value: { latitude: number } }[]
      meta?: unknown[]
    }
    expect(update.values[0].value.latitude).to.equal(60)
    expect(update.meta).to.equal(undefined)
  })

  it('passes through deltas whose path is not navigation.position', async function () {
    const { app, process } = makeApp({
      selfPaths: {
        'design.length.value': { overall: 20 },
        'navigation.headingTrue.value': 0
      },
      gpsSensors: [
        { sensorId: 'gps1', sourceRef: 'n2k.0.5', fromBow: 0, fromCenter: 0 }
      ]
    })
    const corrector = new GpsOffsetCorrector(app)
    await corrector.start()
    const delta: Delta = {
      context: SELF as unknown as Delta['context'],
      updates: [
        {
          $source: 'n2k.0.5' as unknown as never,
          timestamp: '2026-05-31T00:00:00.000Z' as unknown as never,
          values: [
            {
              path: 'navigation.speedOverGround' as unknown as never,
              value: 5.2
            }
          ]
        }
      ]
    }
    const out = process(delta)
    const update = out.updates[0] as never as {
      values: { value: number }[]
      meta?: unknown[]
    }
    expect(update.values[0].value).to.equal(5.2)
    expect(update.meta).to.equal(undefined)
  })

  it('rebuilds lookup on GPS_SENSORS server event', async function () {
    const { app, bus, process } = makeApp({
      selfPaths: {
        'design.length.value': { overall: 20 },
        'navigation.headingTrue.value': 0
      },
      gpsSensors: []
    })
    const corrector = new GpsOffsetCorrector(app)
    await corrector.start()

    // No sensors configured -> passthrough.
    const before = process(
      positionDelta({ sourceRef: 'n2k.0.5', latitude: 60, longitude: 24 })
    )
    const beforeUpdate = before.updates[0] as never as {
      values: { value: { latitude: number } }[]
    }
    expect(beforeUpdate.values[0].value.latitude).to.equal(60)

    // User edits config. settings.gpsSensors changes BEFORE the event fires.
    app.config.settings.gpsSensors = [
      { sensorId: 'gps1', sourceRef: 'n2k.0.5', fromBow: 0, fromCenter: 0 }
    ]
    bus.emit('serverevent', { type: 'GPS_SENSORS', data: [] })

    const after = process(
      positionDelta({ sourceRef: 'n2k.0.5', latitude: 60, longitude: 24 })
    )
    const afterUpdate = after.updates[0] as never as {
      values: { value: { latitude: number } }[]
    }
    const expectedDLat = ((-10 / R) * 180) / Math.PI
    expect(afterUpdate.values[0].value.latitude).to.be.closeTo(
      60 + expectedDLat,
      1e-9
    )
  })

  it('preserves the raw value object reference (does not mutate it in place)', async function () {
    const { app, process } = makeApp({
      selfPaths: {
        'design.length.value': { overall: 20 },
        'navigation.headingTrue.value': 0
      },
      gpsSensors: [
        { sensorId: 'gps1', sourceRef: 'n2k.0.5', fromBow: 0, fromCenter: 0 }
      ]
    })
    const corrector = new GpsOffsetCorrector(app)
    await corrector.start()
    const delta = positionDelta({
      sourceRef: 'n2k.0.5',
      latitude: 60,
      longitude: 24
    })
    const rawObj = (
      delta.updates[0] as never as {
        values: { value: object }[]
      }
    ).values[0].value
    const out = process(delta)
    const update = out.updates[0] as never as {
      values: { value: object }[]
      meta: { value: { gpsOffsetCorrection: { rawValue: object } } }[]
    }
    // Corrected value is a new object.
    expect(update.values[0].value).to.not.equal(rawObj)
    // Raw value preserved by reference under meta.
    expect(update.meta[0].value.gpsOffsetCorrection.rawValue).to.equal(rawObj)
  })
})
