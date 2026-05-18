import { Delta, PathValue, Timestamp, Update } from '@signalk/server-api'
import { expect } from 'chai'

import { STALENESS_PLUGIN_ID, StalenessEnforcer } from '../src/staleness'

interface CapturedMessage {
  providerId: string
  context: string | undefined
  $source: string | undefined
  path: string
  value: unknown
  state: PathValue['state']
}

interface MockOptions {
  defaultTimeout?: number
  staleCheckIntervalMs?: number
  useDefaultTimeouts?: boolean
  metaByPath?: Record<string, Record<string, unknown>>
  failoverFloorByPath?: Record<string, number>
}

interface MockApp {
  selfContext: string
  config: {
    settings: {
      defaultTimeout?: number
      staleCheckIntervalMs?: number
      useDefaultTimeouts?: boolean
    }
    baseDeltaEditor: {
      getMeta: (context: string, path: string) => unknown
    }
  }
  deltaCache: { cache: Record<string, unknown> }
  getMaxFailoverTimeoutMs?: (path: string) => number
  handleMessage: (providerId: string, delta: Partial<Delta>) => void
  captured: CapturedMessage[]
}

const SELF_ID = 'urn:mrn:imo:mmsi:368204530'
const SELF_CONTEXT = 'vessels.' + SELF_ID

const hasValues = (u: Update): u is Update & { values: PathValue[] } =>
  'values' in u && Array.isArray((u as { values?: unknown }).values)

const makeMockApp = (opts: MockOptions = {}): MockApp => {
  const captured: CapturedMessage[] = []
  const metaByPath = opts.metaByPath ?? {}
  const failoverFloorByPath = opts.failoverFloorByPath ?? {}
  return {
    selfContext: SELF_CONTEXT,
    config: {
      settings: {
        defaultTimeout: opts.defaultTimeout,
        staleCheckIntervalMs: opts.staleCheckIntervalMs,
        useDefaultTimeouts: opts.useDefaultTimeouts
      },
      baseDeltaEditor: {
        getMeta: (_context: string, path: string) => metaByPath[path]
      }
    },
    deltaCache: { cache: {} },
    getMaxFailoverTimeoutMs: (path: string) => failoverFloorByPath[path] ?? 0,
    handleMessage: (providerId: string, delta: Partial<Delta>) => {
      const update = delta.updates?.[0]
      if (!update || !hasValues(update)) return
      const v = update.values[0]
      if (!v) return
      captured.push({
        providerId,
        context: delta.context,
        $source: update.$source,
        path: v.path,
        value: v.value,
        state: v.state
      })
    },
    captured
  }
}

type CacheTree = Record<string, unknown>

const seedLeaf = (
  app: MockApp,
  context: string,
  path: string,
  sourceRef: string,
  timestamp: string,
  value: unknown
): void => {
  const parts = (context + '.' + path).split('.')
  let node = app.deltaCache.cache as CacheTree
  for (let i = 0; i < parts.length; i++) {
    const key = parts[i]
    if (i === parts.length - 1) {
      const group = (node[key] ??= {}) as Record<string, unknown>
      group[sourceRef] = {
        context: context,
        path: path,
        $source: sourceRef,
        timestamp: timestamp as Timestamp,
        value,
        isMeta: false
      }
      return
    }
    node = (node[key] ??= {}) as CacheTree
  }
}

// Time helpers. The enforcer's tick uses Date.now() and Date.parse, so we
// just feed it ISO timestamps an arbitrary distance in the past — no need
// to swap out global clocks.
const isoSecondsAgo = (s: number): string =>
  new Date(Date.now() - s * 1000).toISOString()

// Calls the private `tick` method directly so tests stay deterministic
// without sleeping past the enforcer's interval. The cast is scoped to a
// minimal shape rather than `any` so future refactors don't silently
// break it.
const runTick = (enforcer: StalenessEnforcer): void => {
  ;(enforcer as unknown as { tick: () => void }).tick()
}

// The enforcer constructor accepts an `App` from src/staleness.ts; tests
// pass the MockApp via a single-point unknown cast so individual call
// sites do not each carry their own escape hatch.
type EnforcerCtor = new (app: unknown) => StalenessEnforcer
const NewEnforcer = StalenessEnforcer as unknown as EnforcerCtor
const makeEnforcer = (app: MockApp): StalenessEnforcer => new NewEnforcer(app)

describe('StalenessEnforcer', () => {
  it('emits null with state.timedOut when a streaming path exceeds the global default', () => {
    const app = makeMockApp({ defaultTimeout: 60 })
    const ts = isoSecondsAgo(120)
    seedLeaf(app, SELF_CONTEXT, 'navigation.speedOverGround', 'gps.1', ts, 5.5)
    const enforcer = makeEnforcer(app)
    runTick(enforcer)
    expect(app.captured).to.have.lengthOf(1)
    const m = app.captured[0]
    expect(m.providerId).to.equal(STALENESS_PLUGIN_ID)
    expect(m.context).to.equal(SELF_CONTEXT)
    expect(m.path).to.equal('navigation.speedOverGround')
    expect(m.value).to.equal(null)
    expect(m.$source).to.equal('gps.1')
    expect(m.state).to.deep.equal({
      timedOut: true,
      lastValue: { timestamp: ts, value: 5.5 }
    })
  })

  it('does not re-emit on subsequent ticks while still stale', () => {
    const app = makeMockApp({ defaultTimeout: 60 })
    seedLeaf(
      app,
      SELF_CONTEXT,
      'navigation.speedOverGround',
      'gps.1',
      isoSecondsAgo(120),
      5.5
    )
    const enforcer = makeEnforcer(app)
    runTick(enforcer)
    runTick(enforcer)
    runTick(enforcer)
    expect(app.captured).to.have.lengthOf(1)
  })

  it('clears the timed-out state on recovery and re-fires after the next stale window', () => {
    const app = makeMockApp({ defaultTimeout: 60 })
    seedLeaf(
      app,
      SELF_CONTEXT,
      'navigation.speedOverGround',
      'gps.1',
      isoSecondsAgo(120),
      5.5
    )
    const enforcer = makeEnforcer(app)
    runTick(enforcer)
    expect(app.captured).to.have.lengthOf(1)
    // Fresh delta lands: the cache updates and onIncoming clears the entry.
    seedLeaf(
      app,
      SELF_CONTEXT,
      'navigation.speedOverGround',
      'gps.1',
      isoSecondsAgo(0),
      6.0
    )
    enforcer.onIncoming(SELF_CONTEXT, 'navigation.speedOverGround', 'gps.1')
    // Path becomes stale again.
    seedLeaf(
      app,
      SELF_CONTEXT,
      'navigation.speedOverGround',
      'gps.1',
      isoSecondsAgo(120),
      6.0
    )
    runTick(enforcer)
    expect(app.captured).to.have.lengthOf(2)
  })

  it('skips notifications.* paths regardless of staleness', () => {
    const app = makeMockApp({ defaultTimeout: 60 })
    seedLeaf(
      app,
      SELF_CONTEXT,
      'notifications.mob',
      'self.notificationhandler',
      isoSecondsAgo(3600),
      { state: 'alarm', method: ['visual'], message: 'MOB' }
    )
    const enforcer = makeEnforcer(app)
    runTick(enforcer)
    expect(app.captured).to.have.lengthOf(0)
  })

  it('skips paths classified streamType=event via shipped defaults', () => {
    const app = makeMockApp({ defaultTimeout: 60 })
    seedLeaf(
      app,
      SELF_CONTEXT,
      'navigation.anchor.position',
      'plugin.anchor',
      isoSecondsAgo(3600),
      { latitude: 1, longitude: 2 }
    )
    const enforcer = makeEnforcer(app)
    runTick(enforcer)
    expect(app.captured).to.have.lengthOf(0)
  })

  it('skips paths classified streamType=event via per-path meta', () => {
    const app = makeMockApp({
      defaultTimeout: 60,
      metaByPath: {
        'electrical.switches.lights': { streamType: 'event' }
      }
    })
    seedLeaf(
      app,
      SELF_CONTEXT,
      'electrical.switches.lights',
      'switch.1',
      isoSecondsAgo(3600),
      { state: false }
    )
    const enforcer = makeEnforcer(app)
    runTick(enforcer)
    expect(app.captured).to.have.lengthOf(0)
  })

  it('honours an explicit numeric meta.timeout per path', () => {
    const app = makeMockApp({
      defaultTimeout: 60,
      metaByPath: {
        'environment.depth.belowKeel': { timeout: 5 }
      }
    })
    seedLeaf(
      app,
      SELF_CONTEXT,
      'environment.depth.belowKeel',
      'depth.1',
      isoSecondsAgo(10),
      3.2
    )
    const enforcer = makeEnforcer(app)
    runTick(enforcer)
    expect(app.captured).to.have.lengthOf(1)
  })

  it('treats meta.timeout: 0 as a permanent exemption', () => {
    const app = makeMockApp({
      defaultTimeout: 60,
      metaByPath: {
        'environment.depth.belowKeel': { timeout: 0 }
      }
    })
    seedLeaf(
      app,
      SELF_CONTEXT,
      'environment.depth.belowKeel',
      'depth.1',
      isoSecondsAgo(3600),
      3.2
    )
    const enforcer = makeEnforcer(app)
    runTick(enforcer)
    expect(app.captured).to.have.lengthOf(0)
  })

  it('floors the effective timeout at the priority failover window', () => {
    const app = makeMockApp({
      defaultTimeout: 2,
      failoverFloorByPath: {
        'navigation.speedOverGround': 10000
      }
    })
    seedLeaf(
      app,
      SELF_CONTEXT,
      'navigation.speedOverGround',
      'gps.1',
      isoSecondsAgo(5),
      5.5
    )
    const enforcer = makeEnforcer(app)
    runTick(enforcer)
    expect(app.captured).to.have.lengthOf(0)

    seedLeaf(
      app,
      SELF_CONTEXT,
      'navigation.speedOverGround',
      'gps.1',
      isoSecondsAgo(12),
      5.5
    )
    runTick(enforcer)
    expect(app.captured).to.have.lengthOf(1)
  })

  it('never emits when useDefaultTimeouts is off and no per-path meta is set', () => {
    const app = makeMockApp({ defaultTimeout: 60, useDefaultTimeouts: false })
    seedLeaf(
      app,
      SELF_CONTEXT,
      'navigation.speedOverGround',
      'gps.1',
      isoSecondsAgo(3600),
      5.5
    )
    const enforcer = makeEnforcer(app)
    runTick(enforcer)
    expect(app.captured).to.have.lengthOf(0)
  })

  it('marks only the silent source on a multi-source path', () => {
    const app = makeMockApp({ defaultTimeout: 60 })
    seedLeaf(
      app,
      SELF_CONTEXT,
      'navigation.speedOverGround',
      'gps.1',
      isoSecondsAgo(120),
      5.5
    )
    seedLeaf(
      app,
      SELF_CONTEXT,
      'navigation.speedOverGround',
      'gps.2',
      isoSecondsAgo(2),
      5.4
    )
    const enforcer = makeEnforcer(app)
    runTick(enforcer)
    expect(app.captured).to.have.lengthOf(1)
    expect(app.captured[0].$source).to.equal('gps.1')
  })

  it('does not re-emit when the cached value is already null (sensor-null)', () => {
    const app = makeMockApp({ defaultTimeout: 60 })
    seedLeaf(
      app,
      SELF_CONTEXT,
      'environment.depth.belowKeel',
      'depth.1',
      isoSecondsAgo(120),
      null
    )
    const enforcer = makeEnforcer(app)
    runTick(enforcer)
    expect(app.captured).to.have.lengthOf(0)
  })

  it('clears tracking for a context when the cache evicts it', () => {
    const app = makeMockApp({ defaultTimeout: 60 })
    seedLeaf(
      app,
      SELF_CONTEXT,
      'navigation.speedOverGround',
      'gps.1',
      isoSecondsAgo(120),
      5.5
    )
    const enforcer = makeEnforcer(app)
    runTick(enforcer)
    enforcer.onContextRemoved(SELF_CONTEXT)
    // After eviction, re-seeding the path and ticking should re-emit
    // because the prior tracking entry was cleared.
    seedLeaf(
      app,
      SELF_CONTEXT,
      'navigation.speedOverGround',
      'gps.1',
      isoSecondsAgo(120),
      5.5
    )
    runTick(enforcer)
    expect(app.captured).to.have.lengthOf(2)
  })

  it('never descends into non-self contexts (AIS targets)', () => {
    const app = makeMockApp({ defaultTimeout: 60 })
    const aisContext = 'vessels.urn:mrn:imo:mmsi:200000000'
    seedLeaf(
      app,
      aisContext,
      'navigation.position',
      'ais.1',
      isoSecondsAgo(3600),
      { latitude: 0, longitude: 0 }
    )
    const enforcer = makeEnforcer(app)
    runTick(enforcer)
    expect(app.captured).to.have.lengthOf(0)
  })

  it('captures lastValue from the cached leaf', () => {
    const app = makeMockApp({ defaultTimeout: 60 })
    const ts = isoSecondsAgo(120)
    seedLeaf(
      app,
      SELF_CONTEXT,
      'environment.outside.temperature',
      'temp.1',
      ts,
      288.15
    )
    const enforcer = makeEnforcer(app)
    runTick(enforcer)
    expect(app.captured[0].state).to.deep.equal({
      timedOut: true,
      lastValue: { timestamp: ts, value: 288.15 }
    })
  })

  it('skips string-valued leaves (identity fields collide with FullSignalK)', () => {
    const app = makeMockApp({ defaultTimeout: 60 })
    seedLeaf(
      app,
      SELF_CONTEXT,
      'uuid',
      'upstream.signalk',
      isoSecondsAgo(3600),
      'urn:mrn:signalk:uuid:34441577-07ae-412e-8ca9-03319cdee819'
    )
    const enforcer = makeEnforcer(app)
    runTick(enforcer)
    expect(app.captured).to.have.lengthOf(0)
  })

  it('skips boolean-valued leaves (state flags, not measurements)', () => {
    const app = makeMockApp({ defaultTimeout: 60 })
    seedLeaf(
      app,
      SELF_CONTEXT,
      'electrical.alternators.engine.charging',
      'alt.1',
      isoSecondsAgo(3600),
      true
    )
    const enforcer = makeEnforcer(app)
    runTick(enforcer)
    expect(app.captured).to.have.lengthOf(0)
  })
})
