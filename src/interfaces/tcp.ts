/* eslint-disable @typescript-eslint/no-explicit-any */
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
import split from 'split'
import { createDebug } from '../debug'
import { Interface, SignalKServer } from '../types'
import { Unsubscribes } from '@signalk/server-api'
import { isIPAllowed } from '../ip-validation'
const debug = createDebug('signalk-server:interfaces:tcp:signalk')

interface SocketWithId extends Socket {
  id?: number
  name?: string
}

module.exports = (app: SignalKServer) => {
  'use strict'
  let idSequence = 0
  let server: Server | null
  const port = Number(process.env.TCPSTREAMPORT) || 8375
  const api = new Interface()

  api.start = () => {
    if (!app.securityStrategy.allowReadOnly()) {
      debug('Not starting tcp interface because readOnly is false')
      return
    }
    debug('Starting tcp interface')

    server = createServer((socket: SocketWithId) => {
      // IP filtering - reject connections from non-allowed IPs
      const allowedIPs = (app as any).securityStrategy?.getConfiguration?.()
        ?.allowedSourceIPs
      if (!isIPAllowed(socket.remoteAddress, allowedIPs)) {
        debug('Connection rejected from: ' + socket.remoteAddress)
        socket.destroy()
        return
      }

      socket.id = idSequence++
      socket.name = socket.remoteAddress + ':' + socket.remotePort
      debug('Connected:' + socket.id + ' ' + socket.name)

      socket.on('error', (err: Error) => {
        debug('Error:' + err + ' ' + socket.id + ' ' + socket.name)
      })
      socket.on('close', (hadError) => {
        debug('Close:' + hadError + ' ' + socket.id + ' ' + socket.name)
      })

      const unsubscibes: Unsubscribes = []
      socket
        .pipe(
          split((s: string) => {
            if (s.length > 0) {
              try {
                return JSON.parse(s)
              } catch (e: any) {
                console.log(e.message)
              }
            }
          })
        )
        .on('data', socketMessageHandler(app, socket, unsubscibes))
        .on('error', (err: Error) => {
          console.error(err)
        })
      socket.on('end', () => {
        unsubscibes.forEach((f) => f())
        debug('Ended:' + socket.id + ' ' + socket.name)
      })

      socket.write(JSON.stringify(app.getHello()) + '\r\n')
    })

    server.on('listening', () =>
      debug('Signal K tcp server listening on ' + port)
    )
    server.on('error', (e) => {
      console.error(`Signal K tcp server error: ${e.message}`)
    })

    if (process.env.TCPSTREAMADDRESS) {
      debug('Binding to ' + process.env.TCPSTREAMADDRESS)
      server.listen(port, process.env.TCPSTREAMADDRESS)
    } else {
      server.listen(port)
    }

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

function socketMessageHandler(
  app: SignalKServer,
  socket: SocketWithId,
  unsubscribes: Unsubscribes
) {
  let lastUpdateErrorLogged = 0
  return (msg: any) => {
    if (msg.updates) {
      if (app.securityStrategy.isDummy()) {
        app.handleMessage('tcp', msg)
      } else {
        if (Date.now() - lastUpdateErrorLogged > 60 * 1000) {
          console.error(`Security is enabled, deltas over tcp ignored`)
          lastUpdateErrorLogged = Date.now()
        }
      }
    } else if (msg.subscribe) {
      debug.enabled && debug(`subscribe:${JSON.stringify(msg)}`)
      app.subscriptionmanager.subscribe(
        msg,
        unsubscribes,
        (err: any) => {
          console.error(`Subscribe  failed:${err}`)
        },
        (aMsg: any) => socket.write(`${JSON.stringify(aMsg)}\r\n`)
      )
    } else if (msg.unsubscribe) {
      debug.enabled && debug(`unsubscribe:${JSON.stringify(msg)}`)
      try {
        app.subscriptionmanager.unsubscribe(msg, unsubscribes)
      } catch (e: any) {
        console.error(e.message)
        socket.write(JSON.stringify(e.message))
        socket.end(() => {
          console.error(`Closed ${socket.name}`)
        })
      }
    }
  }
}
