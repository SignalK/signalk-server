/* eslint-disable @typescript-eslint/no-explicit-any */
/*
 * Copyright 2016, Teppo Kurki
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 */


import _ from 'lodash'
import createDebug from 'debug'
import { EventEmitter } from 'events'
const debug = createDebug('signalk:fullsignalk')
import signalkSchema from '@signalk/signalk-schema'
import { Context, Delta, SourceRef } from '@signalk/server-api'

export function getSourceId(source: any): SourceRef {
  if (!source) {
    return 'no_source' as SourceRef
  }
  if (source.canName) {
    return `${source.label}.${source.canName}` as SourceRef
  } else if (source.src) {
    return `${source.label}.${source.src}` as SourceRef
  }
  if (typeof source === 'object') {
    return source.label + (source.talker ? '.' + source.talker : '.XX') as SourceRef
  }
  //source data is actually from $source, not source: {...}
  return source
}

const mmsiPrefixLenght = 'urn:mrn:imo:mmsi:'.length
function fillIdentityField(vesselData: any, identity: any) {
  if (identity.indexOf('urn:mrn:imo') === 0) {
    vesselData.mmsi = identity.substring(mmsiPrefixLenght, identity.length)
  } else if (identity.indexOf('urn:mrn:signalk') === 0) {
    vesselData.uuid = identity
  } else {
    vesselData.url = identity
  }
}

export class FullSignalK extends EventEmitter {
  root: any
  self: any
  sources: any
  lastModifieds: any
  constructor(id: any, type: any, defaults?: any) {
    super()
    //hack, apparently not available initially, so need to set lazily

    this.root = {
      vessels: {},
      self: id,
      version: '0.1.0' // Should we read this from the package.json file?
    }
    if (id) {
      this.root.vessels[id] =
        defaults && defaults.vessels && defaults.vessels.self
          ? defaults.vessels.self
          : {}
      this.self = this.root.vessels[id]
      signalkSchema.fillIdentity(this.root)
      this.root.self = 'vessels.' + id
    }
    this.sources = {}
    this.root.sources = this.sources
    this.lastModifieds = {}
  }

  retrieve() {
    return this.root
  }

  addDelta(delta: Delta) {
    this.emit('delta', delta)
    const context = findContext(this.root, delta.context)
    this.addUpdates(context, delta.context, delta.updates)
    if (delta.context) {
      this.updateLastModified(delta.context)
    }
  }

  updateLastModified(contextKey: Context) {
    this.lastModifieds[contextKey] = new Date().getTime()
  }

  pruneContexts(seconds: any) {
    const threshold = new Date().getTime() - seconds * 1000
    for (const contextKey in this.lastModifieds) {
      if (this.lastModifieds[contextKey] < threshold) {
        this.deleteContext(contextKey)
        delete this.lastModifieds[contextKey]
      }
    }
  }

  deleteContext(contextKey: any) {
    debug('Deleting context ' + contextKey)
    const pathParts = contextKey.split('.')
    if (pathParts.length === 2) {
      delete this.root[pathParts[0]][pathParts[1]]
    }
  }

  addUpdates(context: any, contextPath: any, updates: any) {
    const len = updates.length
    for (let i = 0; i < len; ++i) {
      this.addUpdate(context, contextPath, updates[i])
    }
  }

  addUpdate(context: any, contextPath: any, update: any) {
    if (typeof update.source != 'undefined') {
      this.updateSource(context, update.source, update.timestamp)
    } else if (typeof update['$source'] != 'undefined') {
      this.updateDollarSource(context, update['$source'], update.timestamp)
    } else {
      console.error('No source in delta update:' + JSON.stringify(update))
    }
    if (update.values) {
      addValues(
        context,
        contextPath,
        update.source || update['$source'],
        update.timestamp,
        update.values
      )
    }
    if (update.meta) {
      addMetas(
        context,
        contextPath,
        update.source || update['$source'],
        update.timestamp,
        update.meta
      )
    }
  }

  updateDollarSource(context: any, dollarSource: any, timestamp: any) {
    const parts = dollarSource.split('.')
    parts.reduce((cursor: any, part: any) => {
      if (typeof cursor[part] === 'undefined') {
        return (cursor[part] = {})
      }
      return cursor[part]
    }, this.sources)
  }

  updateSource(context: any, source: any, timestamp: any) {
    if (!this.sources[source.label]) {
      this.sources[source.label] = {}
      this.sources[source.label].label = source.label
      this.sources[source.label].type = source.type
    }

    if (source.type === 'NMEA2000' || source.src) {
      handleNmea2000Source(this.sources[source.label], source, timestamp)
      return
    }

    if (source.type === 'NMEA0183' || source.sentence) {
      handleNmea0183Source(this.sources[source.label], source, timestamp)
      return
    }

    handleOtherSource(this.sources[source.label], source, timestamp)
  }
}

function findContext(root: any, contextPath: any) {
  let context = _.get(root, contextPath)
  if (!context) {
    context = {}
    _.set(root, contextPath, context)
  }
  const identity = contextPath.split('.')[1]
  if (!identity) {
    return undefined
  }
  fillIdentityField(context, identity)
  return context
}

function handleNmea2000Source(labelSource: any, source: any, timestamp: any) {
  let existing = labelSource[source.src]

  if (!existing) {
    existing = labelSource[source.src] = {
      n2k: {
        pgns: {}
      }
    }
  }

  _.assign(existing.n2k, source)
  delete existing.n2k.pgn
  delete existing.n2k.label
  delete existing.n2k.instance
  delete existing.n2k.type

  if (source.instance && !labelSource[source.src][source.instance]) {
    labelSource[source.src][source.instance] = {}
  }
  labelSource[source.src].n2k.pgns[source.pgn] = timestamp
}

function handleNmea0183Source(labelSource: any, source: any, timestamp: any) {
  const talker = source.talker || 'II'
  if (!labelSource[talker]) {
    labelSource[talker] = {
      talker: talker,
      sentences: {}
    }
  }
  labelSource[talker].sentences[source.sentence] = timestamp
}

function handleOtherSource(sourceLeaf: any, source: any, timestamp: any) {
  sourceLeaf.timestamp = timestamp
}

function addValues(
  context: any,
  contextPath: any,
  source: any,
  timestamp: any,
  pathValues: any
) {
  const len = pathValues.length
  for (let i = 0; i < len; ++i) {
    addValue(context, contextPath, source, timestamp, pathValues[i])
  }
}

function addValue(
  context: any,
  contextPath: any,
  source: any,
  timestamp: any,
  pathValue: any
) {
  let errMessage = ''
  if (_.isUndefined(pathValue.path)) {
    errMessage += 'path'
  }

  if (_.isUndefined(pathValue.value)) {
    errMessage += errMessage.length > 0 ? ' and value' : 'value'
  }

  if (errMessage.length > 0) {
    errMessage =
      'Delta is missing ' + errMessage + ' in ' + JSON.stringify(pathValue)
    errMessage += ' from source ' + JSON.stringify(source)

    console.error(errMessage)
    return
  }

  let valueLeaf
  if (pathValue.path.length === 0) {
    _.merge(context, pathValue.value)
    return
  } else {
    const splitPath = pathValue.path.split('.')
    valueLeaf = splitPath.reduce(function (
      previous: any,
      pathPart: any,
      i: number
    ) {
      if (!previous[pathPart]) {
        previous[pathPart] = {}
      }
      if (
        i === splitPath.length - 1 &&
        typeof previous[pathPart].value === 'undefined'
      ) {
        const meta = signalkSchema.internalGetMetadata(
          contextPath + '.' + pathValue.path
        )
        if (meta) {
          _.assign(meta, previous[pathPart].meta)
          previous[pathPart].meta = meta
        }
      }
      return previous[pathPart]
    },
    context)
  }

  if (valueLeaf.values) {
    //multiple values already
    const sourceId = getSourceId(source)
    if (!valueLeaf.values[sourceId]) {
      valueLeaf.values[sourceId] = {}
    }
    assignValueToLeaf(pathValue.value, valueLeaf.values[sourceId])
    valueLeaf.values[sourceId].timestamp = timestamp
    setMessage(valueLeaf.values[sourceId], source)
  } else if (
    typeof valueLeaf.value != 'undefined' &&
    valueLeaf['$source'] != getSourceId(source)
  ) {
    // first multiple value

    let sourceId = valueLeaf['$source']
    const tmp = {}
    copyLeafValueToLeaf(valueLeaf, tmp)
    valueLeaf.values = {}
    valueLeaf.values[sourceId] = tmp
    valueLeaf.values[sourceId].timestamp = valueLeaf.timestamp

    sourceId = getSourceId(source)
    valueLeaf.values[sourceId] = {}
    assignValueToLeaf(pathValue.value, valueLeaf.values[sourceId])
    valueLeaf.values[sourceId].timestamp = timestamp
    setMessage(valueLeaf.values[sourceId], source)
  }
  assignValueToLeaf(pathValue.value, valueLeaf)
  if (pathValue.path.length != 0) {
    valueLeaf['$source'] = getSourceId(source)
    valueLeaf.timestamp = timestamp
    setMessage(valueLeaf, source)
  }
}

function copyLeafValueToLeaf(fromLeaf: any, toLeaf: any) {
  _.assign(toLeaf, _.omit(fromLeaf, ['$source', 'timestamp', 'meta']))
}

function assignValueToLeaf(value: any, leaf: any) {
  leaf.value = value
}

function setMessage(leaf: any, source: any) {
  if (!source) {
    return
  }
  if (source.pgn) {
    leaf.pgn = source.pgn
    delete leaf.sentence
  }
  if (source.sentence) {
    leaf.sentence = source.sentence
    delete leaf.pgn
  }
}

function addMetas(
  context: any,
  contextPath: any,
  source: any,
  timestamp: any,
  metas: any
) {
  metas.forEach((metaPathValue: any) =>
    addMeta(context, contextPath, source, timestamp, metaPathValue)
  )
}

function addMeta(
  context: any,
  contextPath: any,
  source: any,
  timestamp: any,
  pathValue: any
) {
  if (_.isUndefined(pathValue.path) || _.isUndefined(pathValue.value)) {
    console.error('Illegal value in delta:' + JSON.stringify(pathValue))
    return
  }
  signalkSchema.addMetaData(contextPath, pathValue.path, pathValue.value)
}

module.exports = FullSignalK
