import { Context, Delta, Path, SourceRef, Timestamp } from '@signalk/server-api'
import { expect } from 'chai'
import { getToPreferredDelta } from '../src/deltaPriority'
import { StreamBundle } from '../src/streambundle'
import SubscriptionManager from '../src/subscriptionmanager'

const SELF_ID = 'self-uuid'
const SELF_CONTEXT = `vessels.${SELF_ID}` as Context
const TIMESTAMP = '2026-01-01T00:00:00.000Z' as Timestamp
const SOURCE_REF = 'test.1' as SourceRef
const EXCLUDED_REF = 'my-plugin' as SourceRef
const AWS_PATH = 'environment.wind.speedApparent' as Path
const VALUES = [1, 2, 3, 4, 5]

function valueDelta(value: number): Delta {
  return {
    context: SELF_CONTEXT,
    updates: [
      {
        $source: SOURCE_REF,
        timestamp: TIMESTAMP,
        values: [{ path: AWS_PATH, value }]
      }
    ]
  }
}

function metaDelta(): Delta {
  return {
    context: SELF_CONTEXT,
    updates: [
      {
        $source: SOURCE_REF,
        timestamp: TIMESTAMP,
        meta: [{ path: AWS_PATH, value: { units: 'm/s' } }]
      }
    ]
  }
}

// index.ts emits `unfilteredDelta` before `delta`, and registers
// pushUnfilteredDelta / pushDelta as permanent listeners on both.
function dispatch(bundle: StreamBundle, delta: Delta) {
  bundle.pushUnfilteredDelta(delta)
  bundle.pushDelta(delta)
}

function mockApp(bundle: StreamBundle) {
  return {
    streambundle: bundle,
    selfContext: SELF_CONTEXT,
    deltaCache: {
      getMatchingContexts: () => [],
      getCachedDeltasForContexts: () => []
    },
    securityStrategy: {
      filterReadDelta: (_user: unknown, delta: Delta) => delta,
      shouldFilterDeltas: () => false
    },
    signalk: { root: {} },
    buildSubscriptionEngine: (refs: string[]) =>
      getToPreferredDelta({ excludeIdentities: new Set(refs) })
  }
}

function valuesOf(deltas: Delta[]): unknown[] {
  return deltas.flatMap((d) =>
    d.updates.flatMap((u) =>
      'values' in u ? u.values.map((v) => v.value) : []
    )
  )
}

// A path can reach the bundle first through only one of its two bus
// families: a meta delta arrives on the preferred side only, and a value
// the global priority engine drops on the unfiltered side only. A
// subscription made before the path's first value on the other side must
// still receive it.
describe('SubscriptionManager new path on the other bus family', () => {
  let bundle: StreamBundle
  let received: Delta[]
  let unsubscribes: Array<() => void>

  const subscribe = (excludeSources?: SourceRef[]) => {
    const manager = new SubscriptionManager(mockApp(bundle))
    manager.subscribe(
      { context: SELF_CONTEXT, subscribe: [{ path: AWS_PATH }] },
      unsubscribes,
      () => undefined,
      (delta: Delta) => received.push(delta),
      undefined,
      'preferred',
      excludeSources
    )
  }

  beforeEach(() => {
    bundle = new StreamBundle(SELF_ID)
    received = []
    unsubscribes = []
  })

  afterEach(() => unsubscribes.forEach((unsubscribe) => unsubscribe()))

  it('delivers values to an excludeSources subscription made after meta', () => {
    bundle.pushDelta(metaDelta())
    subscribe([EXCLUDED_REF])

    VALUES.forEach((v) => dispatch(bundle, valueDelta(v)))

    expect(valuesOf(received)).to.deep.equal(VALUES)
  })

  it('delivers values to a preferred subscription made after an unfiltered-only value', () => {
    bundle.pushUnfilteredDelta(valueDelta(0))
    subscribe()

    VALUES.forEach((v) => dispatch(bundle, valueDelta(v)))

    expect(valuesOf(received)).to.deep.equal(VALUES)
  })

  it('still delivers each value once when meta precedes the subscription', () => {
    bundle.pushDelta(metaDelta())
    subscribe()

    VALUES.forEach((v) => dispatch(bundle, valueDelta(v)))

    expect(valuesOf(received)).to.deep.equal(VALUES)
  })
})
