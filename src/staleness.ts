import { getMetadata } from '@signalk/path-metadata'
import {
  Context,
  MetaValue,
  Path,
  PathValue,
  SourceRef,
  StreamType,
  Timestamp
} from '@signalk/server-api'

import { ServerApp, SignalKMessageHub, WithConfig } from './app'
import { createDebug } from './debug'
import streamTypeDefaults from './defaults/streamTypes.json'

const debug = createDebug('signalk-server:staleness')

export const STALENESS_PLUGIN_ID = 'staleness'

const NOTIFICATIONS_PREFIX = 'notifications.'
const NOTIFICATIONS_ROOT = 'notifications'
const DEFAULT_TIMEOUT_SECONDS = 60
const DEFAULT_CHECK_INTERVAL_MS = 1000
const NEVER_TIMEOUT = 0

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

type StreamTypeDefaults = ReadonlyArray<readonly [string, StreamType]>

/**
 * Build a longest-prefix-match table from the shipped streamTypes.json so a
 * single defaults lookup decides whether a path is event-driven without the
 * enforcer special-casing prefixes inline.
 */
const buildStreamTypeDefaults = (
  raw: Record<string, string>
): StreamTypeDefaults => {
  const entries: Array<[string, StreamType]> = []
  for (const prefix of Object.keys(raw)) {
    const t = raw[prefix]
    if (t === 'streaming' || t === 'event' || t === 'ais') {
      entries.push([prefix, t])
    }
  }
  entries.sort((a, b) => b[0].length - a[0].length)
  return entries
}

const DEFAULT_STREAM_TYPES = buildStreamTypeDefaults(
  streamTypeDefaults as Record<string, string>
)

const resolveStreamTypeFromDefaults = (
  path: string
): StreamType | undefined => {
  for (const [prefix, streamType] of DEFAULT_STREAM_TYPES) {
    if (path === prefix || path.startsWith(prefix + '.')) return streamType
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
  private readonly defaultTimeoutMs: number
  private readonly intervalMs: number
  private readonly useDefaults: boolean
  private timer: ReturnType<typeof setInterval> | null = null

  constructor(app: App) {
    this.app = app
    const s = app.config.settings
    this.defaultTimeoutMs = (s.defaultTimeout ?? DEFAULT_TIMEOUT_SECONDS) * 1000
    this.intervalMs = s.staleCheckIntervalMs ?? DEFAULT_CHECK_INTERVAL_MS
    this.useDefaults = s.useDefaultTimeouts !== false
  }

  start(): void {
    if (this.timer) return
    this.timer = setInterval(this.tick.bind(this), this.intervalMs)
    debug(
      'staleness enforcement on (defaultTimeout=%ds, interval=%dms, useDefaults=%s)',
      this.defaultTimeoutMs / 1000,
      this.intervalMs,
      this.useDefaults
    )
  }

  stop(): void {
    if (!this.timer) return
    clearInterval(this.timer)
    this.timer = null
  }

  /**
   * Recovery hook. Called from DeltaCache.onValue on every accepted delta.
   * O(1) — a single Set.delete. Holds no shape-allocation cost on the
   * per-delta hot path.
   */
  onIncoming(context: string, path: string, sourceRef: string): void {
    if (this.timedOut.size === 0) return
    this.timedOut.delete(makeKey(context, path, sourceRef))
  }

  /**
   * Called from DeltaCache.deleteContext after pruneContexts evicts a
   * vessel — prevents tracked keys for the deleted context from outliving
   * the cache entries they refer to.
   */
  onContextRemoved(context: string): void {
    if (this.timedOut.size === 0) return
    const prefix = context + '\0'
    for (const k of this.timedOut) {
      if (k.startsWith(prefix)) this.timedOut.delete(k)
    }
  }

  private tick(): void {
    const selfContext = this.app.selfContext
    const cache = (this.app.deltaCache as unknown as { cache: CacheNode }).cache
    const selfParts = selfContext.split('.')
    let node: unknown = cache
    for (const part of selfParts) {
      if (!isObject(node)) return
      node = node[part]
    }
    if (!isObject(node)) return
    this.walk(node, [], selfContext, Date.now())
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
    const streamType = this.resolveStreamType(path, meta)
    if (streamType !== 'streaming') return

    const baseTimeoutMs = this.resolveBaseTimeoutMs(context, path, meta)
    if (baseTimeoutMs === NEVER_TIMEOUT) return

    const failoverMs = this.getFailoverFloorMs(path)
    const effectiveMs = Math.max(baseTimeoutMs, failoverMs)

    for (const srcRef of Object.keys(leafGroup)) {
      const leaf = leafGroup[srcRef]
      if (!isCacheLeafEntry(leaf)) continue
      if (leaf.isMeta) continue
      if (leaf.value === null) continue
      // String and boolean leaves are by Signal K convention identity
      // fields (uuid, mmsi, name, flag) or simple state flags — never
      // streaming measurements. Emitting a null+timedOut delta for them
      // also crashes FullSignalK.addValue when the path collides with a
      // top-level identity scalar that fillIdentityField writes onto the
      // vessel context (e.g. `vessels.<id>.uuid = '<id>'`): the value
      // tree carries the identity as a primitive, so walking the path
      // dereferences a string and addValue's leaf.meta assignment fails.
      const valueType = typeof leaf.value
      if (valueType === 'string' || valueType === 'boolean') continue
      const ts = Date.parse(leaf.timestamp)
      if (Number.isNaN(ts)) continue
      if (now - ts <= effectiveMs) continue
      const key = makeKey(context, path, srcRef)
      if (this.timedOut.has(key)) continue
      this.timedOut.add(key)
      this.emit(context as Context, path as Path, srcRef as SourceRef, leaf)
    }
  }

  private resolveStreamType(
    path: string,
    meta: MetaValue | undefined
  ): StreamType {
    if (meta?.streamType) return meta.streamType
    const fromDefaults = resolveStreamTypeFromDefaults(path)
    if (fromDefaults) return fromDefaults
    return 'streaming'
  }

  private resolveBaseTimeoutMs(
    context: string,
    path: string,
    meta: MetaValue | undefined
  ): number {
    const explicit = meta?.timeout
    if (typeof explicit === 'number') {
      return explicit > 0 ? explicit * 1000 : NEVER_TIMEOUT
    }
    // 'auto' deferred to a follow-up PR; fall through to the global
    // default so the path is still monitored.
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
    | Record<string, unknown>
    | undefined
  if (!full) return undefined
  const timeout = full.timeout
  if (typeof timeout !== 'number') return undefined
  return { timeout } as MetaValue
}
