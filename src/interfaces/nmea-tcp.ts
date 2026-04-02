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
      })
      socket.on('error', (err: Error) => {
        debug('Error:' + err + ' ' + socket.id + ' ' + socket.name)
        delete openSockets[socket.id!]
      })
    })
    const send = (data: string) => {
      Object.values(openSockets).forEach((socket) => {
        try {
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
