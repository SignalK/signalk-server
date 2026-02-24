/*
 * Copyright 2016 Teppo Kurki <teppo.kurki@iki.fi>
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

import { Transform, TransformCallback } from 'stream'
import { Client } from '@signalk/client'
import { CreateDebug, DebugLogger } from './types'

interface MdnsWsOptions {
  app: {
    config: {
      getExternalHostname(): string
      getExternalPort(): number
    }
    setProviderStatus(id: string, msg: string): void
    setProviderError(id: string, msg: string): void
  }
  providerId: string
  createDebug?: CreateDebug
  host?: string
  port?: number
  type?: string
  subscription?: string
  selfHandling?: string
  remoteSelf?: string
  ignoreServers?: string[]
  selfsignedcert?: boolean
}

interface DeltaMessage {
  context?: string
  updates?: Array<{ $source?: string; [key: string]: unknown }>
}

export default class MdnsWs extends Transform {
  private readonly options: MdnsWsOptions
  private readonly selfHost: string
  private readonly selfPort: number
  private readonly remoteServers: Record<string, object> = {}
  private readonly debug: DebugLogger
  private readonly dataDebug: DebugLogger
  private handleContext: (delta: DeltaMessage) => void
  private signalkClient?: Client

  constructor(options: MdnsWsOptions) {
    super({ objectMode: true })
    this.options = options
    this.selfHost = options.app.config.getExternalHostname() + '.'
    this.selfPort = options.app.config.getExternalPort()
    this.remoteServers[this.selfHost + ':' + this.selfPort] = {}
    const deltaStreamBehaviour = options.subscription ? 'none' : 'all'

    const createDebug = options.createDebug ?? require('debug')
    this.debug = createDebug('signalk:streams:mdns-ws')
    this.dataDebug = createDebug('signalk:streams:mdns-ws-data')
    this.debug(`deltaStreamBehaviour:${deltaStreamBehaviour}`)

    this.handleContext = () => {}
    if (options.selfHandling === 'manualSelf') {
      if (options.remoteSelf) {
        this.debug(`Using manual remote self ${options.remoteSelf}`)
        this.handleContext = (delta) => {
          if (delta.context === options.remoteSelf) {
            delete delta.context
          }
        }
      } else {
        console.error(
          'Manual self handling speficied but no remoteSelf configured'
        )
      }
    }

    if (options.ignoreServers) {
      options.ignoreServers.forEach((s) => {
        this.remoteServers[s] = {}
      })
    }
    if (options.host && options.port) {
      this.signalkClient = new Client({
        hostname: options.host,
        port: options.port,
        useTLS: options.type === 'wss',
        reconnect: true,
        notifications: false,
        autoConnect: false,
        deltaStreamBehaviour,
        rejectUnauthorized: !(options.selfsignedcert === true),
        wsKeepaliveInterval: 10
      })
      this.connectClient(this.signalkClient)
    } else {
      this.options.app.setProviderError(
        this.options.providerId,
        'This connection is deprecated and must be deleted'
      )
    }
  }

  private connectClient(client: Client): void {
    client
      .connect()
      .then(() => {
        this.options.app.setProviderStatus(
          this.options.providerId,
          `ws connection connected to ${client.options.hostname}:${client.options.port}`
        )
        console.log(
          `ws connection connected to ${client.options.hostname}:${client.options.port}`
        )
        if (this.options.selfHandling === 'useRemoteSelf') {
          client
            .API()
            .then((api) => api.get('/self'))
            .then((selfFromServer) => {
              this.debug(
                `Mapping context ${selfFromServer} to self (empty context)`
              )
              this.handleContext = (delta) => {
                if (delta.context === selfFromServer) {
                  delete delta.context
                }
              }
            })
            .catch((err) => {
              console.error('Error retrieving self from remote server')
              console.error(err)
            })
        }
        this.remoteServers[
          client.options.hostname + ':' + client.options.port
        ] = client
        if (this.options.subscription) {
          let parsed: object | object[]
          try {
            parsed = JSON.parse(this.options.subscription)
          } catch (ex) {
            const error = ex as Error
            this.options.app.setProviderError(
              this.options.providerId,
              `unable to parse subscription json: ${this.options.subscription}: ${error.message}`
            )
            console.error(
              `unable to parse subscription json: ${this.options.subscription}: ${error.message}`
            )
            return
          }
          if (!Array.isArray(parsed)) {
            parsed = [parsed]
          }
          ;(parsed as object[]).forEach((sub: object, idx: number) => {
            this.debug('sending subscription %j', sub)
            client.subscribe(sub, String(idx))
          })
        }
      })
      .catch((err: Error) => {
        this.options.app.setProviderError(this.options.providerId, err.message)
        console.error(err.message)
      })

    client.on('delta', (data: DeltaMessage) => {
      if (data && data.updates) {
        this.handleContext(data)
        if (this.dataDebug.enabled) {
          this.dataDebug(JSON.stringify(data))
        }
        data.updates.forEach((update) => {
          update['$source'] =
            `${this.options.providerId}.${client.options.hostname}:${client.options.port}`
        })
      }

      this.push(data)
    })
  }

  _transform(
    chunk: unknown,
    encoding: BufferEncoding,
    done: TransformCallback
  ): void {
    done()
  }
}
