import { expect } from 'chai'
import QuickToSignalK from './quick-signalk'
import {
  createMockApp,
  collectStreamOutput,
  createDebugStub
} from './test-helpers'

// PGN 1729 (0x6c1) is the chain count packet: the only Quick message the
// mapper currently turns into Signal K values. The shape here mirrors what
// canboatjs' FromPgn parser emits, where the CAN ID becomes the PGN.
const chainCountMessage = (
  chainDeployed: number,
  units: 'metres' | 'feet'
) => ({
  pgn: 0x6c1,
  src: 6337,
  dst: 255,
  prio: 0,
  timestamp: '2026-01-01T00:00:00.000Z',
  protocol: 'quick',
  fields: { chainDeployed, units }
})

async function toDelta(message: unknown): Promise<{
  context: string
  updates: Array<{
    source: { pgn: number; src: string; type: string }
    values: Array<{ path: string; value: number }>
  }>
}> {
  const app = createMockApp()
  const stream = new QuickToSignalK({
    app,
    providerId: 'test-quick',
    createDebug: createDebugStub()
  })

  const outputPromise = collectStreamOutput(stream)
  stream.write(message)
  stream.end()

  const results = await outputPromise
  expect(results).to.have.length(1)
  return results[0] as never
}

describe('QuickToSignalK', () => {
  it('converts a Quick PCS message to a Signal K delta', async () => {
    const delta = await toDelta(chainCountMessage(107, 'metres'))

    expect(delta.context).to.equal('vessels.urn:mrn:imo:mmsi:000000000')
    expect(delta.updates[0]!.source.type).to.equal('QuickPCS')
    expect(delta.updates[0]!.source.pgn).to.equal(0x6c1)
    expect(delta.updates[0]!.source.src).to.equal('6337')
    expect(delta.updates[0]!.values).to.deep.equal([
      { path: 'navigation.anchor.rodeDeployed', value: 107 }
    ])
  })

  it('converts a chain length reported in feet to metres', async () => {
    const delta = await toDelta(chainCountMessage(107, 'feet'))

    // 107 international feet = 32.6136 m, matching the in-image smoke test.
    expect(delta.updates[0]!.values).to.deep.equal([
      { path: 'navigation.anchor.rodeDeployed', value: 32.6136 }
    ])
  })

  it('emits a metadata-only delta for a Quick message it has no path mapping for', async () => {
    const delta = await toDelta({
      ...chainCountMessage(0, 'metres'),
      pgn: 0x6c0
    })

    // PGN 1728 (0x6c0) has no Signal K path yet, so the source metadata is
    // still published, but with nothing in `values`.
    expect(delta.updates[0]!.source.pgn).to.equal(0x6c0)
    expect(delta.updates[0]!.values).to.be.an('array').that.is.empty
  })
})
