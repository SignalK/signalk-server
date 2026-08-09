import { expect } from 'chai'
import N2kToSignalK from './n2k-signalk'
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
