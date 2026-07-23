/* eslint-disable @typescript-eslint/no-explicit-any */
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
  SubscriptionManager as ISubscriptionManager,
  Unsubscribes,
  NormalizedDelta,
  Path,
  WithContext,
  SubscribeMessage,
  SubscriptionOptions,
  UnsubscribeMessage,
  SubscribeCallback,
  RelativePositionOrigin,
  Delta,
  SourceRef,
  Update,
  PathValue,
  Value
} from '@signalk/server-api'
import * as Bacon from 'baconjs'
import { isPointWithinRadius } from 'geolib'
import _, { forOwn, get, isString } from 'lodash'
import { createDebug } from './debug'
import DeltaCache from './deltacache'
import { ToPreferredDelta } from './deltaPriority'
import { StreamBundle, toDelta } from './streambundle'
import { ContextMatcher } from './types'
const debug = createDebug('signalk-server:subscriptionmanager')

interface BusesMap {
  [path: Path]: Bacon.Bus<NormalizedDelta>
}

// Run a delta through a per-subscription priority engine and return
// the filtered delta, or null if every update was emptied. The
// engine mutates update.values in place (a clone is made first so
// other subscribers/bridges sharing the source delta keep their copy
// intact), then anything with no surviving values is dropped.
function runPerSubEngine(
  engine: ToPreferredDelta,
  delta: Delta,
  now: Date,
  selfContext: string
): Delta | null {
  const cloned: Delta = {
    context: delta.context,
    updates: delta.updates.map((u: any) => {
      if ('values' in u && Array.isArray(u.values)) {
        return { ...u, values: u.values.slice() }
      }
      return { ...u }
    })
  }
  const result = engine(cloned, now, selfContext)
  if (!result || !result.updates) return null
  const surviving = result.updates.filter((u: any) => {
    if ('values' in u) {
      return Array.isArray(u.values) && u.values.length > 0
    }
    // meta-updates and other shapes pass through unchanged
    return true
  })
  if (surviving.length === 0) return null
  return { ...result, updates: surviving }
}

class SubscriptionManager implements ISubscriptionManager {
  streambundle: StreamBundle
  selfContext: string
  app: any
  constructor(app: any) {
    this.streambundle = app.streambundle
    this.selfContext = app.selfContext
    this.app = app
  }

  subscribe(
    command: SubscribeMessage,
    unsubscribes: Unsubscribes,
    errorCallback: (err: unknown) => void,
    callback: SubscribeCallback,
    user?: string,
    sourcePolicy?: 'preferred' | 'all',
    excludeSources?: SourceRef[]
  ) {
    const contextFilter = contextMatcher(
      this.selfContext,
      this.app,
      command,
      errorCallback
    )
    // Exclude semantics only make sense under the priority cascade.
    // Under sourcePolicy='all' the caller has opted into raw fan-out
    // and partial filtering would be surprising — log and ignore.
    // Sanitize at the boundary: a WebSocket message or plugin command
    // can carry empty strings or non-string entries, and an array
    // length > 0 of garbage shouldn't flip the subscription into
    // per-engine mode.
    const sanitizedExcludes = Array.isArray(excludeSources)
      ? excludeSources.filter(
          (ref): ref is SourceRef => typeof ref === 'string' && ref.length > 0
        )
      : []
    const effectiveExcludes =
      sourcePolicy === 'all' || sanitizedExcludes.length === 0
        ? undefined
        : sanitizedExcludes
    if (sourcePolicy === 'all' && sanitizedExcludes.length > 0) {
      debug(
        "ignoring excludeSources under sourcePolicy:'all' — excludes only apply to 'preferred'"
      )
    }
    // When the caller asks for exclude semantics, route through a
    // per-subscription priority engine fed from the unfiltered bus
    // (every source). Without excludes, keep the existing fast paths:
    // 'preferred' reads from the pre-filtered global bus, 'all' from
    // the unfiltered bus, neither needs a per-subscription engine.
    const perSubEngine: ToPreferredDelta | null =
      effectiveExcludes && this.app.buildSubscriptionEngine
        ? this.app.buildSubscriptionEngine(effectiveExcludes)
        : null
    const useUnfiltered = sourcePolicy === 'all' || perSubEngine !== null
    const buses = useUnfiltered
      ? this.streambundle.unfilteredBuses
      : this.streambundle.buses
    if (Array.isArray(command.subscribe)) {
      handleSubscribeRows(
        this.app,
        command.subscribe,
        unsubscribes,
        buses,
        contextFilter,
        callback,
        errorCallback,
        user,
        sourcePolicy,
        perSubEngine,
        this.selfContext
      )
      // listen to new keys and then use the same logic to check if we
      // want to subscribe, passing in a map with just that single bus
      unsubscribes.push(
        this.streambundle.keys.onValue((path) => {
          const newBuses: BusesMap = {}
          newBuses[path] = useUnfiltered
            ? this.streambundle.getUnfilteredBus(path)
            : this.streambundle.getBus(path)
          handleSubscribeRows(
            this.app,
            command.subscribe,
            unsubscribes,
            newBuses,
            contextFilter,
            callback,
            errorCallback,
            user,
            sourcePolicy,
            perSubEngine,
            this.selfContext
          )
        })
      )
    }

    // Handle announceNewPaths: announce all paths matching context (once each)
    // This allows clients with granular subscriptions to discover available paths
    // without subscribing to everything continuously
    if (command.announceNewPaths) {
      const announcedPaths = new Set<string>()

      // 1. Announce ALL existing paths matching context (send cached deltas once)
      // With a per-subscription engine in play, fetch every cached
      // source (sourcePolicy='all') and re-run the engine so the
      // bootstrap snapshot honours the exclude mask the same way live
      // deltas do. Without this, the announce-path replay would leak
      // the excluded source on its very first emission.
      const existingDeltas = this.app.deltaCache.getCachedDeltas(
        contextFilter,
        user,
        undefined,
        perSubEngine ? 'all' : sourcePolicy
      )
      if (existingDeltas) {
        const now = new Date()
        existingDeltas.forEach((delta: any) => {
          const filtered = perSubEngine
            ? runPerSubEngine(perSubEngine, delta, now, this.selfContext)
            : delta
          if (!filtered) return
          // Track which paths we've announced
          filtered.updates?.forEach((update: any) => {
            update.values?.forEach((vp: any) => {
              if (vp.path) {
                announcedPaths.add(vp.path)
              }
            })
          })
          callback(filtered)
        })
      }

      // 2. Listen for NEW paths appearing later and announce once
      unsubscribes.push(
        this.streambundle.keys.onValue((path: string) => {
          if (announcedPaths.has(path)) {
            return // Already announced this path
          }
          announcedPaths.add(path)

          // Subscribe to the bus to get the first value for this new path
          // We can't rely on deltaCache here because it might not have
          // received the value yet (race condition with keys.onValue)
          const bus = useUnfiltered
            ? this.streambundle.getUnfilteredBus(path as Path)
            : this.streambundle.getBus(path as Path)
          const unsubscribeBus = bus
            .filter(contextFilter)
            .take(1) // Only take the first value
            .map(toDelta)
            .onValue((delta: any) => {
              if (perSubEngine) {
                const filtered = runPerSubEngine(
                  perSubEngine,
                  delta,
                  new Date(),
                  this.selfContext
                )
                if (filtered) callback(filtered)
              } else {
                callback(delta)
              }
            })

          // Add to unsubscribes so it gets cleaned up
          unsubscribes.push(unsubscribeBus)
        })
      )
    }
  }

  unsubscribe(msg: UnsubscribeMessage, unsubscribes: Unsubscribes) {
    if (
      msg.unsubscribe &&
      msg.context === '*' &&
      msg.unsubscribe &&
      msg.unsubscribe.length === 1 &&
      msg.unsubscribe[0].path === '*'
    ) {
      debug('Unsubscribe all')
      unsubscribes.forEach((unsubscribe) => unsubscribe())
      // clear unsubscribes
      unsubscribes.length = 0
    } else {
      throw new Error(
        `Only '{"context":"*","unsubscribe":[{"path":"*"}]}' supported, received ${JSON.stringify(
          msg
        )}`
      )
    }
  }
}

function handleSubscribeRows(
  app: any,
  rows: SubscriptionOptions[],
  unsubscribes: Unsubscribes,
  buses: BusesMap,
  filter: ContextMatcher,
  callback: SubscribeCallback,
  errorCallback: any,
  user?: string,
  sourcePolicy?: 'preferred' | 'all',
  perSubEngine?: ToPreferredDelta | null,
  selfContext?: string
) {
  rows.reduce((acc, subscribeRow) => {
    if (subscribeRow.path !== undefined) {
      handleSubscribeRow(
        app,
        subscribeRow,
        unsubscribes,
        buses,
        filter,
        callback,
        errorCallback,
        user,
        sourcePolicy,
        perSubEngine,
        selfContext
      )
    }
    return acc
  }, unsubscribes)
}

interface App {
  deltaCache: DeltaCache
}

function handleSubscribeRow(
  app: App,
  subscribeRow: SubscriptionOptions,
  unsubscribes: Unsubscribes,
  buses: BusesMap,
  filter: ContextMatcher,
  callback: SubscribeCallback,
  errorCallback: any,
  user?: string,
  sourcePolicy?: 'preferred' | 'all',
  perSubEngine?: ToPreferredDelta | null,
  selfContext?: string
) {
  const matcher = pathMatcher(subscribeRow.path)
  // iterate over all the buses, checking if we want to subscribe to its values
  forOwn(buses, (bus, key) => {
    // Root deltas (path '') carry vessel identity fields (name, mmsi,
    // communication.callsignVhf, ...) as one object value, mirroring their
    // attribute form in the full model. A row asking for such a leaf path
    // can never match the '' bus directly, so flatten root values into
    // per-leaf deltas for it. Rows whose pattern matches '' itself ('' and
    // wildcards) keep receiving the original root delta, so nothing is
    // delivered twice.
    const flattenRootValues = key === '' && !matcher(key)
    if (matcher(key) || flattenRootValues) {
      debug.enabled && debug('Subscribing to key ' + key)
      let filteredBus: Bacon.EventStream<NormalizedDelta> = bus.filter(filter)
      if (flattenRootValues) {
        filteredBus = filteredBus.flatMap(
          (normalizedDelta: NormalizedDelta) =>
            Bacon.fromArray(
              flattenRootDelta(normalizedDelta, matcher)
            ) as Bacon.EventStream<NormalizedDelta>
        )
      }
      if (subscribeRow.minPeriod) {
        if (subscribeRow.policy && subscribeRow.policy !== 'instant') {
          errorCallback(
            `minPeriod assumes policy 'instant', ignoring policy ${subscribeRow.policy}`
          )
        }
        const minPeriodValue = Number(subscribeRow.minPeriod)
        debug('minPeriod:' + subscribeRow.minPeriod)
        if (isNaN(minPeriodValue)) {
          errorCallback(
            `invalid minPeriod value '${subscribeRow.minPeriod}', ignoring`
          )
        } else if (key !== '') {
          // Timing policies are not applied on the '' bus (flattened rows
          // included): the stream carries values for multiple paths, so a
          // shared debounce would drop values of one path because another
          // path delivered first. Root identity data also arrives on AIS
          // static-report cadence, far slower than any practical period.
          debug('debouncing')
          filteredBus = filteredBus.debounceImmediate(minPeriodValue)
        }
      } else if (
        subscribeRow.period ||
        (subscribeRow.policy && subscribeRow.policy === 'fixed')
      ) {
        if (subscribeRow.policy && subscribeRow.policy !== 'fixed') {
          errorCallback(
            `period assumes policy 'fixed', ignoring policy ${subscribeRow.policy}`
          )
        } else if (key !== '') {
          // we can not apply period for empty path subscriptions
          const interval = Number(subscribeRow.period) || 1000
          filteredBus = filteredBus
            .bufferWithTime(interval)
            .flatMapLatest((bufferedValues: any) => {
              const uniqueValues = _(bufferedValues)
                .reverse()
                .uniqBy(
                  (value) =>
                    value.context + ':' + value.$source + ':' + value.path
                )
                .value()
              return Bacon.fromArray(uniqueValues)
            })
        }
      }
      if (subscribeRow.format && subscribeRow.format !== 'delta') {
        errorCallback('Only delta format supported, using it')
      }
      if (
        subscribeRow.policy &&
        !['instant', 'fixed'].some((s) => s === subscribeRow.policy)
      ) {
        errorCallback(
          `Only 'instant' and 'fixed' policies supported, ignoring policy ${subscribeRow.policy}`
        )
      }
      // With a per-subscription priority engine in play, run each
      // delta through the engine before delivering. The engine carries
      // the user's saved priority groups/overrides minus the excluded
      // sources, so the subscriber sees a single priority-resolved
      // value per path with the cascade respected — the same shape
      // the global preferred-only bus would deliver, but with the
      // plugin's own (or otherwise excluded) sources removed from the
      // candidate set.
      if (perSubEngine) {
        const engineStream = filteredBus
          .map(toDelta)
          .flatMap((delta: Delta) => {
            const filtered = runPerSubEngine(
              perSubEngine,
              delta,
              new Date(),
              selfContext ?? ''
            )
            return filtered ? Bacon.once(filtered) : Bacon.never()
          }) as Bacon.EventStream<Delta>
        unsubscribes.push(engineStream.onValue(callback))
      } else {
        unsubscribes.push(filteredBus.map(toDelta).onValue(callback))
      }

      // Bootstrap snapshot: fetch every source's last cached value
      // (sourcePolicy='all') when a per-subscription engine owns this
      // subscription, then replay through the engine so the snapshot
      // honours the exclude mask. Without the override the snapshot
      // would carry the global preferred winner — which may BE the
      // excluded source — and the subscriber would see it once on
      // startup.
      const cached = app.deltaCache.getCachedDeltas(
        filter,
        user,
        key,
        perSubEngine ? 'all' : sourcePolicy
      )
      const latest =
        flattenRootValues && cached
          ? flattenCachedRootDeltas(cached, matcher)
          : cached
      if (latest) {
        if (perSubEngine) {
          const now = new Date()
          for (const delta of latest) {
            const filtered = runPerSubEngine(
              perSubEngine,
              delta,
              now,
              selfContext ?? ''
            )
            if (filtered) callback(filtered)
          }
        } else {
          latest.forEach(callback)
        }
      }
    }
  })
}

function pathMatcher(path: string = '*') {
  const pattern = path
    .replace(/[\\^$+?()[\]{}|]/g, '\\$&')
    .replace(/\./g, '\\.')
    .replace(/\*/g, '.*')
  const matcher = new RegExp('^' + pattern + '$')
  return (aPath: string) => matcher.test(aPath)
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function collectLeaves(
  obj: Record<string, unknown>,
  prefix: string,
  accept: (path: string) => boolean,
  leaves: PathValue[]
) {
  for (const key of Object.keys(obj)) {
    const path = prefix === '' ? key : `${prefix}.${key}`
    const value = obj[key]
    if (isPlainObject(value)) {
      collectLeaves(value, path, accept, leaves)
    } else if (accept(path)) {
      leaves.push({ path: path as Path, value: value as Value })
    }
  }
}

function flattenRootDelta(
  normalizedDelta: NormalizedDelta,
  accept: (path: string) => boolean
): NormalizedDelta[] {
  if (normalizedDelta.isMeta || !isPlainObject(normalizedDelta.value)) {
    return []
  }
  const leaves: PathValue[] = []
  collectLeaves(normalizedDelta.value, '', accept, leaves)
  return leaves.map((leaf) => ({
    context: normalizedDelta.context,
    source: normalizedDelta.source,
    $source: normalizedDelta.$source,
    timestamp: normalizedDelta.timestamp,
    path: leaf.path,
    value: leaf.value,
    state: normalizedDelta.state,
    isMeta: false
  }))
}

function flattenCachedRootDeltas(
  deltas: Delta[],
  accept: (path: string) => boolean
): Delta[] {
  return deltas.reduce<Delta[]>((acc, delta) => {
    const updates = delta.updates.reduce<Update[]>((updatesAcc, update) => {
      if ('values' in update) {
        const values: PathValue[] = []
        for (const pathValue of update.values) {
          if (pathValue.path === '' && isPlainObject(pathValue.value)) {
            collectLeaves(pathValue.value, '', accept, values)
          }
        }
        if (values.length > 0) {
          updatesAcc.push({ ...update, values })
        }
      }
      return updatesAcc
    }, [])
    if (updates.length > 0) {
      acc.push({ context: delta.context, updates })
    }
    return acc
  }, [])
}

function contextMatcher(
  selfContext: string,
  app: any,
  subscribeCommand: SubscribeMessage,
  errorCallback: any
): ContextMatcher {
  debug.enabled && debug('subscribeCommand:' + JSON.stringify(subscribeCommand))
  if (subscribeCommand.context) {
    if (isString(subscribeCommand.context)) {
      const pattern = subscribeCommand.context
        .replace(/[\\^$+?()[\]{}|]/g, '\\$&')
        .replace(/\./g, '\\.')
        .replace(/\*/g, '.*')
      const matcher = new RegExp('^' + pattern + '$')
      return (normalizedDeltaData: WithContext) =>
        matcher.test(normalizedDeltaData.context) ||
        ((subscribeCommand.context === 'vessels.self' ||
          subscribeCommand.context === 'self') &&
          normalizedDeltaData.context === selfContext)
    } else if ('radius' in subscribeCommand.context) {
      if (
        !Number.isFinite(get(subscribeCommand.context, 'radius')) ||
        !Number.isFinite(get(subscribeCommand.context, 'position.latitude')) ||
        !Number.isFinite(get(subscribeCommand.context, 'position.longitude'))
      ) {
        errorCallback(
          'Please specify a radius and position for relativePosition'
        )
        return () => false
      }
      return (normalizedDeltaData: WithContext) =>
        checkPosition(
          app,
          subscribeCommand.context as RelativePositionOrigin,
          normalizedDeltaData
        )
    }
  }
  return () => true
}

function checkPosition(
  app: any,
  origin: RelativePositionOrigin,
  normalizedDelta: WithContext
): boolean {
  const vessel = get(app.signalk.root, normalizedDelta.context)
  const position = get(vessel, 'navigation.position')

  return (
    position &&
    position.value &&
    Number.isFinite(position.value.latitude) &&
    Number.isFinite(position.value.longitude) &&
    isPointWithinRadius(position.value, origin.position, origin.radius)
  )
}

export = SubscriptionManager
