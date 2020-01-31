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

import Bacon from 'baconjs'
import Debug from 'debug'
import { isPointWithinRadius } from 'geolib'
import _, { forOwn, get, isString } from 'lodash'
const debug = Debug('signalk-server:subscriptionmanager')
import { toDelta } from './streambundle'
import { Unsubscribes } from './types'

interface BusesMap {
  [key: string]: any
}

type ContextMatcher = (context: string) => boolean

class SubscriptionManager {
  streambundle: any
  selfContext: string
  app: any
  constructor(app: any) {
    this.streambundle = app.streambundle
    this.selfContext = app.selfContext
    this.app = app
  }

  subscribe = (
    command: any,
    unsubscribes: Unsubscribes,
    errorCallback: (err: any) => void,
    callback: (msg: any) => void,
    user?: string
  ) => {
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
        this.streambundle.keys.onValue((key: string) => {
          const buses: BusesMap = {}
          buses[key] = this.streambundle.getBus(key)
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

  unsubscribe(msg: any, unsubscribes: Unsubscribes) {
    if (
      msg.unsubscribe &&
      msg.context === '*' &&
      msg.unsubscribe &&
      msg.unsubscribe.length === 1 &&
      msg.unsubscribe[0].path === '*'
    ) {
      debug('Unsubscribe all')
      unsubscribes.forEach(unsubscribe => unsubscribe())
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
  rows: any[],
  unsubscribes: Unsubscribes,
  buses: BusesMap,
  filter: ContextMatcher,
  callback: any,
  errorCallback: any,
  user?: string
) {
  rows.reduce((acc, subscribeRow) => {
    if (subscribeRow.path) {
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

function handleSubscribeRow(
  app: any,
  subscribeRow: any,
  unsubscribes: Unsubscribes,
  buses: BusesMap,
  filter: ContextMatcher,
  callback: any,
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
        filteredBus = filteredBus.debounceImmediate(subscribeRow.minPeriod)
      } else if (
        subscribeRow.period ||
        (subscribeRow.policy && subscribeRow.policy === 'fixed')
      ) {
        if (subscribeRow.policy && subscribeRow.policy !== 'fixed') {
          errorCallback(
            `period assumes policy 'fixed', ignoring policy ${subscribeRow.policy}`
          )
        } else {
          const interval = subscribeRow.period || 1000
          filteredBus = filteredBus
            .bufferWithTime(interval)
            .flatMapLatest((bufferedValues: any) => {
              const uniqueValues = _(bufferedValues)
                .reverse()
                .uniqBy(
                  value =>
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
        !['instant', 'fixed'].some(s => s === subscribeRow.policy)
      ) {
        errorCallback(
          `Only 'instant' and 'fixed' policies supported, ignoring policy ${subscribeRow.policy}`
        )
      }
      unsubscribes.push(filteredBus.map(toDelta).onValue(callback))

      const latest = app.deltaCache.getCachedDeltas(user, filter, key)
      if (latest) {
        latest.forEach(callback)
      }
    }
  })
}

function pathMatcher(path: string) {
  const pattern = path.replace('.', '\\.').replace('*', '.*')
  const matcher = new RegExp('^' + pattern + '$')
  return (aPath: string) => matcher.test(aPath)
}

function contextMatcher(
  selfContext: string,
  app: any,
  subscribeCommand: any,
  errorCallback: any
): ContextMatcher {
  debug('subscribeCommand:' + JSON.stringify(subscribeCommand))
  if (subscribeCommand.context) {
    if (isString(subscribeCommand.context)) {
      const pattern = subscribeCommand.context
        .replace('.', '\\.')
        .replace('*', '.*')
      const matcher = new RegExp('^' + pattern + '$')
      return (normalizedDeltaData: any) =>
        matcher.test(normalizedDeltaData.context) ||
        ((subscribeCommand.context === 'vessels.self' ||
          subscribeCommand.context === 'self') &&
          normalizedDeltaData.context === selfContext)
    } else if (get(subscribeCommand.context, 'radius')) {
      if (
        !get(subscribeCommand.context, 'radius') ||
        !get(subscribeCommand.context, 'position.latitude') ||
        !get(subscribeCommand.context, 'position.longitude')
      ) {
        errorCallback(
          'Please specify a radius and position for relativePosition'
        )
        return x => false
      }
      return normalizedDeltaData => {
        return checkPosition(app, subscribeCommand.context, normalizedDeltaData)
      }
    }
  }
  return x => true
}

function checkPosition(app: any, context: any, normalizedDeltaData: any) {
  const vessel = get(app.signalk.root, normalizedDeltaData.context)
  const position = get(vessel, 'navigation.position')

  const subsPosition = get(context, 'position')
  if (
    position &&
    position.value &&
    position.value.latitude &&
    position.value.longitude &&
    subsPosition &&
    subsPosition.latitude &&
    subsPosition.longitude
  ) {
    return isPointWithinRadius(position.value, subsPosition, context.radius)
  }

  return false
}

export = SubscriptionManager
