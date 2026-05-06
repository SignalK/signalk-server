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

import { createServer, Server, Socket } from 'net'
import { createDebug } from '../debug'
import { Interface, SignalKServer } from '../types'

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

interface SocketWithId extends Socket {
  id?: number
  name?: string
}

interface NmeaTcpApp extends SignalKServer {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  emit(event: string, ...args: any[]): boolean
  on(event: string, listener: (...args: string[]) => void): this
}

module.exports = (app: NmeaTcpApp) => {
  'use strict'
  const openSockets: Record<number, SocketWithId> = {}
  const bufferExceededSince: Record<number, number | undefined> = {}
  let idSequence = 0
  let server: Server | null = null
  const port = Number(process.env.NMEA0183PORT) || 10110
  const api = new Interface()

  api.start = () => {
    debug('Starting tcp interface')

    server = createServer((socket: SocketWithId) => {
      socket.id = idSequence++
      socket.name = socket.remoteAddress + ':' + socket.remotePort
      debug('Connected:' + socket.id + ' ' + socket.name)
      openSockets[socket.id] = socket
      socket.on('data', (data: Buffer) => {
        app.emit('tcpserver0183data', data.toString())
      })
      socket.on('end', () => {
        debug('Ended:' + socket.id + ' ' + socket.name)
        delete openSockets[socket.id!]
        delete bufferExceededSince[socket.id!]
      })
      socket.on('error', (err: Error) => {
        debug('Error:' + err + ' ' + socket.id + ' ' + socket.name)
        delete openSockets[socket.id!]
        delete bufferExceededSince[socket.id!]
      })
    })
    const send = (data: string) => {
      Object.values(openSockets).forEach((socket) => {
        try {
          if (socket.writableLength > BUFFER_LIMIT) {
            debug(
              'Dropping NMEA sentence for slow client %s (buffer: %d)',
              socket.name,
              socket.writableLength
            )
            if (MAX_BUFFER > 0 && socket.writableLength > MAX_BUFFER) {
              if (!bufferExceededSince[socket.id!]) {
                console.warn(
                  `NMEA TCP ${socket.name} buffer exceeded max: ${socket.writableLength}`
                )
                bufferExceededSince[socket.id!] = Date.now()
              }
              if (
                Date.now() - bufferExceededSince[socket.id!]! >
                MAX_BUFFER_TIME
              ) {
                console.error(
                  'NMEA TCP buffer overflow, terminating ' + socket.name
                )
                socket.destroy()
                delete openSockets[socket.id!]
                delete bufferExceededSince[socket.id!]
              }
            }
            return
          }
          delete bufferExceededSince[socket.id!]
          socket.write(data + '\r\n')
        } catch (e) {
          console.error(e + ' ' + socket)
        }
      })
    }
    app.signalk.on('nmea0183', send)
    app.on('nmea0183out', send)
    server.on('listening', () =>
      debug('NMEA0183 tcp server listening on ' + port)
    )
    server.on('error', (e: Error) => {
      console.error(`NMEA0183 tcp server error: ${e.message}`)
    })
    server.listen(port)
  }

  api.stop = () => {
    if (server) {
      server.close()
      server = null
    }
  }

  api.mdns = {
    name: '_nmea-0183',
    type: 'tcp',
    port
  }

  return api
}
