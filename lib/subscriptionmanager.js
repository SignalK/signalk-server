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

const _ = require('lodash')
const Bacon = require('baconjs')

const debug = require('debug')('signalk-server:subscriptionmanager')

function SubscriptionManager (app) {
  this.streambundle = app.streambundle
  this.selfContext = app.selfContext
}

SubscriptionManager.prototype.subscribe = function (
  command,
  unsubscribes,
  errorCallback,
  callback
) {
  const contextFilter = contextMatcher(this.selfContext, command)
  if (Array.isArray(command.subscribe)) {
    handleSubscribeRows(
      command.subscribe,
      unsubscribes,
      this.streambundle.buses,
      contextFilter,
      callback,
      errorCallback
    )
    // listen to new keys and then use the same logic to check if we
    // want to subscribe, passing in a map with just that single bus
    unsubscribes.push(
      this.streambundle.keys.onValue(key => {
        var buses = {}
        buses[key] = this.streambundle.getBus(key)
        handleSubscribeRows(
          command.subscribe,
          unsubscribes,
          buses,
          contextFilter,
          callback,
          errorCallback
        )
      })
    )
  }
}

function handleSubscribeRows (
  rows,
  unsubscribes,
  buses,
  filter,
  callback,
  errorCallback
) {
  rows.reduce((acc, subscribeRow) => {
    if (subscribeRow.path) {
      handleSubscribeRow(
        subscribeRow,
        unsubscribes,
        buses,
        filter,
        callback,
        errorCallback
      )
    }
    return acc
  }, unsubscribes)
}

function handleSubscribeRow (
  subscribeRow,
  unsubscribes,
  buses,
  filter,
  callback,
  errorCallback
) {
  var matcher = pathMatcher(subscribeRow.path)
  // iterate over all the buses, checking if we want to subscribe to its values
  _.forOwn(buses, (bus, key) => {
    if (matcher(key)) {
      debug('Subscribing to key ' + key)
      var filteredBus = bus.filter(filter)
      if (subscribeRow.minPeriod) {
        if (subscribeRow.policy && subscribeRow.policy != 'instant') {
          errorCallback(
            "minPeriod assumes policy 'instant', ignoring policy " +
              subscribeRow.policy
          )
        }
        debug('minPeriod:' + subscribeRow.minPeriod)
        filteredBus = filteredBus.debounceImmediate(subscribeRow.minPeriod)
      } else if (
        subscribeRow.period ||
        (subscribeRow.policy && subscribeRow.policy === 'fixed')
      ) {
        if (subscribeRow.policy && subscribeRow.policy != 'fixed') {
          errorCallback(
            "period assumes policy 'fixed', ignoring policy " +
              subscribeRow.policy
          )
        } else {
          const interval = subscribeRow.period || 1000
          filteredBus = filteredBus
            .bufferWithTime(interval)
            .flatMapLatest(bufferedValues => {
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
      if (subscribeRow.format && subscribeRow.format != 'delta') {
        errorCallback('Only delta format supported, using it')
      }
      if (
        subscribeRow.policy &&
        !['instant', 'fixed'].some(s => s === subscribeRow.policy)
      ) {
        errorCallback(
          "Only 'instant' and 'fixed' policies supported, ignoring policy " +
            subscribeRow.policy
        )
      }
      unsubscribes.push(filteredBus.map(toDelta).onValue(callback))
    }
  })
}

function pathMatcher (path) {
  var pattern = path.replace('.', '\\.').replace('*', '.*')
  var matcher = new RegExp('^' + pattern + '$')
  return aPath => matcher.test(aPath)
}

function contextMatcher (selfContext, subscribeCommand) {
  debug('subscribeCommand:' + JSON.stringify(subscribeCommand))
  var pattern = subscribeCommand.context.replace('.', '\\.').replace('*', '.*')
  var matcher = new RegExp('^' + pattern + '$')
  if (subscribeCommand.context) {
    return normalizedDeltaData =>
      matcher.test(normalizedDeltaData.context) ||
      ((subscribeCommand.context === 'vessels.self' ||
        subscribeCommand.context === 'self') &&
        normalizedDeltaData.context === selfContext)
  }
  return x => true
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

module.exports = SubscriptionManager
