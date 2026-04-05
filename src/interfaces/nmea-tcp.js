/*
 * Copyright 2015 Teppo Kurki <teppo.kurki@iki.fi>
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

const _ = require('lodash')

import { createDebug } from '../debug'
const debug = createDebug('signalk-server:interfaces:tcp:nmea0183')

const BUFFER_LIMIT = process.env.BACKPRESSURE_ENTER
  ? parseInt(process.env.BACKPRESSURE_ENTER, 10)
  : 512 * 1024
const MAX_BUFFER = process.env.MAXSENDBUFFERSIZE
  ? parseInt(process.env.MAXSENDBUFFERSIZE, 10)
  : 4 * 512 * 1024
const MAX_BUFFER_TIME = process.env.MAXSENDBUFFERCHECKTIME
  ? parseInt(process.env.MAXSENDBUFFERCHECKTIME, 10)
  : 30 * 1000

module.exports = function (app) {
  'use strict'
  const net = require('net')
  const openSockets = {}
  const bufferExceededSince = {}
  let idSequence = 0
  let server = null
  const port = Number(process.env.NMEA0183PORT) || 10110
  const api = {}

  api.start = function () {
    debug('Starting tcp interface')

    server = net.createServer(function (socket) {
      socket.id = idSequence++
      socket.name = socket.remoteAddress + ':' + socket.remotePort
      debug('Connected:' + socket.id + ' ' + socket.name)
      openSockets[socket.id] = socket
      socket.on('data', (data) => {
        app.emit('tcpserver0183data', data.toString())
      })
      socket.on('end', function () {
        // client disconnects
        debug('Ended:' + socket.id + ' ' + socket.name)
        delete openSockets[socket.id]
        delete bufferExceededSince[socket.id]
      })
      socket.on('error', function (err) {
        debug('Error:' + err + ' ' + socket.id + ' ' + socket.name)
        delete openSockets[socket.id]
        delete bufferExceededSince[socket.id]
      })
    })
    const send = (data) => {
      _.values(openSockets).forEach(function (socket) {
        try {
          if (socket.writableLength > BUFFER_LIMIT) {
            debug(
              'Dropping NMEA sentence for slow client %s (buffer: %d)',
              socket.name,
              socket.writableLength
            )
            if (MAX_BUFFER > 0 && socket.writableLength > MAX_BUFFER) {
              if (!bufferExceededSince[socket.id]) {
                console.warn(
                  `NMEA TCP ${socket.name} buffer exceeded max: ${socket.writableLength}`
                )
                bufferExceededSince[socket.id] = Date.now()
              }
              if (
                Date.now() - bufferExceededSince[socket.id] >
                MAX_BUFFER_TIME
              ) {
                console.error(
                  'NMEA TCP buffer overflow, terminating ' + socket.name
                )
                socket.destroy()
                delete openSockets[socket.id]
                delete bufferExceededSince[socket.id]
              }
            }
            return
          }
          delete bufferExceededSince[socket.id]
          socket.write(data + '\r\n')
        } catch (e) {
          console.error(e + ' ' + socket)
        }
      })
    }
    app.signalk.on('nmea0183', send)
    app.on('nmea0183out', send)
    server.on('listening', () =>
      debug('NMEA0138 tcp server listening on ' + port)
    )
    server.on('error', (e) => {
      console.error(`NMEA0138 tcp server error: ${e.message}`)
    })
    server.listen(port)
  }

  api.stop = function () {
    if (server) {
      server.close()
      server = null
    }
  }

  api.mdns = {
    name: '_nmea-0183',
    type: 'tcp',
    port: port
  }

  return api
}
