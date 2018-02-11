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
const {
  getMetadata,
  getSourceId,
  FullSignalK
} = require('@signalk/signalk-schema')
function DeltaCache (app, streambundle) {
  this.cache = {}
  this.app = app
  this.defaults = JSON.parse(JSON.stringify(app.config.defaults))
  streambundle.keys.onValue(key => {
    streambundle
      .getBus(key)
      .debounceImmediate(20)
      .onValue(this.onValue.bind(this))
  })
}

DeltaCache.prototype.onValue = function (msg) {
  // debug(`onValue ${JSON.stringify(msg)}`)
  var source = msg['$source']
  if (!source) {
    source = getSourceId(msg.source)
    msg['$source'] = source
  }

  var parts = msg.context.split('.').concat(msg.path.split('.'))

  // debug(JSON.stringify(parts))

  var last = this.cache
  for (var i in parts) {
    var p = parts[i]

    if (typeof last[p] === 'undefined') {
      last[p] = {}
    }
    last = last[p]
  }

  last[source] = msg
}

DeltaCache.prototype.buildFull = function (user, path) {
  var last = this.cache

  for (var i in path) {
    var p = path[i]

    if (typeof last[p] !== 'undefined') {
      last = last[p]
    } else {
      last = null
      break
    }
  }

  var signalk = (signalk = new FullSignalK(
    this.app.selfId,
    this.app.selfType,
    this.defaults
  ))

  var deltas

  if (last) {
    deltas = findDeltas(last).map(toDelta)

    if (this.app.securityStrategy) {
      deltas = deltas.filter(delta => {
        return this.app.securityStrategy.filterReadDelta(user, delta)
      })
    }

    deltas.forEach(signalk.addDelta.bind(signalk))
  }

  return signalk.retrieve()
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

  var deltas = contexts
    .reduce((acc, context) => {
      var deltas

      if (key) {
        deltas = _.get(context, key)
      } else {
        deltas = findDeltas(context)
      }
      if (deltas) {
        // acc.push(_.reduce(deltas, ((delta, acc) => !acc ? delta : (new Date(delta.timestamp).getTime() > new Date(acc.timestamp).getTime() ? delta : acc))))
        acc = acc.concat(deltas)
      }
      return acc
    }, [])
    .map(toDelta)

  deltas.sort((left, right) => {
    return new Date(left.timestamp).getTime() - new Date(right).getTime()
  })

  if (this.app.securityStrategy) {
    deltas = deltas.filter(delta => {
      return this.app.securityStrategy.filterReadDelta(user, delta)
    })
  }
  return deltas
}

function findDeltas (map) {
  var all = []

  function reducer (acc, obj) {
    if (!_.isUndefined(obj.path)) {
      acc.push(obj)
    } else {
      _.reduce(_.values(obj), reducer, acc)
    }
    return acc
  }

  _.reduce(_.values(map), reducer, all)
  return all
}

function toDelta (normalizedDeltaData) {
  return {
    context: normalizedDeltaData.context,
    updates: [
      {
        source: normalizedDeltaData.source,
        $source: normalizedDeltaData['$source'],
        timestamp: normalizedDeltaData.timestamp,
        values: [
          {
            path: normalizedDeltaData.path,
            value: normalizedDeltaData.value
          }
        ]
      }
    ]
  }
}

module.exports = DeltaCache
