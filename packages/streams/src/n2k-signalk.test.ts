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

/**
 * Pre-seed sourceMeta for a src so that deltas pass through without waiting
 * for CAN Name resolution (which requires PGN 60928 address claim traffic).
 */
function markCanNameUnknown(stream: N2kToSignalK, src: number): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(stream as any).sourceMeta[src] = { unknowCanName: true }
}

describe('N2kToSignalK', () => {
  it('converts N2K PGN to Signal K delta', async () => {
    const app = createMockApp()
    const stream = new N2kToSignalK({
      app,
      providerId: 'test-n2k'
    })
    markCanNameUnknown(stream, 204)

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
    markCanNameUnknown(stream, 204)

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

  it('ignores filters when filtersEnabled is false', async () => {
    const app = createMockApp()
    const stream = new N2kToSignalK({
      app,
      providerId: 'test-n2k',
      filtersEnabled: false,
      filters: [{ pgn: '127250', source: '204' }]
    })
    markCanNameUnknown(stream, 204)

    const outputPromise = collectStreamOutput(stream)

    stream.write(HEADING_PGN)
    stream.end()

    const results = await outputPromise
    expect(results).to.have.length(1)
  })
})
