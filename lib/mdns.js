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

let _ = require('lodash'),
  debug = require('debug')('signalk-server:interfaces:mdns'),
  mdns = require('mdns')

function getConfigString (settingsObject, key) {
  if (_.isObject(settingsObject) && typeof settingsObject[key] === 'string') {
    return settingsObject[key].trim()
  }

  return ''
}

module.exports = function mdnsResponder (app) {
  let config = app.config

  if (typeof config.settings.mdns !== 'undefined' && !config.settings.mdns) {
    debug('Mdns disabled by configuration')
    return
  }

  let txtRecord = {
    server: config.name,
    version: config.version,
    // hardcoded out of master/slave, main/aux
    roles: 'master, main',
    self: app.selfId,
    vessel_name: getConfigString(config.settings.vessel, 'name'),
    vessel_brand: getConfigString(config.settings.vessel, 'brand'),
    vessel_type: getConfigString(config.settings.vessel, 'type'),
    vessel_mmsi: getConfigString(config.settings.vessel, 'mmsi'),
    vessel_uuid: getConfigString(config.settings.vessel, 'uuid')
  }

  // Strip all the null or empty props in txtRecord
  txtRecord = _.pickBy(txtRecord, _.identity)

  let types = []
  types.push({
    type: app.config.settings.ssl ? mdns['tcp']('https') : mdns['tcp']('http'),
    port: app.config.port
  })

  for (var key in app.interfaces) {
    if (
      _.isObject(app.interfaces[key]) &&
      _.isObject(app.interfaces[key].mdns)
    ) {
      var service = app.interfaces[key].mdns

      if (
        'tcp'.indexOf(service.type) !== -1 &&
        service.name.charAt(0) === '_'
      ) {
        types.push({
          type: mdns[service.type](service.name),
          port: service.port
        })
      } else {
        debug('Not advertising mDNS service for interface: ' + key)
        debug(
          'mDNS service type should be TCP or HTTP, and the name should start with "_".'
        )
      }
    }
  }

  let options = {
    txtRecord: txtRecord
  }

  const host = app.config.getExternalHostname()

  if (host != require('os').hostname()) {
    options.host = host
  }

  debug(options)

  let ads = []
  for (var i in types) {
    let type = types[i]
    debug(
      'Starting mDNS ad: ' +
        type.type +
        ' ' +
        app.config.getExternalHostname() +
        ':' +
        type.port
    )
    let ad = new mdns.Advertisement(type.type, type.port, options)
    ad.start()
    ads.push(ad)
  }

  return {
    stop: function () {
      ads.forEach(function (ad) {
        debug('Stopping mDNS advertisement...')
        ad.stop()
      })
    }
  }
}
