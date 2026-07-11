import { getMetadata } from '@signalk/path-metadata'
import {
  Context,
  MetaValue,
  Path,
  PathValue,
  SourceRef,
  UpdateContract,
  Timestamp
} from '@signalk/server-api'

import { ServerApp, SignalKMessageHub, WithConfig } from './app'
import { createDebug } from './debug'
import updateContractDefaults from './defaults/updateContracts.json'

const debug = createDebug('signalk-server:staleness')

export const STALENESS_PLUGIN_ID = 'staleness'

const NOTIFICATIONS_PREFIX = 'notifications.'
const NOTIFICATIONS_ROOT = 'notifications'
const DEFAULT_TIMEOUT_SECONDS = 60
const DEFAULT_CHECK_INTERVAL_MS = 1000
const NEVER_TIMEOUT = 0
// `timeout: 'auto'` derives the effective timeout from observed delta
// arrival rates. The constants below match the RFC v7 contract: a
// warm-up window seeded with `defaultTimeout`, a sample ring of fixed
// depth, an envelope of 5× the median inter-arrival, and a clamp that
// keeps a chatty source from being shadowed by jitter and a slow
// source from waiting unboundedly.
const DEFAULT_AUTO_SAMPLES = 10
const DEFAULT_AUTO_WARMUP_SECONDS = 30
const AUTO_INTERVAL_MULTIPLIER = 5
const AUTO_MIN_TIMEOUT_MS = 2 * 1000
const AUTO_MAX_TIMEOUT_MS = 300 * 1000

interface AutoSampler {
  // Fixed-size ring of inter-arrival intervals in ms. `head` marks the
  // most recent write and wraps modulo the ring length; the median
  // derivation reads the filled prefix, so write order is irrelevant.
  intervals: number[]
  head: number
  // Number of intervals recorded so far (capped at intervals.length).
  count: number
  // Timestamp of the most recent delta for this key.
  lastTs: number
  // Wall-clock ms at which the warm-up window ends; until then the
  // global default is used as a safe upper bound.
  warmupExpiresAt: number
}

type App = ServerApp & WithConfig & SignalKMessageHub

/**
 * The delta cache stores either a nested `Record<string, CacheNode>` of
 * sub-paths or a leaf group of `Record<sourceRef, CacheLeafEntry>` at
 * each node — never a mix at the same level. `unknown` covers both
 * shapes; the walker narrows via `isLeafGroup` and `typeof` guards.
 */
type CacheNode = Record<string, unknown>

interface CacheLeafEntry {
  context: Context
  path: Path
  $source: SourceRef
  timestamp: Timestamp
  value: unknown
  isMeta: boolean
  state?: PathValue['state']
}

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null

const isCacheLeafEntry = (v: unknown): v is CacheLeafEntry =>
  isObject(v) &&
  typeof (v as { path?: unknown }).path === 'string' &&
  'value' in v

type UpdateContractDefaults = ReadonlyArray<readonly [string, UpdateContract]>

/**
 * Build a longest-prefix-match table from the shipped updateContracts.json so a
 * single defaults lookup decides whether a path is event-driven without the
 * enforcer special-casing prefixes inline.
 */
const buildUpdateContractDefaults = (
  raw: Record<string, string>
): UpdateContractDefaults => {
  const entries: Array<[string, UpdateContract]> = []
  for (const prefix of Object.keys(raw)) {
    const t = raw[prefix]
    if (t === 'periodic' || t === 'event') {
      entries.push([prefix, t])
    }
  }
  entries.sort((a, b) => b[0].length - a[0].length)
  return entries
}

const DEFAULT_UPDATE_CONTRACTS = buildUpdateContractDefaults(
  updateContractDefaults as Record<string, string>
)

const resolveUpdateContractFromDefaults = (
  path: string
): UpdateContract | undefined => {
  for (const [prefix, updateContract] of DEFAULT_UPDATE_CONTRACTS) {
    if (path === prefix || path.startsWith(prefix + '.')) return updateContract
  }
  return undefined
}

/**
 * Server-side enforcer for `meta.timeout`. Walks the delta cache once per
 * interval and emits a synthetic `value: null` delta with `state.timedOut`
 * for every `vessels.self.*` path+source whose last update is older than
 * the path's effective timeout.
 *
 * Effective timeout per path = `max(stale timeout, max failover timeout)`.
 * Flooring at the priority engine's failover window prevents a stale
 * signal from firing inside an active failover and racing the backup
 * source's takeover.
 *
 * Recovery is implicit: the next fresh delta overwrites the cached leaf
 * and `onIncoming` drops the tracking entry — the consumer sees the new
 * value with no `state` container.
 */
export class StalenessEnforcer {
  private readonly app: App
  private readonly timedOut = new Set<string>()
  private readonly autoSamplers = new Map<string, AutoSampler>()
  private readonly defaultTimeoutMs: number
  private readonly intervalMs: number
  private readonly useDefaults: boolean
  private readonly autoSamplesSize: number
  private readonly autoWarmupMs: number
  private timer: ReturnType<typeof setInterval> | null = null

  constructor(app: App) {
    this.app = app
    const s = app.config.settings
    this.defaultTimeoutMs = (s.defaultTimeout ?? DEFAULT_TIMEOUT_SECONDS) * 1000
    this.intervalMs = s.staleCheckIntervalMs ?? DEFAULT_CHECK_INTERVAL_MS
    this.useDefaults = s.useDefaultTimeouts !== false
    this.autoSamplesSize = s.autoTimeoutSamples ?? DEFAULT_AUTO_SAMPLES
    this.autoWarmupMs =
      (s.autoTimeoutWarmupSeconds ?? DEFAULT_AUTO_WARMUP_SECONDS) * 1000
  }

  start(): void {
    if (this.timer) return
    this.timer = setInterval(this.tick.bind(this), this.intervalMs)
    if (debug.enabled) {
      debug(
        'staleness enforcement on (defaultTimeout=%ds, interval=%dms, useDefaults=%s)',
        this.defaultTimeoutMs / 1000,
        this.intervalMs,
        this.useDefaults
      )
    }
  }

  stop(): void {
    if (!this.timer) return
    clearInterval(this.timer)
    this.timer = null
  }

  /**
   * Recovery hook. Called from DeltaCache.onValue on every accepted delta.
   * O(1) for the recovery-set delete; the auto sampler add is also O(1)
   * (ring write, no reallocation). Both are on the per-delta hot path.
   */
  onIncoming(context: string, path: string, sourceRef: string): void {
    const key = makeKey(context, path, sourceRef)
    if (this.timedOut.size > 0) this.timedOut.delete(key)
    this.recordAutoSample(key)
  }

  private recordAutoSample(key: string): void {
    const now = Date.now()
    let s = this.autoSamplers.get(key)
    if (!s) {
      s = {
        intervals: new Array<number>(this.autoSamplesSize).fill(0),
        head: -1,
        count: 0,
        lastTs: now,
        warmupExpiresAt: now + this.autoWarmupMs
      }
      this.autoSamplers.set(key, s)
      return
    }
    const interval = now - s.lastTs
    s.lastTs = now
    if (interval <= 0) return
    s.head = (s.head + 1) % s.intervals.length
    s.intervals[s.head] = interval
    if (s.count < s.intervals.length) s.count++
  }

  /**
   * Derive an effective timeout (ms) from observed delta arrival rates.
   * Returns null while still in warm-up so the caller falls back to the
   * global default. Once warm, returns 5× the median inter-arrival,
   * clamped to AUTO_MIN_TIMEOUT_MS..AUTO_MAX_TIMEOUT_MS.
   */
  private deriveAutoTimeoutMs(key: string): number | null {
    const s = this.autoSamplers.get(key)
    if (!s) return null
    if (s.count < s.intervals.length && Date.now() < s.warmupExpiresAt) {
      return null
    }
    if (s.count === 0) return null
    const sorted = s.intervals.slice(0, s.count).sort((a, b) => a - b)
    const median = sorted[Math.floor(sorted.length / 2)]
    const ms = median * AUTO_INTERVAL_MULTIPLIER
    if (ms < AUTO_MIN_TIMEOUT_MS) return AUTO_MIN_TIMEOUT_MS
    if (ms > AUTO_MAX_TIMEOUT_MS) return AUTO_MAX_TIMEOUT_MS
    return ms
  }

  /**
   * Called from DeltaCache.deleteContext after pruneContexts evicts a
   * vessel — prevents tracked keys for the deleted context from outliving
   * the cache entries they refer to.
   */
  onContextRemoved(context: string): void {
    const prefix = context + '\0'
    if (this.timedOut.size > 0) {
      for (const k of this.timedOut) {
        if (k.startsWith(prefix)) this.timedOut.delete(k)
      }
    }
    if (this.autoSamplers.size > 0) {
      for (const k of this.autoSamplers.keys()) {
        if (k.startsWith(prefix)) this.autoSamplers.delete(k)
      }
    }
  }

  private tick(): void {
    // The tick runs on a bare interval: an exception escaping it would
    // surface as an uncaught error and take the whole server down. A
    // malformed cache entry must cost one skipped sweep, not the process.
    try {
      const selfContext = this.app.selfContext
      const cache = (this.app.deltaCache as unknown as { cache: CacheNode })
        .cache
      const selfParts = selfContext.split('.')
      let node: unknown = cache
      for (const part of selfParts) {
        if (!isObject(node)) return
        node = node[part]
      }
      if (!isObject(node)) return
      this.walk(node, [], selfContext, Date.now())
    } catch (e) {
      debug('staleness tick failed: %o', e)
    }
  }

  private walk(
    node: CacheNode,
    pathParts: string[],
    context: string,
    now: number
  ): void {
    if (isLeafGroup(node)) {
      this.checkLeafGroup(node, pathParts.join('.'), context, now)
      return
    }
    for (const key of Object.keys(node)) {
      if (key === 'meta') continue
      const child = node[key]
      if (!isObject(child)) continue
      pathParts.push(key)
      this.walk(child, pathParts, context, now)
      pathParts.pop()
    }
  }

  private checkLeafGroup(
    leafGroup: CacheNode,
    path: string,
    context: string,
    now: number
  ): void {
    if (path === NOTIFICATIONS_ROOT || path.startsWith(NOTIFICATIONS_PREFIX)) {
      return
    }

    const meta = this.lookupMeta(context, path)
    const updateContract = this.resolveUpdateContract(path, meta)
    if (updateContract !== 'periodic') return

    const baseTimeoutMs = this.resolveBaseTimeoutMs(context, path, meta)
    if (baseTimeoutMs === NEVER_TIMEOUT) return

    const failoverMs = this.getFailoverFloorMs(path)

    for (const srcRef of Object.keys(leafGroup)) {
      const leaf = leafGroup[srcRef]
      if (!isCacheLeafEntry(leaf)) continue
      if (leaf.isMeta) continue
      if (leaf.value === null) continue
      // String and boolean leaves are by Signal K convention identity
      // fields (uuid, mmsi, name, flag) or simple state flags — never
      // periodic measurements. Emitting a null+timedOut delta for them
      // also crashes FullSignalK.addValue when the path collides with a
      // top-level identity scalar that fillIdentityField writes onto the
      // vessel context (e.g. `vessels.<id>.uuid = '<id>'`): the value
      // tree carries the identity as a primitive, so walking the path
      // dereferences a string and addValue's leaf.meta assignment fails.
      const valueType = typeof leaf.value
      if (valueType === 'string' || valueType === 'boolean') continue
      const key = makeKey(context, path, srcRef)
      // The base timeout depends on the source for `meta.timeout: 'auto'`
      // — different sources of the same path can have different update
      // rates (e.g. a 5 Hz NMEA 2000 GPS vs a 1 Hz NMEA 0183 GPS).
      const perSrcBaseMs = this.applyAutoFallback(baseTimeoutMs, meta, key)
      if (perSrcBaseMs === NEVER_TIMEOUT) continue
      const perSrcEffectiveMs = Math.max(perSrcBaseMs, failoverMs)
      const ts = Date.parse(leaf.timestamp)
      if (Number.isNaN(ts)) continue
      if (now - ts <= perSrcEffectiveMs) continue
      if (this.timedOut.has(key)) continue
      this.timedOut.add(key)
      this.emit(context as Context, path as Path, srcRef as SourceRef, leaf)
    }
  }

  /**
   * Resolves `meta.timeout: 'auto'` to a per-source derived timeout when
   * the auto sampler has warmed up; falls back to the previously-computed
   * `baseTimeoutMs` (numeric meta / schema / global default) otherwise.
   * Pure: extracted so the per-source branch in `checkLeafGroup` stays a
   * single readable expression.
   */
  private applyAutoFallback(
    baseTimeoutMs: number,
    meta: MetaValue | undefined,
    key: string
  ): number {
    if (meta?.timeout !== 'auto') return baseTimeoutMs
    const derived = this.deriveAutoTimeoutMs(key)
    return derived ?? baseTimeoutMs
  }

  private resolveUpdateContract(
    path: string,
    meta: MetaValue | undefined
  ): UpdateContract {
    if (meta?.updateContract) return meta.updateContract
    const fromDefaults = resolveUpdateContractFromDefaults(path)
    if (fromDefaults) return fromDefaults
    return 'periodic'
  }

  // Resolves the base timeout (ms) ignoring `meta.timeout: 'auto'` —
  // that branch is resolved later in `applyAutoFallback` once we have
  // the source ref. The numeric and schema fallbacks here are the
  // warm-up ceiling for an 'auto' path that has not yet collected
  // enough samples to derive a per-source value.
  private resolveBaseTimeoutMs(
    context: string,
    path: string,
    meta: MetaValue | undefined
  ): number {
    const explicit = meta?.timeout
    if (typeof explicit === 'number') {
      return explicit > 0 ? explicit * 1000 : NEVER_TIMEOUT
    }
    if (explicit === 'auto') {
      // 'auto' is an explicit per-path opt-in: it outranks spec-schema
      // timeouts, and the useDefaultTimeouts toggle only gates paths
      // with no timeout configuration of their own. The default here is
      // just the ceiling until the sampler has warmed up;
      // applyAutoFallback replaces it with the derived value.
      return this.defaultTimeoutMs
    }
    const schemaMeta = lookupSchemaMeta(context, path)
    if (typeof schemaMeta?.timeout === 'number') {
      return schemaMeta.timeout > 0 ? schemaMeta.timeout * 1000 : NEVER_TIMEOUT
    }
    return this.useDefaults ? this.defaultTimeoutMs : NEVER_TIMEOUT
  }

  private getFailoverFloorMs(path: string): number {
    const accessor = (
      this.app as { getMaxFailoverTimeoutMs?: (p: string) => number }
    ).getMaxFailoverTimeoutMs
    return typeof accessor === 'function' ? accessor(path) : 0
  }

  // baseDeltaEditor stores self-vessel meta under the literal `vessels.self`
  // context, whereas the cache walker hands us the runtime `vessels.<selfId>`
  // form. Rewrite before lookup so a user-set `meta.timeout` from the Data
  // Browser is honoured.
  private lookupMeta(context: string, path: string): MetaValue | undefined {
    const editor = this.app.config.baseDeltaEditor
    if (!editor) return undefined
    const lookupContext =
      context === this.app.selfContext ? 'vessels.self' : context
    return editor.getMeta(lookupContext, path) as MetaValue | undefined
  }

  private emit(
    context: Context,
    path: Path,
    sourceRef: SourceRef,
    leaf: CacheLeafEntry
  ): void {
    const update: PathValue = {
      path,
      value: null,
      state: {
        timedOut: true,
        lastValue: {
          timestamp: leaf.timestamp,
          value: leaf.value as PathValue['value']
        }
      }
    }
    this.app.handleMessage(STALENESS_PLUGIN_ID, {
      context,
      updates: [
        {
          $source: sourceRef,
          timestamp: new Date().toISOString() as Timestamp,
          values: [update]
        }
      ]
    })
    if (debug.enabled) {
      debug(
        'timeout %s:%s after %dms',
        path,
        sourceRef,
        Date.now() - Date.parse(leaf.timestamp)
      )
    }
  }
}

const makeKey = (context: string, path: string, sourceRef: string): string =>
  context + '\0' + path + '\0' + sourceRef

// The delta cache stores either ALL leaf entries (sourceRef → leaf) or NO
// leaf entries at a given node — intermediate paths never share a level
// with leaf entries. Probing the first non-meta child is sufficient.
const isLeafGroup = (node: CacheNode): boolean => {
  for (const key of Object.keys(node)) {
    if (key === 'meta') continue
    return isCacheLeafEntry(node[key])
  }
  return false
}

// @signalk/path-metadata keys the spec metadata under `vessels.self.*`,
// not `vessels.<selfId>.*`. The enforcer's caller passes the cache's
// runtime context (vessels.<selfId>); rewrite it before consulting the
// schema so a self-vessel path's spec-shipped timeout is honoured.
const lookupSchemaMeta = (
  context: string,
  path: string
): MetaValue | undefined => {
  const ctxPath = context.startsWith('vessels.') ? 'vessels.self' : context
  const full = getMetadata(ctxPath + '.' + path) as
    Record<string, unknown> | undefined
  if (!full) return undefined
  const timeout = full.timeout
  if (typeof timeout !== 'number') return undefined
  return { timeout } as MetaValue
}
