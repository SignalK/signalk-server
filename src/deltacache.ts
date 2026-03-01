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
import { FullSignalK, getSourceId } from '@signalk/signalk-schema'
import _, { isUndefined } from 'lodash'
import { readFileSync, writeFile } from 'fs'
import { join } from 'path'
import { toDelta, StreamBundle } from './streambundle'
import { ContextMatcher, SignalKServer } from './types'
import { Context, NormalizedDelta, SourceRef } from '@signalk/server-api'

const SOURCES_CACHE_FILE = 'sources-cache.json'

interface StringKeyed {
  [key: string]: any
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

  constructor(app: SignalKServer, streambundle: StreamBundle) {
    this.app = app
    streambundle.keys.onValue((key) => {
      streambundle.getBus(key).onValue(this.onValue.bind(this))
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
      this.preferredSources.set(msg.context + '\0' + msg.path, sourceRef)
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
   * MULTISOURCEPATHS so the UI reflects the change.
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
    for (const [key, ref] of this.preferredSources) {
      if (ref === sourceRef) this.preferredSources.delete(key)
    }
    this.emitMultiSourcePaths()
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
   */
  getMultiSourcePaths(): Record<string, string[]> {
    const selfParts = this.app.selfContext.split('.')
    let selfBranch = this.cache
    for (const part of selfParts) {
      if (!selfBranch || !selfBranch[part]) return {}
      selfBranch = selfBranch[part]
    }

    const result: Record<string, string[]> = {}
    const walk = (node: any, pathParts: string[]) => {
      for (const key of Object.keys(node)) {
        if (key === 'meta') continue
        const child = node[key]
        if (!child || typeof child !== 'object') continue
        // Check if child is a leaf (NormalizedDelta) by looking for path+value
        if (child.path !== undefined && child.value !== undefined) {
          // This is a delta value at the parent level — parent is a leaf node
          // Collect all sourceRef keys from the parent
          const sources = Object.keys(node).filter((k) => {
            const v = node[k]
            return (
              v &&
              typeof v === 'object' &&
              v.path !== undefined &&
              v.value !== undefined
            )
          })
          if (sources.length > 1) {
            result[pathParts.join('.')] = sources
          }
          return // Don't recurse into delta objects
        }
        walk(child, [...pathParts, key])
      }
    }
    walk(selfBranch, [])
    return result
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
      if (d.path.length === 0) {
        result.push(d)
        continue
      }
      const key = d.context + '\0' + d.path
      const preferred = this.preferredSources.get(key)
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

    preferred.sort((left, right) => {
      return (
        new Date(left.timestamp).getTime() - new Date(right.timestamp).getTime()
      )
    })

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
