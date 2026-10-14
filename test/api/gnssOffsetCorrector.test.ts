import { expect } from 'chai'
import { EventEmitter } from 'node:events'
import { correctPosition } from '../../src/api/gnssOffsetCorrector/leverArm'
import { GnssOffsetCorrector } from '../../src/api/gnssOffsetCorrector'
import type { Delta, NormalizedDelta } from '@signalk/server-api'

const SELF = 'vessels.self'
const R = 6_378_137

// Build a minimal Delta for navigation.position carrying the given source.
function positionDelta(opts: {
  $source: string
  latitude: number
  longitude: number
  altitude?: number
  context?: string
}): Delta {
  return {
    context: (opts.context ?? SELF) as unknown as Delta['context'],
    updates: [
      {
        $source: opts.$source as unknown as never,
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
  // (e.g. 'design.length.value' or 'navigation.headingTrue.value'). A
  // heading given here also arrives on the self bus as the corrector
  // subscribes, as a live heading would.
  selfPaths?: Record<string, unknown>
  gnssSensors?: Array<{
    sensorId: string
    $source: string
    fromBow: number | null
    fromCenter: number | null
  }>
  // settings.gnssCorrection; the corrector's production default is 'off',
  // so tests exercising correction behavior pass 'replace' explicitly.
  gnssCorrection?: 'off' | 'replace' | 'both'
  // Alias → canonical source-ref translations, mimicking
  // deltaCache.canonicaliseSourceRef (identity when absent).
  canonicalMap?: Record<string, string>
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
    ((delta: Delta, next: (d: Delta) => void) => void) | undefined
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const app: any = bus
  app.selfContext = SELF
  app.config = {
    settings: {
      ...(opts.gnssSensors ? { gnssSensors: opts.gnssSensors } : {}),
      ...(opts.gnssCorrection ? { gnssCorrection: opts.gnssCorrection } : {})
    }
  }
  app.signalk = { self: inflateSelfPaths(opts.selfPaths ?? {}) }
  const headingListeners = new Map<
    string,
    Array<(d: NormalizedDelta) => void>
  >()
  const pushHeading = (path: string, value: number | null) => {
    for (const listener of headingListeners.get(path) ?? []) {
      listener({ path, value, isMeta: false } as unknown as NormalizedDelta)
    }
  }
  app.streambundle = {
    getSelfBus: (path: string) => ({
      onValue: (listener: (d: NormalizedDelta) => void) => {
        headingListeners.set(path, [
          ...(headingListeners.get(path) ?? []),
          listener
        ])
        const initial = opts.selfPaths?.[`${path}.value`]
        if (typeof initial === 'number') pushHeading(path, initial)
      }
    })
  }
  app.deltaCache = {
    canonicaliseSourceRef: (ref: string) => opts.canonicalMap?.[ref] ?? ref
  }
  app.registerDeltaInputHandler = (
    handler: (delta: Delta, next: (d: Delta) => void) => void
  ) => {
    registeredHandler = handler
  }
  const emitted: Array<{ id: string; delta: Partial<Delta> }> = []
  app.handleMessage = (id: string, delta: Partial<Delta>) => {
    emitted.push({ id, delta })
  }
  return {
    app,
    bus,
    emitted,
    pushHeading,
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
    // antenna at midships (fromBow = length/2 = 10) with fromCenter=-2
    // (2m to port of centerline). Physically: heading north -> port
    // is west, so the antenna sits 2m west of the centerline; the
    // CCRP is on the centerline (2m east of antenna). Longitude
    // increases by 2/(R cos lat).
    const out = correctPosition(
      { latitude: 60, longitude: 24 },
      { fromBow: 10, fromCenter: -2 },
      20,
      0
    )
    const latRad = (60 * Math.PI) / 180
    const expectedDLon = ((2 / (R * Math.cos(latRad))) * 180) / Math.PI
    expect(out.longitude).to.be.closeTo(24 + expectedDLon, 1e-9)
    expect(out.latitude).to.be.closeTo(60, 1e-9)
  })

  it('starboard-side antenna at midships, vessel pointing north: CCRP is to the west', function () {
    // Mirror of the previous case: fromCenter=2 (starboard) ->
    // antenna 2m east of centerline at heading north -> CCRP 2m west.
    const out = correctPosition(
      { latitude: 60, longitude: 24 },
      { fromBow: 10, fromCenter: 2 },
      20,
      0
    )
    const latRad = (60 * Math.PI) / 180
    const expectedDLon = ((-2 / (R * Math.cos(latRad))) * 180) / Math.PI
    expect(out.longitude).to.be.closeTo(24 + expectedDLon, 1e-9)
  })

  it('starboard antenna forward of midships, vessel pointing east', function () {
    // Both body components non-zero and the heading off-axis, so a sign
    // error in either term of the rotation shows up. fromBow=5 on a 20m
    // vessel -> body_x = 5-10 = -5 (CCRP is 5m aft); fromCenter=3
    // (starboard) -> body_y = -3 (CCRP is 3m to port of the antenna).
    // Heading 090 (east): the bow points east, so "aft" is west and
    // "port" is north.
    //   north = body_x*cos(90) - body_y*sin(90) = 0 - (-3) = +3
    //   east  = body_x*sin(90) + body_y*cos(90) = -5 + 0    = -5
    const out = correctPosition(
      { latitude: 60, longitude: 24 },
      { fromBow: 5, fromCenter: 3 },
      20,
      Math.PI / 2
    )
    const latRad = (60 * Math.PI) / 180
    const expectedDLat = ((3 / R) * 180) / Math.PI
    const expectedDLon = ((-5 / (R * Math.cos(latRad))) * 180) / Math.PI
    expect(out.latitude).to.be.closeTo(60 + expectedDLat, 1e-9)
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

describe('GnssOffsetCorrector handler', function () {
  it('rewrites navigation.position in place when sensor matches', async function () {
    const { app, process } = makeApp({
      selfPaths: {
        'design.length.value': { overall: 20 },
        'navigation.headingTrue.value': 0
      },
      gnssCorrection: 'replace',
      gnssSensors: [
        { sensorId: 'gnss1', $source: 'n2k.0.5', fromBow: 0, fromCenter: 0 }
      ]
    })
    const corrector = new GnssOffsetCorrector(app)
    await corrector.start()
    const delta = positionDelta({
      $source: 'n2k.0.5',
      latitude: 60,
      longitude: 24
    })
    const out = process(delta)
    const update = out.updates[0] as never as {
      values: { value: { latitude: number; longitude: number } }[]
      meta?: unknown
    }
    const expectedDLat = ((-10 / R) * 180) / Math.PI
    expect(update.values[0].value.latitude).to.be.closeTo(
      60 + expectedDLat,
      1e-9
    )
    // The correction no longer stamps provenance meta on the delta.
    expect(update.meta).to.equal(undefined)
  })

  it('corrects deltas tagged with a numeric-src alias of the configured source', async function () {
    // Rows hold the canonical (canName-form) ref offered by
    // positionSources; N2K frames that arrive before the address claim
    // is observed carry the numeric-src alias and must still match.
    const { app, process } = makeApp({
      selfPaths: {
        'design.length.value': { overall: 20 },
        'navigation.headingTrue.value': 0
      },
      gnssCorrection: 'replace',
      gnssSensors: [
        { sensorId: 'gnss1', $source: 'n2k.can123', fromBow: 0, fromCenter: 0 }
      ],
      canonicalMap: { 'n2k.5': 'n2k.can123' }
    })
    const corrector = new GnssOffsetCorrector(app)
    await corrector.start()
    const out = process(
      positionDelta({ $source: 'n2k.5', latitude: 60, longitude: 24 })
    )
    const update = out.updates[0] as never as {
      values: { value: { latitude: number } }[]
    }
    const expectedDLat = ((-10 / R) * 180) / Math.PI
    expect(update.values[0].value.latitude).to.be.closeTo(
      60 + expectedDLat,
      1e-9
    )
  })

  it('corrects when the config holds an alias and the delta the canonical ref', async function () {
    // Reverse of the previous case: the row was saved while only the
    // numeric-src alias was known; the device's canName has since
    // resolved and deltas arrive canonicalised. rebuildLookup must
    // canonicalise the configured ref so the row still matches.
    const { app, process } = makeApp({
      selfPaths: {
        'design.length.value': { overall: 20 },
        'navigation.headingTrue.value': 0
      },
      canonicalMap: { 'n2k.0.5': 'n2k.c032820059a81e3f' },
      gnssCorrection: 'replace',
      gnssSensors: [
        { sensorId: 'gnss1', $source: 'n2k.0.5', fromBow: 0, fromCenter: 0 }
      ]
    })
    const corrector = new GnssOffsetCorrector(app)
    await corrector.start()

    const out = process(
      positionDelta({
        $source: 'n2k.c032820059a81e3f',
        latitude: 60,
        longitude: 24
      })
    )

    const update = out.updates[0] as never as {
      values: { value: { latitude: number } }[]
    }
    expect(update.values[0].value.latitude).to.not.equal(60)
  })

  it('passes through unchanged when $source is not configured', async function () {
    const { app, process } = makeApp({
      selfPaths: {
        'design.length.value': { overall: 20 },
        'navigation.headingTrue.value': 0
      },
      gnssCorrection: 'replace',
      gnssSensors: [
        { sensorId: 'gnss1', $source: 'n2k.0.5', fromBow: 5, fromCenter: 0 }
      ]
    })
    const corrector = new GnssOffsetCorrector(app)
    await corrector.start()
    const delta = positionDelta({
      $source: 'gp.GP',
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

  it('ignores rows with an empty $source (no wildcard hijack)', async function () {
    // A partially-edited row (offset set, $source still blank) must not
    // act as a catch-all for every position delta. Otherwise filling in
    // an offset before assigning a source would silently apply that
    // correction to whatever stream wins next.
    const { app, process } = makeApp({
      selfPaths: {
        'design.length.value': { overall: 20 },
        'navigation.headingTrue.value': 0
      },
      gnssCorrection: 'replace',
      gnssSensors: [
        { sensorId: 'gnss0', $source: '', fromBow: 5, fromCenter: 0 }
      ]
    })
    const corrector = new GnssOffsetCorrector(app)
    await corrector.start()
    const delta = positionDelta({
      $source: 'anything.really',
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
    // gnssSensors row schema allows null offsets to mean "not configured
    // yet". Coercing null to 0 in the correction would silently fabricate
    // geometry for a half-edited row; the handler skips such rows so the
    // delta passes through unmodified until the user finishes the row.
    const { app, process } = makeApp({
      selfPaths: {
        'design.length.value': { overall: 20 },
        'navigation.headingTrue.value': 0
      },
      gnssCorrection: 'replace',
      gnssSensors: [
        {
          sensorId: 'gnss1',
          $source: 'n2k.0.5',
          fromBow: 5,
          fromCenter: null
        }
      ]
    })
    const corrector = new GnssOffsetCorrector(app)
    await corrector.start()
    const delta = positionDelta({
      $source: 'n2k.0.5',
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
      gnssCorrection: 'replace',
      gnssSensors: [
        { sensorId: 'gnss1', $source: 'n2k.0.5', fromBow: 0, fromCenter: 0 }
      ]
    })
    const corrector = new GnssOffsetCorrector(app)
    await corrector.start()
    const delta = positionDelta({
      $source: 'n2k.0.5',
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
      gnssCorrection: 'replace',
      gnssSensors: [
        { sensorId: 'gnss1', $source: 'n2k.0.5', fromBow: 0, fromCenter: 0 }
      ]
    })
    const corrector = new GnssOffsetCorrector(app)
    await corrector.start()
    const delta = positionDelta({
      $source: 'n2k.0.5',
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
    // vessel reference point correction without rewriting their base deltas.
    const { app, process } = makeApp({
      selfPaths: {
        'design.length.value': 20,
        'navigation.headingTrue.value': 0
      },
      gnssCorrection: 'replace',
      gnssSensors: [
        { sensorId: 'gnss1', $source: 'n2k.0.5', fromBow: 0, fromCenter: 0 }
      ]
    })
    const corrector = new GnssOffsetCorrector(app)
    await corrector.start()
    const delta = positionDelta({
      $source: 'n2k.0.5',
      latitude: 60,
      longitude: 24
    })
    const out = process(delta)
    const update = out.updates[0] as never as {
      values: { value: { latitude: number; longitude: number } }[]
    }
    // A plain-number design.length.value of 20 puts the CCRP 10 m aft of
    // the bow; the resulting latitude shift confirms the length was read.
    const expectedDLat = ((-10 / R) * 180) / Math.PI
    expect(update.values[0].value.latitude).to.be.closeTo(
      60 + expectedDLat,
      1e-9
    )
  })

  it('falls back to headingMagnetic + magneticVariation when headingTrue is unset', async function () {
    const { app, process } = makeApp({
      selfPaths: {
        'design.length.value': { overall: 20 },
        'navigation.headingMagnetic.value': Math.PI / 2 - 0.1,
        'navigation.magneticVariation.value': 0.1
      },
      gnssCorrection: 'replace',
      gnssSensors: [
        { sensorId: 'gnss1', $source: 'n2k.0.5', fromBow: 0, fromCenter: 0 }
      ]
    })
    const corrector = new GnssOffsetCorrector(app)
    await corrector.start()
    const delta = positionDelta({
      $source: 'n2k.0.5',
      latitude: 60,
      longitude: 24
    })
    const out = process(delta)
    const update = out.updates[0] as never as {
      values: { value: { latitude: number; longitude: number } }[]
    }
    // headingMagnetic (π/2 - 0.1) + magneticVariation (0.1) = π/2. The
    // corrected value must match correctPosition driven with that true
    // heading, proving the fallback was used.
    const expected = correctPosition(
      { latitude: 60, longitude: 24 },
      { fromBow: 0, fromCenter: 0 },
      20,
      Math.PI / 2
    )
    expect(update.values[0].value.latitude).to.be.closeTo(
      expected.latitude,
      1e-12
    )
    expect(update.values[0].value.longitude).to.be.closeTo(
      expected.longitude,
      1e-12
    )
  })

  it('passes through deltas from non-self contexts', async function () {
    const { app, process } = makeApp({
      selfPaths: {
        'design.length.value': { overall: 20 },
        'navigation.headingTrue.value': 0
      },
      gnssCorrection: 'replace',
      gnssSensors: [
        { sensorId: 'gnss1', $source: 'n2k.0.5', fromBow: 0, fromCenter: 0 }
      ]
    })
    const corrector = new GnssOffsetCorrector(app)
    await corrector.start()
    const delta = positionDelta({
      $source: 'n2k.0.5',
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
      gnssCorrection: 'replace',
      gnssSensors: [
        { sensorId: 'gnss1', $source: 'n2k.0.5', fromBow: 0, fromCenter: 0 }
      ]
    })
    const corrector = new GnssOffsetCorrector(app)
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

  it('rebuilds lookup on GNSS_SENSORS server event', async function () {
    const { app, bus, process } = makeApp({
      selfPaths: {
        'design.length.value': { overall: 20 },
        'navigation.headingTrue.value': 0
      },
      gnssCorrection: 'replace',
      gnssSensors: []
    })
    const corrector = new GnssOffsetCorrector(app)
    await corrector.start()

    // No sensors configured -> passthrough.
    const before = process(
      positionDelta({ $source: 'n2k.0.5', latitude: 60, longitude: 24 })
    )
    const beforeUpdate = before.updates[0] as never as {
      values: { value: { latitude: number } }[]
    }
    expect(beforeUpdate.values[0].value.latitude).to.equal(60)

    // User edits config. settings.gnssSensors changes BEFORE the event fires.
    app.config.settings.gnssSensors = [
      { sensorId: 'gnss1', $source: 'n2k.0.5', fromBow: 0, fromCenter: 0 }
    ]
    bus.emit('serverevent', { type: 'GNSS_SENSORS', data: [] })

    const after = process(
      positionDelta({ $source: 'n2k.0.5', latitude: 60, longitude: 24 })
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

  it('replaces the value with a new object rather than mutating the raw in place', async function () {
    const { app, process } = makeApp({
      selfPaths: {
        'design.length.value': { overall: 20 },
        'navigation.headingTrue.value': 0
      },
      gnssCorrection: 'replace',
      gnssSensors: [
        { sensorId: 'gnss1', $source: 'n2k.0.5', fromBow: 0, fromCenter: 0 }
      ]
    })
    const corrector = new GnssOffsetCorrector(app)
    await corrector.start()
    const delta = positionDelta({
      $source: 'n2k.0.5',
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
    }
    // Corrected value is a fresh object; correctPosition does not write
    // back into the provider's raw position object.
    expect(update.values[0].value).to.not.equal(rawObj)
  })
})

describe('GnssOffsetCorrector correction modes', function () {
  // The 'both'-mode companion delta is published via setImmediate to stay
  // out of the input-handler call stack; flush it before asserting.
  const flush = () => new Promise((resolve) => setImmediate(resolve))

  const SENSOR = {
    sensorId: 'gnss1',
    $source: 'n2k.0.5',
    fromBow: 0,
    fromCenter: 0
  }
  const SELF_PATHS = {
    'design.length.value': { overall: 20 },
    'navigation.headingTrue.value': 0
  }

  it('defaults to off: configured offsets leave the delta untouched', async function () {
    const { app, process, emitted } = makeApp({
      selfPaths: SELF_PATHS,
      gnssSensors: [SENSOR]
    })
    const corrector = new GnssOffsetCorrector(app)
    await corrector.start()

    const delta = positionDelta({
      $source: 'n2k.0.5',
      latitude: 60,
      longitude: 24
    })
    const out = process(delta)
    await flush()

    const update = out.updates[0] as never as {
      values: { value: { latitude: number } }[]
      meta?: unknown
    }
    expect(update.values[0].value.latitude).to.equal(60)
    expect(update.meta).to.equal(undefined)
    expect(emitted).to.have.length(0)
  })

  it("mode 'both' leaves the original untouched and publishes <sensorId>.ccrp", async function () {
    const { app, process, emitted } = makeApp({
      selfPaths: SELF_PATHS,
      gnssCorrection: 'both',
      gnssSensors: [SENSOR]
    })
    const corrector = new GnssOffsetCorrector(app)
    await corrector.start()

    const delta = positionDelta({
      $source: 'n2k.0.5',
      latitude: 60,
      longitude: 24
    })
    const out = process(delta)
    await flush()

    // Original delta unchanged, no meta added.
    const update = out.updates[0] as never as {
      values: { value: { latitude: number } }[]
      meta?: unknown
    }
    expect(update.values[0].value.latitude).to.equal(60)
    expect(update.meta).to.equal(undefined)

    // One corrected companion delta under <sensorId>.ccrp.
    expect(emitted).to.have.length(1)
    expect(emitted[0].id).to.equal('gnssOffsetCorrector')
    const emittedUpdate = emitted[0].delta.updates![0] as never as {
      $source: string
      timestamp: string
      values: { path: string; value: { latitude: number } }[]
      meta?: unknown
    }
    expect(emittedUpdate.$source).to.equal('gnss1.ccrp')
    expect(emittedUpdate.timestamp).to.equal('2026-05-31T00:00:00.000Z')
    expect(emittedUpdate.values[0].path).to.equal('navigation.position')
    const expected = correctPosition(
      { latitude: 60, longitude: 24 },
      { fromBow: 0, fromCenter: 0 },
      20,
      0
    )
    expect(emittedUpdate.values[0].value.latitude).to.be.closeTo(
      expected.latitude,
      1e-12
    )
    // The companion delta carries only the corrected value, no meta.
    expect(emittedUpdate.meta).to.equal(undefined)
  })

  it("mode 'both' publishes no companion but raises a notification when heading is unavailable", async function () {
    const { app, process, emitted } = makeApp({
      selfPaths: { 'design.length.value': { overall: 20 } },
      gnssCorrection: 'both',
      gnssSensors: [SENSOR]
    })
    const corrector = new GnssOffsetCorrector(app)
    await corrector.start()

    const out = process(
      positionDelta({ $source: 'n2k.0.5', latitude: 60, longitude: 24 })
    )
    await flush()

    const update = out.updates[0] as never as {
      values: { value: { latitude: number } }[]
    }
    expect(update.values[0].value.latitude).to.equal(60)
    // Only the headingUnavailable notification is emitted; no <sensor>.ccrp
    // companion delta because correction could not run.
    expect(emitted).to.have.length(1)
    const notif = emitted[0].delta.updates![0] as never as {
      values: { path: string; value: { state: string } }[]
    }
    expect(notif.values[0].path).to.equal(
      'notifications.navigation.gnss.headingUnavailable'
    )
    expect(notif.values[0].value.state).to.equal('warn')
  })

  it('never corrects rows bound to a *.ccrp source (no recursion)', async function () {
    const { app, process, emitted } = makeApp({
      selfPaths: SELF_PATHS,
      gnssCorrection: 'both',
      gnssSensors: [
        { sensorId: 'gnss2', $source: 'gnss1.ccrp', fromBow: 0, fromCenter: 0 }
      ]
    })
    const corrector = new GnssOffsetCorrector(app)
    await corrector.start()

    const out = process(
      positionDelta({ $source: 'gnss1.ccrp', latitude: 60, longitude: 24 })
    )
    await flush()

    const update = out.updates[0] as never as {
      values: { value: { latitude: number } }[]
      meta?: unknown
    }
    expect(update.values[0].value.latitude).to.equal(60)
    expect(update.meta).to.equal(undefined)
    expect(emitted).to.have.length(0)
  })

  it('switches mode live on a GNSS_SENSORS server event', async function () {
    const { app, bus, process, emitted } = makeApp({
      selfPaths: SELF_PATHS,
      gnssSensors: [SENSOR]
    })
    const corrector = new GnssOffsetCorrector(app)
    await corrector.start()

    // Default 'off': untouched.
    let out = process(
      positionDelta({ $source: 'n2k.0.5', latitude: 60, longitude: 24 })
    )
    let update = out.updates[0] as never as {
      values: { value: { latitude: number } }[]
    }
    expect(update.values[0].value.latitude).to.equal(60)

    // User saves 'replace'. Settings change BEFORE the event fires.
    app.config.settings.gnssCorrection = 'replace'
    bus.emit('serverevent', { type: 'GNSS_SENSORS', data: {} })

    out = process(
      positionDelta({ $source: 'n2k.0.5', latitude: 60, longitude: 24 })
    )
    update = out.updates[0] as never as {
      values: { value: { latitude: number } }[]
    }
    expect(update.values[0].value.latitude).to.not.equal(60)
    await flush()
    expect(emitted).to.have.length(0)
  })

  it('skips correction at extreme polar latitudes', async function () {
    const { app, process, emitted } = makeApp({
      selfPaths: SELF_PATHS,
      gnssCorrection: 'both',
      gnssSensors: [SENSOR]
    })
    const corrector = new GnssOffsetCorrector(app)
    await corrector.start()

    const out = process(
      positionDelta({ $source: 'n2k.0.5', latitude: 90, longitude: 24 })
    )
    await flush()

    const update = out.updates[0] as never as {
      values: { value: { latitude: number } }[]
      meta?: unknown
    }
    expect(update.values[0].value.latitude).to.equal(90)
    expect(update.meta).to.equal(undefined)
    expect(emitted).to.have.length(0)
  })
})

describe('GnssOffsetCorrector heading-unavailable notification', function () {
  const NOTIF_PATH = 'notifications.navigation.gnss.headingUnavailable'
  const SENSOR = {
    sensorId: 'gnss1',
    $source: 'n2k.0.5',
    fromBow: 0,
    fromCenter: 0
  }
  // Notifications are pushed via handleMessage, captured in `emitted`.
  const notifs = (
    emitted: Array<{ id: string; delta: Partial<Delta> }>
  ): Array<{ path: string; value: { state: string } }> =>
    emitted
      .flatMap((e) => e.delta.updates ?? [])
      .flatMap((u) => (u as { values?: unknown[] }).values ?? [])
      .filter((v) => (v as { path: string }).path === NOTIF_PATH) as Array<{
      path: string
      value: { state: string }
    }>

  it('raises a warn notification once while heading stays unavailable', async function () {
    const { app, process, emitted } = makeApp({
      selfPaths: { 'design.length.value': { overall: 20 } },
      gnssCorrection: 'replace',
      gnssSensors: [SENSOR]
    })
    const corrector = new GnssOffsetCorrector(app)
    await corrector.start()

    for (let i = 0; i < 3; i++) {
      process(
        positionDelta({ $source: 'n2k.0.5', latitude: 60, longitude: 24 })
      )
    }
    const raised = notifs(emitted)
    expect(raised).to.have.length(1)
    expect(raised[0].value.state).to.equal('warn')
  })

  it('clears the notification with a normal state when heading returns', async function () {
    const self = { 'design.length.value': { overall: 20 } } as Record<
      string,
      unknown
    >
    const { app, process, emitted, pushHeading } = makeApp({
      selfPaths: self,
      gnssCorrection: 'replace',
      gnssSensors: [SENSOR]
    })
    const corrector = new GnssOffsetCorrector(app)
    await corrector.start()

    // No heading yet: raises the warning.
    process(positionDelta({ $source: 'n2k.0.5', latitude: 60, longitude: 24 }))
    pushHeading('navigation.headingTrue', 0)
    process(positionDelta({ $source: 'n2k.0.5', latitude: 60, longitude: 24 }))

    const seen = notifs(emitted)
    expect(seen.map((n) => n.value.state)).to.deep.equal(['warn', 'normal'])
  })

  it('does not notify when correction is off even without heading', async function () {
    const { app, process, emitted } = makeApp({
      selfPaths: { 'design.length.value': { overall: 20 } },
      gnssSensors: [SENSOR]
    })
    const corrector = new GnssOffsetCorrector(app)
    await corrector.start()

    process(positionDelta({ $source: 'n2k.0.5', latitude: 60, longitude: 24 }))
    expect(notifs(emitted)).to.have.length(0)
  })
})

describe('GnssOffsetCorrector heading freshness', function () {
  const SENSOR = {
    sensorId: 'gnss1',
    $source: 'n2k.0.5',
    fromBow: 0,
    fromCenter: 0
  }
  // Antenna at the bow of a 20 m vessel heading north: a corrected fix
  // moves 10 m south, an uncorrected one stays at latitude 60.
  const CORRECTED_LATITUDE = 60 + ((-10 / R) * 180) / Math.PI
  const realNow = Date.now
  let now = 0

  beforeEach(function () {
    now = 1000000
  })

  afterEach(function () {
    Date.now = realNow
  })

  async function setup(selfPaths: Record<string, unknown> = {}) {
    const env = makeApp({
      selfPaths: { 'design.length.value': { overall: 20 }, ...selfPaths },
      gnssCorrection: 'replace',
      gnssSensors: [SENSOR]
    })
    const corrector = new GnssOffsetCorrector(env.app, () => now)
    await corrector.start()
    const latitude = () => {
      const out = env.process(
        positionDelta({ $source: 'n2k.0.5', latitude: 60, longitude: 24 })
      )
      return (
        out.updates[0] as never as { values: { value: { latitude: number } }[] }
      ).values[0].value.latitude
    }
    return { ...env, corrector, latitude }
  }

  it('corrects with a heading received within the age limit', async function () {
    const { latitude } = await setup({ 'navigation.headingTrue.value': 0 })
    now += 3000
    expect(latitude()).to.be.closeTo(CORRECTED_LATITUDE, 1e-9)
  })

  it('passes through and notifies once the heading stops arriving', async function () {
    const { latitude, emitted } = await setup({
      'navigation.headingTrue.value': 0
    })
    now += 3001
    expect(latitude()).to.equal(60)
    const states = emitted
      .flatMap((e) => e.delta.updates ?? [])
      .flatMap(
        (u) =>
          (u as { values?: { path: string; value: { state: string } }[] })
            .values ?? []
      )
      .filter(
        (v) => v.path === 'notifications.navigation.gnss.headingUnavailable'
      )
      .map((v) => v.value.state)
    expect(states).to.deep.equal(['warn'])
  })

  it('stops correcting at once when the heading goes null', async function () {
    const { latitude, pushHeading } = await setup({
      'navigation.headingTrue.value': 0
    })
    pushHeading('navigation.headingTrue', null)
    expect(latitude()).to.equal(60)
  })

  it('ignores a heading present in the data model but not received live', async function () {
    const { app, latitude } = await setup()
    ;(
      app.signalk.self as { navigation?: { headingTrue?: { value: number } } }
    ).navigation = { headingTrue: { value: 0 } }
    expect(latitude()).to.equal(60)
  })

  it('falls back to a fresh magnetic heading when the true one is stale', async function () {
    const { latitude, pushHeading } = await setup({
      'navigation.headingTrue.value': Math.PI,
      // Variation is slow-changing and often sent rarely, so it is read
      // from the data model without an age limit.
      'navigation.magneticVariation.value': 0.1
    })
    now += 60000
    pushHeading('navigation.headingMagnetic', -0.1)
    expect(latitude()).to.be.closeTo(CORRECTED_LATITUDE, 1e-9)
  })

  it('does not use a stale magnetic heading', async function () {
    const { latitude } = await setup({
      'navigation.headingMagnetic.value': 0,
      'navigation.magneticVariation.value': 0
    })
    now += 3001
    expect(latitude()).to.equal(60)
  })

  it('expires a heading when the wall clock steps backwards', async function () {
    const { latitude } = await setup({ 'navigation.headingTrue.value': 0 })
    const wallClock = realNow()
    Date.now = () => wallClock - 3600000
    now += 3001
    expect(latitude()).to.equal(60)
  })

  it('falls back to course over ground while making way', async function () {
    const { latitude, pushHeading } = await setup({
      'navigation.headingTrue.value': Math.PI
    })
    now += 3001
    pushHeading('navigation.courseOverGroundTrue', 0)
    pushHeading('navigation.speedOverGround', 0.6)
    expect(latitude()).to.be.closeTo(CORRECTED_LATITUDE, 1e-9)
  })

  it('prefers a fresh heading over course over ground', async function () {
    const { latitude } = await setup({
      'navigation.headingTrue.value': 0,
      'navigation.courseOverGroundTrue.value': Math.PI,
      'navigation.speedOverGround.value': 3
    })
    expect(latitude()).to.be.closeTo(CORRECTED_LATITUDE, 1e-9)
  })

  it('does not use course over ground below 1 kn', async function () {
    const { latitude } = await setup({
      'navigation.courseOverGroundTrue.value': 0,
      'navigation.speedOverGround.value': 0.5
    })
    expect(latitude()).to.equal(60)
  })

  it('does not use a stale course over ground', async function () {
    const { latitude, pushHeading } = await setup({
      'navigation.courseOverGroundTrue.value': 0
    })
    now += 3001
    pushHeading('navigation.speedOverGround', 3)
    expect(latitude()).to.equal(60)
  })

  it('does not use course over ground without a fresh speed', async function () {
    const { latitude, pushHeading } = await setup({
      'navigation.speedOverGround.value': 3
    })
    now += 3001
    pushHeading('navigation.courseOverGroundTrue', 0)
    expect(latitude()).to.equal(60)
  })

  it('reports active status while correcting by course over ground', async function () {
    const { corrector } = await setup({
      'navigation.courseOverGroundTrue.value': 0,
      'navigation.speedOverGround.value': 3
    })
    expect(corrector.getStatus()).to.deep.equal({
      mode: 'replace',
      active: true
    })
  })

  it('reports no-heading status once the heading is stale', async function () {
    const { corrector } = await setup({ 'navigation.headingTrue.value': 0 })
    expect(corrector.getStatus()).to.deep.equal({
      mode: 'replace',
      active: true
    })
    now += 3001
    expect(corrector.getStatus()).to.deep.equal({
      mode: 'replace',
      active: false,
      blocked: 'no-heading'
    })
  })
})
