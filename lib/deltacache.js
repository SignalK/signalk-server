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

const debug = require('debug')('signalk-server:deltacache')
const _ = require('lodash')
const { isUndefined } = _
const {
  getMetadata,
  getSourceId,
  FullSignalK
} = require('@signalk/signalk-schema')

const { toDelta } = require('./streambundle')

function DeltaCache (app, streambundle) {
  this.cache = {}
  this.lastModifieds = {}
  this.app = app
  this.defaults = JSON.parse(JSON.stringify(app.config.defaults || {}))
  streambundle.keys.onValue(key => {
    streambundle.getBus(key).onValue(this.onValue.bind(this))
  })
}

DeltaCache.prototype.onValue = function (msg) {
  // debug(`onValue ${JSON.stringify(msg)}`)
  const source = ensureHasDollarSource(msg)

  var parts = msg.context.split('.')
  if (msg.path.length != 0) {
    parts = parts.concat(msg.path.split('.'))
  }
  // debug(JSON.stringify(parts))
  const leaf = getLeafObject(this.cache, parts, true)

  if (msg.path.length != 0) {
    leaf[source] = msg
  } else if (msg.value) {
    _.keys(msg.value).forEach(key => {
      if (!leaf[key]) {
        leaf[key] = {}
      }
      leaf[key][source] = msg
    })
  }
  this.lastModifieds[msg.context] = Date.now()
}

DeltaCache.prototype.deleteContext = function (contextKey) {
  debug('Deleting context ' + contextKey)
  var pathParts = contextKey.split('.')
  if (pathParts.length === 2) {
    delete this.cache[pathParts[0]][pathParts[1]]
  }
}

DeltaCache.prototype.pruneContexts = function (seconds) {
  debug('pruning contexts...')
  var threshold = Date.now() - seconds * 1000
  for (let contextKey in this.lastModifieds) {
    if (this.lastModifieds[contextKey] < threshold) {
      this.deleteContext(contextKey)
      delete this.lastModifieds[contextKey]
    }
  }
}
DeltaCache.prototype.buildFull = function (user, path) {
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

  return this.buildFullFromDeltas(user, deltas)
}

DeltaCache.prototype.buildFullFromDeltas = function (user, deltas) {
  var signalk = new FullSignalK(
    this.app.selfId,
    this.app.selfType,
    JSON.parse(JSON.stringify(this.defaults))
  )

  if (deltas && deltas.length) {
    const secFilter = this.app.securityStrategy.shouldFilterDeltas()
      ? delta => this.app.securityStrategy.filterReadDelta(user, delta)
      : delta => true
    const addDelta = signalk.addDelta.bind(signalk)
    deltas.filter(secFilter).forEach(addDelta)
  }

  return signalk.retrieve()
}

function pathToProcessForFull (pathArray) {
  if (pathArray.length > 0 && pathArray[0] === 'sources') {
    return []
  }
  return pathArray
}

DeltaCache.prototype.getCachedDeltas = function (user, contextFilter, key) {
  var contexts = []
  _.keys(this.cache).forEach(type => {
    _.keys(this.cache[type]).forEach(id => {
      var context = `${type}.${id}`
      if (contextFilter({ context: context })) {
        contexts.push(this.cache[type][id])
      }
    })
  })

  var deltas = contexts.reduce((acc, context) => {
    var deltas

    if (key) {
      deltas = _.get(context, key)
    } else {
      deltas = findDeltas(context)
    }
    if (deltas) {
      // acc.push(_.reduce(deltas, ((delta, acc) => !acc ? delta : (new Date(delta.timestamp).getTime() > new Date(acc.timestamp).getTime() ? delta : acc))))
      acc = acc.concat(_.values(deltas))
    }
    return acc
  }, [])

  deltas.sort((left, right) => {
    return (
      new Date(left.timestamp).getTime() - new Date(right.timestamp).getTime()
    )
  })

  deltas = deltas.map(toDelta)

  deltas = deltas.filter(delta => {
    return this.app.securityStrategy.filterReadDelta(user, delta)
  })

  return deltas
}

function pickDeltasFromBranch (acc, obj) {
  if (isUndefined(obj.path)) {
    // not a delta, so process possible children
    _.values(obj).reduce(pickDeltasFromBranch, acc)
  } else {
    acc.push(obj)
  }
  return acc
}

function findDeltas (branchOrLeaf) {
  return _.values(branchOrLeaf).reduce(pickDeltasFromBranch, [])
}

function ensureHasDollarSource (normalizedDelta) {
  let dollarSource = normalizedDelta['$source']
  if (!dollarSource) {
    dollarSource = getSourceId(normalizedDelta.source)
    normalizedDelta['$source'] = dollarSource
  }
  return dollarSource
}

function getLeafObject (
  start,
  branchesArray,
  createIfMissing = false,
  returnLast = false
) {
  let current = start
  for (var i in branchesArray) {
    var p = branchesArray[i]
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
