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
import {
  AccumulatedItem,
  accumulateLatestValue,
  buildFlushDeltas
} from '../LatestValuesAccumulator'
const debug = createDebug('signalk-server:interfaces:tcp:signalk')

const BACKPRESSURE_ENTER_THRESHOLD = process.env.BACKPRESSURE_ENTER
  ? parseInt(process.env.BACKPRESSURE_ENTER, 10)
  : 512 * 1024
const BACKPRESSURE_EXIT_THRESHOLD = process.env.BACKPRESSURE_EXIT
  ? parseInt(process.env.BACKPRESSURE_EXIT, 10)
  : 1024
const MAXSENDBUFFERSIZE = process.env.MAXSENDBUFFERSIZE
  ? parseInt(process.env.MAXSENDBUFFERSIZE, 10)
  : 4 * 512 * 1024
const MAXSENDBUFFERCHECKTIME = process.env.MAXSENDBUFFERCHECKTIME
  ? parseInt(process.env.MAXSENDBUFFERCHECKTIME, 10)
  : 30 * 1000

interface SocketWithId extends Socket {
  id?: number
  name?: string
}

interface TcpBackpressureState {
  active: boolean
  accumulator: Map<string, AccumulatedItem>
  since: number | null
  bufferSizeExceeded: number | undefined
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
    debug(
      'Backpressure thresholds: enter=%d, exit=%d, max=%d, maxTime=%d',
      BACKPRESSURE_ENTER_THRESHOLD,
      BACKPRESSURE_EXIT_THRESHOLD,
      MAXSENDBUFFERSIZE,
      MAXSENDBUFFERCHECKTIME
    )

    server = createServer((socket: SocketWithId) => {
      socket.id = idSequence++
      socket.name = socket.remoteAddress + ':' + socket.remotePort
      debug('Connected:' + socket.id + ' ' + socket.name)

      const backpressure: TcpBackpressureState = {
        active: false,
        accumulator: new Map(),
        since: null,
        bufferSizeExceeded: undefined
      }

      socket.on('error', (err: Error) => {
        debug('Error:' + err + ' ' + socket.id + ' ' + socket.name)
      })
      socket.on('close', (hadError) => {
        debug('Close:' + hadError + ' ' + socket.id + ' ' + socket.name)
      })

      socket.on('drain', () => {
        if (backpressure.active && backpressure.accumulator.size > 0) {
          if (socket.writableLength <= BACKPRESSURE_EXIT_THRESHOLD) {
            flushAccumulator(socket, backpressure)
          }
        }
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
        .on(
          'data',
          socketMessageHandler(app, socket, unsubscibes, backpressure)
        )
        .on('error', (err: Error) => {
          console.error(err)
        })
      socket.on('close', () => {
        unsubscibes.forEach((f) => f())
        backpressure.accumulator.clear()
        debug('Closed:' + socket.id + ' ' + socket.name)
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

function flushAccumulator(
  socket: SocketWithId,
  backpressure: TcpBackpressureState
): void {
  if (socket.destroyed || backpressure.accumulator.size === 0) return
  const countBefore = backpressure.accumulator.size
  const duration = backpressure.since ? Date.now() - backpressure.since : 0
  const deltas = buildFlushDeltas(backpressure.accumulator, duration)
  for (const delta of deltas) {
    socket.write(`${JSON.stringify(delta)}\r\n`)
  }
  backpressure.accumulator.clear()
  backpressure.active = false
  backpressure.since = null
  debug('Flushed %d accumulated values for %s', countBefore, socket.name)
}

function assertBufferSize(
  socket: SocketWithId,
  backpressure: TcpBackpressureState
): void {
  if (MAXSENDBUFFERSIZE === 0) return
  if (socket.writableLength > MAXSENDBUFFERSIZE) {
    if (!backpressure.bufferSizeExceeded) {
      console.warn(
        `TCP ${socket.name} outgoing buffer > max:${socket.writableLength}`
      )
      backpressure.bufferSizeExceeded = Date.now()
    }
    if (Date.now() - backpressure.bufferSizeExceeded > MAXSENDBUFFERCHECKTIME) {
      console.error(
        'TCP send buffer overflow, terminating connection ' + socket.name
      )
      socket.destroy()
    }
  } else {
    backpressure.bufferSizeExceeded = undefined
  }
}

function socketMessageHandler(
  app: SignalKServer,
  socket: SocketWithId,
  unsubscribes: Unsubscribes,
  backpressure: TcpBackpressureState
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
        (delta: any) => {
          const bufferLength = socket.writableLength
          if (bufferLength > BACKPRESSURE_ENTER_THRESHOLD) {
            if (!backpressure.active) {
              backpressure.active = true
              backpressure.since = Date.now()
              debug(
                'Entering backpressure for %s (buffer: %d)',
                socket.name,
                bufferLength
              )
            }
            accumulateLatestValue(backpressure.accumulator, delta)
          } else {
            socket.write(`${JSON.stringify(delta)}\r\n`)
          }
          assertBufferSize(socket, backpressure)
        }
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
