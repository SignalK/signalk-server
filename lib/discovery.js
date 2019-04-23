/*
 * Copyright 2017 Scott Bender <scott@scottbender.net>
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

const debug = require('debug')('signalk-server:discovery')
const n2kDiscover = require('@canboat/canboatjs').discover
const dgram = require('dgram')

module.exports.runDiscovery = function (app) {
  try {
    n2kDiscover(app)
  } catch (ex) {
    console.log(ex)
  }

  discoverWLN10()
  discoverGoFree()

  function findUDPProvider (port) {
    return app.config.settings.pipedProviders.find(provider => {
      return (
        provider.pipeElements &&
        provider.pipeElements.length === 1 &&
        provider.pipeElements[0].type === 'providers/simple' &&
        provider.pipeElements[0].options &&
        provider.pipeElements[0].options.type === 'NMEA0183' &&
        provider.pipeElements[0].options.subOptions.type === 'udp' &&
        provider.pipeElements[0].options.subOptions.port === port
      )
    })
  }

  function discoverGoFree () {
    const socket = dgram.createSocket('udp4')
    const found = []
    socket.on('message', function (buffer, remote) {
      const msg = buffer.toString('utf8')
      if (msg[0] === '{') {
        try {
          const json = JSON.parse(msg)
          const serial = json.SerialNumber
          if (json.Services && !(serial in found)) {
            json.Services.forEach(service => {
              if (service.Service === 'nmea-0183') {
                const id = `${json.Name}(${serial})`
                debug('found GoFree %s at %s:%s', id, service.IP, service.Port)
                app.emit('discovered', {
                  id: id,
                  pipeElements: [
                    {
                      type: 'providers/simple',
                      options: {
                        type: 'NMEA0183',
                        subOptions: {
                          type: 'tcp',
                          host: service.IP,
                          port: service.Port
                        }
                      }
                    }
                  ]
                })
              }
            })
          }
        } catch (err) {
          debug(err)
          return
        }
      }
    })
    socket.on('error', error => {
      debug(error)
    })
    socket.on('close', () => {
      debug('close')
    })
    debug('looking for GoFree broadcasting on UDP port 2052')
    try {
      socket.bind(2052, () => {
        socket.addMembership('239.2.1.1')
      })
    } catch (ex) {
      debug(ex)
    }
    setTimeout(() => {
      if (socket) {
        socket.close()
      }
    }, 5000)
  }

  function discoverWLN10 () {
    if (!findUDPProvider('2000')) {
      let socket = dgram.createSocket('udp4')
      socket.on('message', function (buffer, remote) {
        const msg = buffer.toString('utf8')
        if (msg[0] === '$') {
          socket.close()
          socket = undefined
          app.emit('discovered', {
            id: 'WLN10',
            pipeElements: [
              {
                type: 'providers/simple',
                options: {
                  type: 'NMEA0183',
                  subOptions: {
                    type: 'udp',
                    port: '2000'
                  }
                }
              }
            ]
          })
        }
      })
      socket.on('error', error => {
        debug(error)
      })
      socket.on('close', () => {
        debug('close')
      })
      debug('looking for a WLN10 broadcasting UDP port 2000')
      try {
        socket.bind(2000)
      } catch (ex) {
        debug(ex)
      }
      setTimeout(() => {
        if (socket) {
          socket.close()
        }
      }, 5000)
    }
  }
}
