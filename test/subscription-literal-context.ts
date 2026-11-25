import assert from 'node:assert/strict'
import { mock } from 'node:test'
import type {
  Context,
  Delta,
  Path,
  SourceRef,
  Timestamp,
  SubscribeMessage
} from '@signalk/server-api'
import type { ContextMatcher, SignalKServer } from '../src/types'
import { StreamBundle } from '../src/streambundle'
import DeltaCache from '../src/deltacache'
import SubscriptionManager from '../src/subscriptionmanager'

describe('Literal-context subscription bootstrap', () => {
  let bundle: StreamBundle
  let cache: DeltaCache
  let manager: SubscriptionManager
  let comparisons: number
  let unsubscribes: Array<() => void>
  const selfContext = 'vessels.self-id' as Context
  const skPath = 'navigation.speedOverGround' as Path

  const dispatch = (context: Context, value: number) => {
    const delta: Delta = {
      context,
      updates: [
        {
          $source: 'test' as SourceRef,
          timestamp: new Date().toISOString() as Timestamp,
          values: [{ path: skPath, value }]
        }
      ]
    }
    cache.ingestDelta(delta)
    bundle.pushDelta(delta)
  }
  const subscribe = (context: SubscribeMessage['context']) => {
    const received: Delta[] = []
    manager.subscribe(
      { context, subscribe: [{ path: skPath }] },
      unsubscribes,
      (error) => {
        throw error
      },
      (delta) => received.push(delta)
    )
    return received
  }

  beforeEach(() => {
    bundle = new StreamBundle('self-id')
    const app = {
      selfContext,
      streambundle: bundle,
      config: {},
      signalk: { root: {} },
      securityStrategy: { filterReadDelta: () => true },
      emit: () => undefined
    }
    mock.timers.enable({ apis: ['setInterval'] })
    try {
      cache = new DeltaCache(app as unknown as SignalKServer, bundle)
    } finally {
      mock.timers.reset()
    }
    manager = new SubscriptionManager({ ...app, deltaCache: cache })
    const original = cache.getMatchingContexts.bind(cache)
    cache.getMatchingContexts = (filter: ContextMatcher) =>
      original(
        Object.assign((delta: Parameters<ContextMatcher>[0]) => {
          comparisons++
          return filter(delta)
        }, filter)
      )
    unsubscribes = []
    for (let i = 0; i < 1000; i++) dispatch(`vessels.target-${i}` as Context, i)
    dispatch(selfContext, 123)
    comparisons = 0
  })
  afterEach(() => unsubscribes.forEach((unsubscribe) => unsubscribe()))

  it('finds a literal target without comparing unrelated cached vessels', () => {
    const received = subscribe('vessels.target-999' as Context)
    assert.deepEqual(
      received.map((d) => d.context),
      ['vessels.target-999']
    )
    assert.equal(comparisons, 0)
    dispatch('vessels.target-1' as Context, 5)
    dispatch('vessels.target-999' as Context, 6)
    assert.equal(received.length, 2)
  })
  it('returns no cached data for missing and prototype-named targets', () => {
    for (const context of [
      'vessels.absent',
      'vessels.constructor',
      '__proto__.target'
    ])
      assert.equal(subscribe(context as Context).length, 0)
  })
  it('still handles wildcard, self and unconstrained subscriptions', () => {
    assert.equal(subscribe('vessels.target-99*' as Context).length, 11)
    assert.deepEqual(
      subscribe('self' as Context).map((d) => d.context),
      [selfContext]
    )
    assert.deepEqual(
      subscribe('vessels.self' as Context).map((d) => d.context),
      [selfContext]
    )
    assert.equal(subscribe('*' as Context).length, 1001)
  })
  it('finds a target added after a subscription was created', () => {
    const received = subscribe('vessels.new-target' as Context)
    assert.equal(received.length, 0)
    dispatch('vessels.new-target' as Context, 1)
    assert.equal(received.length, 1)
    assert.equal(subscribe('vessels.new-target' as Context).length, 1)
  })
})
