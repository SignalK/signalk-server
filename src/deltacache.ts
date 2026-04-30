/* eslint-disable @typescript-eslint/no-explicit-any */
/*
 * Copyright 2017 Scott Bender <scott@scottbender.net>
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0

 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { createDebug } from './debug'
const debug = createDebug('signalk-server:deltacache')
import { FullSignalK, getSourceId } from '@signalk/server-api'
import _, { isUndefined } from 'lodash'
import { readFileSync, writeFile } from 'fs'
import { join } from 'path'
import { toDelta, StreamBundle } from './streambundle'
import { ContextMatcher, SignalKServer } from './types'
import { Context, NormalizedDelta, SourceRef } from '@signalk/server-api'
import { isFanOutPriorities } from './deltaPriority'

const SOURCES_CACHE_FILE = 'sources-cache.json'

interface StringKeyed {
  [key: string]: any
}

/**
 * Build a `<label>.<src>` → `<label>.<canName>` map from the Signal K
 * sources summary tree.
 *
 * Providers with `useCanName: true` emit deltas tagged with the canName
 * form once the device's PGN 60928 has been observed. Frames that
 * arrived before that point — common with UDP gateways that miss the
 * early ISO Address Claim — leak out tagged by numeric src and create
 * stale leaves that survive in the cache. Returning a translation map
 * here lets callers collapse those duplicates back onto the canonical
 * canName form.
 *
 * Providers with `useCanName` off never populate `n2k.canName`; the
 * map stays empty and callers see refs unchanged.
 */
export function buildSrcToCanonicalMap(sources: unknown): Map<string, string> {
  const out = new Map<string, string>()
  if (!sources || typeof sources !== 'object') return out
  try {
    for (const [label, conn] of Object.entries(sources)) {
      if (!conn || typeof conn !== 'object') continue
      for (const [src, dev] of Object.entries(
        conn as Record<string, unknown>
      )) {
        if (src === 'type' || src === 'label') continue
        if (!dev || typeof dev !== 'object') continue
        const canName = (dev as any)?.n2k?.canName
        if (typeof canName === 'string' && canName.length > 0) {
          out.set(`${label}.${src}`, `${label}.${canName}`)
        }
      }
    }
  } catch {
    // best-effort — never block multi-source detection on a malformed
    // sources tree
  }
  return out
}

export default class DeltaCache {
  cache: StringKeyed = {}
  lastModifieds: StringKeyed = {}
  app: SignalKServer
  defaults: any
  sourceDeltas: StringKeyed = {}
  cachedContextPaths: {
    [context: string]: {
      [path: string]: string[]
    }
  } = {}
  private sourcesCachePath: string | null = null
  private saveTimer: ReturnType<typeof setTimeout> | null = null
  private preferredSources: Map<string, SourceRef> = new Map()
  private multiSourceTimer: ReturnType<typeof setTimeout> | null = null
  private lastEmittedMultiSourceCount = 0
  private livePreferredEmitTimer: ReturnType<typeof setTimeout> | null = null
  private livePreferredDirtyPaths: Set<string> = new Set()

  // Cached `<label>.<src> → <label>.<canName>` translation, refreshed
  // whenever `app.signalk.sources` is replaced or sourceRefChanged
  // fires. Without this, livePreferredSources reports raw refs that
  // don't match the canName-form ranking saved in priorities.json,
  // and the admin UI's wins/Preferred badge disagrees with the engine.
  private canonicalMap: Map<string, string> | null = null
  private canonicalSnapshot: unknown = null

  private subscribedPaths = new Set<string>()

  constructor(app: SignalKServer, streambundle: StreamBundle) {
    this.app = app
    streambundle.keys.onValue((key) => {
      if (this.subscribedPaths.has(key)) return
      this.subscribedPaths.add(key)
      streambundle.getBus(key).onValue(this.onValue.bind(this))
    })

    // Refresh the canonical translation when a new device is observed
    // or a numeric-keyed source is replaced by a canName-keyed one.
    ;(app as any).on?.('sourceRefChanged', () => {
      this.canonicalSnapshot = null
    })

    this.loadSourcesCache()

    // String.split() is heavy enough and called frequently enough
    // to warrant caching the result. Has a noticeable effect
    // on throughput of a server going full blast with the n2k
    // sample data and the memory hit is negligible. The cache
    // must be pruned, or AIS vessel data will stick forever.
    // No fancy pruning, just clear & let it recreate.
    setInterval(
      () => {
        this.cachedContextPaths = {}
      },
      5 * 60 * 1000
    )
  }

  getContextAndPathParts(msg: NormalizedDelta): string[] {
    let result
    if (
      this.cachedContextPaths[msg.context] &&
      (result = this.cachedContextPaths[msg.context][msg.path])
    ) {
      return result
    }

    let contextAndPathParts = msg.context.split('.')
    if (msg.path.length !== 0) {
      contextAndPathParts = contextAndPathParts.concat(msg.path.split('.'))
    }
    if (!this.cachedContextPaths[msg.context]) {
      this.cachedContextPaths[msg.context] = {}
    }
    this.cachedContextPaths[msg.context][msg.path] = contextAndPathParts
    return contextAndPathParts
  }

  private canonicaliseSourceRef(sourceRef: string): string {
    const sources = (this.app.signalk as any)?.sources
    if (sources !== this.canonicalSnapshot || this.canonicalMap === null) {
      this.canonicalSnapshot = sources
      this.canonicalMap = buildSrcToCanonicalMap(sources)
    }
    return this.canonicalMap.get(sourceRef) ?? sourceRef
  }

  onValue(msg: NormalizedDelta) {
    // debug(`onValue ${JSON.stringify(msg)}`)

    if (msg.isMeta) {
      // ignore meta data since it's getting managed by FullSignalK
      return
    }

    const sourceRef = ensureHasDollarSource(msg)
    const leaf = getLeafObject(
      this.cache,
      this.getContextAndPathParts(msg),
      true
    )

    if (msg.path.length !== 0) {
      leaf[sourceRef] = msg
      const prefKey = msg.context + '\0' + msg.path
      // The priority engine matches by canonical (canName) form. Store
      // the same canonical ref in preferredSources so the livePreferred
      // stream and the wins/Preferred badge in the admin UI compare
      // like-for-like with the saved priorities.json. Falls through to
      // the raw ref when no canName is known (cold boot, non-N2K).
      const canonicalRef = this.canonicaliseSourceRef(sourceRef) as SourceRef
      const prevSource = this.preferredSources.get(prefKey)
      this.preferredSources.set(prefKey, canonicalRef)
      // Only mark the path dirty for the LIVEPREFERRED stream when the
      // winning source actually changed — otherwise every accepted
      // delta would queue a redundant emit.
      if (prevSource !== canonicalRef) {
        this.livePreferredDirtyPaths.add(prefKey)
        this.scheduleLivePreferredEmit()
      }
    } else if (msg.value) {
      _.keys(msg.value).forEach((key) => {
        if (!leaf[key]) {
          leaf[key] = {}
        }
        leaf[key][sourceRef] = msg
      })
    }
    this.lastModifieds[msg.context] = Date.now()
  }

  private scheduleMultiSourceEmit() {
    if (this.multiSourceTimer) return
    this.multiSourceTimer = setTimeout(() => {
      this.multiSourceTimer = null
      this.emitMultiSourcePaths()
    }, 2000)
  }

  private scheduleLivePreferredEmit() {
    if (this.livePreferredEmitTimer) return
    // 1s debounce: priority transitions are user-visible but not
    // latency-critical; coalescing many flips into one event keeps the
    // admin-ui WS quiet during noisy startup or heavy reconnect.
    this.livePreferredEmitTimer = setTimeout(() => {
      this.livePreferredEmitTimer = null
      const dirty = this.livePreferredDirtyPaths
      this.livePreferredDirtyPaths = new Set()
      const data: Record<string, string> = {}
      for (const key of dirty) {
        const sourceRef = this.preferredSources.get(key)
        if (sourceRef) data[key] = sourceRef
      }
      if (Object.keys(data).length === 0) return
      ;(this.app as any).emit('serverevent', {
        type: 'LIVEPREFERREDSOURCES',
        data
      })
    }, 1000)
  }

  /**
   * Snapshot of the current "winning" source per path, keyed as
   * `${context}\0${path}`. Updated by onValue on every accepted delta;
   * reflects what the priority engine is actually routing right now.
   */
  getLivePreferredSources(): Record<string, string> {
    const out: Record<string, string> = {}
    for (const [key, ref] of this.preferredSources) out[key] = ref
    return out
  }

  private emitMultiSourcePaths() {
    const paths = this.getMultiSourcePaths()
    const count = Object.keys(paths).length
    const countChanged = count !== this.lastEmittedMultiSourceCount
    this.lastEmittedMultiSourceCount = count
    ;(this.app as any).emit('serverevent', {
      type: 'MULTISOURCEPATHS',
      data: paths
    })
    if (countChanged) {
      this.scheduleMultiSourceEmit()
    }
  }

  /**
   * Remove all cached deltas for a given sourceRef and re-emit
   * MULTISOURCEPATHS so the UI reflects the change. For every path whose
   * preferred source pointed at the removed ref, pick a deterministic
   * replacement from the remaining leaf entries so filterDeltasToPreferred
   * doesn't fall back to whatever Object.keys iterates first.
   */
  removeSource(sourceRef: SourceRef) {
    const removeFromNode = (node: any): void => {
      for (const key of Object.keys(node)) {
        if (key === 'meta') continue
        const child = node[key]
        if (!child || typeof child !== 'object') continue
        if (child.path !== undefined && child.value !== undefined) {
          if (key === sourceRef) delete node[key]
        } else {
          removeFromNode(child)
        }
      }
    }
    removeFromNode(this.cache)
    // preferredSources stores canonical (canName) refs since onValue
    // canonicalised on write, so compare in the same form whether the
    // caller passed a raw or canonical ref.
    const canonicalTarget = this.canonicaliseSourceRef(sourceRef) as SourceRef
    for (const [key, ref] of this.preferredSources) {
      if (ref !== canonicalTarget) continue
      const nullIdx = key.indexOf('\0')
      const context = nullIdx === -1 ? key : key.slice(0, nullIdx)
      const path = nullIdx === -1 ? '' : key.slice(nullIdx + 1)
      const replacement = this.pickReplacementSource(context, path)
      if (replacement) {
        this.preferredSources.set(
          key,
          this.canonicaliseSourceRef(replacement) as SourceRef
        )
      } else {
        this.preferredSources.delete(key)
      }
    }
    this.emitMultiSourcePaths()
  }

  /**
   * Drop preferredSources entries whose path is no longer covered by an
   * active source-priority config. Without this, the bootstrap snapshot
   * served by getCachedDeltas('preferred') keeps returning the
   * formerly-preferred source for paths whose group has just been
   * deactivated — until a different source's delta happens to overwrite
   * the cache entry. Called from activateSourcePriorities() after the
   * priority engine is rebuilt so the snapshot stays in sync with what
   * the engine will actually enforce.
   */
  resetPreferredSourcesNotIn(activePaths: Set<string>): void {
    for (const key of this.preferredSources.keys()) {
      const nullIdx = key.indexOf('\0')
      const path = nullIdx === -1 ? '' : key.slice(nullIdx + 1)
      if (!activePaths.has(path)) {
        this.preferredSources.delete(key)
      }
    }
  }

  private pickReplacementSource(
    context: string,
    path: string
  ): SourceRef | undefined {
    const parts = context.split('.')
    if (path.length !== 0) parts.push(...path.split('.'))
    let node: any = this.cache
    for (const p of parts) {
      if (!node || typeof node !== 'object') return undefined
      node = node[p]
    }
    if (!node || typeof node !== 'object') return undefined
    for (const ref of Object.keys(node)) {
      if (ref === 'meta') continue
      const leaf = node[ref]
      if (leaf && typeof leaf === 'object' && leaf.value !== undefined) {
        return ref as SourceRef
      }
    }
    return undefined
  }

  /**
   * Remove a source delta entry by key, purge all cached data for the
   * corresponding sourceRefs (numeric address and CAN Name forms), and
   * persist the updated sources cache to disk.
   */
  removeSourceDelta(key: string) {
    const delta = this.sourceDeltas[key] as any
    const refsToRemove: string[] = [key]
    const dotIdx = key.indexOf('.')
    const conn = dotIdx !== -1 ? key.slice(0, dotIdx) : ''
    const addr = dotIdx !== -1 ? key.slice(dotIdx + 1) : ''
    if (delta?.updates?.[0]?.source) {
      const src = delta.updates[0].source
      if (src.canName) refsToRemove.push(`${conn}.${src.canName}`)
      if (src.src !== undefined) refsToRemove.push(`${conn}.${src.src}`)
    }
    delete this.sourceDeltas[key]
    for (const ref of new Set(refsToRemove)) {
      this.removeSource(ref as SourceRef)
    }

    // Also remove from the FullSignalK sources tree so the REST API
    // (which may serve app.signalk.retrieve() directly) reflects the change
    const sources = this.app.signalk.retrieve().sources
    if (sources && conn && sources[conn]) {
      delete sources[conn][addr]
      const remaining = Object.keys(sources[conn]).filter(
        (k) => k !== 'type' && k !== 'label'
      )
      if (remaining.length === 0) {
        delete sources[conn]
      }
    }

    this.scheduleSaveSourcesCache()
  }

  ingestDelta(delta: any) {
    if (!delta.updates) return
    for (const update of delta.updates) {
      if (!('values' in update) || !update.values) continue
      const sourceRef: SourceRef = update.$source
      for (const pathValue of update.values) {
        if (pathValue.path.length === 0) continue
        const msg = {
          context: delta.context,
          source: update.source,
          $source: sourceRef,
          timestamp: update.timestamp,
          path: pathValue.path,
          value: pathValue.value,
          isMeta: false
        } as NormalizedDelta
        const leaf = getLeafObject(
          this.cache,
          this.getContextAndPathParts(msg),
          true
        )
        const isNewSource = !leaf[sourceRef]
        leaf[sourceRef] = msg
        // Populate preferredSources so getCachedDeltas('preferred')
        // works correctly after restart/replay
        const prefKey = delta.context + '\0' + pathValue.path
        if (!this.preferredSources.has(prefKey)) {
          this.preferredSources.set(prefKey, sourceRef)
        }

        if (isNewSource) {
          const sourceCount = Object.keys(leaf).filter((k) => {
            const v = leaf[k]
            return (
              v &&
              typeof v === 'object' &&
              v.path !== undefined &&
              v.value !== undefined
            )
          }).length
          if (sourceCount >= 2) {
            this.scheduleMultiSourceEmit()
          }
        }
      }
    }
    if (delta.context) {
      this.lastModifieds[delta.context] = Date.now()
    }
  }

  setSourceDelta(key: string, delta: any) {
    // Deduplicate by canName: if a different key already exists for the
    // same canName (e.g. a device moved from address 254 to its final
    // address), remove the old entry to prevent duplicates.
    const canName = delta?.updates?.[0]?.source?.canName
    if (canName) {
      const dotIdx = key.indexOf('.')
      const conn = dotIdx !== -1 ? key.slice(0, dotIdx) : ''
      // Collect first, mutate after — removeSourceDelta deletes from
      // this.sourceDeltas, which would invalidate the entries iterator.
      const keysToRemove: string[] = []
      for (const [existingKey, existingDelta] of Object.entries(
        this.sourceDeltas
      )) {
        if (existingKey === key) continue
        if (!existingKey.startsWith(conn + '.')) continue
        const existingCanName = (existingDelta as any)?.updates?.[0]?.source
          ?.canName
        if (existingCanName === canName) {
          keysToRemove.push(existingKey)
        }
      }
      for (const existingKey of keysToRemove) {
        this.removeSourceDelta(existingKey)
      }
    }
    this.sourceDeltas[key] = delta
    this.app.signalk.addDelta(delta)
    this.scheduleSaveSourcesCache()
  }

  private getSourcesCachePath(): string | null {
    if (this.sourcesCachePath === null) {
      const configPath = (this.app.config as any).configPath as
        | string
        | undefined
      if (configPath) {
        this.sourcesCachePath = join(configPath, SOURCES_CACHE_FILE)
      }
    }
    return this.sourcesCachePath
  }

  private loadSourcesCache() {
    const cachePath = this.getSourcesCachePath()
    if (!cachePath) {
      return
    }
    try {
      const data = readFileSync(cachePath, 'utf-8')
      const cached = JSON.parse(data)
      if (cached && typeof cached === 'object') {
        // Deduplicate by canName: when the same device appears under
        // multiple addresses (e.g. from address 254 claim cycling),
        // keep only the entry with the lower non-254 address.
        const byCanName = new Map<string, string>()
        for (const [key, delta] of Object.entries(cached)) {
          const cn = (delta as any)?.updates?.[0]?.source?.canName
          if (!cn) continue
          const dotIdx = key.indexOf('.')
          const conn = dotIdx !== -1 ? key.slice(0, dotIdx) : ''
          const fullCn = conn + '.' + cn
          const existing = byCanName.get(fullCn)
          if (existing) {
            const existingAddr = Number(
              existing.slice(existing.indexOf('.') + 1)
            )
            const thisAddr = Number(key.slice(dotIdx + 1))
            // If addresses are not numeric (e.g. canName-based key), keep
            // the existing entry to avoid NaN-driven nondeterministic choice
            if (Number.isNaN(existingAddr) || Number.isNaN(thisAddr)) {
              delete cached[key]
              continue
            }
            // Prefer non-254; if both non-254, prefer lower address
            const keepExisting =
              thisAddr === 254 ||
              (existingAddr !== 254 && existingAddr < thisAddr)
            const toRemove = keepExisting ? key : existing
            delete cached[toRemove]
            if (!keepExisting) byCanName.set(fullCn, key)
          } else {
            byCanName.set(fullCn, key)
          }
        }
        this.sourceDeltas = cached
        const addDelta = this.app.signalk.addDelta.bind(this.app.signalk)
        _.values(this.sourceDeltas).forEach(addDelta)
        debug(
          'Loaded %d cached sources from %s',
          Object.keys(cached).length,
          cachePath
        )
      }
    } catch (e: any) {
      if (e.code !== 'ENOENT') {
        debug('Failed to load sources cache: %s', e.message)
      }
    }
  }

  private scheduleSaveSourcesCache() {
    if (this.saveTimer) {
      return
    }
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null
      this.saveSourcesCache()
    }, 5000)
  }

  private saveSourcesCache() {
    const cachePath = this.getSourcesCachePath()
    if (!cachePath) {
      return
    }
    const data = JSON.stringify(this.sourceDeltas, null, 2)
    writeFile(cachePath, data, (err) => {
      if (err) {
        debug('Failed to save sources cache: %s', err.message)
      } else {
        debug(
          'Saved %d sources to %s',
          Object.keys(this.sourceDeltas).length,
          cachePath
        )
      }
    })
  }

  deleteContext(contextKey: string) {
    debug('Deleting context ' + contextKey)
    const contextParts = contextKey.split('.')
    if (contextParts.length === 2) {
      delete this.cache[contextParts[0]][contextParts[1]]
    }
  }

  pruneContexts(seconds: number) {
    debug('pruning contexts...')
    const threshold = Date.now() - seconds * 1000
    for (const contextKey in this.lastModifieds) {
      if (this.lastModifieds[contextKey] < threshold) {
        this.deleteContext(contextKey)
        delete this.lastModifieds[contextKey]
      }
    }
  }

  buildFull(user: string, path: string[]) {
    const leaf = getLeafObject(
      this.cache,
      pathToProcessForFull(path),
      false,
      true
    )

    let deltas
    if (leaf) {
      deltas = findDeltas(leaf).map(toDelta)
    }

    return this.buildFullFromDeltas(
      user,
      deltas,
      path.length === 0 || path[0] === 'sources'
    )
  }

  /**
   * Return paths on the self vessel that have more than one source.
   * Result: { path: sourceRef[] } for each multi-source path.
   *
   * Persisted source priorities are also unioned in. Without this, a path
   * whose user-ranked sources are temporarily silent (e.g. an MFD that has
   * been powered off) drops to one or zero live publishers and disappears
   * from the multi-source view — the admin-ui then shows the path's
   * persisted entries under "Ungrouped" and surprises the user. Keeping
   * the persisted view in lets the priorities page render the user's
   * intent stably across power cycles.
   */
  getMultiSourcePaths(): Record<string, string[]> {
    const selfParts = this.app.selfContext.split('.')
    let selfBranch: any = this.cache
    for (const part of selfParts) {
      if (!selfBranch || !selfBranch[part]) {
        selfBranch = null
        break
      }
      selfBranch = selfBranch[part]
    }

    const srcToCanonical = buildSrcToCanonicalMap(
      (this.app.signalk as any)?.sources
    )
    const canonical = (ref: string): string => srcToCanonical.get(ref) ?? ref

    // Per-path canonical publishers observed in the cache, regardless
    // of publisher count. Multi-source paths drop in via the standard
    // ≥2-source filter below; fan-out paths reuse this map when only
    // one source is currently emitting so the path keeps its group
    // affiliation in the priorities view.
    const cachePublishers: Record<string, Set<string>> = {}
    const result: Record<string, Set<string>> = {}
    if (selfBranch) {
      const walk = (node: any, pathParts: string[]) => {
        for (const key of Object.keys(node)) {
          if (key === 'meta') continue
          const child = node[key]
          if (!child || typeof child !== 'object') continue
          if (child.path !== undefined && child.value !== undefined) {
            // Notifications are events, not measurements — the priority
            // engine never dedupes them (see deltaPriority.ts), so they
            // must not surface as multi-source paths in the priorities UI.
            if (pathParts[0] === 'notifications') return
            const sources = Object.keys(node).filter((k) => {
              const v = node[k]
              return (
                v &&
                typeof v === 'object' &&
                v.path !== undefined &&
                v.value !== undefined
              )
            })
            if (sources.length > 0) {
              const canonicalSet = new Set(sources.map(canonical))
              const path = pathParts.join('.')
              cachePublishers[path] = canonicalSet
              if (canonicalSet.size > 1) {
                const set = result[path] ?? (result[path] = new Set<string>())
                for (const s of canonicalSet) set.add(s)
              }
            }
            return
          }
          walk(child, [...pathParts, key])
        }
      }
      walk(selfBranch, [])
    }

    const persisted = (this.app.config as any).settings?.sourcePriorities as
      | Record<string, Array<{ sourceRef?: string }>>
      | undefined
    if (persisted) {
      for (const [path, entries] of Object.entries(persisted)) {
        if (!Array.isArray(entries)) continue
        if (path === 'notifications' || path.startsWith('notifications.')) {
          continue
        }
        // Fan-out path (sentinel `*` entry): keep the path anchored to
        // its group in the admin UI. Without this, when only one
        // source is currently emitting, the path drops below the
        // multi-source threshold and the group reconciliation pulls
        // it out into "Ungrouped path overrides". Inject every source
        // from whichever priority group already contains the live
        // publisher(s) — that produces the connected-component edges
        // computeGroups needs to keep the path in the group.
        if (
          isFanOutPriorities(
            entries as unknown as Parameters<typeof isFanOutPriorities>[0]
          )
        ) {
          const cached = cachePublishers[path]
          if (!cached || cached.size === 0) continue
          const set = result[path] ?? (result[path] = new Set<string>())
          for (const s of cached) set.add(s)
          const savedGroups = (this.app.config as any).settings
            ?.priorityGroups as Array<{ sources?: string[] }> | undefined
          if (Array.isArray(savedGroups)) {
            for (const group of savedGroups) {
              if (!Array.isArray(group?.sources)) continue
              const groupSet = new Set(group.sources)
              const overlap = [...cached].some((s) => groupSet.has(s))
              if (overlap) {
                for (const s of group.sources) set.add(canonical(s))
              }
            }
          }
          continue
        }
        if (entries.length < 2) continue
        const set = result[path] ?? (result[path] = new Set<string>())
        for (const entry of entries) {
          if (entry && typeof entry.sourceRef === 'string') {
            set.add(canonical(entry.sourceRef))
          }
        }
      }
    }

    const out: Record<string, string[]> = {}
    for (const [path, set] of Object.entries(result)) {
      out[path] = [...set].sort()
    }
    return out
  }

  getSources() {
    const signalk = new FullSignalK(this.app.selfId, this.app.selfType)

    const addDelta = signalk.addDelta.bind(signalk)
    _.values(this.sourceDeltas).forEach(addDelta)

    return signalk.retrieve().sources
  }

  buildFullFromDeltas(
    user: string,
    deltas: any[] | undefined,
    includeSources: boolean
  ) {
    const signalk = new FullSignalK(this.app.selfId, this.app.selfType)

    const addDelta = signalk.addDelta.bind(signalk)

    if (includeSources) {
      _.values(this.sourceDeltas).forEach(addDelta)
    }

    if (deltas && deltas.length) {
      const secFilter = this.app.securityStrategy.shouldFilterDeltas()
        ? (delta: any) => this.app.securityStrategy.filterReadDelta(user, delta)
        : () => true
      deltas.filter(secFilter).forEach(addDelta)
    }

    return signalk.retrieve()
  }

  private filterDeltasToPreferred(
    deltas: NormalizedDelta[]
  ): NormalizedDelta[] {
    const byPath = new Map<string, NormalizedDelta>()
    const result: NormalizedDelta[] = []
    for (const d of deltas) {
      // Defensive: getCachedDeltas(key=...) can surface non-leaf branch
      // objects when the subscription path is a parent of the actual
      // leaves. Skip anything that isn't a well-formed delta.
      if (!d || typeof d.path !== 'string') continue
      if (d.path.length === 0) {
        // Root multi-value deltas carry distinct data per source — keep all
        result.push(d)
        continue
      }
      const key = d.context + '\0' + d.path
      const preferred = this.preferredSources.get(key)
      // Without a preferred source the path has no priority enforcement
      // (group inactive, or never configured). Fan it out — let every
      // source through — so the bootstrap snapshot matches what the
      // live unfiltered stream produces.
      if (preferred === undefined) {
        result.push(d)
        continue
      }
      if (preferred === d.$source) {
        byPath.set(key, d)
      } else if (!byPath.has(key)) {
        byPath.set(key, d)
      }
    }
    return result.concat(Array.from(byPath.values()))
  }

  getCachedDeltas(
    contextFilter: ContextMatcher,
    user?: string,
    key?: string,
    sourcePolicy?: 'preferred' | 'all'
  ) {
    const contexts: Context[] = []
    _.keys(this.cache).forEach((type) => {
      _.keys(this.cache[type]).forEach((id) => {
        const context = `${type}.${id}` as Context
        if (contextFilter({ context })) {
          contexts.push(this.cache[type][id])
        }
      })
    })

    const deltas = contexts.reduce(
      (acc: NormalizedDelta[], context: Context) => {
        let deltasToProcess

        if (key) {
          deltasToProcess = _.get(context, key)
        } else {
          deltasToProcess = findDeltas(context)
        }
        if (deltasToProcess) {
          acc = acc.concat(
            _.values(
              _.pickBy(deltasToProcess, (val, akey) => {
                return akey !== 'meta'
              })
            )
          )
        }
        return acc
      },
      []
    )

    const preferred =
      sourcePolicy === 'all' ? deltas : this.filterDeltasToPreferred(deltas)

    // ISO 8601 Zulu timestamps (as produced by new Date().toISOString() in
    // handleMessage) are lexicographically sortable, so we can avoid
    // allocating two Date objects per comparison.
    preferred.sort((left, right) =>
      left.timestamp < right.timestamp
        ? -1
        : left.timestamp > right.timestamp
          ? 1
          : 0
    )

    return preferred.map(toDelta).filter((delta) => {
      return this.app.securityStrategy.filterReadDelta(user, delta)
    })
  }
}

function pathToProcessForFull(pathArray: any[]) {
  if (pathArray.length > 0 && pathArray[0] === 'sources') {
    return []
  }
  return pathArray
}

function pickDeltasFromBranch(acc: any[], obj: any) {
  if (typeof obj === 'object') {
    if (isUndefined(obj.path) || isUndefined(obj.value)) {
      // not a delta, so process possible children
      _.values(obj).reduce(pickDeltasFromBranch, acc)
    } else {
      acc.push(obj)
    }
  }
  return acc
}

function findDeltas(branchOrLeaf: any) {
  return _.values(branchOrLeaf).reduce(pickDeltasFromBranch, [])
}

function ensureHasDollarSource(normalizedDelta: NormalizedDelta): SourceRef {
  let dollarSource = normalizedDelta.$source
  if (!dollarSource) {
    dollarSource = getSourceId(normalizedDelta.source)
    normalizedDelta.$source = dollarSource
  }
  return dollarSource
}

function getLeafObject(
  start: any,
  contextAndPathParts: string[],
  createIfMissing = false,
  returnLast = false
) {
  let current = start

  for (let i = 0; i < contextAndPathParts.length; i++) {
    const p = contextAndPathParts[i]
    if (isUndefined(current[p])) {
      if (createIfMissing) {
        current[p] = {}
      } else {
        return returnLast ? current : null
      }
    }
    current = current[p]
  }
  return current
}
