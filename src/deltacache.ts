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
import { toDelta } from './streambundle'
import { ContextMatcher, SignalKServer, StreamBundle } from './types'
import { Context, NormalizedDelta, SourceRef } from '@signalk/server-api'

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

  constructor(app: SignalKServer, streambundle: StreamBundle) {
    this.app = app
    streambundle.keys.onValue((key) => {
      streambundle.getBus(key).onValue(this.onValue.bind(this))
    })

    // String.split() is heavy enough and called frequently enough
    // to warrant caching the result. Has a noticeable effect
    // on throughput of a server going full blast with the n2k
    // sample data and the memory hit is negligible. The cache
    // must be pruned, or AIS vessel data will stick forever.
    // No fancy pruning, just clear & let it recreate.
    setInterval(() => (this.cachedContextPaths = {}), 5 * 60 * 1000)
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

  setSourceDelta(key: string, delta: any) {
    this.sourceDeltas[key] = delta
    this.app.signalk.addDelta(delta)
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

  getCachedDeltas(contextFilter: ContextMatcher, user?: string, key?: string) {
    const contexts: Context[] = []
    _.keys(this.cache).forEach((type) => {
      _.keys(this.cache[type]).forEach((id) => {
        const context = `${type}.${id}` as Context
        if (contextFilter({ context })) {
          contexts.push(this.cache[type][id])
        }
      })
    })

    let deltas = contexts.reduce((acc: any[], context: Context) => {
      let deltasToProcess

      if (key) {
        deltasToProcess = _.get(context, key)
      } else {
        deltasToProcess = findDeltas(context)
      }
      if (deltasToProcess) {
        // acc.push(_.reduce(deltas, ((delta, acc) => !acc ? delta : (new Date(delta.timestamp).getTime() > new Date(acc.timestamp).getTime() ? delta : acc))))
        acc = acc.concat(
          _.values(
            _.pickBy(deltasToProcess, (val, akey) => {
              return akey !== 'meta'
            })
          )
        )
      }
      return acc
    }, [])

    deltas.sort((left: any, right: any) => {
      return (
        new Date(left.timestamp).getTime() - new Date(right.timestamp).getTime()
      )
    })

    deltas = deltas.map(toDelta)

    deltas = deltas.filter((delta: any) => {
      return this.app.securityStrategy.filterReadDelta(user, delta)
    })

    return deltas
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

module.exports = DeltaCache
