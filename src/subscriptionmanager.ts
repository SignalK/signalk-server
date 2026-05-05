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
  RelativePositionOrigin
} from '@signalk/server-api'
import * as Bacon from 'baconjs'
import { isPointWithinRadius } from 'geolib'
import _ from 'lodash'
import { createDebug } from './debug'
import DeltaCache from './deltacache'
import { StreamBundle, toDelta } from './streambundle'
import { ContextMatcher } from './types'
const debug = createDebug('signalk-server:subscriptionmanager')

const VALID_POLICIES: ReadonlySet<string> = new Set(['instant', 'fixed'])

interface BusesMap {
  [path: Path]: Bacon.Bus<NormalizedDelta>
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
    user?: string
  ) {
    const contextFilter = contextMatcher(
      this.selfContext,
      this.app,
      command,
      errorCallback
    )
    if (Array.isArray(command.subscribe)) {
      handleSubscribeRows(
        this.app,
        command.subscribe,
        unsubscribes,
        this.streambundle.buses,
        contextFilter,
        callback,
        errorCallback,
        user
      )
      // listen to new keys and then use the same logic to check if we
      // want to subscribe, passing in a map with just that single bus
      unsubscribes.push(
        this.streambundle.keys.onValue((path) => {
          const buses: BusesMap = {}
          buses[path] = this.streambundle.getBus(path)
          handleSubscribeRows(
            this.app,
            command.subscribe,
            unsubscribes,
            buses,
            contextFilter,
            callback,
            errorCallback,
            user
          )
        })
      )
    }

    // Handle announceNewPaths: announce all paths matching context (once each)
    // This allows clients with granular subscriptions to discover available paths
    // without subscribing to everything continuously
    if (command.announceNewPaths) {
      const announcedPaths = new Set<string>()

      const existingDeltas = this.app.deltaCache.getCachedDeltas(
        contextFilter,
        user
      )
      if (existingDeltas) {
        existingDeltas.forEach((delta: any) => {
          delta.updates?.forEach((update: any) => {
            update.values?.forEach((vp: any) => {
              if (vp.path) {
                announcedPaths.add(vp.path)
              }
            })
          })
          callback(delta)
        })
      }

      unsubscribes.push(
        this.streambundle.keys.onValue((path: string) => {
          if (announcedPaths.has(path)) {
            return
          }
          announcedPaths.add(path)

          // deltaCache may not yet hold the value when keys.onValue fires,
          // so subscribe to the bus directly for the first value.
          const bus = this.streambundle.getBus(path as Path)
          const unsubscribeBus = bus
            .filter(contextFilter)
            .take(1)
            .map(toDelta)
            .onValue((delta: any) => {
              callback(delta)
            })

          unsubscribes.push(unsubscribeBus)
        })
      )
    }
  }

  unsubscribe(msg: UnsubscribeMessage, unsubscribes: Unsubscribes) {
    if (
      msg.unsubscribe &&
      msg.context === '*' &&
      msg.unsubscribe.length === 1 &&
      msg.unsubscribe[0].path === '*'
    ) {
      debug('Unsubscribe all')
      unsubscribes.forEach((unsubscribe) => unsubscribe())
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
  errorCallback: (err: unknown) => void,
  user?: string
) {
  for (const subscribeRow of rows) {
    if (subscribeRow.path !== undefined) {
      handleSubscribeRow(
        app,
        subscribeRow,
        unsubscribes,
        buses,
        filter,
        callback,
        errorCallback,
        user
      )
    }
  }
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
  errorCallback: (err: unknown) => void,
  user?: string
) {
  const matcher = pathMatcher(subscribeRow.path)
  for (const key in buses) {
    if (!matcher(key)) {
      continue
    }
    const bus = buses[key as Path]
    debug.enabled && debug('Subscribing to key ' + key)
    let filteredBus: Bacon.EventStream<NormalizedDelta> = bus.filter(filter)
    if (subscribeRow.minPeriod) {
      if (subscribeRow.policy && subscribeRow.policy !== 'instant') {
        errorCallback(
          `minPeriod assumes policy 'instant', ignoring policy ${subscribeRow.policy}`
        )
      }
      const minPeriodValue = Number(subscribeRow.minPeriod)
      debug.enabled && debug('minPeriod:' + subscribeRow.minPeriod)
      if (isNaN(minPeriodValue)) {
        errorCallback(
          `invalid minPeriod value '${subscribeRow.minPeriod}', ignoring`
        )
      } else if (key !== '') {
        // minPeriod can not apply to empty-path subscriptions
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
    if (subscribeRow.policy && !VALID_POLICIES.has(subscribeRow.policy)) {
      errorCallback(
        `Only 'instant' and 'fixed' policies supported, ignoring policy ${subscribeRow.policy}`
      )
    }
    unsubscribes.push(filteredBus.map(toDelta).onValue(callback))

    const latest = app.deltaCache.getCachedDeltas(filter, user, key)
    if (latest) {
      latest.forEach(callback)
    }
  }
}

function pathMatcher(path: string = '*') {
  const pattern = path
    .replace(/[\\^$+?()[\]{}|]/g, '\\$&')
    .replace(/\./g, '\\.')
    .replace(/\*/g, '.*')
  const matcher = new RegExp('^' + pattern + '$')
  return (aPath: string) => matcher.test(aPath)
}

function contextMatcher(
  selfContext: string,
  app: any,
  subscribeCommand: SubscribeMessage,
  errorCallback: (err: unknown) => void
): ContextMatcher {
  debug.enabled && debug('subscribeCommand:' + JSON.stringify(subscribeCommand))
  if (subscribeCommand.context) {
    if (typeof subscribeCommand.context === 'string') {
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
      const origin = subscribeCommand.context
      if (
        !origin.radius ||
        !origin.position?.latitude ||
        !origin.position?.longitude
      ) {
        errorCallback(
          'Please specify a radius and position for relativePosition'
        )
        return () => false
      }
      return (normalizedDeltaData: WithContext) =>
        checkPosition(app, origin, normalizedDeltaData)
    }
  }
  return () => true
}

function checkPosition(
  app: any,
  origin: RelativePositionOrigin,
  normalizedDelta: WithContext
): boolean {
  const vessel = _.get(app.signalk.root, normalizedDelta.context)
  const position = vessel?.navigation?.position

  return (
    position &&
    position.value &&
    position.value.latitude &&
    position.value.longitude &&
    isPointWithinRadius(position.value, origin.position, origin.radius)
  )
}

export = SubscriptionManager
