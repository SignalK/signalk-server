import { expect } from 'chai'
import { FromPgn, pgnToActisenseSerialFormat } from '@canboat/canboatjs'
import N2kToSignalK from './n2k-signalk'
import type { N2kInstanceMappings } from './n2k-instance-groups'
import { createMockApp, collectStreamOutput } from './test-helpers'

const HEADING_PGN = {
  prio: 2,
  pgn: 127250,
  dst: 255,
  src: 204,
  timestamp: '2024-01-01T00:00:00.000Z',
  fields: { sid: 0, heading: 2.8176, deviation: 0.0001, reference: 'Magnetic' },
  description: 'Vessel Heading',
  id: 'vesselHeading'
}

const WIND_PGN = {
  prio: 2,
  pgn: 130306,
  dst: 255,
  src: 35,
  timestamp: '2024-01-01T00:00:00.000Z',
  fields: { sid: 0, windSpeed: 5.2, windAngle: 1.1, reference: 'Apparent' },
  description: 'Wind Data',
  id: 'windData'
}

describe('N2kToSignalK', () => {
  it('converts N2K PGN to Signal K delta', async () => {
    const app = createMockApp()
    const stream = new N2kToSignalK({
      app,
      providerId: 'test-n2k'
    })

    const outputPromise = collectStreamOutput(stream)

    stream.write(HEADING_PGN)
    stream.end()

    const results = await outputPromise
    expect(results).to.have.length(1)
    const delta = results[0] as {
      updates: Array<{
        source: { pgn: number; src: string; type: string }
        values: Array<{ path: string; value: number }>
      }>
    }
    expect(delta.updates[0]!.source.pgn).to.equal(127250)
    expect(delta.updates[0]!.source.src).to.equal('204')
    expect(delta.updates[0]!.source.type).to.equal('NMEA2000')
    expect(delta.updates[0]!.values.length).to.be.greaterThan(0)
  })

  it('filters PGNs when filters are enabled', async () => {
    const app = createMockApp()
    const stream = new N2kToSignalK({
      app,
      providerId: 'test-n2k',
      filtersEnabled: true,
      filters: [{ pgn: '127250', source: '204' }]
    })

    const outputPromise = collectStreamOutput(stream)

    stream.write(HEADING_PGN)
    stream.end()

    const results = await outputPromise
    expect(results).to.have.length(0)
  })

  it('passes PGNs that do not match active filters', async () => {
    const app = createMockApp()
    const stream = new N2kToSignalK({
      app,
      providerId: 'test-n2k',
      filtersEnabled: true,
      filters: [{ pgn: '999999', source: '' }]
    })

    const outputPromise = collectStreamOutput(stream)

    stream.write(HEADING_PGN)
    stream.end()

    const results = await outputPromise
    expect(results).to.have.length(1)
  })

  it('emits sourceRefChanged when CAN name changes', (done) => {
    const app = createMockApp()
    const stream = new N2kToSignalK({
      app,
      providerId: 'canhat'
    })

    app.on(
      'sourceRefChanged',
      ({
        oldRef,
        newRef,
        src
      }: {
        oldRef: string
        newRef: string
        src: number
      }) => {
        expect(oldRef).to.equal('canhat.c08cbe00e7e00b16')
        expect(newRef).to.equal('canhat.c08cbe05e7e00b16')
        expect(src).to.equal(42)
        done()
      }
    )

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(stream as any).n2kMapper.emit(
      'n2kSourceChanged',
      42,
      'c08cbe00e7e00b16',
      'c08cbe05e7e00b16'
    )
  })

  it('emits sourceRefChanged when CAN name first resolves (useCanName on)', (done) => {
    const app = createMockApp()
    const stream = new N2kToSignalK({
      app,
      providerId: 'YDEN02',
      useCanName: true
    })

    app.on(
      'sourceRefChanged',
      ({
        oldRef,
        newRef,
        src
      }: {
        oldRef: string
        newRef: string
        src: number
      }) => {
        expect(oldRef).to.equal('YDEN02.122')
        expect(newRef).to.equal('YDEN02.cfa0aad31135b495')
        expect(src).to.equal(122)
        done()
      }
    )

    // The n2kMapper first sees traffic from address 122 without a CAN
    // Name (timeout or slow address claim), then a PGN 60928 response
    // arrives and resolves it. The first metadata event carries no
    // canName, the second carries it.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mapper = (stream as any).n2kMapper
    mapper.emit(
      'n2kSourceMetadata',
      { src: 122, pgn: 127501, timestamp: '2024-01-01T00:00:00.000Z' },
      {}
    )
    mapper.emit(
      'n2kSourceMetadata',
      { src: 122, pgn: 60928, timestamp: '2024-01-01T00:00:01.000Z' },
      { canName: 'cfa0aad31135b495', manufacturerCode: 'Maretron' }
    )
  })

  it('does not emit sourceRefChanged when useCanName is off', () => {
    const app = createMockApp()
    const stream = new N2kToSignalK({
      app,
      providerId: 'YDEN02'
      // useCanName: false (default)
    })
    let fired = 0
    app.on('sourceRefChanged', () => fired++)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mapper = (stream as any).n2kMapper
    mapper.emit(
      'n2kSourceMetadata',
      { src: 122, pgn: 60928, timestamp: '2024-01-01T00:00:01.000Z' },
      { canName: 'cfa0aad31135b495' }
    )
    expect(fired).to.equal(0)
  })

  it('drops frames with the null address (src=254)', async () => {
    // src=254 is NMEA 2000's "null address": devices send with it before
    // claiming a real address via PGN 60928. We must not let such deltas
    // flow downstream — they create phantom can0.254 / ydgw02.254 devices.
    const app = createMockApp()
    const stream = new N2kToSignalK({ app, providerId: 'test-n2k' })

    const outputPromise = collectStreamOutput(stream)
    stream.write({ ...HEADING_PGN, src: 254 })
    stream.end()

    const results = await outputPromise
    expect(results).to.have.length(0)
  })

  it('does not register metadata for the null address', async () => {
    // A device that still holds 254 may emit an Address Claim (PGN 60928)
    // which reaches the n2kSourceMetadata listener with src=254. Reject
    // that too, so the server tree never carries a sources[providerId][254]
    // identity.
    const app = createMockApp()
    const stream = new N2kToSignalK({ app, providerId: 'test-n2k' })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mapper = (stream as any).n2kMapper
    mapper.emit(
      'n2kSourceMetadata',
      { src: 254, pgn: 60928, timestamp: '2024-01-01T00:00:00.000Z' },
      {
        canName: 'c0788c00e7e04312'
      }
    )
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((stream as any).sourceMeta[254]).to.equal(undefined)
  })

  it('runs with an app that has no config', async () => {
    const app = createMockApp()
    Reflect.deleteProperty(app, 'config')
    const stream = new N2kToSignalK({ app, providerId: 'test-n2k' })
    app.emit('serverAdminEvent', { type: 'N2KINSTANCEMAPPINGS', data: {} })

    const outputPromise = collectStreamOutput(stream)
    stream.write(HEADING_PGN)
    stream.end()

    expect(await outputPromise).to.have.length(1)
  })

  it('ignores filters when filtersEnabled is false', async () => {
    const app = createMockApp()
    const stream = new N2kToSignalK({
      app,
      providerId: 'test-n2k',
      filtersEnabled: false,
      filters: [{ pgn: '127250', source: '204' }]
    })

    const outputPromise = collectStreamOutput(stream)

    stream.write(HEADING_PGN)
    stream.end()

    const results = await outputPromise
    expect(results).to.have.length(1)
  })
})

describe('N2kToSignalK canName warmup', () => {
  // Pre-seed the mapper so a src already has a resolved canName, as it
  // would after a PGN 60928 address claim. toDelta then stamps the
  // canName onto the delta source.
  function seedCanName(stream: N2kToSignalK, src: number, canName: string) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(stream as any).n2kMapper.state[src] = { canName }
  }

  it('drops src-only deltas during the warmup window (useCanName on)', async () => {
    const app = createMockApp()
    const stream = new N2kToSignalK({
      app,
      providerId: 'canbus0',
      useCanName: true,
      canNameWarmupMs: 60000
    })

    const outputPromise = collectStreamOutput(stream)
    stream.write(WIND_PGN)
    stream.end()

    // Inside warmup with no canName yet — hold it back so no numeric-form
    // ref is stamped before the address claim resolves.
    expect(await outputPromise).to.have.length(0)
  })

  it('passes src-only deltas once warmup has elapsed (never-claiming device)', async () => {
    const app = createMockApp()
    const stream = new N2kToSignalK({
      app,
      providerId: 'canbus0',
      useCanName: true,
      canNameWarmupMs: 0
    })

    const outputPromise = collectStreamOutput(stream)
    stream.write(WIND_PGN)
    stream.end()

    const results = (await outputPromise) as Array<{
      updates: Array<{ source: { src: string; canName?: string } }>
    }>
    expect(results).to.have.length(1)
    expect(results[0]!.updates[0]!.source.src).to.equal('35')
    expect(results[0]!.updates[0]!.source.canName).to.equal(undefined)
  })

  it('passes deltas that already carry a canName during warmup', async () => {
    const app = createMockApp()
    const stream = new N2kToSignalK({
      app,
      providerId: 'canbus0',
      useCanName: true,
      canNameWarmupMs: 60000
    })
    seedCanName(stream, 35, 'c0509635e7664732')

    const outputPromise = collectStreamOutput(stream)
    stream.write(WIND_PGN)
    stream.end()

    const results = (await outputPromise) as Array<{
      updates: Array<{ source: { canName?: string } }>
    }>
    expect(results).to.have.length(1)
    expect(results[0]!.updates[0]!.source.canName).to.equal('c0509635e7664732')
  })

  it('does not gate src-only deltas when useCanName is off', async () => {
    const app = createMockApp()
    const stream = new N2kToSignalK({
      app,
      providerId: 'canbus0',
      canNameWarmupMs: 60000
      // useCanName off
    })

    const outputPromise = collectStreamOutput(stream)
    stream.write(WIND_PGN)
    stream.end()

    expect(await outputPromise).to.have.length(1)
  })

  it('an alarm dropped during warmup is delivered when it re-arrives after warmup', async () => {
    // Answers the core question: notifications need no special-casing
    // during warmup because N2K alarms are periodic (PGN 127489 every
    // 500 ms). The same alarm that is held back mid-warmup flows through
    // once the window passes.
    const ENGINE_ALARM = {
      prio: 2,
      pgn: 127489,
      dst: 255,
      src: 50,
      timestamp: '2024-01-01T00:00:00.000Z',
      fields: { engineInstance: 0, discreteStatus1: ['Check Engine'] },
      description: 'Engine Parameters, Dynamic',
      id: 'engineParametersDynamic'
    }

    const app = createMockApp()
    const stream = new N2kToSignalK({
      app,
      providerId: 'canbus0',
      useCanName: true,
      canNameWarmupMs: 0
    })
    // Force the first frame into the warmup window, then let it lapse so
    // the periodic retransmit lands after warmup — without real timers.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(stream as any).warmupUntil = Number.MAX_SAFE_INTEGER

    const outputPromise = collectStreamOutput(stream)
    stream.write(ENGINE_ALARM)
    // Warmup elapsed: the alarm's next periodic broadcast gets through.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(stream as any).warmupUntil = 0
    stream.write({ ...ENGINE_ALARM, timestamp: '2024-01-01T00:00:00.500Z' })
    stream.end()

    const results = (await outputPromise) as Array<{
      updates: Array<{ values: Array<{ path: string }> }>
    }>
    expect(results).to.have.length(1)
    const paths = results[0]!.updates[0]!.values.map((v) => v.path)
    expect(paths).to.include('notifications.propulsion.starboard.checkEngine')
  })
})

describe('N2kToSignalK instance path mapping', () => {
  const PROVIDER = 'can0'
  const parser = new FromPgn({})

  // Encoded and decoded by canboat, so fields arrive in production shape:
  // lookup names for known codes, absent fields for the "no data" value.
  function frame(pgn: number, src: number, fields: Record<string, unknown>) {
    const encoded = pgnToActisenseSerialFormat({
      pgn,
      src,
      dst: 255,
      prio: 2,
      fields
    } as unknown as Parameters<typeof pgnToActisenseSerialFormat>[0])
    const decoded = parser.parseString(encoded!) as unknown
    if (!decoded) throw new Error(`canboat could not decode PGN ${pgn}`)
    return decoded as { pgn: number; src: number; timestamp: string }
  }

  const ENGINE_DEVICE = { manufacturerCode: 137, uniqueNumber: 656598 }
  const ENGINE_KEY = '137:656598'
  const OTHER_DEVICE = { manufacturerCode: 381, uniqueNumber: 12345 }
  const ENGINE_SRC = 50
  const OTHER_SRC = 51

  function addressClaim(
    src: number,
    device: { manufacturerCode: number; uniqueNumber: number }
  ) {
    return frame(60928, src, {
      ...device,
      deviceInstanceLower: 0,
      deviceInstanceUpper: 0,
      deviceFunction: 140,
      deviceClass: 50,
      systemInstance: 0,
      industryGroup: 4,
      arbitraryAddressCapable: 1
    })
  }

  const engineRapid = (src: number, instance: number) =>
    frame(127488, src, { instance, speed: 1000 })
  const engineAlarm = (src: number, instance: number) =>
    frame(127489, src, {
      instance,
      temperature: 350,
      discreteStatus1: ['Over Temperature']
    })
  const battery = (src: number, instance: number) =>
    frame(127508, src, { instance, voltage: 12.5 })
  const engineRoomTemperature = (src: number, instance: number) =>
    frame(130312, src, { sid: 0, instance, source: 3, actualTemperature: 300 })
  const positionRapid = (src: number) =>
    frame(129025, src, { latitude: 60.1, longitude: 24.9 })

  const MAIN_ENGINE: N2kInstanceMappings = {
    [ENGINE_KEY]: [{ group: 'engine', instance: 0, target: 'propulsion.main' }]
  }

  type Output = Array<{
    updates: Array<{
      source: { src: string; canName?: string }
      values: Array<{ path: string | null; value: unknown }>
    }>
  }>

  const pathsOf = (results: Output) =>
    results.flatMap((d) =>
      d.updates.flatMap((u) => u.values.map((v) => v.path))
    )

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const internals = (stream: N2kToSignalK) => stream as any

  function makeStream(
    mappings: N2kInstanceMappings | undefined,
    options: { useCanName?: boolean; canNameWarmupMs?: number } = {}
  ) {
    const app = createMockApp({ n2kInstanceMappings: mappings })
    const stream = new N2kToSignalK({
      app,
      providerId: PROVIDER,
      canNameWarmupMs: 60000,
      ...options
    })
    return { app, stream }
  }

  async function run(stream: N2kToSignalK, frames: object[]): Promise<Output> {
    const output = collectStreamOutput(stream)
    for (const f of frames) stream.write(f)
    stream.end()
    return (await output) as Output
  }

  const MAX_TIMER_MS = 2 ** 31 - 1

  // The auto-normal timer runs every 5 s; capture its callback instead of
  // waiting for it.
  function captureIntervals(): {
    callbacks: Array<() => void>
    restore(): void
  } {
    const original = global.setInterval
    const callbacks: Array<() => void> = []
    global.setInterval = ((cb: () => void) => {
      callbacks.push(cb)
      return original(() => {}, MAX_TIMER_MS).unref()
    }) as unknown as typeof setInterval
    return {
      callbacks,
      restore: () => {
        global.setInterval = original
      }
    }
  }

  const WARMUP_MS = 100
  // Longer than the auto-normal's quiet period.
  const PAST_AUTO_NORMAL_MS = 60_000

  function fakeClock(): { advance(ms: number): void; restore(): void } {
    const original = Date.now
    let now = original()
    Date.now = () => now
    return {
      advance: (ms) => {
        now += ms
      },
      restore: () => {
        Date.now = original
      }
    }
  }

  type NormalPaths = Array<{ path: string | null; state: string }>

  const handledValues = (app: ReturnType<typeof createMockApp>): NormalPaths =>
    app.handledMessages.flatMap((m) =>
      (m.delta as Output[number]).updates.flatMap((u) =>
        u.values.map((v) => ({
          path: v.path,
          state: (v.value as { state: string }).state
        }))
      )
    )

  it('maps an engine of a device with rules and leaves other devices alone', async () => {
    const { stream } = makeStream(MAIN_ENGINE)
    const results = await run(stream, [
      addressClaim(ENGINE_SRC, ENGINE_DEVICE),
      addressClaim(OTHER_SRC, OTHER_DEVICE),
      engineRapid(ENGINE_SRC, 0),
      engineRapid(OTHER_SRC, 0)
    ])
    expect(results).to.have.length(2)
    expect(pathsOf([results[0]!])).to.include('propulsion.main.revolutions')
    expect(
      pathsOf([results[0]!]).some((p) => p?.startsWith('propulsion.port'))
    ).to.equal(false)
    expect(pathsOf([results[1]!])).to.include('propulsion.port.revolutions')
  })

  it('skips malformed hand-edited settings and applies the valid rules', async () => {
    const malformed = {
      '1:2': 'not a list',
      '3:4': null,
      [ENGINE_KEY]: [
        null,
        { group: 'nonsense', instance: 0, target: 'propulsion.x' },
        { group: 'engine', instance: 0.5, target: 'propulsion.x' },
        { group: 'engine', instance: 1, target: 42 },
        { group: 'engine', discriminator: 3, instance: 1, target: 'a.b' },
        { group: 'tank', instance: 1, target: 'tanks.day' },
        { group: 'tank', discriminator: 99, instance: 1, target: 'tanks.day' },
        { group: 'engine', instance: 0, target: 'propulsion.main' }
      ]
    } as unknown as N2kInstanceMappings
    const { stream } = makeStream(malformed)
    const results = await run(stream, [
      addressClaim(ENGINE_SRC, ENGINE_DEVICE),
      engineRapid(ENGINE_SRC, 0),
      engineRapid(ENGINE_SRC, 1)
    ])
    expect(results.map((r) => pathsOf([r])[0])).to.deep.equal([
      'propulsion.main.revolutions',
      'propulsion.starboard.revolutions'
    ])
  })

  it('skips hand-edited rules with an instance outside the group range', async () => {
    const outOfRange = {
      [ENGINE_KEY]: [
        { group: 'engine', instance: -1, target: 'propulsion.negative' },
        { group: 'engine', instance: 256, target: 'propulsion.tooBig' }
      ]
    } as unknown as N2kInstanceMappings
    const { stream } = makeStream(outOfRange)
    // With no applicable rule, an unidentified source is not held back.
    const results = await run(stream, [engineRapid(ENGINE_SRC, 0)])
    expect(pathsOf(results)).to.include('propulsion.port.revolutions')
  })

  it('maps the notification and its auto-normal', async () => {
    const timers = captureIntervals()
    const clock = fakeClock()
    try {
      const { app, stream } = makeStream(MAIN_ENGINE)
      const results = await run(stream, [
        addressClaim(ENGINE_SRC, ENGINE_DEVICE),
        engineAlarm(ENGINE_SRC, 0)
      ])
      const paths = pathsOf(results)
      expect(paths).to.include('notifications.propulsion.main.overTemperature')
      expect(paths).to.include('propulsion.main.temperature')
      expect(paths.some((p) => p?.includes('propulsion.port'))).to.equal(false)

      clock.advance(PAST_AUTO_NORMAL_MS)
      timers.callbacks.forEach((cb) => cb())
      const normals = handledValues(app)
      expect(normals).to.deep.include({
        path: 'notifications.propulsion.main.overTemperature',
        state: 'normal'
      })
      expect(
        normals.every((n) => !n.path?.includes('propulsion.port'))
      ).to.equal(true)
    } finally {
      clock.restore()
      timers.restore()
    }
  })

  it('splits two Engine Room sensors of one device with a single-leaf rule', async () => {
    const { stream } = makeStream({
      [ENGINE_KEY]: [
        {
          group: 'temperature',
          discriminator: 3,
          instance: 1,
          target: 'environment.inside.engineRoomAft.temperature'
        }
      ]
    })
    const results = await run(stream, [
      addressClaim(ENGINE_SRC, ENGINE_DEVICE),
      engineRoomTemperature(ENGINE_SRC, 0),
      engineRoomTemperature(ENGINE_SRC, 1)
    ])
    expect(pathsOf([results[0]!])).to.deep.equal([
      'environment.inside.engineRoom.temperature'
    ])
    expect(pathsOf([results[1]!])).to.deep.equal([
      'environment.inside.engineRoomAft.temperature'
    ])
  })

  it('a rule for battery 1 does not touch battery 10', async () => {
    const { stream } = makeStream({
      [ENGINE_KEY]: [
        { group: 'battery', instance: 1, target: 'electrical.batteries.house' }
      ]
    })
    const results = await run(stream, [
      addressClaim(ENGINE_SRC, ENGINE_DEVICE),
      battery(ENGINE_SRC, 10),
      battery(ENGINE_SRC, 1)
    ])
    expect(pathsOf([results[0]!])).to.include('electrical.batteries.10.voltage')
    expect(pathsOf([results[1]!])).to.include(
      'electrical.batteries.house.voltage'
    )
  })

  it('passes a value without a path through untouched', async () => {
    const { stream } = makeStream({
      [ENGINE_KEY]: [
        {
          group: 'temperature',
          discriminator: 3,
          instance: 0,
          target: 'environment.inside.engineRoomAft.temperature'
        }
      ]
    })
    // No source: n2k-signalk cannot place the value and emits a null path.
    const results = await run(stream, [
      addressClaim(ENGINE_SRC, ENGINE_DEVICE),
      frame(130312, ENGINE_SRC, { sid: 0, instance: 0, actualTemperature: 300 })
    ])
    expect(results).to.have.length(1)
    expect(results[0]!.updates[0]!.values).to.deep.equal([
      { path: null, value: 300 }
    ])
  })

  it('applies rules with useCanName off', async () => {
    const { stream } = makeStream(MAIN_ENGINE, { useCanName: false })
    const results = await run(stream, [
      addressClaim(ENGINE_SRC, ENGINE_DEVICE),
      engineRapid(ENGINE_SRC, 0)
    ])
    expect(results[0]!.updates[0]!.source.canName).to.equal(undefined)
    expect(pathsOf(results)).to.include('propulsion.main.revolutions')
  })

  it('applies rules with useCanName on', async () => {
    const { stream } = makeStream(MAIN_ENGINE, { useCanName: true })
    const results = await run(stream, [
      addressClaim(ENGINE_SRC, ENGINE_DEVICE),
      engineRapid(ENGINE_SRC, 0)
    ])
    expect(results[0]!.updates[0]!.source.canName).to.be.a('string')
    expect(pathsOf(results)).to.include('propulsion.main.revolutions')
  })

  it('drops an unidentified table PGN during the source warmup, then passes it at the default path', async () => {
    const clock = fakeClock()
    try {
      const { stream } = makeStream(MAIN_ENGINE, { canNameWarmupMs: WARMUP_MS })
      const output = collectStreamOutput(stream)
      stream.write(engineRapid(ENGINE_SRC, 0))
      clock.advance(WARMUP_MS)
      stream.write(engineRapid(ENGINE_SRC, 0))
      stream.end()
      const results = (await output) as Output
      expect(results).to.have.length(1)
      expect(pathsOf(results)).to.include('propulsion.port.revolutions')
    } finally {
      clock.restore()
    }
  })

  it('does not hold back PGNs outside the group table', async () => {
    const { stream } = makeStream(MAIN_ENGINE)
    const results = await run(stream, [positionRapid(ENGINE_SRC)])
    expect(pathsOf(results)).to.deep.equal(['navigation.position'])
  })

  it('does not hold back unidentified table PGNs without rules', async () => {
    for (const mappings of [undefined, {}]) {
      const { stream } = makeStream(mappings)
      const results = await run(stream, [engineRapid(ENGINE_SRC, 0)])
      expect(pathsOf(results)).to.include('propulsion.port.revolutions')
    }
  })

  it('holds back per source, not from the first frame on the bus', async () => {
    const clock = fakeClock()
    try {
      const { stream } = makeStream(MAIN_ENGINE, { canNameWarmupMs: WARMUP_MS })
      const output = collectStreamOutput(stream)
      stream.write(engineRapid(OTHER_SRC, 0))
      clock.advance(WARMUP_MS)
      // A source first seen now gets its own window.
      stream.write(engineRapid(ENGINE_SRC, 0))
      stream.end()
      expect(await output).to.have.length(0)
    } finally {
      clock.restore()
    }
  })

  it('prunes default paths when identity resolves after the warmup', async () => {
    const { app, stream } = makeStream(MAIN_ENGINE, { canNameWarmupMs: 0 })
    const results = await run(stream, [
      engineRapid(ENGINE_SRC, 0),
      addressClaim(ENGINE_SRC, ENGINE_DEVICE),
      engineRapid(ENGINE_SRC, 0)
    ])
    expect(pathsOf([results[0]!])).to.include('propulsion.port.revolutions')
    expect(pathsOf([results[1]!])).to.include('propulsion.main.revolutions')
    expect(app.removedSources).to.deep.equal([
      {
        sourceRef: `${PROVIDER}.${ENGINE_SRC}`,
        prefixes: ['propulsion.port', 'notifications.propulsion.port']
      }
    ])
  })

  it('prunes every default prefix of every rule, notifications included', async () => {
    const { app, stream } = makeStream(
      {
        [ENGINE_KEY]: [
          { group: 'engine', instance: 0, target: 'propulsion.main' },
          {
            group: 'temperature',
            discriminator: 200,
            instance: 1,
            target: 'environment.inside.lazarette.temperature'
          }
        ]
      },
      { canNameWarmupMs: 0 }
    )
    await run(stream, [
      engineRapid(ENGINE_SRC, 0),
      addressClaim(ENGINE_SRC, ENGINE_DEVICE)
    ])
    expect(app.removedSources).to.have.length(1)
    expect(app.removedSources[0]!.prefixes).to.have.members([
      'propulsion.port',
      'notifications.propulsion.port',
      'generic.temperatures.userDefined200.1.temperature',
      'notifications.generic.temperatures.userDefined200.1.temperature'
    ])
  })

  it('prunes the address-form ref before announcing the canName ref (useCanName on)', async () => {
    const { app, stream } = makeStream(MAIN_ENGINE, {
      canNameWarmupMs: 0,
      useCanName: true
    })
    const events: string[] = []
    const removeSource = app.deltaCache.removeSource!.bind(app.deltaCache)
    app.deltaCache.removeSource = (ref, prefixes) => {
      events.push(`removeSource ${ref}`)
      removeSource(ref, prefixes)
    }
    app.on('sourceRefChanged', ({ oldRef }: { oldRef: string }) => {
      events.push(`sourceRefChanged ${oldRef}`)
    })
    await run(stream, [
      engineRapid(ENGINE_SRC, 0),
      addressClaim(ENGINE_SRC, ENGINE_DEVICE)
    ])
    expect(app.removedSources).to.deep.equal([
      {
        sourceRef: `${PROVIDER}.${ENGINE_SRC}`,
        prefixes: ['propulsion.port', 'notifications.propulsion.port']
      }
    ])
    expect(events).to.deep.equal([
      `removeSource ${PROVIDER}.${ENGINE_SRC}`,
      `sourceRefChanged ${PROVIDER}.${ENGINE_SRC}`
    ])
  })

  it('prunes when rules arrive while an unidentified source is already sending', async () => {
    // The server's prune on PUT cannot attribute a source without identity
    // to the device, so the transform prunes once the identity resolves.
    const { app, stream } = makeStream(undefined)
    const output = collectStreamOutput(stream)
    stream.write(engineRapid(ENGINE_SRC, 0))
    app.config.settings.n2kInstanceMappings = MAIN_ENGINE
    app.emit('serverAdminEvent', {
      type: 'N2KINSTANCEMAPPINGS',
      data: MAIN_ENGINE
    })
    stream.write(addressClaim(ENGINE_SRC, ENGINE_DEVICE))
    stream.write(engineRapid(ENGINE_SRC, 0))
    stream.end()
    const results = (await output) as Output
    expect(results.map((r) => pathsOf([r])[0])).to.deep.equal([
      'propulsion.port.revolutions',
      'propulsion.main.revolutions'
    ])
    expect(app.removedSources).to.deep.equal([
      {
        sourceRef: `${PROVIDER}.${ENGINE_SRC}`,
        prefixes: ['propulsion.port', 'notifications.propulsion.port']
      }
    ])
  })

  it('does not prune for a device without rules', async () => {
    const { app, stream } = makeStream(MAIN_ENGINE, { canNameWarmupMs: 0 })
    await run(stream, [
      engineRapid(OTHER_SRC, 0),
      addressClaim(OTHER_SRC, OTHER_DEVICE)
    ])
    expect(app.removedSources).to.deep.equal([])
  })

  it('does not prune again when the same identity is re-announced', async () => {
    const { app, stream } = makeStream(MAIN_ENGINE, { canNameWarmupMs: 0 })
    await run(stream, [
      engineRapid(ENGINE_SRC, 0),
      addressClaim(ENGINE_SRC, ENGINE_DEVICE),
      addressClaim(ENGINE_SRC, ENGINE_DEVICE)
    ])
    expect(app.removedSources).to.have.length(1)
  })

  it('applies a rule emitted by N2KINSTANCEMAPPINGS without recreating the stream', async () => {
    const { app, stream } = makeStream(undefined)
    const output = collectStreamOutput(stream)
    stream.write(addressClaim(ENGINE_SRC, ENGINE_DEVICE))
    stream.write(engineRapid(ENGINE_SRC, 0))
    app.config.settings.n2kInstanceMappings = MAIN_ENGINE
    app.emit('serverAdminEvent', { type: 'OTHEREVENT', data: {} })
    stream.write(engineRapid(ENGINE_SRC, 0))
    app.emit('serverAdminEvent', {
      type: 'N2KINSTANCEMAPPINGS',
      data: MAIN_ENGINE
    })
    stream.write(engineRapid(ENGINE_SRC, 0))
    app.config.settings.n2kInstanceMappings = {}
    app.emit('serverAdminEvent', { type: 'N2KINSTANCEMAPPINGS', data: {} })
    stream.write(engineRapid(ENGINE_SRC, 0))
    stream.end()
    const results = (await output) as Output
    expect(results.map((r) => pathsOf([r])[0])).to.deep.equal([
      'propulsion.port.revolutions',
      'propulsion.port.revolutions',
      'propulsion.main.revolutions',
      'propulsion.port.revolutions'
    ])
  })

  it('gives the mapper a resolver only while rules exist', () => {
    const resolver = (stream: N2kToSignalK) =>
      internals(stream).n2kMapper.options.instancePrefixResolver
    const { app, stream } = makeStream(undefined)
    expect(resolver(stream)).to.equal(undefined)
    app.config.settings.n2kInstanceMappings = MAIN_ENGINE
    app.emit('serverAdminEvent', { type: 'N2KINSTANCEMAPPINGS', data: {} })
    expect(resolver(stream)).to.be.a('function')
    app.config.settings.n2kInstanceMappings = {}
    app.emit('serverAdminEvent', { type: 'N2KINSTANCEMAPPINGS', data: {} })
    expect(resolver(stream)).to.equal(undefined)
    expect(resolver(makeStream(MAIN_ENGINE).stream)).to.be.a('function')
  })

  const overTemperatureNormal = (path: string) => ({
    path: `notifications.${path}.overTemperature`,
    state: 'normal'
  })

  it('a rule change settles the old-path alarm with one normal', async () => {
    const timers = captureIntervals()
    const clock = fakeClock()
    try {
      const { app, stream } = makeStream(MAIN_ENGINE)
      const output = collectStreamOutput(stream)
      stream.write(addressClaim(ENGINE_SRC, ENGINE_DEVICE))
      stream.write(addressClaim(OTHER_SRC, OTHER_DEVICE))
      stream.write(engineAlarm(ENGINE_SRC, 0))
      stream.write(engineAlarm(OTHER_SRC, 0))
      const renamed: N2kInstanceMappings = {
        [ENGINE_KEY]: [
          { group: 'engine', instance: 0, target: 'propulsion.mainEngine' }
        ]
      }
      app.config.settings.n2kInstanceMappings = renamed
      app.emit('serverAdminEvent', {
        type: 'N2KINSTANCEMAPPINGS',
        data: renamed
      })
      stream.end()
      await output

      expect(handledValues(app)).to.deep.equal([
        overTemperatureNormal('propulsion.main')
      ])

      clock.advance(PAST_AUTO_NORMAL_MS)
      timers.callbacks.forEach((cb) => cb())
      // Another device's tracker on an unmapped path still auto-normals.
      expect(handledValues(app)).to.deep.equal([
        overTemperatureNormal('propulsion.main'),
        overTemperatureNormal('propulsion.port')
      ])
    } finally {
      clock.restore()
      timers.restore()
    }
  })

  it('a rule moved to another instance keeps the alarm under its unchanged target', async () => {
    const timers = captureIntervals()
    try {
      const { app, stream } = makeStream(MAIN_ENGINE)
      const output = collectStreamOutput(stream)
      stream.write(addressClaim(ENGINE_SRC, ENGINE_DEVICE))
      stream.write(engineAlarm(ENGINE_SRC, 0))
      const renumbered: N2kInstanceMappings = {
        [ENGINE_KEY]: [
          { group: 'engine', instance: 1, target: 'propulsion.main' }
        ]
      }
      app.config.settings.n2kInstanceMappings = renumbered
      app.emit('serverAdminEvent', {
        type: 'N2KINSTANCEMAPPINGS',
        data: renumbered
      })
      stream.end()
      await output
      expect(handledValues(app)).to.deep.equal([])
    } finally {
      timers.restore()
    }
  })

  it('a rule change keeps trackers under a sibling target that only shares a string prefix', async () => {
    const timers = captureIntervals()
    const clock = fakeClock()
    try {
      const twoEngines = (first: string): N2kInstanceMappings => ({
        [ENGINE_KEY]: [
          { group: 'engine', instance: 0, target: first },
          { group: 'engine', instance: 1, target: 'propulsion.mainAft' }
        ]
      })
      const { app, stream } = makeStream(twoEngines('propulsion.main'))
      const output = collectStreamOutput(stream)
      stream.write(addressClaim(ENGINE_SRC, ENGINE_DEVICE))
      stream.write(engineAlarm(ENGINE_SRC, 1))
      app.config.settings.n2kInstanceMappings = twoEngines('propulsion.center')
      app.emit('serverAdminEvent', {
        type: 'N2KINSTANCEMAPPINGS',
        data: app.config.settings.n2kInstanceMappings
      })
      stream.end()
      const paths = pathsOf((await output) as Output)
      expect(paths).to.include(
        'notifications.propulsion.mainAft.overTemperature'
      )
      expect(handledValues(app)).to.deep.equal([])

      clock.advance(PAST_AUTO_NORMAL_MS)
      timers.callbacks.forEach((cb) => cb())
      expect(handledValues(app)).to.deep.equal([
        overTemperatureNormal('propulsion.mainAft')
      ])
    } finally {
      clock.restore()
      timers.restore()
    }
  })

  it('a new rule settles the default-path alarm of that device with one normal', async () => {
    const timers = captureIntervals()
    const clock = fakeClock()
    try {
      const { app, stream } = makeStream(undefined)
      const output = collectStreamOutput(stream)
      stream.write(addressClaim(ENGINE_SRC, ENGINE_DEVICE))
      stream.write(engineAlarm(ENGINE_SRC, 0))
      app.config.settings.n2kInstanceMappings = MAIN_ENGINE
      app.emit('serverAdminEvent', {
        type: 'N2KINSTANCEMAPPINGS',
        data: MAIN_ENGINE
      })
      stream.end()
      await output
      expect(handledValues(app)).to.deep.equal([
        overTemperatureNormal('propulsion.port')
      ])

      clock.advance(PAST_AUTO_NORMAL_MS)
      timers.callbacks.forEach((cb) => cb())
      expect(handledValues(app)).to.deep.equal([
        overTemperatureNormal('propulsion.port')
      ])
    } finally {
      clock.restore()
      timers.restore()
    }
  })

  it('a late identity settles the default-path alarm before pruning it', async () => {
    const timers = captureIntervals()
    const clock = fakeClock()
    try {
      const { app, stream } = makeStream(MAIN_ENGINE, {
        canNameWarmupMs: WARMUP_MS
      })
      const events: string[] = []
      const handleMessage = app.handleMessage.bind(app)
      app.handleMessage = (id, delta) => {
        events.push('handleMessage')
        handleMessage(id, delta)
      }
      const removeSource = app.deltaCache.removeSource!.bind(app.deltaCache)
      app.deltaCache.removeSource = (ref, prefixes) => {
        events.push('removeSource')
        removeSource(ref, prefixes)
      }
      const output = collectStreamOutput(stream)
      stream.write(engineAlarm(ENGINE_SRC, 0))
      clock.advance(WARMUP_MS)
      stream.write(engineAlarm(ENGINE_SRC, 0))
      stream.write(addressClaim(ENGINE_SRC, ENGINE_DEVICE))
      stream.end()
      expect(pathsOf((await output) as Output)).to.include(
        'notifications.propulsion.port.overTemperature'
      )

      expect(events).to.deep.equal(['handleMessage', 'removeSource'])
      expect(handledValues(app)).to.deep.equal([
        overTemperatureNormal('propulsion.port')
      ])

      clock.advance(PAST_AUTO_NORMAL_MS)
      timers.callbacks.forEach((cb) => cb())
      expect(handledValues(app)).to.deep.equal([
        overTemperatureNormal('propulsion.port')
      ])
    } finally {
      clock.restore()
      timers.restore()
    }
  })

  it('after n2kSourceChanged the address warms up again and maps once identified', async () => {
    const clock = fakeClock()
    try {
      const { app, stream } = makeStream(MAIN_ENGINE, {
        canNameWarmupMs: WARMUP_MS
      })
      const output = collectStreamOutput(stream)
      // Held back: the address's warmup starts before its identity resolves.
      stream.write(engineRapid(ENGINE_SRC, 0))
      stream.write(addressClaim(ENGINE_SRC, ENGINE_DEVICE))
      stream.write(engineRapid(ENGINE_SRC, 0))
      clock.advance(WARMUP_MS)
      internals(stream).n2kMapper.emit(
        'n2kSourceChanged',
        ENGINE_SRC,
        'c0000000011200d6',
        'c0000000011200d7'
      )
      // Identity is unknown again and the warmup restarted: dropped.
      stream.write(engineRapid(ENGINE_SRC, 0))
      stream.write(addressClaim(ENGINE_SRC, ENGINE_DEVICE))
      stream.write(engineRapid(ENGINE_SRC, 0))
      stream.end()
      const results = (await output) as Output
      expect(results.map((r) => pathsOf([r])[0])).to.deep.equal([
        'propulsion.main.revolutions',
        'propulsion.main.revolutions'
      ])
      expect(app.removedSources).to.deep.equal([])
    } finally {
      clock.restore()
    }
  })
})
