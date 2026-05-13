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

import {
  StreamBundle as IStreamBundle,
  Delta,
  NormalizedDelta,
  Path,
  Update,
  Value,
  NormalizedMetaDelta
} from '@signalk/server-api'
import * as Bacon from 'baconjs'

export class StreamBundle implements IStreamBundle {
  selfContext: string
  buses: { [key: Path]: Bacon.Bus<NormalizedDelta> }
  allPathsBus: Bacon.Bus<NormalizedDelta>
  selfBuses: Record<Path, Bacon.Bus<NormalizedDelta>>
  selfAllPathsBus: Bacon.Bus<NormalizedDelta>
  selfStreams: Record<Path, Bacon.Bus<Value>>
  selfAllPathsStream: Bacon.Bus<Value>
  keys: Bacon.Bus<Path>
  availableSelfPaths: { [key: Path]: true }
  metaBus: Bacon.Bus<NormalizedMetaDelta>
  selfMetaBus: Bacon.Bus<NormalizedMetaDelta>

  constructor(selfId: string) {
    this.selfContext = 'vessels.' + selfId
    this.buses = {}
    this.allPathsBus = new Bacon.Bus()
    this.selfBuses = {}
    this.selfAllPathsBus = new Bacon.Bus()
    this.selfStreams = {}
    this.selfAllPathsStream = new Bacon.Bus()
    this.keys = new Bacon.Bus()
    this.availableSelfPaths = {}
    this.metaBus = new Bacon.Bus()
    this.selfMetaBus = new Bacon.Bus()
  }

  pushDelta(delta: Delta) {
    try {
      if (delta.updates) {
        delta.updates.forEach((update) => {
          const base = {
            context: delta.context!, // TSTODO: make optional/required match
            source: update.source,
            $source: update.$source!, // TSTODO: make optional/required match
            timestamp: update.timestamp! // TSTODO: make optional/required match
          }

          if ('meta' in update) {
            update.meta.forEach((meta) => {
              this.push(meta.path, {
                ...base,
                path: meta.path,
                value: meta.value,
                isMeta: true
              })
            })
          }

          if ('values' in update) {
            update.values.forEach((pathValue) => {
              this.push(pathValue.path, {
                ...base,
                path: pathValue.path,
                value: pathValue.value,
                isMeta: false
              })
            })
          }
        })
      }
    } catch (e) {
      console.error(e)
    }
  }

  push(path: Path, normalizedDelta: NormalizedDelta) {
    const { isMeta } = normalizedDelta
    const isSelf = normalizedDelta.context === this.selfContext
    if (isMeta) {
      this.metaBus.push(normalizedDelta)
      if (isSelf) {
        this.selfMetaBus.push(normalizedDelta)
      }
    }
    if (!this.availableSelfPaths[path]) {
      this.availableSelfPaths[path] = true
    }
    this.getBus().push(normalizedDelta)
    this.getBus(path).push(normalizedDelta)
    if (isSelf) {
      this.getSelfBus().push(normalizedDelta)
      this.getSelfBus(path).push(normalizedDelta)
      if (!isMeta) {
        this.getSelfStream().push(normalizedDelta.value)
        this.getSelfStream(path).push(normalizedDelta.value)
      }
    }
  }

  getMetaBus() {
    return this.metaBus
  }

  getSelfMetaBus() {
    return this.selfMetaBus
  }

  getBus(path?: Path) {
    if (path !== undefined) {
      let result = this.buses[path]
      if (!result) {
        result = this.buses[path] = new Bacon.Bus()
        this.keys.push(path)
      }
      return result
    } else {
      return this.allPathsBus
    }
  }

  getSelfStream(path?: Path) {
    if (path !== undefined) {
      let result = this.selfStreams[path]
      if (!result) {
        result = this.selfStreams[path] = new Bacon.Bus()
      }
      return result
    } else {
      return this.selfAllPathsStream
    }
  }

  getSelfBus(path?: Path) {
    if (path !== undefined) {
      let result = this.selfBuses[path]
      if (!result) {
        result = this.selfBuses[path] = new Bacon.Bus()
      }
      return result
    } else {
      return this.selfAllPathsBus
    }
  }

  getAvailablePaths() {
    return Object.keys(this.availableSelfPaths) as Path[]
  }
}

// The same NormalizedDelta is fanned out to multiple Bacon buses (allPathsBus,
// the path-specific bus, the self equivalents) and from there to N subscriber
// chains, each with its own .map(toDelta). Caching the produced Delta on the
// source object lets all subscribers for one push share one allocation.
//
// The cached Delta is shared by reference across every subscriber for the
// push, including third-party plugin callbacks. We freeze it (and the inner
// Update / values / meta arrays + their single entry) so any consumer that
// tries to mutate the structural wrapper throws loudly instead of silently
// corrupting other subscribers' view. The leaf `value` and `source`
// references are left thawed: both are owned by the upstream delta, not by
// toDelta. `source` in particular is shared with every NormalizedDelta built
// from the same upstream Update (via the `base` object in pushDelta) and
// freezing it would freeze the upstream layer's own object. The
// no-mutation contract for the cached Delta extends to these leaves.
const cachedDeltaSlot = Symbol('toDeltaCache')

interface MemoizedDelta {
  [cachedDeltaSlot]?: Delta
}

export function toDelta(normalizedDeltaData: NormalizedDelta): Delta {
  const cached = (normalizedDeltaData as MemoizedDelta)[cachedDeltaSlot]
  if (cached !== undefined) {
    return cached
  }

  const type = normalizedDeltaData.isMeta ? 'meta' : 'values'
  const entry = Object.freeze({
    path: normalizedDeltaData.path,
    value: normalizedDeltaData.value
  })
  const items = Object.freeze([entry])
  const update = Object.freeze({
    source: normalizedDeltaData.source,
    $source: normalizedDeltaData.$source,
    timestamp: normalizedDeltaData.timestamp,
    [type]: items
  }) as Update

  const delta: Delta = Object.freeze({
    context: normalizedDeltaData.context,
    updates: Object.freeze([update]) as Update[]
  })
  // Non-enumerable so a future `{...nd}` or `Object.assign({}, nd)` on the
  // NormalizedDelta does not carry the cached Delta into the copy.
  Object.defineProperty(normalizedDeltaData, cachedDeltaSlot, {
    value: delta,
    writable: true,
    configurable: true,
    enumerable: false
  })
  return delta
}
