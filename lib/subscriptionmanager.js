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

debug = require('debug')('signalk-server:subscriptionmanager')

function SubscriptionManager(app) {
  this.streambundle = app.streambundle
  this.selfContext = app.selfContext
}

SubscriptionManager.prototype.subscribe = function(command, errorCallback, callback) {
  if (Array.isArray(command.subscribe)) {
    return command.subscribe.reduce((acc, subscribeRow) => {
      if (subscribeRow.path) {
        var filteredBus = this.streambundle.
          getBus(subscribeRow.path).
          filter(contextMatcher(this.selfContext, command))
        if (subscribeRow.minPeriod) {
          filteredBus = filteredBus.debounceImmediate(subscribeRow.minPeriod)
        }
        acc.push(filteredBus.map(toDelta).onValue(callback))
      }
      return acc
    }, [])
  }
}

function contextMatcher(selfContext, subscribeCommand) {
  debug("subscribeCommand:" + JSON.stringify(subscribeCommand))
  if (subscribeCommand.context) {
    return normalizedDeltaData =>
      normalizedDeltaData.context === subscribeCommand.context ||
      ((subscribeCommand.context === 'vessels.self' ||
          subscribeCommand.context === 'self') &&
        normalizedDeltaData.context === selfContext)
  }
  return x => true
}

function toDelta(normalizedDeltaData) {
  return {
    context: normalizedDeltaData.context,
    updates: [{
      source: normalizedDeltaData.source,
      '$source': normalizedDeltaData['$source'],
      values: [{
        path: normalizedDeltaData.path,
        value: normalizedDeltaData.value
      }]
    }]
  }
}

module.exports = SubscriptionManager;
