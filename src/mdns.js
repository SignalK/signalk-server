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
const { Bonjour } = require('bonjour-service')
const ports = require('./ports')

module.exports = function mdnsResponder(app) {
  const config = app.config

  if (typeof config.settings.mdns !== 'undefined' && !config.settings.mdns) {
    debug('Mdns disabled by configuration')
    return
  }

  // Create Bonjour instance
  const bonjour = new Bonjour()

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

  // Configure hostname if different from OS hostname
  const host = app.config.getExternalHostname()
  const osHostname = require('os').hostname()
  const hostOption = host !== osHostname ? host : undefined

  const serviceName = config.vesselName || config.name || 'SignalK'
  const publishedServices = []

  // Primary HTTP/HTTPS service
  const primaryType = app.config.settings.ssl ? 'signalk-https' : 'signalk-http'
  const primaryPort = ports.getExternalPort(app)

  debug(`Starting mDNS ad: _${primaryType}._tcp ${host}:${primaryPort}`)
  publishedServices.push(
    bonjour.publish({
      name: serviceName,
      type: primaryType,
      port: primaryPort,
      txt: txtRecord,
      host: hostOption,
      probe: false // Disable probing - we own this service name
    })
  )

  // Additional services from interfaces
  for (const key in app.interfaces) {
    if (
      _.isObject(app.interfaces[key]) &&
      _.isObject(app.interfaces[key].mdns)
    ) {
      const mdnsConfig = app.interfaces[key].mdns

      if (mdnsConfig.type === 'tcp' && mdnsConfig.name.charAt(0) === '_') {
        // Remove leading underscore - bonjour-service adds it automatically
        const serviceType = mdnsConfig.name.substring(1)

        debug(
          `Starting mDNS ad: _${serviceType}._tcp ${host}:${mdnsConfig.port}`
        )
        publishedServices.push(
          bonjour.publish({
            name: serviceName,
            type: serviceType,
            port: mdnsConfig.port,
            txt: txtRecord,
            host: hostOption,
            probe: false // Disable probing - we own this service name
          })
        )
      } else {
        debug('Not advertising mDNS service for interface: ' + key)
        debug(
          'mDNS service type should be TCP, and the name should start with "_".'
        )
      }
    }
  }

  debug(`Published ${publishedServices.length} mDNS services`)

  return {
    stop: function () {
      debug('Stopping mDNS advertisements...')
      return new Promise((resolve) => {
        bonjour.unpublishAll(() => {
          bonjour.destroy()
          debug('mDNS advertisements stopped')
          resolve()
        })
      })
    }
  }
}
