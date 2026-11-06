import {
  Context,
  Delta,
  Path,
  SourceRef,
  SubscriptionOptions,
  Timestamp,
  UnsubscribeMessage
} from '@signalk/server-api'
import { expect } from 'chai'
import { StreamBundle } from '../src/streambundle'
import SubscriptionManager from '../src/subscriptionmanager'

const SELF_ID = 'self-uuid'
const SELF_CONTEXT = `vessels.${SELF_ID}` as Context
const TIMESTAMP = '2026-01-01T00:00:00.000Z' as Timestamp
const SOURCE_REF = 'test.1' as SourceRef

const ALL_CONTEXTS = '*' as Context
const NAVIGATION_PATHS = 'navigation.*' as Path
const SOG_PATH = 'navigation.speedOverGround' as Path
const HEADING_PATH = 'navigation.headingTrue' as Path
const COG_PATH = 'navigation.courseOverGroundTrue' as Path

const VALUE = 1.5
const MIN_PERIOD = 10

function valueDelta(path: Path): Delta {
  return {
    context: SELF_CONTEXT,
    updates: [
      {
        $source: SOURCE_REF,
        timestamp: TIMESTAMP,
        values: [{ path, value: VALUE }]
      }
    ]
  }
}

function dispatch(bundle: StreamBundle, path: Path) {
  const delta = valueDelta(path)
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
    deltaCache: {
      getMatchingContexts: () => [],
      getCachedDeltasForContexts: () => cached
    },
    securityStrategy: {
      filterReadDelta: (_user: unknown, delta: Delta) => delta,
      shouldFilterDeltas: () => false
    },
    signalk: { root: {} }
  }
}

describe('SubscriptionManager unsubscribe', () => {
  let bundle: StreamBundle
  let manager: SubscriptionManager
  let received: Delta[]
  let unsubscribes: Array<() => void>

  const subscribe = (
    context: Context,
    rows: SubscriptionOptions[],
    sourcePolicy?: 'preferred' | 'all'
  ) =>
    manager.subscribe(
      { context, subscribe: rows },
      unsubscribes,
      () => undefined,
      (delta: Delta) => received.push(delta),
      undefined,
      sourcePolicy
    )

  const unsubscribe = (context: Context | '*', paths: Array<Path | '*'>) =>
    manager.unsubscribe(
      { context, unsubscribe: paths.map((path) => ({ path })) },
      unsubscribes
    )

  beforeEach(() => {
    bundle = new StreamBundle(SELF_ID)
    received = []
    unsubscribes = []
    // seed the paths so the initial pass over the bus map sees them
    dispatch(bundle, SOG_PATH)
    dispatch(bundle, HEADING_PATH)
    manager = new SubscriptionManager(mockApp(bundle))
  })

  it('ends only the unsubscribed path of a subscription', () => {
    subscribe(SELF_CONTEXT, [{ path: SOG_PATH }, { path: HEADING_PATH }])
    unsubscribe(SELF_CONTEXT, [SOG_PATH])

    dispatch(bundle, SOG_PATH)
    dispatch(bundle, HEADING_PATH)

    expect(pathsOf(received)).to.deep.equal([HEADING_PATH])
  })

  it('leaves a subscription made in another context alone', () => {
    subscribe(SELF_CONTEXT, [{ path: SOG_PATH }])
    unsubscribe(ALL_CONTEXTS, [SOG_PATH])

    dispatch(bundle, SOG_PATH)

    expect(pathsOf(received)).to.deep.equal([SOG_PATH])
  })

  it('does not carve a literal path out of a wildcard subscription', () => {
    subscribe(SELF_CONTEXT, [{ path: NAVIGATION_PATHS }])
    unsubscribe(SELF_CONTEXT, [SOG_PATH])

    dispatch(bundle, SOG_PATH)

    expect(pathsOf(received)).to.deep.equal([SOG_PATH])
  })

  it('keeps an ended wildcard subscription off paths that appear later', () => {
    subscribe(SELF_CONTEXT, [{ path: NAVIGATION_PATHS }])
    unsubscribe(SELF_CONTEXT, [NAVIGATION_PATHS])

    dispatch(bundle, COG_PATH)
    dispatch(bundle, COG_PATH)

    expect(received).to.be.empty
  })

  it('still attaches the remaining rows to paths that appear later', () => {
    subscribe(SELF_CONTEXT, [{ path: SOG_PATH }, { path: NAVIGATION_PATHS }])
    unsubscribe(SELF_CONTEXT, [SOG_PATH])

    dispatch(bundle, COG_PATH)

    expect(pathsOf(received)).to.deep.equal([COG_PATH])
  })

  it('delivers once to a path subscribed again after unsubscribing', () => {
    subscribe(SELF_CONTEXT, [{ path: SOG_PATH }])
    unsubscribe(SELF_CONTEXT, [SOG_PATH])
    subscribe(SELF_CONTEXT, [{ path: SOG_PATH }])

    dispatch(bundle, SOG_PATH)

    expect(pathsOf(received)).to.deep.equal([SOG_PATH])
  })

  it('ends only the row whose criteria the unsubscribe echoes', () => {
    subscribe(SELF_CONTEXT, [{ path: SOG_PATH }])
    subscribe(SELF_CONTEXT, [{ path: SOG_PATH, minPeriod: MIN_PERIOD }])
    manager.unsubscribe(
      {
        context: SELF_CONTEXT,
        unsubscribe: [{ path: SOG_PATH, minPeriod: MIN_PERIOD }]
      },
      unsubscribes
    )

    dispatch(bundle, SOG_PATH)

    expect(pathsOf(received)).to.deep.equal([SOG_PATH])
  })

  it('leaves a row with criteria the unsubscribe does not echo', () => {
    subscribe(SELF_CONTEXT, [{ path: SOG_PATH, minPeriod: MIN_PERIOD }])
    unsubscribe(SELF_CONTEXT, [SOG_PATH])

    dispatch(bundle, SOG_PATH)

    expect(pathsOf(received)).to.deep.equal([SOG_PATH])
  })

  it('tells rows apart by their sourcePolicy', () => {
    subscribe(SELF_CONTEXT, [{ path: SOG_PATH }], 'all')
    unsubscribe(SELF_CONTEXT, [SOG_PATH])
    dispatch(bundle, SOG_PATH)

    manager.unsubscribe(
      { context: SELF_CONTEXT, unsubscribe: [{ path: SOG_PATH }] },
      unsubscribes,
      'all'
    )
    dispatch(bundle, SOG_PATH)

    expect(pathsOf(received)).to.deep.equal([SOG_PATH])
  })

  it('ends a subscription torn down from its own cache replay', () => {
    manager = new SubscriptionManager(mockApp(bundle, [valueDelta(SOG_PATH)]))
    manager.subscribe(
      { context: SELF_CONTEXT, subscribe: [{ path: NAVIGATION_PATHS }] },
      unsubscribes,
      () => undefined,
      (delta: Delta) => {
        received.push(delta)
        unsubscribes.forEach((teardown) => teardown())
        unsubscribes.length = 0
      }
    )
    const replayed = received.length

    dispatch(bundle, SOG_PATH)
    dispatch(bundle, HEADING_PATH)
    dispatch(bundle, COG_PATH)

    expect(replayed).to.be.greaterThan(0)
    expect(received).to.have.lengthOf(replayed)
    expect(unsubscribes).to.be.empty
  })

  it('attaches a path that first appears during the replay once', () => {
    manager = new SubscriptionManager(mockApp(bundle, [valueDelta(SOG_PATH)]))
    let publishing = true
    manager.subscribe(
      {
        context: SELF_CONTEXT,
        subscribe: [{ path: SOG_PATH }, { path: NAVIGATION_PATHS }]
      },
      unsubscribes,
      () => undefined,
      (delta: Delta) => {
        if (publishing) {
          publishing = false
          dispatch(bundle, COG_PATH)
        }
        received.push(delta)
      }
    )
    received = []

    dispatch(bundle, COG_PATH)

    expect(pathsOf(received)).to.deep.equal([COG_PATH])
  })

  it('reports and skips a row whose path is no string', () => {
    const errors: unknown[] = []
    manager.subscribe(
      {
        context: SELF_CONTEXT,
        subscribe: [
          { path: 5 as unknown as Path },
          { path: null as unknown as Path },
          { path: SOG_PATH }
        ]
      },
      unsubscribes,
      (error) => errors.push(error),
      (delta: Delta) => received.push(delta)
    )
    subscribe(SELF_CONTEXT, [{ path: NAVIGATION_PATHS }])

    dispatch(bundle, SOG_PATH)
    dispatch(bundle, COG_PATH)

    expect(errors).to.have.lengthOf(2)
    expect(pathsOf(received)).to.deep.equal([SOG_PATH, SOG_PATH, COG_PATH])
  })

  it('matches a period given as a string', () => {
    subscribe(SELF_CONTEXT, [{ path: SOG_PATH, minPeriod: MIN_PERIOD }])
    manager.unsubscribe(
      {
        context: SELF_CONTEXT,
        unsubscribe: [
          { path: SOG_PATH, minPeriod: String(MIN_PERIOD) as unknown as number }
        ]
      },
      unsubscribes
    )

    dispatch(bundle, SOG_PATH)

    expect(received).to.be.empty
  })

  it('matches excludeSources in any order and repetition', () => {
    const excludes = ['a.1', 'b.2', 'a.1'] as SourceRef[]
    manager.subscribe(
      { context: SELF_CONTEXT, subscribe: [{ path: SOG_PATH }] },
      unsubscribes,
      () => undefined,
      (delta: Delta) => received.push(delta),
      undefined,
      'preferred',
      excludes
    )
    manager.unsubscribe(
      { context: SELF_CONTEXT, unsubscribe: [{ path: SOG_PATH }] },
      unsubscribes,
      'preferred',
      ['b.2', 'a.1'] as SourceRef[]
    )

    dispatch(bundle, SOG_PATH)

    expect(received).to.be.empty
  })

  it('keeps a row with a non-finite minPeriod apart from one without', () => {
    subscribe(SELF_CONTEXT, [{ path: SOG_PATH }])
    subscribe(SELF_CONTEXT, [
      { path: SOG_PATH, minPeriod: 'Infinity' as unknown as number }
    ])
    unsubscribe(SELF_CONTEXT, [SOG_PATH])

    dispatch(bundle, SOG_PATH)

    expect(pathsOf(received)).to.deep.equal([SOG_PATH])
  })

  it('releases the new-path listener once every row has ended', () => {
    let listening = 0
    const onValue = bundle.keys.onValue.bind(bundle.keys)
    bundle.keys.onValue = (listener: (path: Path) => void) => {
      listening++
      const stop = onValue(listener)
      return () => {
        listening--
        stop()
      }
    }
    const before = listening
    subscribe(SELF_CONTEXT, [{ path: SOG_PATH }, { path: HEADING_PATH }])
    unsubscribe(SELF_CONTEXT, [SOG_PATH])
    const afterOne = listening
    unsubscribe(SELF_CONTEXT, [HEADING_PATH])

    expect(afterOne).to.equal(before + 1)
    expect(listening).to.equal(before)
  })

  it('ignores an unsubscribe that matches no subscription', () => {
    subscribe(SELF_CONTEXT, [{ path: SOG_PATH }])
    unsubscribe(SELF_CONTEXT, [HEADING_PATH])

    dispatch(bundle, SOG_PATH)

    expect(pathsOf(received)).to.deep.equal([SOG_PATH])
  })

  it('leaves nothing behind once every row of a subscription has ended', () => {
    subscribe(SELF_CONTEXT, [{ path: SOG_PATH }, { path: HEADING_PATH }])
    unsubscribe(SELF_CONTEXT, [SOG_PATH, HEADING_PATH])

    expect(unsubscribes).to.be.empty
  })

  it('still ends every subscription on unsubscribe all', () => {
    subscribe(SELF_CONTEXT, [{ path: SOG_PATH }])
    subscribe(ALL_CONTEXTS, [{ path: HEADING_PATH }])
    unsubscribe(ALL_CONTEXTS, ['*'])

    dispatch(bundle, SOG_PATH)
    dispatch(bundle, HEADING_PATH)

    expect(received).to.be.empty
    expect(unsubscribes).to.be.empty
  })

  it('ends every row when the caller runs its unsubscribes itself', () => {
    subscribe(SELF_CONTEXT, [{ path: SOG_PATH }, { path: NAVIGATION_PATHS }])
    unsubscribes.forEach((teardown) => teardown())

    dispatch(bundle, SOG_PATH)
    dispatch(bundle, COG_PATH)

    expect(received).to.be.empty
  })

  it('skips unsubscribe entries that carry no path', () => {
    subscribe(SELF_CONTEXT, [{ path: SOG_PATH }])
    const entries = [null, { path: SOG_PATH }]
    manager.unsubscribe(
      {
        context: SELF_CONTEXT,
        unsubscribe: entries as UnsubscribeMessage['unsubscribe']
      },
      unsubscribes
    )

    dispatch(bundle, SOG_PATH)

    expect(received).to.be.empty
  })

  it('rejects an unsubscribe without a list of paths', () => {
    const malformed = { context: SELF_CONTEXT } as UnsubscribeMessage

    expect(() => manager.unsubscribe(malformed, unsubscribes)).to.throw(
      /unsubscribe must be an array/
    )
  })
})
