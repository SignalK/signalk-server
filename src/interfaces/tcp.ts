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

import Debug from 'debug'
import { values } from 'lodash'
import { createServer, Server, Socket } from 'net'
import split from 'split'
const debug = Debug('signalk-server:interfaces:tcpstream')
import { Interface, SignalKServer } from '../types'

interface SocketWithId extends Socket {
  id?: number
  name?: string
}

module.exports = (app: SignalKServer) => {
  'use strict'
  const openSockets: { [socketId: number]: SocketWithId } = {}
  let idSequence = 0
  let server: Server | null
  const port = Number(process.env.TCPSTREAMPORT) || 8375
  const api = new Interface()

  api.start = () => {
    debug('Starting tcp interface')

    server = createServer((socket: SocketWithId) => {
      socket.id = idSequence++
      socket.on('error', err => {
        debug('Error:' + err + ' ' + socket.id + ' ' + socket.name)
        delete openSockets[socket.id || 0]
      })
      socket.on('close', hadError => {
        debug('Close:' + hadError + ' ' + socket.id + ' ' + socket.name)
        delete openSockets[socket.id || 0]
      })
      socket
        .pipe(
          split((s: string) => {
            if (s.length > 0) {
              return JSON.parse(s)
            }
          })
        )
        .on('data', msg => {
          app.handleMessage('tcp', msg)
        })
        .on('error', err => {
          console.error(err)
        })
      socket.name = socket.remoteAddress + ':' + socket.remotePort
      debug('Connected:' + socket.id + ' ' + socket.name)
      openSockets[socket.id] = socket
      socket.write(JSON.stringify(app.getHello()) + '\r\n')
      socket.on('end', () => {
        // client disconnects
        debug('Ended:' + socket.id + ' ' + socket.name)
        delete openSockets[socket.id || 0]
      })
    })
    app.signalk.on('delta', (data: any) => {
      const jsonData = JSON.stringify(data)
      values(openSockets).forEach(socket => {
        try {
          socket.write(jsonData + '\r\n')
        } catch (e) {
          console.error(e + ' ' + socket)
        }
      })
    })

    server.on('listening', () =>
      debug('Signal K tcp server listening on ' + port)
    )
    server.on('error', e => {
      console.error(`Signal K tcp server error: ${e.message}`)
    })

    if (process.env.TCPSTREAMADDRESS) {
      debug('Binding to ' + process.env.TCPSTREAMADDRESS)
      server.listen(port, process.env.TCPSTREAMADDRESS)
    } else {
      server.listen(port)
    }
    debug('Tcp delta server listening on ' + port)
    return {
      port
    }
  }

  api.stop = () => {
    if (server) {
      server.close()
      server = null
    }
  }

  api.mdns = {
    name: '_signalk-tcp',
    type: 'tcp',
    port
  }

  return api
}
