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

  msg.meta = getMetadata(`${msg.context}.${msg.path}`)

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

  /*
  var type = contextParts[0]

  var context = this.cache[type][contextParts[1]]
  if ( ! context ) {
    context = {}
    this.cache[type][contextParts[1]] = context
  }

  var path = context[msg.path]
  if ( !path ) {
    path = {}
    context[msg.path] = path
  }

  path[source] = msg
  */

  // debug(JSON.stringify(this.cache, null, 2))
}

DeltaCache.prototype.buildFull = function (req, path) {
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
        return this.app.securityStrategy.filterReadDelta(req, delta)
      })
    }

    deltas.forEach(signalk.addDelta.bind(signalk))
  }

  // debug(`normalizedDeltas ${JSON.stringify(normalizedDeltas)}`)
  // debug(`fuil ${JSON.stringify(signalk.retrieve(), null, 2)}`)
  return signalk.retrieve()
}

function findDeltas (map) {
  var all = []

  function reducer (acc, obj) {
    if (obj.path) {
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
