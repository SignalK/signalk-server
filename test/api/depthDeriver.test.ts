import { expect } from 'chai'
import { EventEmitter } from 'node:events'
import type { Delta } from '@signalk/server-api'
import { DepthDeriver } from '../../src/api/depthDeriver'

const SELF = 'vessels.self'
const TS = '2026-10-13T19:52:31.815Z'
const DST810 = 'IPG100.c078880010eae4cd'

type Values = Record<string, number | null>

interface Emitted {
  $source: string
  timestamp: string
  values: Array<{ path: string; value: number | null }>
}

function depthDelta(values: Values, $source = DST810, context = SELF): Delta {
  return {
    context: context as unknown as Delta['context'],
    updates: [
      {
        $source: $source as unknown as never,
        timestamp: TS as unknown as never,
        values: Object.entries(values).map(([path, value]) => ({
          path: `environment.depth.${path}` as unknown as never,
          value
        }))
      }
    ]
  }
}

function makeApp(draft?: { current?: number; maximum?: number }) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const app: any = new EventEmitter()
  app.selfContext = SELF
  app.signalk = { self: draft ? { design: { draft: { value: draft } } } : {} }
  let handler: ((delta: Delta, next: (d: Delta) => void) => void) | undefined
  app.registerDeltaInputHandler = (
    h: (delta: Delta, next: (d: Delta) => void) => void
  ) => {
    handler = h
  }
  const emitted: Array<{ id: string; delta: Partial<Delta> }> = []
  app.handleMessage = (id: string, delta: Partial<Delta>) => {
    emitted.push({ id, delta })
  }
  return {
    app,
    emitted,
    // The derived delta is published via setImmediate, outside the
    // input-handler call stack, so each call waits for it.
    async process(delta: Delta): Promise<Delta> {
      let out: Delta = delta
      handler?.(delta, (d) => {
        out = d
      })
      await new Promise((resolve) => setImmediate(resolve))
      return out
    }
  }
}

async function setup(draft?: { current?: number; maximum?: number }) {
  const env = makeApp(draft)
  await new DepthDeriver(env.app).start()
  const derived = (): Emitted[] =>
    env.emitted.flatMap((e) => (e.delta.updates ?? []) as unknown as Emitted[])
  const derivedValues = (index = 0): Record<string, number | null> =>
    Object.fromEntries(
      (derived()[index]?.values ?? []).map((v) => [
        v.path.replace('environment.depth.', ''),
        v.value
      ])
    )
  return { ...env, derived, derivedValues }
}

describe('DepthDeriver', function () {
  it('derives belowSurface for a keel-mode transducer from the draft', async function () {
    const { process, emitted, derived, derivedValues } = await setup({
      maximum: 1.7
    })
    const input = depthDelta({
      belowTransducer: 12.93,
      transducerToKeel: 1,
      belowKeel: 11.93
    })
    const out = await process(input)

    expect(out).to.equal(input)
    expect(emitted[0].id).to.equal('depthDeriver')
    expect(derived()[0].$source).to.equal(`${DST810}.derived`)
    expect(derived()[0].timestamp).to.equal(TS)
    // belowKeel is the transducer's own, so only belowSurface is derived.
    expect(Object.keys(derivedValues())).to.deep.equal(['belowSurface'])
    expect(derivedValues().belowSurface).to.be.closeTo(13.63, 1e-9)
  })

  it('reads a negative transducerToKeel as the same distance', async function () {
    const { process, derivedValues } = await setup({ maximum: 1.7 })
    await process(
      depthDelta({
        belowTransducer: 12.93,
        transducerToKeel: -1,
        belowKeel: 11.93
      })
    )
    expect(derivedValues().belowSurface).to.be.closeTo(13.63, 1e-9)
  })

  it('derives belowKeel for a waterline-mode transducer', async function () {
    const { process, derivedValues } = await setup({ maximum: 1.7 })
    await process(
      depthDelta({
        belowTransducer: 10,
        surfaceToTransducer: 0.5,
        belowSurface: 10.5
      })
    )
    expect(Object.keys(derivedValues())).to.deep.equal(['belowKeel'])
    expect(derivedValues().belowKeel).to.be.closeTo(8.8, 1e-9)
  })

  it('prefers the current draft over the maximum', async function () {
    const { process, derivedValues } = await setup({
      current: 1.5,
      maximum: 1.7
    })
    await process(depthDelta({ belowTransducer: 10, transducerToKeel: 1 }))
    expect(derivedValues().belowSurface).to.be.closeTo(10.5, 1e-9)
    expect(derivedValues().belowKeel).to.be.closeTo(9, 1e-9)
  })

  it('derives nothing from a depth without an offset', async function () {
    const { process, emitted } = await setup({ maximum: 1.7 })
    await process(depthDelta({ belowTransducer: 10 }))
    expect(emitted).to.have.length(0)
  })

  it('derives nothing for a keel-mode transducer without a draft', async function () {
    const { process, emitted } = await setup()
    await process(
      depthDelta({ belowTransducer: 10, transducerToKeel: 1, belowKeel: 9 })
    )
    expect(emitted).to.have.length(0)
  })

  it('derives nothing when the keel offset exceeds the draft', async function () {
    const { process, emitted } = await setup({ maximum: 0.5 })
    await process(
      depthDelta({ belowTransducer: 10, transducerToKeel: 1, belowKeel: 9 })
    )
    expect(emitted).to.have.length(0)
  })

  it('retracts a derived depth with null when the offset stops arriving', async function () {
    const { process, derived, derivedValues } = await setup({ maximum: 1.7 })
    await process(depthDelta({ belowTransducer: 10, transducerToKeel: 1 }))
    await process(depthDelta({ belowTransducer: 10 }))
    expect(derived()).to.have.length(2)
    expect(derivedValues(1)).to.deep.equal({
      belowSurface: null,
      belowKeel: null
    })
    // Once retracted, further readings without an offset emit nothing.
    await process(depthDelta({ belowTransducer: 10 }))
    expect(derived()).to.have.length(2)
  })

  it('mirrors a null depth onto the derived paths', async function () {
    const { process, derivedValues } = await setup({ maximum: 1.7 })
    await process(
      depthDelta({ belowTransducer: 10, transducerToKeel: 1, belowKeel: 9 })
    )
    await process(
      depthDelta({
        belowTransducer: null,
        transducerToKeel: 1,
        belowKeel: null
      })
    )
    expect(derivedValues(1)).to.deep.equal({ belowSurface: null })
  })

  it('derives each transducer from its own offset', async function () {
    const { process, derived } = await setup({ maximum: 1.7 })
    await process(
      depthDelta({ belowTransducer: 10, transducerToKeel: 1, belowKeel: 9 })
    )
    await process(
      depthDelta(
        { belowTransducer: 20, surfaceToTransducer: 0.4, belowSurface: 20.4 },
        'nmea0183.II'
      )
    )
    expect(derived().map((u) => u.$source)).to.deep.equal([
      `${DST810}.derived`,
      'nmea0183.II.derived'
    ])
    expect(derived()[0].values[0].value).to.be.closeTo(10.7, 1e-9)
    expect(derived()[1].values[0].value).to.be.closeTo(18.7, 1e-9)
  })

  it('ignores derived sources and other vessels', async function () {
    const { process, emitted } = await setup({ maximum: 1.7 })
    await process(
      depthDelta(
        { belowTransducer: 10, transducerToKeel: 1 },
        `${DST810}.derived`
      )
    )
    await process(
      depthDelta(
        { belowTransducer: 10, transducerToKeel: 1 },
        DST810,
        'vessels.urn:mrn:imo:mmsi:230099999'
      )
    )
    expect(emitted).to.have.length(0)
  })
})
