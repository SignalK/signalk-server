import {
  Context,
  Delta,
  Path,
  SourceRef,
  SubscriptionOptions,
  Timestamp
} from '@signalk/server-api'
import * as Bacon from 'baconjs'
import { expect } from 'chai'
import { StreamBundle } from '../src/streambundle'
import SubscriptionManager from '../src/subscriptionmanager'

const SELF_ID = 'self-uuid'
const SELF_CONTEXT = `vessels.${SELF_ID}` as Context
const AIS_CONTEXT = 'vessels.urn:mrn:imo:mmsi:999' as Context
const TIMESTAMP = '2026-01-01T00:00:00.000Z' as Timestamp
const SOURCE_REF = 'test.1' as SourceRef

const ALL_CONTEXTS = '*' as Context
const ALL_PATHS = '*' as Path
const SOG_PATH = 'navigation.speedOverGround' as Path
const HEADING_PATH = 'navigation.headingTrue' as Path

const SOG_FIRST = 3.4
const SOG_SECOND = 3.5
const HEADING = 1.2
const AIS_SOG = 9.9

function valueDelta(context: Context, path: Path, value: number): Delta {
  return {
    context,
    updates: [
      { $source: SOURCE_REF, timestamp: TIMESTAMP, values: [{ path, value }] }
    ]
  }
}

// index.ts emits `unfilteredDelta` before `delta`, and registers
// pushUnfilteredDelta / pushDelta as permanent listeners on both.
function dispatch(bundle: StreamBundle, delta: Delta) {
  bundle.pushUnfilteredDelta(delta)
  bundle.pushDelta(delta)
}

function pathsOf(deltas: Delta[]): string[] {
  return deltas.map((d) => {
    const update = d.updates[0]
    return 'values' in update ? update.values[0].path : 'meta'
  })
}

function mockApp(bundle: StreamBundle, cached: Delta[] = []) {
  return {
    streambundle: bundle,
    selfContext: SELF_CONTEXT,
    deltaCache: { getCachedDeltas: () => cached },
    securityStrategy: {
      filterReadDelta: (_user: unknown, delta: Delta) => delta,
      shouldFilterDeltas: () => false
    },
    signalk: { root: {} }
  }
}

// Rows carrying no rate limiting, no root flattening and no source excludes
// are delivered by a single inline sink rather than a filter/map/onValue Bacon
// chain. These pin the delivery contract that shortcut has to honour.
describe('SubscriptionManager delivery', () => {
  let bundle: StreamBundle
  let received: Delta[]
  let manager: SubscriptionManager
  let unsubscribes: Array<() => void>

  const subscribe = (
    rows: SubscriptionOptions[],
    callback?: (delta: Delta) => unknown,
    cached: Delta[] = []
  ) => {
    manager = new SubscriptionManager(mockApp(bundle, cached))
    manager.subscribe(
      { context: ALL_CONTEXTS, subscribe: rows },
      unsubscribes,
      () => undefined,
      callback ?? ((delta: Delta) => received.push(delta)),
      undefined,
      'preferred',
      undefined
    )
  }

  beforeEach(() => {
    bundle = new StreamBundle(SELF_ID)
    received = []
    unsubscribes = []
    // seed the paths so the initial pass over the bus map sees them
    dispatch(bundle, valueDelta(SELF_CONTEXT, SOG_PATH, SOG_FIRST))
    dispatch(bundle, valueDelta(SELF_CONTEXT, HEADING_PATH, HEADING))
  })

  it('delivers every matching delta once for a wildcard row', () => {
    subscribe([{ path: ALL_PATHS }])

    dispatch(bundle, valueDelta(SELF_CONTEXT, SOG_PATH, SOG_SECOND))
    dispatch(bundle, valueDelta(SELF_CONTEXT, HEADING_PATH, HEADING))
    dispatch(bundle, valueDelta(AIS_CONTEXT, SOG_PATH, AIS_SOG))

    expect(pathsOf(received)).to.deep.equal([SOG_PATH, HEADING_PATH, SOG_PATH])
  })

  it('delivers only the subscribed path for an explicit row', () => {
    subscribe([{ path: SOG_PATH }])

    dispatch(bundle, valueDelta(SELF_CONTEXT, HEADING_PATH, HEADING))
    dispatch(bundle, valueDelta(SELF_CONTEXT, SOG_PATH, SOG_SECOND))

    expect(pathsOf(received)).to.deep.equal([SOG_PATH])
    expect(received[0].updates[0]).to.have.property('$source', SOURCE_REF)
  })

  it('applies the context filter', () => {
    manager = new SubscriptionManager(mockApp(bundle))
    manager.subscribe(
      { context: SELF_CONTEXT, subscribe: [{ path: ALL_PATHS }] },
      unsubscribes,
      () => undefined,
      (delta: Delta) => received.push(delta),
      undefined,
      'preferred',
      undefined
    )

    dispatch(bundle, valueDelta(AIS_CONTEXT, SOG_PATH, AIS_SOG))
    dispatch(bundle, valueDelta(SELF_CONTEXT, SOG_PATH, SOG_SECOND))

    expect(received.map((d) => d.context)).to.deep.equal([SELF_CONTEXT])
  })

  // Returning Bacon.noMore from a subscriber ends the subscription. That works
  // through a filter/map chain and has to keep working through the inline sink,
  // which means the sink must return the callback's result.
  it('honours Bacon.noMore returned by the callback', () => {
    subscribe([{ path: SOG_PATH }], (delta: Delta) => {
      received.push(delta)
      return Bacon.noMore
    })

    dispatch(bundle, valueDelta(SELF_CONTEXT, SOG_PATH, SOG_SECOND))
    dispatch(bundle, valueDelta(SELF_CONTEXT, SOG_PATH, SOG_FIRST))

    expect(received).to.have.lengthOf(1)
  })

  it('replays cached deltas at subscribe time before live ones', () => {
    const cachedValue = 1.11
    subscribe([{ path: SOG_PATH }], undefined, [
      valueDelta(SELF_CONTEXT, SOG_PATH, cachedValue)
    ])

    const replayed = received.length
    dispatch(bundle, valueDelta(SELF_CONTEXT, SOG_PATH, SOG_SECOND))

    expect(replayed).to.equal(1)
    expect(pathsOf(received)).to.deep.equal([SOG_PATH, SOG_PATH])
  })

  it('stops delivering after the subscription is torn down', () => {
    subscribe([{ path: ALL_PATHS }])
    unsubscribes.forEach((unsubscribe) => unsubscribe())

    dispatch(bundle, valueDelta(SELF_CONTEXT, SOG_PATH, SOG_SECOND))

    expect(received).to.be.empty
  })

  // minPeriod and period rows still need real Bacon stages, so they must not
  // take the inline path.
  it('still debounces a row carrying minPeriod', (done) => {
    subscribe([{ path: SOG_PATH, minPeriod: 200 }])

    dispatch(bundle, valueDelta(SELF_CONTEXT, SOG_PATH, SOG_FIRST))
    dispatch(bundle, valueDelta(SELF_CONTEXT, SOG_PATH, SOG_SECOND))

    setTimeout(() => {
      expect(received).to.have.lengthOf(1)
      done()
    }, 50)
  })

  it('still buffers a row carrying period', (done) => {
    subscribe([{ path: SOG_PATH, period: 100 }])

    dispatch(bundle, valueDelta(SELF_CONTEXT, SOG_PATH, SOG_FIRST))
    dispatch(bundle, valueDelta(SELF_CONTEXT, SOG_PATH, SOG_SECOND))

    // nothing is emitted synchronously; the buffer flushes on the interval
    expect(received).to.be.empty
    setTimeout(() => {
      expect(received).to.have.lengthOf(1)
      done()
    }, 200)
  })
})
