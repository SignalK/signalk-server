/* eslint-disable @typescript-eslint/no-explicit-any */
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

import { isUndefined, values } from 'lodash'
import { EventEmitter } from 'node:events'

const STATS_UPDATE_INTERVAL_SECONDS = 5
export const CONNECTION_WRITE_EVENT_NAME = 'connectionwrite'
// The id the server writes the rates under, as their $source.
export const STATS_PROVIDER_ID = 'signalk-server'
const RATES = ['deltaRate', 'writeRate'] as const
type Rate = (typeof RATES)[number]

export interface ConnectionWriteEvent {
  providerId: string
  count?: number
}

class ProviderStats {
  writeRate: number
  writeCount: number
  lastIntervalWriteCount: number
  deltaRate: number
  deltaCount: number
  lastIntervalDeltaCount: number
  constructor() {
    this.writeRate =
      this.writeCount =
      this.lastIntervalWriteCount =
      this.deltaRate =
      this.deltaCount =
      this.lastIntervalDeltaCount =
        0
  }
}

// When each provider last wrote a rate itself, under providers.<its id>.
// Kept out of ProviderStats, which goes to the admin UI as it is.
const ownRates = new WeakMap<ProviderStats, Map<Rate, number>>()
// The server leaves a rate to the provider while the provider's own value is
// this recent. A connection that dies stops writing it, and the server's own
// count, which then drops to 0, takes over again.
export const OWN_RATE_TIMEOUT_MS = 3 * STATS_UPDATE_INTERVAL_SECONDS * 1000
// The rates the server last wrote for each provider; it writes a rate only
// when it changes, so an idle connection's 0 is sent once.
const sentRates = new WeakMap<ProviderStats, Map<Rate, number>>()

export interface WithProviderStatistics {
  selfId?: string
  deltaCount: number
  lastIntervalDeltaCount: number
  providerStatistics: {
    [providerId: string]: ProviderStats
  }
}

export function startDeltaStatistics(
  app: EventEmitter & WithProviderStatistics
) {
  app.deltaCount = 0
  app.lastIntervalDeltaCount = 0
  app.providerStatistics = {}

  app.on(CONNECTION_WRITE_EVENT_NAME, (msg: ConnectionWriteEvent) => {
    const stats =
      app.providerStatistics[msg.providerId] ||
      (app.providerStatistics[msg.providerId] = new ProviderStats())
    if (msg.count !== undefined) {
      stats.writeCount += msg.count
    } else {
      stats.writeCount++
    }
  })

  return setInterval(() => {
    updateProviderPeriodStats(app)
    const anyApp = app as any
    app.emit('serverevent', {
      type: 'SERVERSTATISTICS',
      from: 'signalk-server',
      data: {
        deltaRate:
          (app.deltaCount - app.lastIntervalDeltaCount) /
          STATS_UPDATE_INTERVAL_SECONDS,
        numberOfAvailablePaths: anyApp.streambundle.getAvailablePaths().length,
        wsClients: anyApp.interfaces.ws ? anyApp.interfaces.ws.numClients() : 0,
        providerStatistics: app.providerStatistics,
        uptime: process.uptime()
      }
    })
    app.lastIntervalDeltaCount = app.deltaCount
    publishRates(app)
  }, STATS_UPDATE_INTERVAL_SECONDS * 1000)
}

export function incDeltaStatistics(
  app: WithProviderStatistics,
  providerId: any,
  delta?: any
) {
  app.deltaCount++

  const stats =
    app.providerStatistics[providerId] ||
    (app.providerStatistics[providerId] = new ProviderStats())
  stats.deltaCount++
  if (delta) noteOwnRates(app, providerId, stats, delta)
}

// A connection that counts its own traffic, such as one that runs outside
// the server, writes providers.<its id>.deltaRate or writeRate itself. From
// then on the server stops writing that rate for it, until the connection
// hasn't written it for OWN_RATE_TIMEOUT_MS.
function noteOwnRates(
  app: WithProviderStatistics,
  providerId: string,
  stats: ProviderStats,
  delta: any
) {
  if (
    delta.context !== undefined &&
    delta.context !== 'vessels.self' &&
    delta.context !== `vessels.${app.selfId}`
  ) {
    return
  }
  const prefix = `providers.${providerId}.`
  for (const update of delta.updates) {
    if (!Array.isArray(update?.values)) continue
    // handleMessage drops an update with an invalid entry, so it doesn't
    // count as the connection writing its rate.
    if (
      update.values.some(
        (pv: any) =>
          pv === null || typeof pv !== 'object' || typeof pv.path !== 'string'
      )
    ) {
      continue
    }
    for (const pv of update.values) {
      const path = pv?.path
      if (typeof path !== 'string' || !path.startsWith(prefix)) continue
      const rate = path.slice(prefix.length) as Rate
      if (!RATES.includes(rate)) continue
      let own = ownRates.get(stats)
      if (!own) ownRates.set(stats, (own = new Map()))
      own.set(rate, Date.now())
    }
  }
}

// Writes each connection's rates under providers.<id> when they change,
// other than those the connection has written itself recently.
export function publishRates(app: any, now = Date.now()) {
  if (typeof app.handleMessage !== 'function') return
  const values: { path: string; value: number }[] = []
  for (const provider of app.providers ?? []) {
    const stats: ProviderStats | undefined = app.providerStatistics[provider.id]
    if (!stats) continue
    const own = ownRates.get(stats)
    let sent = sentRates.get(stats)
    if (!sent) sentRates.set(stats, (sent = new Map()))
    for (const rate of RATES) {
      const ownAt = own?.get(rate)
      if (ownAt !== undefined && now - ownAt < OWN_RATE_TIMEOUT_MS) {
        // The connection's value is the current one; when the server takes
        // the rate back it must write its own, even an unchanged one.
        sent.delete(rate)
      } else if (sent.get(rate) !== stats[rate]) {
        sent.set(rate, stats[rate])
        values.push({
          path: `providers.${provider.id}.${rate}`,
          value: stats[rate]
        })
      }
    }
  }
  if (values.length) {
    app.handleMessage(STATS_PROVIDER_ID, { updates: [{ values }] })
  }
}

function updateProviderPeriodStats(app: any) {
  app.providers.forEach((provider: any) => {
    if (isUndefined(app.providerStatistics[provider.id])) {
      app.providerStatistics[provider.id] = new ProviderStats()
    }
  })

  values(app.providerStatistics).forEach((stats: ProviderStats) => {
    stats.deltaRate =
      (stats.deltaCount - stats.lastIntervalDeltaCount) /
      STATS_UPDATE_INTERVAL_SECONDS
    stats.lastIntervalDeltaCount = stats.deltaCount
    stats.writeRate =
      (stats.writeCount - stats.lastIntervalWriteCount) /
      STATS_UPDATE_INTERVAL_SECONDS
    stats.lastIntervalWriteCount = stats.writeCount
  })
}
