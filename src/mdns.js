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
const debug = require('debug')('signalk-server:mdns')
const dnssd = require('dnssd2')
const ports = require('./ports')

module.exports = function mdnsResponder(app) {
  const config = app.config

  let mdns = dnssd

  try {
    mdns = require('mdns')
    debug('using  mdns')
  } catch (ex) {
    debug(ex)
    debug('mdns not found, using dnssd2')
  }

  if (typeof config.settings.mdns !== 'undefined' && !config.settings.mdns) {
    debug('Mdns disabled by configuration')
    return
  }

  let txtRecord = {
    txtvers: '1',
    swname: config.name,
    swvers: config.version,
    // hardcoded out of master/slave, main/aux
    roles: 'master, main',
    self: app.selfId,
    vname: config.vesselName,
    vmmsi: config.vesselMMSI,
    vuuid: config.vesselUUID
  }

  // Strip all the null or empty props in txtRecord
  txtRecord = _.pickBy(txtRecord, _.identity)

  const types = []
  types.push({
    type: app.config.settings.ssl ? mdns.tcp('https') : mdns.tcp('http'),
    port: ports.getExternalPort(app)
  })

  for (const key in app.interfaces) {
    if (
      _.isObject(app.interfaces[key]) &&
      _.isObject(app.interfaces[key].mdns)
    ) {
      const service = app.interfaces[key].mdns

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

  const options = {
    txtRecord,
    txt: txtRecord
  }

  const instanceName = getInstanceName(app.signalk)

  const host = app.config.getExternalHostname()
  if (host !== require('os').hostname()) {
    options.host = host
  }

  const ads = []
  types.forEach((type, i) => {
    startAdWithNamedRetry(mdns, type, i, options, instanceName, ads, 0)
  })

  return {
    stop: function() {
      ads.forEach(function(ad) {
        debug('Stopping mDNS advertisement...')
        ad.stop()
      })
    }
  }
}

const MAX_RETRIES = 9

function startAdWithNamedRetry(
  mdns,
  type,
  i,
  options,
  instanceName,
  ads,
  retryIndex
) {
  if (retryIndex > MAX_RETRIES) {
    return
  }

  debug(`Starting mDNS ad: ${type.type} ${type.host} ${type.port}`)

  let name
  if (instanceName) {
    name = toLengthCappedIndexedName(
      i === 0 ? `SK ${instanceName}` : instanceName,
      retryIndex
    )
  }
  const optionsForType = { name, ...options }
  debug(optionsForType)
  const ad = new mdns.Advertisement(type.type, type.port, optionsForType)
  ad.on('error', err => {
    console.log(type.type.name)
    console.error(err)
    try {
      ad.stop()
    } catch (e) {
      console.error(e)
    }
    startAdWithNamedRetry(
      mdns,
      type,
      i,
      options,
      instanceName,
      ads,
      retryIndex + 1
    )
  })
  ad.start()
  ads[i] = ad
}

const AD_NAME_MAX_UTF_LENGTH = 63 - 3 //allow prefix 'SK ' for http

function getInstanceName(signalk) {
  const full = signalk.retrieve()
  return _.get(full, `${_.get(full, 'self')}.name`)
}

// return the string with utf length capped to 60
// with retry count appended as -n for n >0
function toLengthCappedIndexedName(s, retryIndex) {
  let result = s
  const maxLength = AD_NAME_MAX_UTF_LENGTH - (retryIndex > 0 ? '-X'.length : 0)
  while (utfLength(result) > maxLength) {
    result = result.slice(0, result.length - 1)
  }
  return result + (retryIndex > 0 ? `-${retryIndex}` : '')
}

function utfLength(s) {
  // tslint:disable-next-line:no-bitwise
  return ~-encodeURI(s).split(/%..|./).length
}
