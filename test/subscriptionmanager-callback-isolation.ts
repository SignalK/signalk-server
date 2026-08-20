import {
  Context,
  Delta,
  Path,
  PathValue,
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

const STW_PATH = 'navigation.speedThroughWater' as Path
const TWS_PATH = 'environment.wind.speedTrue' as Path
const DEPTH_PATH = 'environment.depth.belowTransducer' as Path

function valueDelta(context: Context, path: Path, value: number): Delta {
  return {
    context,
    updates: [
      { $source: SOURCE_REF, timestamp: TIMESTAMP, values: [{ path, value }] }
    ]
  }
}

function metaDelta(context: Context, path: Path): Delta {
  return {
    context,
    updates: [
      {
        $source: SOURCE_REF,
        timestamp: TIMESTAMP,
        meta: [{ path, value: { units: 'm/s' } }]
      }
    ]
  } as Delta
}

function pathsOf(deltas: Delta[]): string[] {
  return deltas.map((d) => {
    const update = d.updates[0]
    return 'values' in update ? update.values[0].path : 'meta'
  })
}

// A plugin subscribing at startup, before its paths carry data, attaches to
// the per-path buses via streambundle.keys announcements. Subscriber
// callbacks run synchronously inside those Bacon dispatches; these tests pin
// that a callback throwing there stays contained instead of aborting the
// dispatch for every subscription registered after it (or leaving a Bus
// stuck mid-drain, silencing announcements for good).
describe('SubscriptionManager callback isolation', () => {
  let bundle: StreamBundle
  let cache: Map<string, Delta>
  let unsubscribes: Array<() => void>

  // index.ts dispatchDelta ingests into the delta cache first, then emits
  // unfilteredDelta and delta; pushDelta may throw when a raw streambundle
  // subscriber crashes, which index.ts survives via EventEmitter isolation.
  const dispatch = (delta: Delta) => {
    const update = delta.updates[0]
    if ('values' in update) {
      cache.set(update.values[0].path, delta)
    }
    bundle.pushUnfilteredDelta(delta)
    try {
      bundle.pushDelta(delta)
    } catch (_) {
      // swallowed like the console.error catch inside pushDelta
    }
  }

  const mockApp = () => ({
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

  const subscribe = (
    rows: SubscriptionOptions[],
    callback: (delta: Delta) => void,
    errorCallback: (err: unknown) => void = () => undefined
  ) => {
    const manager = new SubscriptionManager(mockApp())
    manager.subscribe(
      { context: '*' as Context, subscribe: rows },
      unsubscribes,
      errorCallback,
      callback
    )
  }

  const throwingCallback = () => {
    throw new TypeError('broken plugin callback')
  }

  beforeEach(() => {
    bundle = new StreamBundle(SELF_ID)
    cache = new Map()
    unsubscribes = []
    // DeltaCache's constructor registers a keys listener that materializes
    // the per-path bus inside the announcement dispatch — reproduce that
    // re-entrant getBus call here.
    bundle.keys.onValue((key) => {
      bundle.getBus(key).onValue(() => undefined)
    })
  })

  afterEach(() => {
    unsubscribes.forEach((f) => f())
  })

  it('a callback throwing on cache bootstrap does not blind later subscriptions', () => {
    subscribe([{ path: STW_PATH }], throwingCallback)

    const received: Delta[] = []
    subscribe(
      [{ path: STW_PATH }, { path: TWS_PATH }, { path: DEPTH_PATH }],
      (delta) => received.push(delta)
    )

    // first data arrives only after both subscriptions exist: the crashy
    // subscription's bootstrap replay runs inside each keys announcement
    dispatch(valueDelta(SELF_CONTEXT, STW_PATH, 3.1))
    dispatch(valueDelta(SELF_CONTEXT, TWS_PATH, 7.2))
    dispatch(valueDelta(SELF_CONTEXT, DEPTH_PATH, 12.4))
    const receivedInBurst = received.length
    dispatch(valueDelta(SELF_CONTEXT, STW_PATH, 3.2))
    dispatch(valueDelta(SELF_CONTEXT, TWS_PATH, 7.3))

    // every path was attached (announcement not lost) …
    const burstPaths = pathsOf(received.slice(0, receivedInBurst))
    expect(burstPaths).to.include(STW_PATH)
    expect(burstPaths).to.include(TWS_PATH)
    expect(burstPaths).to.include(DEPTH_PATH)
    // … and steady-state deltas keep arriving afterwards
    expect(pathsOf(received.slice(receivedInBurst))).to.deep.equal([
      STW_PATH,
      TWS_PATH
    ])
  })

  it('a callback throwing on live delivery does not block other subscribers of the path', () => {
    // values-only callback crashing on a meta update, the
    // signalk-polar-performance-plugin shape
    subscribe([{ path: STW_PATH }], (delta) => {
      delta.updates.forEach((u) => {
        // deliberately assumes a values update, like broken plugins do
        ;(u as { values: PathValue[] }).values.forEach(() => undefined)
      })
    })

    const received: Delta[] = []
    subscribe([{ path: STW_PATH }], (delta) => received.push(delta))

    dispatch(valueDelta(SELF_CONTEXT, STW_PATH, 3.1))
    dispatch(metaDelta(SELF_CONTEXT, STW_PATH))
    dispatch(valueDelta(SELF_CONTEXT, STW_PATH, 3.2))

    expect(pathsOf(received)).to.deep.equal([STW_PATH, 'meta', STW_PATH])
  })

  it('reports callback exceptions through errorCallback', () => {
    const errors: unknown[] = []
    subscribe([{ path: STW_PATH }], throwingCallback, (err) => errors.push(err))

    dispatch(valueDelta(SELF_CONTEXT, STW_PATH, 3.1))

    // the callback throws on every delivery, so the error must surface
    // through errorCallback rather than escaping into the dispatch
    expect(errors).to.not.be.empty
    errors.forEach((err) => expect(err).to.be.instanceOf(TypeError))
  })

  it('survives an errorCallback that also throws', () => {
    subscribe([{ path: STW_PATH }], throwingCallback, () => {
      throw new Error('broken errorCallback')
    })

    const received: Delta[] = []
    subscribe([{ path: STW_PATH }], (delta) => received.push(delta))

    dispatch(valueDelta(SELF_CONTEXT, STW_PATH, 3.1))
    dispatch(valueDelta(SELF_CONTEXT, STW_PATH, 3.2))

    expect(pathsOf(received)).to.deep.equal([STW_PATH, STW_PATH])
  })

  it('keys announcements keep flowing after repeated callback crashes', () => {
    // the wedge scenario: the crashy subscription throws on every delivery,
    // including the bootstrap replay of announcements drained from the keys
    // bus re-entrancy queue
    subscribe([{ path: '*' as Path }], throwingCallback)

    const received: Delta[] = []
    subscribe([{ path: '*' as Path }], (delta) => received.push(delta))

    dispatch(valueDelta(SELF_CONTEXT, STW_PATH, 3.1))
    dispatch(valueDelta(SELF_CONTEXT, TWS_PATH, 7.2))
    dispatch(valueDelta(SELF_CONTEXT, DEPTH_PATH, 12.4))

    expect(pathsOf(received)).to.include(STW_PATH)
    expect(pathsOf(received)).to.include(TWS_PATH)
    expect(pathsOf(received)).to.include(DEPTH_PATH)
  })
})
