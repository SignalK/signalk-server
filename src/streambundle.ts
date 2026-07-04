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
  PathValue,
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
  unfilteredBuses: { [key: Path]: Bacon.Bus<NormalizedDelta> }
  unfilteredAllPathsBus: Bacon.Bus<NormalizedDelta>

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
    this.unfilteredBuses = {}
    this.unfilteredAllPathsBus = new Bacon.Bus()
  }

  pushDelta(delta: Delta) {
    try {
      if (!delta.updates) {
        return
      }
      // TSTODO: the ! coercions below cover optional fields that are required
      // here; tighten the Delta types when possible.
      const context = delta.context!
      for (const update of delta.updates) {
        const source = update.source
        const $source = update.$source!
        const timestamp = update.timestamp!

        if ('meta' in update) {
          for (const meta of update.meta) {
            // Build the NormalizedDelta in its final shape with a stable key
            // order across both branches so V8 can reuse one hidden class.
            this.push(meta.path, {
              context,
              source,
              $source,
              timestamp,
              path: meta.path,
              value: meta.value,
              isMeta: true
            })
          }
        }

        if ('values' in update) {
          for (const pathValue of update.values) {
            this.push(pathValue.path, {
              context,
              source,
              $source,
              timestamp,
              path: pathValue.path,
              value: pathValue.value,
              state: pathValue.state,
              isMeta: false
            })
          }
        }
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
    this.getBus().push(normalizedDelta)
    this.getBus(path).push(normalizedDelta)
    if (isSelf) {
      this.getSelfBus().push(normalizedDelta)
      this.getSelfBus(path).push(normalizedDelta)
      if (!isMeta) {
        // Record a path only once we have seen a real value for it on the
        // self vessel. Plugins sometimes pre-register meta templates for a
        // whole schema (e.g. the Weather provider schema); including those
        // here polluted getAvailablePaths() with entries the user's vessel
        // is not actually reporting.
        if (!this.availableSelfPaths[path]) {
          this.availableSelfPaths[path] = true
        }
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

  pushUnfilteredDelta(delta: Delta) {
    try {
      if (!delta.updates) {
        return
      }
      // Same hot-path shape as pushDelta: hoist context, drop the base
      // spread, write all seven NormalizedDelta keys in one literal so
      // V8 reuses a single hidden class on the per-value fan-out.
      const context = delta.context!
      for (const update of delta.updates) {
        if (!('values' in update) || !update.values) continue
        const source = update.source
        const $source = update.$source!
        const timestamp = update.timestamp!
        for (const pathValue of update.values) {
          const normalizedDelta: NormalizedDelta = {
            context,
            source,
            $source,
            timestamp,
            path: pathValue.path,
            value: pathValue.value,
            state: pathValue.state,
            isMeta: false
          }
          this.getUnfilteredBus().push(normalizedDelta)
          this.getUnfilteredBus(pathValue.path).push(normalizedDelta)
        }
      }
    } catch (e) {
      console.error(e)
    }
  }

  getUnfilteredBus(path?: Path) {
    if (path !== undefined) {
      let result = this.unfilteredBuses[path]
      if (!result) {
        result = this.unfilteredBuses[path] = new Bacon.Bus()
        // Don't double-emit on `keys` if getBus(path) already announced it.
        if (!this.buses[path]) {
          this.keys.push(path)
        }
      }
      return result
    } else {
      return this.unfilteredAllPathsBus
    }
  }

  getAvailablePaths() {
    return Object.keys(this.availableSelfPaths) as Path[]
  }
}

export function toDelta(normalizedDeltaData: NormalizedDelta): Delta {
  const type = normalizedDeltaData.isMeta ? 'meta' : 'values'
  const pathValue: Pick<PathValue, 'path' | 'value' | 'state'> = {
    path: normalizedDeltaData.path,
    value: normalizedDeltaData.value
  }
  // Replay the staleness state container alongside the value so a
  // late-arriving WS subscriber receives the same `state.timedOut`
  // signal a long-lived client got at the moment the path went stale.
  if (!normalizedDeltaData.isMeta && normalizedDeltaData.state) {
    pathValue.state = normalizedDeltaData.state
  }
  const update = {
    source: normalizedDeltaData.source,
    $source: normalizedDeltaData.$source,
    timestamp: normalizedDeltaData.timestamp,
    [type]: [pathValue]
  } as Update

  return {
    context: normalizedDeltaData.context,
    updates: [update]
  }
}
