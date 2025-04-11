/*
 * Copyright 2014-2015 Teppo Kurki <teppo.kurki@iki.fi>
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

/* Usage:
 * As part of a PipedProvider in a settings file. Lets you pass gpsd to Signal K. GPSD is a service daemon that monitors one or more GPSes or AIS receivers attached to a host computer through serial or USB ports,
 * making all data on the location/course/velocity of the sensors available to be queried on TCP port 2947 of the host computer.
 * For examples of use, see https://github.com/SignalK/signalk-server-node/blob/master/settings/volare-gpsd-settings.json
 * Takes the options "port" (default 2947) and "hostname" (default 'localhost')

 {
  "type": "providers/gpsd",
  "options": {
    "port": 2947,
    "hostname": "localhost"
  },
 },

 */

const Transform = require('stream').Transform
const GpsdClient = require('node-gpsd-client')

function Gpsd(options) {
  Transform.call(this, {
    objectMode: true
  })

  const port = options.port || 2947
  const hostname = options.hostname || options.host || 'localhost'
  const noDataReceivedTimeout = options.noDataReceivedTimeout || 0

  function setProviderStatus(msg) {
    options.app.setProviderStatus(options.providerId, msg)
  }

  const createDebug = options.createDebug || require('debug')

  this.listener = new GpsdClient({
    port: port,
    hostname: hostname,
    logger: {
      info: createDebug('signalk:streams:gpsd'),
      warn: console.warn,
      error: (msg) => {
        options.app.setProviderError(
          options.providerId,
          `${hostname}:${port}: ` + msg
        )
      }
    },
    parse: false,
    reconnectThreshold: noDataReceivedTimeout,
    reconnectInterval: noDataReceivedTimeout / 2
  })

  setProviderStatus(`Connecting to ${hostname}:${port}`)

  this.listener.on('connected', () => {
    setProviderStatus(`Connected to ${hostname}:${port}`)
    this.listener.watch({
      class: 'WATCH',
      nmea: true,
      json: false
    })
  })

  const self = this
  this.listener.on('raw', function (data) {
    self.push(data)
  })

  this.listener.connect()
}

require('util').inherits(Gpsd, Transform)

Gpsd.prototype._transform = function (chunk, encoding, done) {
  done()
}

module.exports = Gpsd
