/*
 * Copyright 2014-2015 Fabian Tollenaar <fabian@starting-point.nl>
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

'use strict'

const _ = require('lodash')
import { createDebug } from './debug'
const debug = createDebug('signalk-server:mdns')
const ciao = require('@homebridge/ciao')
const ports = require('./ports')

module.exports = function mdnsResponder(app) {
  const config = app.config

  if (typeof config.settings.mdns !== 'undefined' && !config.settings.mdns) {
    debug('Mdns disabled by configuration')
    return
  }

  // Create a single responder instance for all services
  const responder = ciao.getResponder()

  // Build TXT record, stripping null/empty values
  let txtRecord = {
    txtvers: '1',
    swname: config.name,
    swvers: config.version,
    roles: 'master, main',
    self: app.selfId,
    vname: config.vesselName,
    vmmsi: config.vesselMMSI,
    vuuid: config.vesselUUID
  }
  txtRecord = _.pickBy(txtRecord, _.identity)

  // Collect services to advertise
  const services = []

  // Primary HTTP/HTTPS service
  services.push({
    name: config.vesselName || config.name || 'SignalK',
    type: app.config.settings.ssl ? 'signalk-https' : 'signalk-http',
    port: ports.getExternalPort(app),
    txt: txtRecord
  })

  // Additional services from interfaces
  for (const key in app.interfaces) {
    if (
      _.isObject(app.interfaces[key]) &&
      _.isObject(app.interfaces[key].mdns)
    ) {
      const mdnsConfig = app.interfaces[key].mdns

      if (mdnsConfig.type === 'tcp' && mdnsConfig.name.charAt(0) === '_') {
        // Remove leading underscore - ciao adds it automatically
        const serviceType = mdnsConfig.name.substring(1)
        services.push({
          name: config.vesselName || config.name || 'SignalK',
          type: serviceType,
          port: mdnsConfig.port,
          txt: txtRecord
        })
      } else {
        debug('Not advertising mDNS service for interface: ' + key)
        debug(
          'mDNS service type should be TCP, and the name should start with "_".'
        )
      }
    }
  }

  // Configure hostname if different from OS hostname
  const host = app.config.getExternalHostname()
  const osHostname = require('os').hostname()
  const serviceOptions = host !== osHostname ? { hostname: host } : {}

  debug('mDNS service options:', serviceOptions)

  const activeServices = []
  let stopping = false
  let advertisingPromise = null

  // Start advertising all services
  const startAdvertising = async () => {
    for (const svc of services) {
      // Check if we're stopping before starting each service
      if (stopping) {
        debug('Stopping flag set, skipping remaining services')
        break
      }

      debug('Starting mDNS ad: _' + svc.type + '._tcp ' + host + ':' + svc.port)

      try {
        const service = responder.createService({
          name: svc.name,
          type: svc.type,
          port: svc.port,
          txt: svc.txt,
          ...serviceOptions
        })

        service.on('name-change', (newName) => {
          debug(`Service name changed to: ${newName}`)
        })

        activeServices.push(service)

        // Don't await if we're stopping
        if (!stopping) {
          await service.advertise()
          debug(`Successfully advertising _${svc.type}._tcp`)
        }
      } catch (err) {
        // Ignore errors if we're stopping
        if (!stopping) {
          console.error(`Failed to advertise _${svc.type}._tcp:`, err)
        }
      }
    }
  }

  // Start advertising (track the promise so we can wait for it on stop)
  advertisingPromise = startAdvertising().catch((err) => {
    if (!stopping) {
      console.error('mDNS advertising failed:', err)
    }
  })

  return {
    stop: async function () {
      debug('Stopping mDNS advertisements...')

      // Set stopping flag to prevent new operations
      stopping = true

      // Wait for advertising to complete or fail (with a timeout)
      if (advertisingPromise) {
        try {
          await Promise.race([
            advertisingPromise,
            new Promise((resolve) => setTimeout(resolve, 1000))
          ])
        } catch (err) {
          debug('Error waiting for advertising to complete:', err)
        }
      }

      // Stop all services
      for (const service of activeServices) {
        try {
          await service.end()
        } catch (err) {
          debug('Error stopping service:', err)
        }
      }

      // Shutdown the responder (sends goodbye packets)
      try {
        await responder.shutdown()
      } catch (err) {
        debug('Error shutting down responder:', err)
      }

      debug('mDNS advertisements stopped')
    }
  }
}
