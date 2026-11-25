import assert from 'node:assert/strict'
import { FullSignalK } from '@signalk/server-api'
import type {
  Context,
  Delta,
  Path,
  SourceRef,
  Timestamp
} from '@signalk/server-api'
import { StreamBundle } from '../src/streambundle'
import SubscriptionManager from '../src/subscriptionmanager'

describe('Radius subscription vessel lookups', () => {
  it('filters many vessels and missing or invalid positions', () => {
    const bundle = new StreamBundle('self-id')
    const vessels: Record<string, unknown> = {}
    const app = {
      selfContext: 'vessels.self-id',
      streambundle: bundle,
      signalk: { root: { vessels } },
      deltaCache: {
        getMatchingContexts: () => [],
        getCachedDeltasForContexts: () => []
      }
    }
    const received: Delta[] = [],
      unsubscribes: Array<() => void> = []
    new SubscriptionManager(app).subscribe(
      {
        context: { radius: 1000, position: { latitude: 50, longitude: 0 } },
        subscribe: [{ path: 'navigation.position' as Path }]
      },
      unsubscribes,
      (error) => {
        throw error
      },
      (delta) => received.push(delta)
    )
    const send = (id: string, position?: unknown) => {
      if (position !== undefined) vessels[id] = { navigation: { position } }
      bundle.pushDelta({
        context: `vessels.${id}` as Context,
        updates: [
          {
            values: [
              {
                path: 'navigation.position' as Path,
                value: { latitude: 50, longitude: 0 }
              }
            ]
          }
        ]
      })
    }
    try {
      for (let i = 0; i < 600; i++)
        send(`urn:mrn:imo:mmsi:${200000000 + i}`, {
          value: { latitude: 50, longitude: 0 }
        })
      assert.equal(received.length, 600)
      send('far', { value: { latitude: 51, longitude: 0 } })
      send('missing')
      send('null', { value: null })
      send('invalid', { value: { latitude: Infinity, longitude: 0 } })
      send('missing-coordinate', { value: { latitude: 50 } })
      assert.equal(received.length, 600)
    } finally {
      unsubscribes.forEach((unsubscribe) => unsubscribe())
    }
  })

  for (const context of [
    'vessels.boat',
    'vessels.boat.example',
    'vessels.group.boat.example'
  ]) {
    it(`uses the stored position for ${context}`, () => {
      const bundle = new StreamBundle('self-id')
      const signalk = new FullSignalK('self-id')
      const app = {
        selfContext: 'vessels.self-id',
        streambundle: bundle,
        signalk,
        deltaCache: {
          getMatchingContexts: () => [],
          getCachedDeltasForContexts: () => []
        }
      }
      const received: Delta[] = []
      const unsubscribes: Array<() => void> = []
      new SubscriptionManager(app).subscribe(
        {
          context: { radius: 1000, position: { latitude: 50, longitude: 0 } },
          subscribe: [{ path: 'navigation.position' as Path }]
        },
        unsubscribes,
        (error) => {
          throw error
        },
        (delta) => received.push(delta)
      )
      const send = (latitude: number) => {
        const delta: Delta = {
          context: context as Context,
          updates: [
            {
              $source: 'radius-test' as SourceRef,
              timestamp: new Date().toISOString() as Timestamp,
              values: [
                {
                  path: 'navigation.position' as Path,
                  value: { latitude, longitude: 0 }
                }
              ]
            }
          ]
        }
        signalk.addDelta(delta)
        bundle.pushDelta(delta)
      }
      try {
        send(50)
        assert.equal(received.length, 1)
        assert.equal(received[0].context, context)
        send(51)
        assert.equal(received.length, 1)
        send(50)
        assert.equal(received.length, 2)
      } finally {
        unsubscribes.forEach((unsubscribe) => unsubscribe())
      }
    })
  }
})
