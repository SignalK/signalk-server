/*
 * Copyright 2017 Teppo Kurki, Scott Bender
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

const { isUndefined, values } = require('lodash')

module.exports = {
  startDeltaStatistics: function(app) {
    app.deltaCount = 0
    app.lastIntervalDeltaCount = 0
    app.providerStatistics = {}

    return setInterval(() => {
      updateProviderPeriodStats(app)
      app.emit('serverevent', {
        type: 'SERVERSTATISTICS',
        from: 'signalk-server',
        data: {
          deltaRate: (app.deltaCount - app.lastIntervalDeltaCount) / 5,
          numberOfAvailablePaths: app.streambundle.getAvailablePaths().length,
          wsClients: app.interfaces.ws ? app.interfaces.ws.numClients() : 0,
          providerStatistics: app.providerStatistics
        }
      })
      app.lastIntervalDeltaCount = app.deltaCount
    }, 5 * 1000)
  },

  incDeltaStatistics: function(app, providerId) {
    app.deltaCount++

    const stats =
      app.providerStatistics[providerId] ||
      (app.providerStatistics[providerId] = {
        deltaCount: 0
      })
    stats.deltaCount++
  }
}

function updateProviderPeriodStats(app) {
  app.providers.forEach(provider => {
    if (isUndefined(app.providerStatistics[provider.id])) {
      app.providerStatistics[provider.id] = {
        deltaCount: 0,
        deltaRate: 0
      }
    }
  })

  values(app.providerStatistics).forEach(stats => {
    stats.deltaRate = (stats.deltaCount - stats.lastIntervalDeltaCount) / 5
    stats.lastIntervalDeltaCount = stats.deltaCount
  })
}
