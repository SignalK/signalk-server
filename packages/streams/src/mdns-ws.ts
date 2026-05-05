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
import http from 'http'
import https from 'https'
import { Client } from '@signalk/client'
import { getMetadata } from '@signalk/signalk-schema'
import { CreateDebug, DebugLogger } from './types'
import { stampRemoteUpdates, RemoteUpdate } from './remote-deltas'

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
  token?: string
  remoteSelf?: string
  ignoreServers?: string[]
  selfsignedcert?: boolean
}

interface DeltaMessage {
  context?: string
  updates?: RemoteUpdate[]
}

export default class MdnsWs extends Transform {
  private readonly options: MdnsWsOptions
  private readonly selfHost: string
  private readonly selfPort: number
  private readonly remoteServers: Record<string, object> = {}
  private readonly debug: DebugLogger
  private readonly dataDebug: DebugLogger
  private readonly subscriptions: object[] = []
  private handleContext: (delta: DeltaMessage) => void
  private signalkClient?: Client
  private isDestroying = false
  private fetchedMetaPaths = new Set<string>()

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
    if (options.subscription) {
      try {
        const parsed = JSON.parse(options.subscription)
        this.subscriptions = Array.isArray(parsed) ? parsed : [parsed]
      } catch (ex) {
        const error = ex as Error
        options.app.setProviderError(
          options.providerId,
          `unable to parse subscription json: ${options.subscription}: ${error.message}`
        )
        console.error(
          `unable to parse subscription json: ${options.subscription}: ${error.message}`
        )
        return
      }
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

  private verifyRemoteToken(): Promise<boolean> {
    const protocol = this.options.type === 'wss' ? https : http
    return new Promise((resolve, reject) => {
      const reqOptions = {
        hostname: this.options.host,
        port: this.options.port,
        path: '/signalk/v1/api/self',
        method: 'GET',
        headers: {
          Authorization: `JWT ${this.options.token}`
        },
        rejectUnauthorized: !(this.options.selfsignedcert === true)
      }
      const req = protocol.request(reqOptions, (response) => {
        response.resume()
        resolve(response.statusCode === 200)
      })
      req.on('error', (err) => reject(err))
      req.setTimeout(10000, () => {
        req.destroy(new Error('Token verification timed out'))
      })
      req.end()
    })
  }

  private setProviderStatus(message: string, isError: boolean): void {
    if (!isError) {
      this.options.app.setProviderStatus(this.options.providerId, message)
    } else {
      this.options.app.setProviderError(this.options.providerId, message)
    }
  }

  private connectClient(client: Client): void {
    client.on('connect', () => {
      this.fetchedMetaPaths.clear()
      this.options.app.setProviderStatus(
        this.options.providerId,
        `ws connection connected to ${client.options.hostname}:${client.options.port}`
      )
      if (this.options.token) {
        const conn = client.connection
        if (conn) {
          conn.send(JSON.stringify({ token: this.options.token })).catch(() => {
            // ignore send errors; error event handler will report
          })
          conn.setAuthenticated(this.options.token, 'JWT')
          this.debug('Sent authentication token to remote server')

          this.verifyRemoteToken()
            .then((isValid) => {
              if (!isValid) {
                this.setProviderStatus(
                  `Authentication failed for ${client.options.hostname}:${client.options.port} — token may be invalid or revoked`,
                  true
                )
                conn.disconnect()
              }
            })
            .catch((err) => {
              if (this.debug.enabled) {
                this.debug('Token verification error: ' + err.message)
              }
            })
        }
      }
      if (
        this.options.selfHandling !== 'manualSelf' &&
        this.options.selfHandling !== 'noSelf'
      ) {
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
      this.remoteServers[client.options.hostname + ':' + client.options.port] =
        client
      this.subscriptions.forEach((sub, idx) => {
        if (this.debug.enabled) {
          this.debug('sending subscription %j', sub)
        }
        client.subscribe(sub, String(idx))
      })
    })

    client.on('disconnect', () => {
      if (this.isDestroying) {
        return
      }
      this.setProviderStatus(
        `Disconnected from ${client.options.hostname}:${client.options.port}`,
        true
      )
    })

    client.on('error', (err: Error) => {
      if (this.isDestroying) {
        return
      }
      this.setProviderStatus(`Connection error: ${err.message}`, true)
    })

    client.on('delta', (data: DeltaMessage) => {
      if (data && data.updates) {
        this.handleContext(data)
        if (this.dataDebug.enabled) {
          this.dataDebug(JSON.stringify(data))
        }
        stampRemoteUpdates(
          data.updates,
          `${this.options.providerId}.${client.options.hostname}:${client.options.port}`
        )
      }

      this.push(data)

      if (data?.updates) {
        for (const update of data.updates) {
          const values = update.values as Array<{ path: string }> | undefined
          if (values) {
            for (const pv of values) {
              if (!this.fetchedMetaPaths.has(pv.path)) {
                this.fetchedMetaPaths.add(pv.path)
                this.fetchMetaIfNeeded(client, data.context, pv.path)
              }
            }
          }
        }
      }
    })

    client.connect().catch((err) => {
      if (this.debug.enabled) {
        this.debug('connect() promise rejected: %s', err?.message ?? err)
      }
    })
  }

  private fetchMetaIfNeeded(
    client: Client,
    context: string | undefined,
    path: string
  ): void {
    if (getMetadata('vessels.self.' + path)) {
      return
    }

    client
      .API()
      .then((api) => api.getMeta(`/vessels/self/${path.replace(/\./g, '/')}`))
      .then((meta) => {
        if (meta) {
          this.debug(`fetched meta for ${path} from remote`)
          this.push({
            context,
            updates: [{ meta: [{ path, value: meta }] }]
          })
        }
      })
      .catch((err: Error) => {
        this.debug(`failed to fetch meta for ${path}: ${err.message}`)
      })
  }

  _transform(
    chunk: unknown,
    encoding: BufferEncoding,
    done: TransformCallback
  ): void {
    done()
  }

  _destroy(
    error: Error | null,
    callback: (error?: Error | null) => void
  ): void {
    this.isDestroying = true
    try {
      this.signalkClient?.disconnect()
    } catch (err) {
      this.debug('error disconnecting client: %s', (err as Error).message)
    }
    this.signalkClient = undefined
    callback(error)
  }
}
