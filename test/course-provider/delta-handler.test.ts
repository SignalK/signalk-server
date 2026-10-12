import { expect } from 'chai'
import { mockModule, resetModuleCache, spy, type Spy } from './helpers'
import type {
  CourseData,
  SKPaths
} from '../../packages/course-provider-plugin/src/types'

type DeltaCallback = (delta: unknown) => void
type CalcsSpy = Spy<(src: SKPaths) => CourseData>

// Per-test mock-restore latch. Set by startPluginCapturingDelta(),
// torn down in afterEach so a failed assertion cannot leak the
// `src/lib/course` stub into a later test file.
let restoreCourse: (() => void) | null = null

afterEach(() => {
  if (restoreCourse) {
    restoreCourse()
    restoreCourse = null
  }
})

interface StartOptions {
  /**
   * Custom parseSKPaths implementation (defaults to always-true so calc()
   * always reaches the calcs branch). Tests of the activeDest flip pass
   * a programmable returner.
   */
  parseSKPaths?: (src: SKPaths) => boolean
  /**
   * Custom calcs return value. Defaults to an empty CourseData; tests
   * that assert on the published delta payload pass a non-trivial
   * fixture.
   */
  calcsReturn?: CourseData
  /**
   * Custom calcs implementation. Overrides calcsReturn; used by the
   * fault-isolation test to make calcs() throw on demand.
   */
  calcsImpl?: (src: SKPaths) => CourseData
  /**
   * The plugin config passed to start(). Defaults to a saved config;
   * `{}` is what a server passes before the settings were ever saved.
   */
  startArgs?: Record<string, unknown>
}

// Stub `calcs`/`parseSKPaths` so the dispatcher can run inline without
// the real geodesy. The calcs spy doubles as our test-visible snapshot
// of `srcPaths` at the moment calc() ran (its first argument).
function startPluginCapturingDelta(opts: StartOptions = {}): {
  stop: () => void
  restart: () => DeltaCallback
  deltaCallback: DeltaCallback
  calcsSpy: CalcsSpy
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  server: any
} {
  const fixed: CourseData = opts.calcsReturn ?? {
    gc: {},
    rl: {},
    passedPerpendicular: false
  }
  const calcsSpy = spy<(src: SKPaths) => CourseData>(
    opts.calcsImpl ?? (() => fixed)
  )
  restoreCourse = mockModule(
    '../../packages/course-provider-plugin/src/course',
    {
      calcs: calcsSpy,
      parseSKPaths: opts.parseSKPaths ?? (() => true),
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

  let capturedDeltaCallback: DeltaCallback | null = null

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
          deltaCb: DeltaCallback
        ) => {
          capturedDeltaCallback = deltaCb
          unsubscribes.push(() => {})
        }
      )
    },
    resourcesApi: {
      getResource: spy(() => Promise.resolve(null))
    }
  }

  const startArgs = opts.startArgs ?? {
    notifications: { sound: false },
    calculations: { method: 'GreatCircle' }
  }
  const plugin = factory(server)
  plugin.start(startArgs)

  if (!capturedDeltaCallback) {
    throw new Error('subscriptionmanager.subscribe was not called')
  }

  return {
    stop: () => plugin.stop(),
    // Stop and re-start the SAME plugin closure, returning the delta
    // callback captured by the fresh subscription. Used to assert that
    // doStartup resets the in-process latches (metaSent/activeDest).
    restart: () => {
      plugin.stop()
      plugin.start(startArgs)
      return capturedDeltaCallback as DeltaCallback
    },
    deltaCallback: capturedDeltaCallback as DeltaCallback,
    calcsSpy,
    server
  }
}

function positionDelta(lat: number, lon: number) {
  return {
    updates: [
      {
        values: [
          {
            path: 'navigation.position',
            value: { latitude: lat, longitude: lon }
          }
        ]
      }
    ]
  }
}

describe('delta handler dispatch', () => {
  // Positive path: a navigation.position delta triggers calc().
  it('forwards navigation.position value and triggers calc', () => {
    const { deltaCallback, calcsSpy, stop } = startPluginCapturingDelta()

    deltaCallback({
      updates: [
        {
          values: [
            {
              path: 'navigation.position',
              value: { latitude: 10, longitude: 20 }
            }
          ]
        }
      ]
    })

    expect(calcsSpy.calls.length).to.equal(1)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const src = calcsSpy.calls[0]![0] as Record<string, any>
    expect(src['navigation.position']).to.deep.equal({
      latitude: 10,
      longitude: 20
    })

    stop()
  })

  // Non-position paths should be stored but not trigger a calc.
  it('stores non-position paths without triggering calc', () => {
    const { deltaCallback, calcsSpy, stop } = startPluginCapturingDelta()

    deltaCallback({
      updates: [
        {
          values: [
            { path: 'navigation.speedOverGround', value: 5.5 },
            { path: 'navigation.magneticVariation', value: 0.1 }
          ]
        }
      ]
    })

    expect(calcsSpy.calls.length).to.equal(0)
    stop()
  })

  // resources.routes.<id> paths must dispatch to the route update handler,
  // not fall through to srcPaths.
  it('dispatches resources.routes.* paths to handleRouteUpdate', async () => {
    const { deltaCallback, server, stop } = startPluginCapturingDelta()

    deltaCallback({
      updates: [
        {
          values: [
            {
              path: 'resources.routes.abc123',
              value: { feature: { geometry: { coordinates: [] } } }
            }
          ]
        }
      ]
    })

    // handleRouteUpdate is async; wait a tick.
    await Promise.resolve()
    // It ultimately calls resourcesApi.getResource only if activeRouteId
    // matches. Here activeRouteId is unset, so nothing is fetched, but the
    // important thing is the dispatch did not store under srcPaths and did
    // not crash.
    expect(server.resourcesApi.getResource.called).to.equal(false)
    stop()
  })

  // Mixed batch: one update, multiple values of different kinds.
  it('handles a batch with multiple value kinds in one update', () => {
    const { deltaCallback, calcsSpy, stop } = startPluginCapturingDelta()

    deltaCallback({
      updates: [
        {
          values: [
            { path: 'navigation.speedOverGround', value: 4.2 },
            {
              path: 'navigation.position',
              value: { latitude: 1, longitude: 2 }
            },
            { path: 'navigation.headingTrue', value: 1.57 }
          ]
        }
      ]
    })

    // Exactly one calc: the one triggered by navigation.position.
    expect(calcsSpy.calls.length).to.equal(1)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const src = calcsSpy.calls[0]![0] as Record<string, any>
    // All three values should be present in srcPaths by the time calc() runs.
    expect(src['navigation.speedOverGround']).to.equal(4.2)
    expect(src['navigation.position']).to.deep.equal({
      latitude: 1,
      longitude: 2
    })
    expect(src['navigation.headingTrue']).to.equal(1.57)
    stop()
  })

  // Defensive: deltas with no updates or no values should not crash.
  it('tolerates delta with no updates', () => {
    const { deltaCallback, calcsSpy, stop } = startPluginCapturingDelta()
    deltaCallback({})
    expect(calcsSpy.calls.length).to.equal(0)
    stop()
  })

  it('tolerates update with no values', () => {
    const { deltaCallback, calcsSpy, stop } = startPluginCapturingDelta()
    deltaCallback({ updates: [{}] })
    expect(calcsSpy.calls.length).to.equal(0)
    stop()
  })

  // Boundary: multiple updates in a single delta.
  it('processes multiple updates in a single delta', () => {
    const { deltaCallback, calcsSpy, stop } = startPluginCapturingDelta()

    deltaCallback({
      updates: [
        {
          values: [{ path: 'navigation.speedOverGround', value: 3.1 }]
        },
        {
          values: [
            {
              path: 'navigation.position',
              value: { latitude: 5, longitude: 6 }
            }
          ]
        }
      ]
    })

    expect(calcsSpy.calls.length).to.equal(1)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const src = calcsSpy.calls[0]![0] as Record<string, any>
    expect(src['navigation.speedOverGround']).to.equal(3.1)
    expect(src['navigation.position']).to.deep.equal({
      latitude: 5,
      longitude: 6
    })
    stop()
  })

  // Skip the calc entirely when navigation.position is missing — the
  // dispatcher's first guard. Without this, parseSKPaths would receive
  // a srcPaths with no position and cascade into the wrong branch.
  it('skips calc when navigation.position is missing', () => {
    const { deltaCallback, calcsSpy, server, stop } =
      startPluginCapturingDelta()

    deltaCallback({
      updates: [
        {
          values: [{ path: 'navigation.speedOverGround', value: 5 }]
        }
      ]
    })

    expect(calcsSpy.calls.length).to.equal(0)
    expect(server.handleMessage.called).to.equal(false)
    stop()
  })
})

// Pins the activeDest flip — the cleared-state delta has to fire
// exactly once when the navigation context becomes incomplete after
// being complete, then stay silent until it becomes complete again.
describe('activeDest flip', () => {
  it('emits one calc, one cleared-state delta, then stays silent on idle ticks', () => {
    let parseResult = true
    const calcsReturn: CourseData = {
      gc: { calcMethod: 'GreatCircle', distance: 1234 },
      rl: { calcMethod: 'Rhumbline', distance: 1235 },
      passedPerpendicular: false
    }
    const { deltaCallback, calcsSpy, server, stop } = startPluginCapturingDelta(
      {
        parseSKPaths: () => parseResult,
        calcsReturn
      }
    )

    // Tick 1: complete context → calcs runs and a calcValues delta fires.
    deltaCallback(positionDelta(50, 8))
    expect(calcsSpy.calls.length).to.equal(1)
    // Two handleMessage calls expected on the very first complete tick:
    // the calcValues delta and the once-only meta delta.
    expect(server.handleMessage.calls.length).to.equal(2)

    // Tick 2: context becomes incomplete → exactly one cleared-state
    // calcValues delta is emitted from the activeDest=true path. No
    // further calcs() invocation.
    parseResult = false
    deltaCallback(positionDelta(50, 8))
    expect(calcsSpy.calls.length).to.equal(1)
    expect(server.handleMessage.calls.length).to.equal(3)

    // The cleared-state delta must carry CLEARED values (empty gc/rl), not
    // the populated calc from tick 1. A bug that re-published the stale
    // result would keep the same handleMessage count, so assert the payload:
    // calcValues.distance must be null, not tick 1's 1234.
    const clearedDelta = server.handleMessage.calls[2]![1] as {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      updates: Array<{ values: Array<{ path: string; value: any }> }>
    }
    const clearedDistance = clearedDelta.updates[0]!.values.find(
      (v) => v.path === 'navigation.course.calcValues.distance'
    )
    expect(clearedDistance, 'cleared delta should include a distance entry').to
      .exist
    expect(clearedDistance!.value).to.equal(null)

    // Tick 3: still incomplete and activeDest is now false → idle. No
    // new handleMessage call.
    deltaCallback(positionDelta(50, 8))
    expect(calcsSpy.calls.length).to.equal(1)
    expect(server.handleMessage.calls.length).to.equal(3)

    // Tick 4: context complete again → fresh calcs run and one more
    // calcValues delta. Meta delta is NOT re-emitted (latch).
    parseResult = true
    deltaCallback(positionDelta(50, 8))
    expect(calcsSpy.calls.length).to.equal(2)
    expect(server.handleMessage.calls.length).to.equal(4)

    stop()
  })

  it('publishes the buildDeltaMsg payload from the configured method on each calc', () => {
    const calcsReturn: CourseData = {
      gc: { calcMethod: 'GreatCircle', distance: 9999 },
      rl: {},
      passedPerpendicular: false
    }
    const { deltaCallback, server, stop } = startPluginCapturingDelta({
      calcsReturn
    })

    deltaCallback(positionDelta(50, 8))

    // The calcValues delta is the first handleMessage call; the meta
    // delta is the second. Both go through SKVersion.v2.
    const firstCall = server.handleMessage.calls[0]
    expect(firstCall).to.exist
    const [, payload, version] = firstCall!
    // SKVersion.v2 is exported as the string 'v2' from server-api.
    expect(version).to.equal('v2')
    const distanceEntry = (
      payload as {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        updates: Array<{ values: Array<{ path: string; value: any }> }>
      }
    ).updates[0]!.values.find(
      (v) => v.path === 'navigation.course.calcValues.distance'
    )
    expect(distanceEntry).to.exist
    expect(distanceEntry!.value).to.equal(9999)

    stop()
  })
})

// A malformed delta value (e.g. a non-numeric coordinate arriving on the
// bus) makes the inline geodesy throw. calc() must contain it so the bad
// tick is logged and the stream recovers, instead of the throw escaping
// into the subscription dispatch.
describe('calc() fault isolation', () => {
  it('contains a calcs() throw, logs it, and recovers on the next good tick', () => {
    let throwNext = true
    const calcsImpl = (): CourseData => {
      if (throwNext) {
        throw new TypeError("invalid lat 'not-a-number'")
      }
      return {
        gc: { calcMethod: 'GreatCircle', distance: 500 },
        rl: {},
        passedPerpendicular: false
      }
    }
    const { deltaCallback, server, stop } = startPluginCapturingDelta({
      calcsImpl
    })

    // Bad tick: calcs() throws. The delta callback must not propagate it.
    expect(() => deltaCallback(positionDelta(NaN, 8))).to.not.throw()
    expect(server.error.called).to.equal(true)
    // No calcValues delta is published for the failed tick.
    expect(server.handleMessage.called).to.equal(false)

    // Recovery: the next good tick computes and publishes as normal.
    throwNext = false
    deltaCallback(positionDelta(50, 8))
    expect(server.handleMessage.called).to.equal(true)

    stop()
  })
})

// The metaSent/activeDest latches live in the plugin closure, so doStartup
// must reset them — otherwise a stop/start cycle within the same server
// process inherits the previous run's state and the meta delta never
// re-fires. Deleting the reset would leave the rest of the suite green, so
// this pins it explicitly.
describe('doStartup latch reset', () => {
  it('re-emits the meta delta after a stop/start cycle', () => {
    const { deltaCallback, restart, server, stop } = startPluginCapturingDelta()

    // First run, one complete tick: calcValues delta + the once-only meta.
    deltaCallback(positionDelta(50, 8))
    expect(server.handleMessage.calls.length).to.equal(2)

    // Restart the same closure, then drive another complete tick. The meta
    // delta must fire again (+2, not +1) — proving metaSent was reset.
    const deltaCallback2 = restart()
    deltaCallback2(positionDelta(50, 8))
    expect(server.handleMessage.calls.length).to.equal(4)

    stop()
  })
})

describe('notification settings', () => {
  const ARRIVAL = 'notifications.navigation.course.arrivalCircleEntered'
  const PERPENDICULAR = 'notifications.navigation.course.perpendicularPassed'

  // Arrive 20 m from the next point, inside a 50 m arrival circle, past its
  // perpendicular.
  const arrive = (startArgs: Record<string, unknown>) => {
    const started = startPluginCapturingDelta({
      startArgs,
      calcsReturn: {
        gc: { distance: 20 },
        rl: {},
        passedPerpendicular: true
      } as CourseData
    })
    started.deltaCallback({
      updates: [
        {
          values: [
            { path: 'navigation.course.arrivalCircle', value: 50 },
            {
              path: 'navigation.position',
              value: { latitude: 10, longitude: 20 }
            }
          ]
        }
      ]
    })
    const raised = started.server.handleMessage.calls
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .flatMap((call: any[]) => call[1]?.updates ?? [])
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .flatMap((u: any) => u.values ?? [])
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .filter((v: any) => v.path?.startsWith('notifications.') && v.value)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((v: any) => v.path)
    started.stop()
    return raised
  }

  it('raises both notifications before the settings were ever saved', () => {
    expect(arrive({})).to.have.members([ARRIVAL, PERPENDICULAR])
  })

  it('raises both notifications for a config saved without them', () => {
    expect(arrive({ calculations: { method: 'Rhumbline' } })).to.have.members([
      ARRIVAL,
      PERPENDICULAR
    ])
  })

  it('raises only the notifications left enabled', () => {
    expect(
      arrive({
        notifications: {
          enableArrival: false,
          enablePerpendicular: true,
          sound: false
        },
        calculations: { method: 'GreatCircle' }
      })
    ).to.deep.equal([PERPENDICULAR])
  })
})
