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
 */

import { EventEmitter } from 'events'
import { getSourceId, fillIdentity, fillIdentityField } from './sourceutil'
import { metadataRegistry } from '@signalk/path-metadata'

/** @hidden */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyObject = Record<string, any>

export interface SourceMetaEntry {
  lastSeen: number
  pgnInstances?: Record<string, number[]>
}

function handleNmea2000Source(
  labelSource: AnyObject,
  source: AnyObject,
  timestamp: string,
  meta: SourceMetaEntry
): void {
  let existing = labelSource[source.src]
  if (!existing) {
    existing = labelSource[source.src] = { n2k: { pgns: {} } }
  }

  Object.assign(existing.n2k, source)
  delete existing.n2k.pgn
  delete existing.n2k.label
  delete existing.n2k.instance
  delete existing.n2k.type

  if (
    source.instance !== undefined &&
    source.instance !== null &&
    !labelSource[source.src][source.instance]
  ) {
    labelSource[source.src][source.instance] = {}
  }
  existing.n2k.pgns[source.pgn] = timestamp
  meta.lastSeen = Date.now()

  if (source.instance !== undefined && source.instance !== null) {
    const instanceNum = Number(source.instance)
    if (!Number.isNaN(instanceNum)) {
      if (!meta.pgnInstances) meta.pgnInstances = {}
      const list = meta.pgnInstances[source.pgn]
      if (!list) {
        meta.pgnInstances[source.pgn] = [instanceNum]
      } else if (!list.includes(instanceNum)) {
        list.push(instanceNum)
      }
    }
  }
}

function handleNmea0183Source(
  labelSource: AnyObject,
  source: AnyObject,
  timestamp: string,
  meta: SourceMetaEntry
): void {
  const talker = source.talker || 'XX'
  if (!labelSource[talker]) {
    labelSource[talker] = { talker, sentences: {} }
  }
  labelSource[talker].sentences[source.sentence] = timestamp
  meta.lastSeen = Date.now()
}

function handleOtherSource(
  sourceLeaf: AnyObject,
  _source: AnyObject,
  timestamp: string,
  meta: SourceMetaEntry
): void {
  sourceLeaf.timestamp = timestamp
  meta.lastSeen = Date.now()
}

function setMessage(leaf: AnyObject, source: AnyObject | string): void {
  if (!source || typeof source === 'string') return
  if (source.pgn) {
    leaf.pgn = source.pgn
    delete leaf.sentence
  }
  if (source.sentence) {
    leaf.sentence = source.sentence
    delete leaf.pgn
  }
}

function assignValueToLeaf(value: unknown, leaf: AnyObject): void {
  leaf.value = value
}

function copyLeafValueToLeaf(fromLeaf: AnyObject, toLeaf: AnyObject): void {
  for (const key of Object.keys(fromLeaf)) {
    if (key !== '$source' && key !== 'timestamp' && key !== 'meta') {
      toLeaf[key] = fromLeaf[key]
    }
  }
}

function getNestedValue(obj: AnyObject, dotPath: string): unknown {
  const parts = dotPath.split('.')
  let cursor: unknown = obj
  for (const part of parts) {
    if (cursor === null || cursor === undefined || typeof cursor !== 'object')
      return undefined
    cursor = (cursor as AnyObject)[part]
  }
  return cursor
}

function setNestedValue(obj: AnyObject, dotPath: string, value: unknown): void {
  const parts = dotPath.split('.')
  let cursor: AnyObject = obj
  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i]!
    if (
      cursor[part] === null ||
      cursor[part] === undefined ||
      typeof cursor[part] !== 'object'
    ) {
      cursor[part] = {}
    }
    cursor = cursor[part]
  }
  cursor[parts[parts.length - 1]!] = value
}

function findContext(
  root: AnyObject,
  contextPath: string
): AnyObject | undefined {
  // Reject contexts without an identity segment up front. Otherwise
  // the setNestedValue below would seed an empty entry like
  // root.vessels = {} that no caller can ever reach via a normal
  // identity-prefixed lookup, leaving an orphan key in the tree.
  const identity = contextPath.split('.')[1]
  if (!identity) {
    return undefined
  }
  let context = getNestedValue(root, contextPath) as AnyObject | undefined
  if (!context) {
    context = {}
    setNestedValue(root, contextPath, context)
  }
  fillIdentityField(context, identity)
  return context
}

function addValue(
  context: AnyObject,
  contextPath: string,
  source: AnyObject | string,
  timestamp: string,
  pathValue: AnyObject
): void {
  let errMessage = ''
  if (pathValue.path === undefined) {
    errMessage += 'path'
  }
  if (pathValue.value === undefined) {
    errMessage += errMessage.length > 0 ? ' and value' : 'value'
  }
  if (errMessage.length > 0) {
    errMessage =
      'Delta is missing ' +
      errMessage +
      ' in ' +
      JSON.stringify(pathValue) +
      ' from source ' +
      JSON.stringify(source)
    console.error(errMessage)
    return
  }

  let valueLeaf: AnyObject
  if (pathValue.path.length === 0) {
    Object.assign(context, pathValue.value)
    return
  } else {
    const splitPath: string[] = pathValue.path.split('.')
    valueLeaf = splitPath.reduce(
      (previous: AnyObject, pathPart: string, i: number) => {
        if (!previous[pathPart]) {
          previous[pathPart] = {}
        }
        if (
          i === splitPath.length - 1 &&
          previous[pathPart].value === undefined
        ) {
          const meta = metadataRegistry.internalGetMetadata(
            contextPath + '.' + pathValue.path
          )
          if (meta) {
            // Non-mutating merge: spec metadata as the base, leaf's
            // existing meta wins on conflicts. Mutating `meta` in place
            // would leak the leaf's runtime meta back into the shared
            // registry entry, polluting every other path that resolves
            // through the same wildcard.
            previous[pathPart].meta = {
              ...meta,
              ...previous[pathPart].meta
            }
          }
        }
        return previous[pathPart]
      },
      context
    )
  }

  const sourceId = getSourceId(source)

  if (valueLeaf.values) {
    // multiple values already
    if (!valueLeaf.values[sourceId]) {
      valueLeaf.values[sourceId] = {}
    }
    assignValueToLeaf(pathValue.value, valueLeaf.values[sourceId])
    valueLeaf.values[sourceId].timestamp = timestamp
    setMessage(valueLeaf.values[sourceId], source)
  } else if (
    valueLeaf.value !== undefined &&
    valueLeaf['$source'] !== sourceId
  ) {
    // first multiple value
    const existingSourceId = valueLeaf['$source']
    const tmp: AnyObject = {}
    copyLeafValueToLeaf(valueLeaf, tmp)
    valueLeaf.values = {}
    valueLeaf.values[existingSourceId] = tmp
    valueLeaf.values[existingSourceId].timestamp = valueLeaf.timestamp

    valueLeaf.values[sourceId] = {}
    assignValueToLeaf(pathValue.value, valueLeaf.values[sourceId])
    valueLeaf.values[sourceId].timestamp = timestamp
    setMessage(valueLeaf.values[sourceId], source)
  }

  assignValueToLeaf(pathValue.value, valueLeaf)
  if (pathValue.path.length !== 0) {
    valueLeaf['$source'] = sourceId
    valueLeaf.timestamp = timestamp
    setMessage(valueLeaf, source)
  }
}

function addValues(
  context: AnyObject,
  contextPath: string,
  source: AnyObject | string,
  timestamp: string,
  pathValues: AnyObject[]
): void {
  for (const pv of pathValues) {
    addValue(context, contextPath, source, timestamp, pv)
  }
}

function addMeta(
  _context: AnyObject,
  contextPath: string,
  _source: AnyObject | string,
  _timestamp: string,
  pathValue: AnyObject
): void {
  if (pathValue.path === undefined || pathValue.value === undefined) {
    console.error('Illegal value in delta:' + JSON.stringify(pathValue))
    return
  }
  metadataRegistry.addMetaData(contextPath, pathValue.path, pathValue.value)
}

function addMetas(
  context: AnyObject,
  contextPath: string,
  source: AnyObject | string,
  timestamp: string,
  metas: AnyObject[]
): void {
  for (const meta of metas) {
    addMeta(context, contextPath, source, timestamp, meta)
  }
}

export class FullSignalK extends EventEmitter {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  root: Record<string, any>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  self: Record<string, any> | undefined
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sources: Record<string, any>
  lastModifieds: Record<string, number>
  /**
   * Per-source freshness data. Kept off the `sources` tree so that
   * `retrieve()` continues to satisfy the Signal K spec schema
   * (which bans unknown properties under `sources.*.*.n2k`).
   *
   * Key format: `${source.label}.${source.src}` for N2K,
   * `${source.label}.${source.talker || 'XX'}` for NMEA 0183, and
   * `${source.label}` for other sources.
   */
  sourceMeta: Record<string, SourceMetaEntry>

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(id?: string, _type?: string, defaults?: any) {
    super()
    this.root = {
      vessels: {},
      self: id,
      version: '0.1.0'
    }
    if (id) {
      this.root.vessels[id] = defaults?.vessels?.self
        ? defaults.vessels.self
        : {}
      this.self = this.root.vessels[id]
      fillIdentity(this.root)
      this.root.self = 'vessels.' + id
    }
    this.sources = {}
    this.root.sources = this.sources
    this.lastModifieds = {}
    this.sourceMeta = {}
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  retrieve(): Record<string, any> {
    return this.root
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  addDelta(delta: Record<string, any>): void {
    this.emit('delta', delta)
    const context = findContext(this.root, delta.context)
    if (context) {
      this.addUpdates(context, delta.context, delta.updates)
      this.updateLastModified(delta.context)
    }
  }

  updateLastModified(contextKey: string): void {
    this.lastModifieds[contextKey] = Date.now()
  }

  pruneContexts(seconds: number): void {
    const threshold = Date.now() - seconds * 1000
    for (const contextKey of Object.keys(this.lastModifieds)) {
      if ((this.lastModifieds[contextKey] ?? 0) < threshold) {
        this.deleteContext(contextKey)
        delete this.lastModifieds[contextKey]
      }
    }
  }

  deleteContext(contextKey: string): void {
    const pathParts = contextKey.split('.')
    if (pathParts.length === 2) {
      const container = this.root[pathParts[0]!]
      if (container && typeof container === 'object') {
        delete container[pathParts[1]!]
      }
    }
  }

  private addUpdates(
    context: AnyObject,
    contextPath: string,
    updates: AnyObject[]
  ): void {
    for (const update of updates) {
      this.addUpdate(context, contextPath, update)
    }
  }

  private addUpdate(
    context: AnyObject,
    contextPath: string,
    update: AnyObject
  ): void {
    if (update.source !== undefined) {
      this.updateSource(update.source, update.timestamp)
    }
    if (update['$source'] !== undefined) {
      // Stamp the $source-keyed meta even when a structured `source`
      // object is also present. Remote upstream Signal K servers can
      // alternate between the two shapes on reconnect, leaving a
      // sourceRef-keyed entry stale forever while a label-keyed twin
      // ages out — sources end up stuck Offline in priority lists.
      // Both keys point to independent freshness records so either
      // lookup hits.
      if (update.source === undefined) {
        this.updateDollarSource(update['$source'])
      }
      const metaKey = update['$source'] as string
      let meta = this.sourceMeta[metaKey]
      if (!meta) {
        meta = this.sourceMeta[metaKey] = { lastSeen: 0 }
      }
      meta.lastSeen = Date.now()
    } else if (update.source === undefined) {
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

  private updateDollarSource(dollarSource: string): void {
    // Dollar-source strings usually split cleanly on dots into a small
    // nested tree (e.g. "N2000-01.37" → sources["N2000-01"]["37"],
    // "i2c-0.0x48.volts" → sources["i2c-0"]["0x48"]["volts"]). That
    // works as long as every segment is schema-conformant.
    //
    // Providers whose id itself contains dots — a bad habit but users
    // do it, e.g. "ws-pi4.local:3000 (192.168.0.125)" — break the naive
    // split: a suffix "local:3000 (192.168.0.125).pi4.local:3000" would
    // be carved into phantom keys like sources["ws-pi4"]["local:3000 (192"].
    // Detect an illegal first segment and keep everything after the
    // first dot as one opaque suffix key.
    const SCHEMA_OK = /^[A-Za-z0-9\-_]+$/
    const firstDot = dollarSource.indexOf('.')
    if (firstDot === -1) {
      if (this.sources[dollarSource] === undefined) {
        this.sources[dollarSource] = {}
      }
      return
    }
    const label = dollarSource.slice(0, firstDot)
    const suffix = dollarSource.slice(firstDot + 1)
    if (this.sources[label] === undefined) {
      this.sources[label] = {}
    }
    if (SCHEMA_OK.test(label) && SCHEMA_OK.test(suffix.split('.')[0]!)) {
      // Legacy nested-tree behaviour, safe when all segments are plain.
      const rest = suffix.split('.')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      rest.reduce((cursor: any, part: string) => {
        if (cursor[part] === undefined) {
          cursor[part] = {}
        }
        return cursor[part]
      }, this.sources[label])
      return
    }
    if (this.sources[label][suffix] === undefined) {
      this.sources[label][suffix] = {}
    }
  }

  private updateSource(source: AnyObject, timestamp: string): void {
    if (!this.sources[source.label]) {
      this.sources[source.label] = {}
      this.sources[source.label].label = source.label
      this.sources[source.label].type = source.type
    }

    // Key meta by the canonical $source form so that downstream
    // consumers (SOURCESTATUS, multiSourcePaths) can look it up by the
    // same string they see in `$source`. Without this, an N2K provider
    // with useCanName: true emits deltas with $source = "label.canName"
    // but meta would be keyed by "label.src" (numeric address), so
    // sourceStatus lookups would always miss and badge every source
    // Offline.
    const metaKey = getSourceId(source) as string

    if (
      source.type === 'NMEA2000' ||
      (source.src !== undefined && source.src !== null)
    ) {
      let meta = this.sourceMeta[metaKey]
      if (!meta) {
        meta = this.sourceMeta[metaKey] = { lastSeen: 0 }
      }
      handleNmea2000Source(this.sources[source.label], source, timestamp, meta)
      return
    }

    if (source.type === 'NMEA0183' || source.sentence) {
      let meta = this.sourceMeta[metaKey]
      if (!meta) {
        meta = this.sourceMeta[metaKey] = { lastSeen: 0 }
      }
      handleNmea0183Source(this.sources[source.label], source, timestamp, meta)
      return
    }

    let otherMeta = this.sourceMeta[metaKey]
    if (!otherMeta) {
      otherMeta = this.sourceMeta[metaKey] = { lastSeen: 0 }
    }
    handleOtherSource(this.sources[source.label], source, timestamp, otherMeta)
  }
}
