import {
  Context,
  Delta,
  Path,
  SourceRef,
  SubscriptionOptions,
  Timestamp
} from '@signalk/server-api'
import { expect } from 'chai'
import { StreamBundle } from '../src/streambundle'
import SubscriptionManager from '../src/subscriptionmanager'

const SELF_ID = 'self-uuid'
const SELF_CONTEXT = `vessels.${SELF_ID}` as Context
const TIMESTAMP = '2026-01-01T00:00:00.000Z' as Timestamp
const SOURCE_REF = 'test.1' as SourceRef

const SOG_PATH = 'navigation.speedOverGround' as Path

const SOG_FIRST = 3.4
const SOG_SECOND = 3.5

function valueDelta(context: Context, path: Path, value: number): Delta {
  return {
    context,
    updates: [
      { $source: SOURCE_REF, timestamp: TIMESTAMP, values: [{ path, value }] }
    ]
  }
}

function valuesOf(deltas: Delta[]): unknown[] {
  return deltas.map((d) => {
    const update = d.updates[0]
    return 'values' in update ? update.values[0].value : undefined
  })
}

// The cache bootstrap in handleSubscribeRow serves two callers with
// different needs. At subscribe time it delivers the last known value of
// paths that are already flowing — the subscriber's snapshot. In the keys
// listener the announcement is triggered by the delta that is mid-dispatch
// (index.ts ingests into the delta cache before emitting), so the live push
// follows the attach within the same dispatch and a cache replay would
// deliver that first delta twice.
describe('SubscriptionManager cache bootstrap', () => {
  let bundle: StreamBundle
  let cache: Map<string, Delta>
  let received: Delta[]
  let unsubscribes: Array<() => void>

  // index.ts dispatchDelta order: deltaCache.ingestDelta, then the
  // unfilteredDelta emit, then the delta emit
  const dispatch = (delta: Delta) => {
    const update = delta.updates[0]
    if ('values' in update) {
      cache.set(update.values[0].path, delta)
    }
    bundle.pushUnfilteredDelta(delta)
    bundle.pushDelta(delta)
  }

  const subscribe = (
    rows: SubscriptionOptions[],
    sourcePolicy?: 'preferred' | 'all'
  ) => {
    const manager = new SubscriptionManager({
      streambundle: bundle,
      selfContext: SELF_CONTEXT,
      deltaCache: {
        getMatchingContexts: () => [],
        getCachedDeltasForContexts: (
          _contexts: unknown,
          _user: unknown,
          key?: string
        ) => {
          if (key !== undefined) {
            const hit = cache.get(key)
            return hit ? [hit] : []
          }
          return [...cache.values()]
        }
      },
      signalk: { root: {} }
    })
    manager.subscribe(
      { context: '*' as Context, subscribe: rows },
      unsubscribes,
      () => undefined,
      (delta: Delta) => received.push(delta),
      undefined,
      sourcePolicy
    )
  }

  beforeEach(() => {
    bundle = new StreamBundle(SELF_ID)
    cache = new Map()
    received = []
    unsubscribes = []
    // DeltaCache's constructor registers a keys listener that touches the
    // per-path bus inside the announcement dispatch
    bundle.keys.onValue((key) => {
      bundle.getBus(key).onValue(() => undefined)
    })
  })

  afterEach(() => {
    unsubscribes.forEach((f) => f())
  })

  it('delivers the first delta of a path appearing after subscribe exactly once', () => {
    subscribe([{ path: SOG_PATH }])

    dispatch(valueDelta(SELF_CONTEXT, SOG_PATH, SOG_FIRST))
    dispatch(valueDelta(SELF_CONTEXT, SOG_PATH, SOG_SECOND))

    expect(valuesOf(received)).to.deep.equal([SOG_FIRST, SOG_SECOND])
  })

  it("delivers a sourcePolicy 'all' subscriber the first delta exactly once", () => {
    subscribe([{ path: SOG_PATH }], 'all')

    dispatch(valueDelta(SELF_CONTEXT, SOG_PATH, SOG_FIRST))
    dispatch(valueDelta(SELF_CONTEXT, SOG_PATH, SOG_SECOND))

    expect(valuesOf(received)).to.deep.equal([SOG_FIRST, SOG_SECOND])
  })

  it('enumerates matching contexts once per row across its matching paths', () => {
    const cogPath = 'navigation.courseOverGroundTrue' as Path
    dispatch(valueDelta(SELF_CONTEXT, SOG_PATH, SOG_FIRST))
    dispatch(valueDelta(SELF_CONTEXT, cogPath, 1.2))

    const sentinelContexts: unknown[] = []
    let enumerations = 0
    const contextsSeen: unknown[] = []
    const manager = new SubscriptionManager({
      streambundle: bundle,
      selfContext: SELF_CONTEXT,
      deltaCache: {
        getMatchingContexts: () => {
          enumerations++
          return sentinelContexts
        },
        getCachedDeltasForContexts: (contexts: unknown) => {
          contextsSeen.push(contexts)
          return []
        }
      },
      signalk: { root: {} }
    })
    manager.subscribe(
      {
        context: '*' as Context,
        subscribe: [{ path: 'navigation.*' as Path }]
      },
      unsubscribes,
      () => undefined,
      (delta: Delta) => received.push(delta),
      undefined,
      'preferred'
    )

    expect(contextsSeen.length).to.equal(2)
    expect(enumerations).to.equal(1)
    contextsSeen.forEach((c) => expect(c).to.equal(sentinelContexts))
  })

  it('still replays the cached value at subscribe time for known paths', () => {
    dispatch(valueDelta(SELF_CONTEXT, SOG_PATH, SOG_FIRST))

    subscribe([{ path: SOG_PATH }])
    expect(valuesOf(received)).to.deep.equal([SOG_FIRST])

    dispatch(valueDelta(SELF_CONTEXT, SOG_PATH, SOG_SECOND))
    expect(valuesOf(received)).to.deep.equal([SOG_FIRST, SOG_SECOND])
  })
})
