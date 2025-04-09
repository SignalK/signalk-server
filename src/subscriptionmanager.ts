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
import Bacon from 'baconjs'
import { isPointWithinRadius } from 'geolib'
import _, { forOwn, get, isString } from 'lodash'
import { createDebug } from './debug'
import DeltaCache from './deltacache'
import { StreamBundle, toDelta } from './streambundle'
import { ContextMatcher } from './types'
const debug = createDebug('signalk-server:subscriptionmanager')

interface BusesMap {
  [path: Path]: Bacon.Bus<unknown, NormalizedDelta>
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
  user?: string
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
        user
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
  user?: string
) {
  const matcher = pathMatcher(subscribeRow.path)
  // iterate over all the buses, checking if we want to subscribe to its values
  forOwn(buses, (bus, key) => {
    if (matcher(key)) {
      debug('Subscribing to key ' + key)
      let filteredBus = bus.filter(filter)
      if (subscribeRow.minPeriod) {
        if (subscribeRow.policy && subscribeRow.policy !== 'instant') {
          errorCallback(
            `minPeriod assumes policy 'instant', ignoring policy ${subscribeRow.policy}`
          )
        }
        debug('minPeriod:' + subscribeRow.minPeriod)
        if (key !== '') {
          // we can not apply minPeriod for empty path subscriptions
          debug('debouncing')
          filteredBus = filteredBus.debounceImmediate(subscribeRow.minPeriod)
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
          const interval = subscribeRow.period || 1000
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
      unsubscribes.push(filteredBus.map(toDelta).onValue(callback))

      const latest = app.deltaCache.getCachedDeltas(filter, user, key)
      if (latest) {
        latest.forEach(callback)
      }
    }
  })
}

function pathMatcher(path: string = '*') {
  const pattern = path.replace('.', '\\.').replace('*', '.*')
  const matcher = new RegExp('^' + pattern + '$')
  return (aPath: string) => matcher.test(aPath)
}

function contextMatcher(
  selfContext: string,
  app: any,
  subscribeCommand: SubscribeMessage,
  errorCallback: any
): ContextMatcher {
  debug('subscribeCommand:' + JSON.stringify(subscribeCommand))
  if (subscribeCommand.context) {
    if (isString(subscribeCommand.context)) {
      const pattern = subscribeCommand.context
        .replace('.', '\\.')
        .replace('*', '.*')
      const matcher = new RegExp('^' + pattern + '$')
      return (normalizedDeltaData: WithContext) =>
        matcher.test(normalizedDeltaData.context) ||
        ((subscribeCommand.context === 'vessels.self' ||
          subscribeCommand.context === 'self') &&
          normalizedDeltaData.context === selfContext)
    } else if ('radius' in subscribeCommand.context) {
      if (
        !get(subscribeCommand.context, 'radius') ||
        !get(subscribeCommand.context, 'position.latitude') ||
        !get(subscribeCommand.context, 'position.longitude')
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
    position.value.latitude &&
    position.value.longitude &&
    isPointWithinRadius(position.value, origin.position, origin.radius)
  )
}

export = SubscriptionManager
