import { expect } from 'chai'
import {
  hasValues,
  type Context,
  type Delta,
  type Path,
  type PathValue,
  type SourceRef,
  type Update
} from '@signalk/server-api'
import type { AccumulatedItem } from '../dist/LatestValuesAccumulator'
import {
  accumulateLatestValue,
  buildFlushDeltas
} from '../dist/LatestValuesAccumulator'

const SELF_CONTEXT = 'vessels.self' as Context
const SPEED_OVER_GROUND_PATH = 'navigation.speedOverGround' as Path
const UNKNOWN_SOURCE = 'unknown' as SourceRef
const GPS_SOURCE = 'gps' as SourceRef
const FLUSH_DURATION_MS = 1000

function delta(
  source: SourceRef | undefined,
  value: PathValue['value']
): Delta {
  return {
    context: SELF_CONTEXT,
    updates: [
      {
        $source: source,
        values: [{ path: SPEED_OVER_GROUND_PATH, value }]
      }
    ]
  }
}

function firstValue(update: Update | undefined) {
  return update && hasValues(update) ? update.values[0]?.value : undefined
}

describe('LatestValuesAccumulator TypeScript cases', function () {
  it('keeps a missing source separate from a real unknown source', function () {
    const accumulator = new Map<string, AccumulatedItem>()

    accumulateLatestValue(accumulator, delta(undefined, 5))
    accumulateLatestValue(accumulator, delta(UNKNOWN_SOURCE, 6))

    expect(accumulator.size).to.equal(2)
    const items = Array.from(accumulator.values())
    expect(items.find((item) => item.$source === undefined)?.value).to.equal(5)
    expect(
      items.find((item) => item.$source === UNKNOWN_SOURCE)?.value
    ).to.equal(6)

    const [flushed] = buildFlushDeltas(accumulator, FLUSH_DURATION_MS)
    expect(flushed.updates).to.have.length(2)
    expect(
      firstValue(flushed.updates.find((update) => update.$source === undefined))
    ).to.equal(5)
    expect(
      firstValue(
        flushed.updates.find((update) => update.$source === UNKNOWN_SOURCE)
      )
    ).to.equal(6)
  })

  it('propagates an undefined timestamp', function () {
    const accumulator = new Map<string, AccumulatedItem>()
    accumulateLatestValue(accumulator, delta(GPS_SOURCE, 5))

    const [flushed] = buildFlushDeltas(accumulator, FLUSH_DURATION_MS)

    expect(flushed.updates).to.have.length(1)
    expect(flushed.updates[0].timestamp).to.equal(undefined)
  })
})
