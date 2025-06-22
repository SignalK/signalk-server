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
import { resolveDeviceName } from './deviceNameResolver'
import { deviceRegistryCache } from './deviceRegistryCache'
import { createDebug } from './debug'

const debug = createDebug('signalk-server:deltastats')

const STATS_UPDATE_INTERVAL_SECONDS = 5
export const CONNECTION_WRITE_EVENT_NAME = 'connectionwrite'

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
  displayName?: string
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

export interface WithProviderStatistics {
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
    
    // Add display names for WebSocket connections
    if (anyApp.interfaces?.ws) {
      // Use device registry cache for background stats generation
      const devices = deviceRegistryCache.getAllDevices()
      const activeClients = anyApp.interfaces.ws.getActiveClients()
      debug('Active WebSocket clients:', activeClients.length)
      debug('Cached devices:', devices.map(d => ({ clientId: d.clientId, description: d.description })))
      
      Object.keys(app.providerStatistics).forEach((providerId) => {
        if (providerId.startsWith('ws.')) {
          debug('Processing WebSocket provider:', providerId)
          
          // Find matching client by various ID formats
          const clientInfo = activeClients.find((c: any) => {
            // Try direct ID match first
            if (`ws.${c.id}` === providerId) {
              debug('Found matching client by direct ID:', c.id)
              return true
            }
            
            // Try principal identifier match
            if (c.skPrincipal?.identifier && `ws.${c.skPrincipal.identifier.replace(/\./g, '_')}` === providerId) {
              debug('Found matching client by principal:', c.skPrincipal.identifier)
              return true
            }
            
            return false
          })
          
          if (clientInfo) {
            debug('Client info:', { 
              id: clientInfo.id, 
              principal: clientInfo.skPrincipal?.identifier,
              userAgent: clientInfo.userAgent 
            })
            
            // Use device registry cache for name resolution
            // Try multiple ID formats for device lookup
            let deviceId = clientInfo.id
            
            // If we have a principal identifier, it might be the device ID
            if (clientInfo.skPrincipal?.identifier) {
              // Check if any device matches the principal identifier
              const deviceByPrincipal = devices.find(d => d.clientId === clientInfo.skPrincipal.identifier)
              if (deviceByPrincipal) {
                deviceId = clientInfo.skPrincipal.identifier
                debug('Found device by principal identifier:', deviceId)
              }
            }
            
            const displayName = resolveDeviceName(
              deviceId,
              devices,
              clientInfo
            )
            app.providerStatistics[providerId].displayName = displayName
            debug('Resolved display name:', displayName, 'for', providerId, 'using device ID:', deviceId)
          } else {
            debug('No matching client found for', providerId)
          }
        }
      })
    }
    
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
  }, STATS_UPDATE_INTERVAL_SECONDS * 1000)
}

export function incDeltaStatistics(
  app: WithProviderStatistics,
  providerId: any
) {
  app.deltaCount++

  const stats =
    app.providerStatistics[providerId] ||
    (app.providerStatistics[providerId] = new ProviderStats())
  stats.deltaCount++
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
