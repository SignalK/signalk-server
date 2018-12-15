/*
 * Copyright 2016 Teppo Kurki <teppo.kurki@iki.fi>
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

var Bacon = require('baconjs')
const _ = require('lodash')
const isUndefined = _.isUndefined

function StreamBundle (selfId) {
  this.selfContext = 'vessels.' + selfId
  this.buses = {}
  this.selfBuses = {}
  this.streams = {}
  this.keys = new Bacon.Bus()
  this.availableSelfPaths = []
}

StreamBundle.prototype.pushDelta = function (delta) {
  try {
    if (delta.updates) {
      delta.updates.forEach(update => {
        if (update.values) {
          update.values.forEach(pathValue => {
            var paths =
              pathValue.path === ''
                ? getPathsFromObjectValue(pathValue.value)
                : [pathValue.path]
            /*
            For values with empty path and object value we enumerate all the paths in the object
            and push the original delta's value to all those buses, so that subscriptionmanager
            can track hits also for paths of naked values (no path, just object value) and when
            regenerating the outgoing delta will use the unmodified, original delta pathvalue.
          */
            paths.forEach(path => {
              this.push(path, {
                path: pathValue.path,
                value: pathValue.value,
                context: delta.context,
                source: update.source,
                $source: update.$source,
                timestamp: update.timestamp,
                key: getPathWithSourceId(pathValue.path, update.$source)
              })
            })
          }, this)
        }
      }, this)
    }
  } catch (e) {
    console.error(e)
  }
}

function getPathsFromObjectValue (objectValue) {
  return Object.keys(objectValue).reduce((acc, propName) => {
    const propValue = objectValue[propName]
    if (_.isObject(propValue)) {
      accumulatePathsFromValues(acc, propName + '.', propValue)
    } else {
      acc.push(propName)
    }
    return acc
  }, [])
}

function accumulatePathsFromValues (acc, prefix, objectValue) {
  Object.keys(objectValue).forEach(propName => {
    const propValue = objectValue[propName]
    if (_.isObject(propValue)) {
      accumulatePathsFromValues(acc, `${prefix}.${propName}`, propValue)
    }
  })
}

StreamBundle.prototype.push = function (path, pathValueWithSourceAndContext) {
  if (this.availableSelfPaths.indexOf(path) == -1) {
    this.availableSelfPaths.push(path)
  }
  this.getBus(path).push(pathValueWithSourceAndContext)
  if (pathValueWithSourceAndContext.context === this.selfContext) {
    this.getSelfBusByKey(path).push(pathValueWithSourceAndContext)
    this.getSelfBusByKey(pathValueWithSourceAndContext.key).push(
      pathValueWithSourceAndContext
    )
    this.getSelfStreamByKey(path).push(pathValueWithSourceAndContext.value)
    this.getSelfStreamByKey(pathValueWithSourceAndContext.key).push(
      pathValueWithSourceAndContext.value
    )
  }
}

StreamBundle.prototype.getBus = function (path) {
  var result = this.buses[path]
  if (!result) {
    result = this.buses[path] = new Bacon.Bus()
    this.keys.push(path)
  }
  return result
}

StreamBundle.prototype.getSelfStream = function (path, sourceId = undefined) {
  return getSelfStreamByKey(getPathWithSourceId(path, sourceId))
}

StreamBundle.prototype.getSelfStreamByKey = function (pathWithSourceId) {
  return (
    this.streams[pathWithSourceId] ||
    (this.streams[pathWithSourceId] = new Bacon.Bus())
  )
}

StreamBundle.prototype.getSelfBus = function (path, sourceId = undefined) {
  return this.getSelfBusByKey(getPathWithSourceId(path, sourceId))
}

StreamBundle.prototype.getSelfBusByKey = function (pathWithSourceId) {
  return (
    this.selfBuses[pathWithSourceId] ||
    (this.selfBuses[pathWithSourceId] = new Bacon.Bus())
  )
}

StreamBundle.prototype.getAvailablePaths = function () {
  return this.availableSelfPaths
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

const getPathWithSourceId = (path, sourceId) =>
  path + (isUndefined(sourceId) ? '' : `.${sourceId}`)

module.exports = { StreamBundle, toDelta }
