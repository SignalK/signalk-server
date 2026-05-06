import { expect } from 'chai'
import { hasValues, type Delta, type Update } from '@signalk/server-api'
import type { AccumulatedItem } from '../dist/LatestValuesAccumulator'
import {
  accumulateLatestValue,
  buildFlushDeltas
} from '../dist/LatestValuesAccumulator'

function delta(source: string | undefined, value: number): Delta {
  return {
    context: 'vessels.self',
    updates: [
      {
        $source: source,
        values: [{ path: 'navigation.speedOverGround', value }]
      }
    ]
  } as Delta
}

function firstValue(update: Update | undefined) {
  return update && hasValues(update) ? update.values[0]?.value : undefined
}

describe('LatestValuesAccumulator TypeScript cases', function () {
  it('keeps a missing source separate from a real unknown source', function () {
    const accumulator = new Map<string, AccumulatedItem>()

    accumulateLatestValue(accumulator, delta(undefined, 5))
    accumulateLatestValue(accumulator, delta('unknown', 6))

    expect(accumulator.size).to.equal(2)
    const items = Array.from(accumulator.values())
    expect(items.find((item) => item.$source === undefined)?.value).to.equal(5)
    expect(items.find((item) => item.$source === 'unknown')?.value).to.equal(6)

    const [flushed] = buildFlushDeltas(accumulator, 1000)
    expect(flushed.updates).to.have.length(2)
    expect(
      firstValue(flushed.updates.find((update) => update.$source === undefined))
    ).to.equal(5)
    expect(
      firstValue(flushed.updates.find((update) => update.$source === 'unknown'))
    ).to.equal(6)
  })

  it('propagates an undefined timestamp', function () {
    const accumulator = new Map<string, AccumulatedItem>()
    accumulateLatestValue(accumulator, delta('gps', 5))

    const [flushed] = buildFlushDeltas(accumulator, 1000)

    expect(flushed.updates).to.have.length(1)
    expect(flushed.updates[0].timestamp).to.equal(undefined)
  })
})
