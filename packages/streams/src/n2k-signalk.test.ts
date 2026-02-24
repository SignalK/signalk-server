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
