import { expect } from 'chai'
import { mockModule, resetModuleCache, spy, type Spy } from './helpers'
import type {
  CourseData,
  SKPaths
} from '../../packages/course-provider-plugin/src/types'

type DeltaCallback = (delta: unknown) => void
type CalcsSpy = Spy<(src: SKPaths) => CourseData>

interface Started {
  stop: () => void
  deltaCallback: DeltaCallback
  calcsSpy: CalcsSpy
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  server: any
}

// Per-test mock-restore latch. Set by startPlugin(), torn down in
// afterEach so a failed assertion cannot leak the
// `src/lib/course` stub into a later test file.
let restoreCourse: (() => void) | null = null

afterEach(() => {
  if (restoreCourse) {
    restoreCourse()
    restoreCourse = null
  }
})

// Stub `calcs`/`parseSKPaths` so the dispatcher can run without spinning
// up the real geodesy maths. The calcs spy doubles as our test-visible
// snapshot of `srcPaths` at the moment calc() ran (its first argument).
function startPlugin(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  getResourceImpl: (...args: any[]) => Promise<any>
): Started {
  const calcsSpy = spy<(src: SKPaths) => CourseData>(() => ({
    gc: {},
    rl: {},
    passedPerpendicular: false
  }))
  restoreCourse = mockModule(
    '../../packages/course-provider-plugin/src/lib/course',
    {
      calcs: calcsSpy,
      parseSKPaths: () => true,
      emptyCourseData: () => ({ gc: {}, rl: {}, passedPerpendicular: false }),
      resetCaches: () => {}
    }
  )
  resetModuleCache('../../packages/course-provider-plugin/src/index')

  const factory =
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('../../packages/course-provider-plugin/src/index') as (
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      server: any
    ) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      start: (options: any) => void
      stop: () => void
    }

  let deltaCallback: DeltaCallback | null = null

  const server = {
    debug: spy(),
    error: spy(),
    setPluginStatus: spy(),
    setPluginError: spy(),
    handleMessage: spy(),
    getSelfPath: spy(() => null),
    getCourse: spy(() => Promise.resolve(null)),
    get: spy(),
    subscriptionmanager: {
      subscribe: spy(
        (
          _sub: unknown,
          unsubscribes: Array<() => void>,
          _err: unknown,
          cb: DeltaCallback
        ) => {
          deltaCallback = cb
          unsubscribes.push(() => {})
        }
      )
    },
    resourcesApi: { getResource: spy(getResourceImpl) }
  }

  const plugin = factory(server)
  plugin.start({
    notifications: { sound: false },
    calculations: { method: 'GreatCircle' }
  })

  if (!deltaCallback) throw new Error('subscribe was not called')

  return {
    stop: () => plugin.stop(),
    deltaCallback: deltaCallback as DeltaCallback,
    calcsSpy,
    server
  }
}

// Drive a navigation.position through the dispatcher so calc() runs and
// the calcs spy captures the current srcPaths. Returns that snapshot.

async function snapshotSrcPaths(
  deltaCallback: DeltaCallback,
  calcsSpy: CalcsSpy
): Promise<
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Record<string, any>
> {
  const before = calcsSpy.calls.length
  deltaCallback({
    updates: [
      {
        values: [
          {
            path: 'navigation.position',
            value: { latitude: 0, longitude: 0 }
          }
        ]
      }
    ]
  })
  // Give any pending microtasks (from handleActiveRoute awaits) a chance to settle.
  await new Promise((r) => setTimeout(r, 0))
  const after = calcsSpy.calls.length
  expect(after).to.be.greaterThan(before)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return calcsSpy.calls[after - 1]![0] as Record<string, any>
}

describe('navigation.course.activeRoute dispatch', () => {
  // Pins the post-handleActiveRoute storage shape so a refactor that drops
  // the `{ ...v.value }` spread still produces an entry containing href and
  // waypoints fetched from resourcesApi.
  it('stores activeRoute with waypoints fetched from resourcesApi', async () => {
    const waypoints = [
      [10, 20],
      [11, 21],
      [12, 22]
    ]
    const { deltaCallback, calcsSpy, server, stop } = startPlugin(async () => ({
      feature: { geometry: { coordinates: waypoints } }
    }))

    const routeValue = {
      href: '/resources/routes/abc123',
      name: 'Test Route'
    }

    deltaCallback({
      updates: [
        {
          values: [{ path: 'navigation.course.activeRoute', value: routeValue }]
        }
      ]
    })

    // Wait for the async getResource in handleActiveRoute to settle.
    await new Promise((r) => setTimeout(r, 0))

    // Now drive a position update so calcs() captures srcPaths.
    const snapshot = await snapshotSrcPaths(deltaCallback, calcsSpy)

    expect(server.resourcesApi.getResource.calledWith('routes', 'abc123')).to.be
      .true
    expect(snapshot.activeRoute).to.exist
    expect(snapshot.activeRoute.href).to.equal('/resources/routes/abc123')
    expect(snapshot.activeRoute.waypoints).to.deep.equal(waypoints)
    // Important: stored object is a fresh copy, not the original delta value,
    // so the plugin owns its own state and cannot bleed back into upstream.
    expect(snapshot.activeRoute).to.not.equal(routeValue)

    stop()
  })

  it('clears activeRoute when delta value is null', async () => {
    const { deltaCallback, calcsSpy, stop } = startPlugin(async () => null)

    deltaCallback({
      updates: [
        {
          values: [{ path: 'navigation.course.activeRoute', value: null }]
        }
      ]
    })
    await new Promise((r) => setTimeout(r, 0))

    const snapshot = await snapshotSrcPaths(deltaCallback, calcsSpy)
    expect(snapshot.activeRoute).to.be.null
    stop()
  })

  // Regression: out-of-order resolution of getWaypoints() between two
  // route-activation events must not overwrite the newer route with the
  // older one's late result.
  it('drops a stale getWaypoints result when a newer route fetch has started', async () => {
    const waypointsA = [
      [10, 20],
      [11, 21]
    ]
    const waypointsB = [
      [30, 40],
      [31, 41],
      [32, 42]
    ]
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let resolveA: (value: any) => void = () => {}
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const aPromise = new Promise<any>((r) => {
      resolveA = r
    })
    const { deltaCallback, calcsSpy, stop } = startPlugin(
      async (_resType: string, id: string) => {
        if (id === 'route-a') return aPromise
        if (id === 'route-b') {
          return { feature: { geometry: { coordinates: waypointsB } } }
        }
        return null
      }
    )

    // Activate route A — the fetch is pending until we explicitly resolve it.
    deltaCallback({
      updates: [
        {
          values: [
            {
              path: 'navigation.course.activeRoute',
              value: { href: '/resources/routes/route-a', name: 'A' }
            }
          ]
        }
      ]
    })
    // Activate route B before A's fetch resolves; B's fetch resolves promptly.
    deltaCallback({
      updates: [
        {
          values: [
            {
              path: 'navigation.course.activeRoute',
              value: { href: '/resources/routes/route-b', name: 'B' }
            }
          ]
        }
      ]
    })
    // Let B's microtasks settle so its result lands first.
    await new Promise((r) => setTimeout(r, 0))

    // Now A finally resolves — its result must NOT overwrite B.
    resolveA({ feature: { geometry: { coordinates: waypointsA } } })
    await new Promise((r) => setTimeout(r, 0))

    const snapshot = await snapshotSrcPaths(deltaCallback, calcsSpy)
    expect(snapshot.activeRoute.href).to.equal('/resources/routes/route-b')
    expect(snapshot.activeRoute.waypoints).to.deep.equal(waypointsB)
    stop()
  })

  // Regression: switching from one route to another must replace the stored
  // activeRoute, not silently retain the first one.
  it('replaces stored activeRoute when a different route becomes active', async () => {
    const waypointsA = [
      [10, 20],
      [11, 21]
    ]
    const waypointsB = [
      [30, 40],
      [31, 41],
      [32, 42]
    ]
    const { deltaCallback, calcsSpy, server, stop } = startPlugin(
      async (_resType: string, id: string) => {
        if (id === 'route-a') {
          return { feature: { geometry: { coordinates: waypointsA } } }
        }
        if (id === 'route-b') {
          return { feature: { geometry: { coordinates: waypointsB } } }
        }
        return null
      }
    )

    deltaCallback({
      updates: [
        {
          values: [
            {
              path: 'navigation.course.activeRoute',
              value: { href: '/resources/routes/route-a', name: 'A' }
            }
          ]
        }
      ]
    })
    await new Promise((r) => setTimeout(r, 0))
    const afterA = await snapshotSrcPaths(deltaCallback, calcsSpy)
    expect(afterA.activeRoute.href).to.equal('/resources/routes/route-a')
    expect(afterA.activeRoute.waypoints).to.deep.equal(waypointsA)

    // Switch to route B. Without the fix, srcPaths.activeRoute remains A.
    deltaCallback({
      updates: [
        {
          values: [
            {
              path: 'navigation.course.activeRoute',
              value: { href: '/resources/routes/route-b', name: 'B' }
            }
          ]
        }
      ]
    })
    await new Promise((r) => setTimeout(r, 0))
    const afterB = await snapshotSrcPaths(deltaCallback, calcsSpy)

    expect(afterB.activeRoute.href).to.equal('/resources/routes/route-b')
    expect(afterB.activeRoute.name).to.equal('B')
    expect(afterB.activeRoute.waypoints).to.deep.equal(waypointsB)
    expect(server.resourcesApi.getResource.calledWith('routes', 'route-b')).to
      .be.true
    stop()
  })
})
