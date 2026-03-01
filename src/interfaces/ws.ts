/*
 * Copyright 2014-2015 Fabian Tollenaar <fabian@starting-point.nl>
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
import cookie from 'cookie'
import { Server } from 'http'
import { Socket } from 'net'
import Primus from 'primus'
import WebSocket from 'ws'
import { getSourceId, getMetadata } from '@signalk/signalk-schema'
import {
  requestAccess,
  InvalidTokenError,
  WithSecurityStrategy
} from '../security'
import { WithConfig } from '../app'
import {
  findRequest,
  updateRequest,
  queryRequest,
  Reply
} from '../requestResponse'
import { putPath, deletePath } from '../put'
import { createDebug } from '../debug'
import { JsonWebTokenError, TokenExpiredError } from 'jsonwebtoken'
import { startEvents, startServerEvents } from '../events'
import {
  AccumulatedItem,
  accumulateLatestValue,
  buildFlushDeltas
} from '../LatestValuesAccumulator'
import { getExternalPort } from '../ports'
import { resolveDisplayUnits, getDefaultCategory } from '../unitpreferences'
import { Delta, hasValues } from '@signalk/server-api'

const debug = createDebug('signalk-server:interfaces:ws')
const debugConnection = createDebug('signalk-server:interfaces:ws:connections')

const BACKPRESSURE_ENTER_THRESHOLD = process.env.BACKPRESSURE_ENTER
  ? parseInt(process.env.BACKPRESSURE_ENTER, 10)
  : 512 * 1024
const BACKPRESSURE_EXIT_THRESHOLD = process.env.BACKPRESSURE_EXIT
  ? parseInt(process.env.BACKPRESSURE_EXIT, 10)
  : 1024

interface BackpressureState {
  active: boolean
  accumulator: Map<string, AccumulatedItem>
  since: number | null
}

interface SkPrincipal {
  identifier: string
}

interface SignalKSparkRequest {
  skPrincipal?: SkPrincipal
  token?: string
  source?: string
  cookies?: Record<string, string>
  headers: Record<string, string | string[] | undefined>
  query?: Record<string, string>
  socket: Socket & { bufferSize: number }
  connection: { remoteAddress: string }
}

interface Spark {
  id: string
  query: {
    subscribe?: string
    sendMeta?: string
    startTime?: string
    playbackRate?: number
    serverevents?: string
    events?: string
    sendCachedValues?: string
  }
  request: SignalKSparkRequest
  sendMetaDeltas: boolean
  sentMetaData: Record<string, boolean>
  backpressure: BackpressureState
  skPendingAccessRequest?: boolean
  logUnsubscribe?: () => void
  bufferSizeExceeded?: number
  onDisconnects: Array<() => void>
  hasServerEvents?: boolean
  isHistory?: boolean
  wsAlive?: boolean
  socket: WebSocket
  write: (data: unknown) => void
  end: (message?: unknown, options?: { reconnect?: boolean }) => void
  on: (event: string, handler: (data: unknown) => void) => void
  removeListener: (event: string, handler: (data: unknown) => void) => void
}

interface WsMessage {
  token?: string
  updates?: Delta['updates']
  subscribe?: Array<{ path: string }> | string
  unsubscribe?: Array<{ path: string }>
  accessRequest?: unknown
  login?: { username: string; password: string }
  put?: { path: string; value: unknown; source?: string }
  delete?: { path: string }
  requestId?: string
  query?: boolean
  context?: string
  state?: string
  statusCode?: number
  message?: string
}

interface PathSources {
  [path: string]: {
    [source: string]: Spark
  }
}

interface SecurityStrategy {
  canAuthorizeWS: () => boolean
  authorizeWS: (req: Spark['request']) => void
  verifyWS: (req: Spark['request']) => void
  filterReadDelta: (
    principal: SkPrincipal | undefined,
    delta: Delta
  ) => Delta | null
  shouldAllowWrite: (req: Spark['request'], msg: WsMessage) => boolean
  supportsLogin: () => boolean
  login: (
    username: string,
    password: string
  ) => Promise<{ token?: string; statusCode: number }>
  isDummy: () => boolean
}

interface SubscriptionManager {
  subscribe: (
    msg: WsMessage,
    unsubscribes: Array<() => void>,
    write: (data: unknown) => void,
    onChange: (delta: Delta) => void,
    principal?: SkPrincipal
  ) => void
  unsubscribe: (msg: WsMessage, unsubscribes: Array<() => void>) => void
}

interface HistoryProvider {
  hasAnyData: (
    options: HistoryOptions,
    callback: (hasResults: boolean) => void
  ) => void
  streamHistory: (
    spark: Spark,
    options: HistoryOptions,
    onChange: (delta: Delta) => void
  ) => () => void
}

interface HistoryOptions {
  startTime: Date
  playbackRate: number
  subscribe?: string
}

interface WithContext {
  context: string
}

interface DeltaCache {
  getCachedDeltas: (
    filter: (delta: WithContext) => boolean,
    principal?: SkPrincipal
  ) => Delta[]
}

interface WsAppConfig {
  settings: {
    ssl?: boolean
    wsCompression?: boolean
    wsPingInterval?: number | false
    trustProxy?: boolean | string
  }
  maxSendBufferSize?: number
  maxSendBufferCheckTime?: number
}

interface WsApp {
  server: unknown
  config: WsAppConfig
  selfContext: string
  selfId: string
  securityStrategy: SecurityStrategy
  subscriptionmanager: SubscriptionManager
  historyProvider?: HistoryProvider
  deltaCache: DeltaCache
  streambundle: {
    getAvailablePaths: () => string[]
  }
  signalk: {
    on: (event: string, handler: (delta: Delta) => void) => void
    removeListener: (event: string, handler: (delta: Delta) => void) => void
  }
  logging: {
    getLog: () => unknown[]
  }
  on: (event: string, handler: (data: unknown) => void) => void
  removeListener: (event: string, handler: (data: unknown) => void) => void
  handleMessage: (source: string, msg: WsMessage) => void
  setProviderError: (provider: string, message: string) => void
  getHello: () => Record<string, unknown>
}

interface WsApi {
  mdns: {
    name: string
    type: string
    port: number
  }
  numClients: () => number
  canHandlePut: (path: string, source: string | undefined) => boolean
  handlePut: (
    requestId: string,
    context: string,
    path: string,
    source: string | undefined,
    value: unknown
  ) => Promise<Reply>
  start: () => void
  stop: () => void
}

function wsInterface(app: WsApp): WsApi {
  debug(
    'Backpressure thresholds: enter=%d, exit=%d',
    BACKPRESSURE_ENTER_THRESHOLD,
    BACKPRESSURE_EXIT_THRESHOLD
  )

  let primuses: Primus[] = []
  const pathSources: PathSources = {}

  const api: WsApi = {
    mdns: {
      name: app.config.settings.ssl ? '_signalk-wss' : '_signalk-ws',
      type: 'tcp',
      port: getExternalPort(
        app as unknown as Parameters<typeof getExternalPort>[0]
      )
    },

    numClients: function () {
      let count = 0
      primuses.forEach((primus) =>
        primus.forEach(() => {
          count++
          return true
        })
      )
      return count
    },

    canHandlePut: function (path: string, source: string | undefined) {
      const sources = pathSources[path]
      return sources !== undefined && (!source || sources[source] !== undefined)
    },

    handlePut: function (
      requestId: string,
      context: string,
      path: string,
      source: string | undefined,
      value: unknown
    ): Promise<Reply> {
      return new Promise((resolve, reject) => {
        const sources = pathSources[path]
        if (sources) {
          let spark: Spark | undefined
          if (source) {
            spark = sources[source]
          } else if (Object.keys(sources).length === 1) {
            spark = Object.values(sources)[0]
          } else {
            updateRequest(requestId, 'COMPLETED', {
              statusCode: 400,
              message:
                'there are multiple sources for the given path, but no source was specified in the request'
            })
              .then(resolve)
              .catch(reject)
            return
          }

          if (!spark) {
            reject(new Error('no spark found'))
            return
          }

          const listener = (msg: WsMessage) => {
            if (msg.requestId === requestId) {
              updateRequest(
                requestId,
                msg.state as 'PENDING' | 'COMPLETED' | null,
                msg
              )
                .then((reply) => {
                  if (reply.state !== 'PENDING') {
                    spark!.removeListener(
                      'data',
                      listener as (data: unknown) => void
                    )
                  }
                })
                .catch(() => {
                  console.error(`could not update requestId ${requestId}`)
                })
            }
          }
          spark.on('data', listener as (data: unknown) => void)
          setTimeout(() => {
            const request = findRequest((r) => r.requestId === requestId)
            if (request && request.state === 'PENDING') {
              spark!.removeListener('data', listener as (data: unknown) => void)
              updateRequest(requestId, 'COMPLETED', { statusCode: 504 })
            }
          }, 60 * 1000)

          spark.write({
            requestId: requestId,
            context: context,
            put: [{ path: path, value: value }]
          })

          updateRequest(requestId, 'PENDING', { statusCode: 202 })
            .then(resolve)
            .catch(reject)
        } else {
          reject(new Error('no source found'))
        }
      })
    },

    start: function () {
      debug('Starting Primus/WS interface')

      const wsPingInterval = app.config.settings.wsPingInterval ?? 30000

      let baseOptions: Record<string, unknown> = {
        transformer: 'websockets',
        pingInterval: false
      }
      if (app.config.settings.wsCompression) {
        baseOptions = {
          ...baseOptions,
          compression: true,
          transport: {
            perMessageDeflate: { threshold: 0 }
          }
        }
      }

      const allWsOptions = [
        {
          ...baseOptions,
          pathname: '/signalk/v1/stream',
          isPlayback: false
        },
        {
          ...baseOptions,
          pathname: '/signalk/v1/playback',
          isPlayback: true
        }
      ]

      const assertBufferSize = getAssertBufferSize(app.config)

      primuses = allWsOptions.map((primusOptions) => {
        const primus = new Primus(app.server as Server, primusOptions)

        if (wsPingInterval) {
          const interval = setInterval(() => {
            primus.forEach((primusSpark: unknown) => {
              const spark = primusSpark as Spark
              if (spark.wsAlive === false) {
                debug('heartbeat timeout for spark %s, closing', spark.id)
                return spark.end(undefined, { reconnect: true })
              }
              spark.wsAlive = false
              if (spark.socket && spark.socket.readyState === WebSocket.OPEN) {
                spark.socket.ping()
              }
            })
          }, wsPingInterval)
          primus.once('close', () => clearInterval(interval))
        }

        if (app.securityStrategy.canAuthorizeWS()) {
          primus.authorize(
            createPrimusAuthorize(app.securityStrategy.authorizeWS)
          )
        }

        primus.on('connection', function (primusSpark: unknown) {
          const spark = primusSpark as Spark
          let principalId: string | undefined
          if (spark.request.skPrincipal) {
            principalId = spark.request.skPrincipal.identifier
          }

          debugConnection(
            `${spark.id} connected ${JSON.stringify(spark.query)} ${
              spark.request.connection.remoteAddress
            }:${principalId}`
          )

          spark.sendMetaDeltas = spark.query.sendMeta === 'all'
          spark.sentMetaData = {}

          spark.backpressure = {
            active: false,
            accumulator: new Map(),
            since: null
          }

          spark.request.socket.on('drain', () => {
            if (
              spark.backpressure.active &&
              spark.backpressure.accumulator.size > 0
            ) {
              const bufferSize = spark.request.socket.bufferSize
              if (bufferSize <= BACKPRESSURE_EXIT_THRESHOLD) {
                flushAccumulator(app, spark)
              }
            }
          })

          if (wsPingInterval) {
            spark.wsAlive = true
            spark.socket.on('pong', () => {
              spark.wsAlive = true
            })
          }

          let onChange = (delta: Delta) => {
            const filtered = app.securityStrategy.filterReadDelta(
              spark.request.skPrincipal,
              delta
            )
            if (filtered === null) return

            const bufferSize = spark.request.socket.bufferSize

            if (bufferSize > BACKPRESSURE_ENTER_THRESHOLD) {
              if (!spark.backpressure.active) {
                spark.backpressure.active = true
                spark.backpressure.since = Date.now()
                debug(
                  'Entering backpressure mode for spark %s (buffer: %d)',
                  spark.id,
                  bufferSize
                )
              }
              accumulateLatestValue(spark.backpressure.accumulator, filtered)
            } else {
              sendMetaData(app, spark, filtered)
              spark.write(filtered)
            }

            assertBufferSize(spark)
          }

          const unsubscribes: Array<() => void> = []

          if (primusOptions.isPlayback) {
            spark.on('data', () => {
              console.error('Playback does not support ws upstream messages')
              spark.end('Playback does not support ws upstream messages')
            })
          } else {
            spark.on('data', function (msg: unknown) {
              let parsedMsg: WsMessage
              try {
                parsedMsg = JSON.parse(String(msg))
              } catch (e) {
                debug('Failed to parse message: ' + (e as Error).message)
                return
              }
              debug('<' + JSON.stringify(parsedMsg))

              try {
                if (parsedMsg.token) {
                  spark.request.token = parsedMsg.token
                }

                if (parsedMsg.updates) {
                  processUpdates(app, pathSources, spark, parsedMsg)
                }

                if (parsedMsg.subscribe) {
                  processSubscribe(
                    app,
                    unsubscribes,
                    spark,
                    assertBufferSize,
                    parsedMsg
                  )
                }

                if (parsedMsg.unsubscribe) {
                  processUnsubscribe(
                    app,
                    unsubscribes,
                    parsedMsg,
                    onChange,
                    spark
                  )
                }

                if (parsedMsg.accessRequest) {
                  processAccessRequest(app, spark, parsedMsg)
                }

                if (parsedMsg.login && app.securityStrategy.supportsLogin()) {
                  processLoginRequest(app, spark, parsedMsg)
                }

                if (parsedMsg.put) {
                  processPutRequest(app, spark, parsedMsg)
                }

                if (parsedMsg.delete) {
                  processDeleteRequest(app, spark, parsedMsg)
                }

                if (parsedMsg.requestId && parsedMsg.query) {
                  processRequestQuery(spark, parsedMsg)
                }
              } catch (e) {
                console.error(e)
              }
            })
          }

          spark.on('end', function () {
            debugConnection(
              `${spark.id} end ${JSON.stringify(spark.query)} ${
                spark.request.connection.remoteAddress
              }:${principalId}`
            )

            unsubscribes.forEach((unsubscribe) => unsubscribe())

            Object.keys(pathSources).forEach((path) => {
              Object.keys(pathSources[path]).forEach((source) => {
                if (pathSources[path][source] === spark) {
                  debug('removing source for %s', path)
                  delete pathSources[path][source]
                }
              })
            })
          })

          if (isSelfSubscription(spark.query)) {
            const realOnChange = onChange
            onChange = function (msg: Delta) {
              if (!msg.context || msg.context === app.selfContext) {
                realOnChange(msg)
              }
            }
          }

          if (spark.query.subscribe === 'none') {
            onChange = () => undefined
          }

          onChange = wrapWithVerifyWS(app.securityStrategy, spark, onChange)

          spark.onDisconnects = []

          if (primusOptions.isPlayback) {
            if (!spark.query.startTime) {
              spark.end(
                'startTime is a required query parameter for playback connections'
              )
            } else {
              handlePlaybackConnection(app, spark, onChange)
            }
          } else {
            handleRealtimeConnection(app, spark, onChange)
          }
        })

        primus.on('disconnection', function (primusSpark: unknown) {
          const spark = primusSpark as Spark
          spark.onDisconnects.forEach((f) => f())
          debug(spark.id + ' disconnected')
        })

        return primus
      })
    },

    stop: function () {
      debug('Destroying primuses...')
      primuses.forEach((primus) =>
        primus.destroy({ close: false, timeout: 500, reconnect: false }, () => {
          /* noop */
        })
      )
    }
  }

  function processRequestQuery(spark: Spark, msg: WsMessage): void {
    queryRequest(msg.requestId!)
      .then((reply) => {
        spark.write(reply)
      })
      .catch(() => {
        spark.write({
          requestId: msg.requestId,
          statusCode: 404
        })
      })
  }

  function processPutRequest(app: WsApp, spark: Spark, msg: WsMessage): void {
    putPath(
      app as unknown as Parameters<typeof putPath>[0],
      msg.context || null,
      msg.put!.path,
      msg.put!,
      spark.request as unknown as Parameters<typeof putPath>[4],
      msg.requestId || null,
      (reply) => {
        debug('sending put update %j', reply)
        spark.write(reply)
      }
    ).catch((err) => {
      console.error(err)
      spark.write({
        requestId: msg.requestId,
        state: 'COMPLETED',
        statusCode: 502,
        message: err.message
      })
    })
  }

  function processDeleteRequest(
    app: WsApp,
    spark: Spark,
    msg: WsMessage
  ): void {
    deletePath(
      app as unknown as Parameters<typeof deletePath>[0],
      msg.context || null,
      msg.delete!.path,
      spark.request as unknown as Parameters<typeof deletePath>[3],
      msg.requestId || null,
      (reply) => {
        debug('sending delete update %j', reply)
        spark.write(reply)
      }
    ).catch((err) => {
      console.error(err)
      spark.write({
        requestId: msg.requestId,
        state: 'COMPLETED',
        statusCode: 502,
        message: err.message
      })
    })
  }

  function processAccessRequest(
    app: WsApp,
    spark: Spark,
    msg: WsMessage
  ): void {
    if (spark.skPendingAccessRequest) {
      spark.write({
        requestId: msg.requestId,
        state: 'COMPLETED',
        statusCode: 400,
        message: 'A request has already been submitted'
      })
    } else {
      const forwardedFor = spark.request.headers['x-forwarded-for']
      const clientIp =
        (app.config.settings.trustProxy &&
          app.config.settings.trustProxy !== 'false' &&
          typeof forwardedFor === 'string' &&
          forwardedFor) ||
        spark.request.connection.remoteAddress
      requestAccess(
        app as unknown as WithSecurityStrategy & WithConfig,
        msg,
        clientIp,
        (res: Reply) => {
          if (res.state === 'COMPLETED') {
            spark.skPendingAccessRequest = false

            if (res.accessRequest && res.accessRequest.token) {
              spark.request.token = res.accessRequest.token
              app.securityStrategy.authorizeWS(spark.request)
              spark.request.source =
                'ws.' +
                spark.request.skPrincipal!.identifier.replace(/\./g, '_')
            }
          }
          spark.write(res)
        }
      )
        .then((res: Reply) => {
          if (res.state === 'PENDING') {
            spark.skPendingAccessRequest = true
          }
        })
        .catch((err: Error) => {
          console.log(err.stack)
          spark.write({
            requestId: msg.requestId,
            state: 'COMPLETED',
            statusCode: 502,
            message: err.message
          })
        })
    }
  }

  function processLoginRequest(app: WsApp, spark: Spark, msg: WsMessage): void {
    app.securityStrategy
      .login(msg.login!.username, msg.login!.password)
      .then((reply) => {
        if (reply.token) {
          spark.request.token = reply.token
          app.securityStrategy.authorizeWS(spark.request)
        }
        spark.write({
          requestId: msg.requestId,
          state: 'COMPLETED',
          statusCode: reply.statusCode,
          login: {
            token: reply.token
          }
        })
      })
      .catch((err) => {
        console.error(err)
        spark.write({
          requestId: msg.requestId,
          state: 'COMPLETED',
          statusCode: 502,
          message: err.message
        })
      })
  }

  return api
}

function createPrimusAuthorize(
  authorizeWS: (req: SignalKSparkRequest) => void
): (req: unknown, authorized: (err?: Error) => void) => void {
  return function (
    primusReq: unknown,
    authorized: (err?: Error) => void
  ): void {
    const req = primusReq as SignalKSparkRequest
    try {
      const cookieHeader = req.headers.cookie
      if (typeof cookieHeader === 'string') {
        req.cookies = cookie.parse(cookieHeader)
      }

      authorizeWS(req)
      authorized()

      const identifier = req.skPrincipal?.identifier
      if (identifier) {
        debug(`authorized username: ${identifier}`)
        req.source = 'ws.' + identifier.replace(/\./g, '_')
      }
    } catch (error) {
      if (
        error instanceof InvalidTokenError ||
        error instanceof JsonWebTokenError ||
        error instanceof TokenExpiredError
      ) {
        authorized(error as Error)
      } else {
        authorized()
      }
    }
  }
}

function processUpdates(
  app: WsApp,
  pathSources: PathSources,
  spark: Spark,
  msg: WsMessage
): void {
  if (!app.securityStrategy.shouldAllowWrite(spark.request, msg)) {
    debug('security disallowed update')
    app.setProviderError(
      'ws',
      spark.request.connection.remoteAddress + ' needs authentication'
    )
    return
  }
  app.handleMessage(spark.request.source || 'ws', msg)

  msg.updates?.forEach((update) => {
    if (hasValues(update)) {
      let source = update.$source
      if (!source && update.source) {
        source = getSourceId(update.source)
      }

      if (source) {
        update.values.forEach((valuePath) => {
          if (!pathSources[valuePath.path]) {
            pathSources[valuePath.path] = {}
          }
          if (
            !pathSources[valuePath.path][source!] ||
            pathSources[valuePath.path][source!] !== spark
          ) {
            if (pathSources[valuePath.path][source!]) {
              console.log(
                `WARNING: got a new ws client for path ${valuePath.path} source ${source}`
              )
            }
            debug(
              'registered spark for source %s path %s = %s',
              source,
              valuePath.path,
              spark.id
            )

            pathSources[valuePath.path][source!] = spark
          }
        })
      }
    }
  })
}

let canonical_meta_contextpath_values: Record<
  string,
  Record<string, string>
> = {}
const getContextPathMetaKey = (context: string, path: string): string => {
  const contextPaths =
    canonical_meta_contextpath_values[context] ||
    (canonical_meta_contextpath_values[context] = {})
  const result =
    contextPaths[path] || (contextPaths[path] = `${context}.${path}`)
  return result
}
setInterval(
  () => {
    canonical_meta_contextpath_values = {}
  },
  30 * 60 * 1000
)

interface MetaHandlerContext {
  context: string
  spark: Spark
  timestamp?: string
}

function handleValuesMeta(
  this: MetaHandlerContext,
  kp: { path: string }
): void {
  const fullContextPathKey = getContextPathMetaKey(this.context, kp.path)
  if (kp.path && !this.spark.sentMetaData[fullContextPathKey]) {
    const split = kp.path.split('.')
    for (let i = split.length; i > 1; i--) {
      const path = split.slice(0, i).join('.')
      const partialContextPathKey = getContextPathMetaKey(this.context, path)
      if (this.spark.sentMetaData[partialContextPathKey]) {
        break
      } else {
        this.spark.sentMetaData[partialContextPathKey] = true
        let meta = getMetadata(partialContextPathKey) as Record<
          string,
          unknown
        > | null
        if (meta) {
          // Clone and enhance metadata with displayUnits formulas
          meta = JSON.parse(JSON.stringify(meta))
          let storedDisplayUnits = (meta as Record<string, unknown>)
            .displayUnits as { category?: string } | undefined
          if (!storedDisplayUnits?.category && path) {
            const defaultCategory = getDefaultCategory(path)
            if (defaultCategory) {
              storedDisplayUnits = { category: defaultCategory }
            }
          }
          if (storedDisplayUnits?.category) {
            const username = this.spark.request.skPrincipal?.identifier
            const enhanced = resolveDisplayUnits(
              { category: storedDisplayUnits.category },
              (meta as Record<string, unknown>).units as string | undefined,
              username
            )
            if (enhanced) {
              ;(meta as Record<string, unknown>).displayUnits = enhanced
            }
          }
          this.spark.write({
            context: this.context,
            updates: [
              {
                timestamp: this.timestamp,
                meta: [
                  {
                    path: path,
                    value: meta
                  }
                ]
              }
            ]
          })
        }
      }
    }
  }
}

function handleUpdatesMeta(
  this: MetaHandlerContext,
  update: NonNullable<Delta['updates']>[number]
): void {
  if (hasValues(update)) {
    this.timestamp = update.timestamp
    update.values.forEach(handleValuesMeta, this)
  }
}

function sendMetaData(app: WsApp, spark: Spark, delta: Delta): void {
  if (spark.sendMetaDeltas && delta.updates) {
    const thisContext: MetaHandlerContext = {
      context: delta.context || '',
      spark
    }
    delta.updates.forEach(handleUpdatesMeta, thisContext)
  }
}

function processSubscribe(
  app: WsApp,
  unsubscribes: Array<() => void>,
  spark: Spark,
  assertBufferSize: (spark: Spark) => void,
  msg: WsMessage
): void {
  if (
    Array.isArray(msg.subscribe) &&
    msg.subscribe.length > 0 &&
    msg.subscribe[0].path === 'log'
  ) {
    if (!spark.logUnsubscribe) {
      spark.logUnsubscribe = startServerLog(app, spark)
    }
  } else {
    app.subscriptionmanager.subscribe(
      msg,
      unsubscribes,
      spark.write.bind(spark),
      (message: Delta) => {
        const filtered = app.securityStrategy.filterReadDelta(
          spark.request.skPrincipal,
          message
        )
        if (!filtered) return

        const bufferSize = spark.request.socket.bufferSize

        if (bufferSize > BACKPRESSURE_ENTER_THRESHOLD) {
          if (!spark.backpressure.active) {
            spark.backpressure.active = true
            spark.backpressure.since = Date.now()
            debug(
              'Entering backpressure mode for spark %s (buffer: %d)',
              spark.id,
              bufferSize
            )
          }
          accumulateLatestValue(spark.backpressure.accumulator, filtered)
        } else {
          sendMetaData(app, spark, filtered)
          spark.write(filtered)
        }

        assertBufferSize(spark)
      },
      spark.request.skPrincipal
    )
  }
}

function processUnsubscribe(
  app: WsApp,
  unsubscribes: Array<() => void>,
  msg: WsMessage,
  onChange: (delta: Delta) => void,
  spark: Spark
): void {
  try {
    if (
      Array.isArray(msg.unsubscribe) &&
      msg.unsubscribe.length > 0 &&
      msg.unsubscribe[0].path === 'log'
    ) {
      if (spark.logUnsubscribe) {
        spark.logUnsubscribe()
        spark.logUnsubscribe = undefined
      }
    } else {
      app.subscriptionmanager.unsubscribe(msg, unsubscribes)
      app.signalk.removeListener('delta', onChange)
      spark.sentMetaData = {}
    }
  } catch (e) {
    console.log((e as Error).message)
    spark.write((e as Error).message)
    spark.end()
  }
}

const isSelfSubscription = (query: Spark['query']): boolean =>
  !query.subscribe || query.subscribe === 'self'

function wrapWithVerifyWS(
  securityStrategy: SecurityStrategy,
  spark: Spark,
  theFunction: (delta: Delta) => void
): (delta: Delta) => void {
  if (!securityStrategy.canAuthorizeWS()) {
    return theFunction
  }
  return (msg: Delta) => {
    try {
      securityStrategy.verifyWS(spark.request)
      theFunction(msg)
    } catch (error) {
      if (!spark.skPendingAccessRequest) {
        spark.end(
          '{message: "Connection disconnected by security constraint"}',
          {
            reconnect: true
          }
        )
      }
      console.error(error)
      return
    }
  }
}

function sendHello(
  app: WsApp,
  helloProps: Record<string, unknown>,
  spark: Spark
): void {
  spark.write({
    ...app.getHello(),
    ...helloProps
  })
}

function handlePlaybackConnection(
  app: WsApp,
  spark: Spark,
  onChange: (delta: Delta) => void
): void {
  if (app.historyProvider === undefined) {
    spark.end('No history provider')
    return
  }

  const startTimeStr = spark.query.startTime
  if (!startTimeStr) {
    spark.end('startTime is required')
    return
  }

  const options: HistoryOptions = {
    startTime: new Date(startTimeStr),
    playbackRate: spark.query.playbackRate || 1
  }

  sendHello(app, options as unknown as Record<string, unknown>, spark)

  options.subscribe = spark.query.subscribe
  app.historyProvider.hasAnyData(options, (hasResults: boolean) => {
    if (hasResults) {
      spark.onDisconnects.push(
        app.historyProvider!.streamHistory(spark, options, onChange)
      )
      spark.isHistory = true
    } else {
      spark.end('No data found')
    }
  })
}

function handleRealtimeConnection(
  app: WsApp,
  spark: Spark,
  onChange: (delta: Delta) => void
): void {
  sendHello(app, {}, spark)

  app.signalk.on('delta', onChange)
  spark.onDisconnects.push(() => {
    app.signalk.removeListener('delta', onChange)
  })

  if (spark.sendMetaDeltas) {
    const onUnitPrefsChanged = (event: unknown) => {
      const username = spark.request.skPrincipal?.identifier
      const ev = event as { username?: string } | null
      if (ev?.username && ev.username !== username) return

      const allPaths = app.streambundle.getAvailablePaths()
      const meta = allPaths.reduce(
        (
          acc: Array<{ path: string; value: Record<string, unknown> }>,
          path: string
        ) => {
          const fullPath = 'vessels.self.' + path
          const pathMeta =
            (getMetadata(fullPath) as Record<string, unknown>) || {}
          const category =
            (pathMeta.displayUnits as { category?: string } | undefined)
              ?.category || getDefaultCategory(path)
          if (category) {
            const displayUnits = resolveDisplayUnits(
              { category },
              pathMeta.units as string | undefined,
              username
            )
            if (displayUnits) {
              acc.push({ path, value: { ...pathMeta, displayUnits } })
            }
          }
          return acc
        },
        []
      )

      if (meta.length > 0) {
        const timestamp = new Date().toISOString()
        spark.write({
          context: 'vessels.' + app.selfId,
          updates: [{ timestamp, meta }]
        })
      }
    }

    app.on('unitpreferencesChanged', onUnitPrefsChanged as () => void)
    spark.onDisconnects.push(() => {
      app.removeListener(
        'unitpreferencesChanged',
        onUnitPrefsChanged as () => void
      )
    })
  }

  if (spark.request.query?.sendCachedValues !== 'false') {
    sendLatestDeltas(app, app.deltaCache, app.selfContext, spark)
  }

  if (spark.query.serverevents === 'all') {
    spark.hasServerEvents = true
    startServerEvents(
      app,
      spark,
      wrapWithVerifyWS(
        app.securityStrategy,
        spark,
        spark.write.bind(spark) as (delta: Delta) => void
      )
    )
  }

  if (spark.query.events) {
    startEvents(
      app,
      spark,
      wrapWithVerifyWS(
        app.securityStrategy,
        spark,
        spark.write.bind(spark) as (delta: Delta) => void
      ),
      spark.query.events
    )
  }
}

function sendLatestDeltas(
  app: WsApp,
  deltaCache: DeltaCache,
  selfContext: string,
  spark: Spark
): void {
  let deltaFilter: (delta: WithContext) => boolean = () => false
  if (!spark.query.subscribe || spark.query.subscribe === 'self') {
    deltaFilter = (delta: WithContext): boolean => delta.context === selfContext
  } else if (spark.query.subscribe === 'all') {
    deltaFilter = (): boolean => true
  }

  deltaCache
    .getCachedDeltas(deltaFilter, spark.request.skPrincipal)
    .forEach((delta) => {
      sendMetaData(app, spark, delta)
      spark.write(delta)
    })
}

function startServerLog(app: WsApp, spark: Spark): () => void {
  const onServerLogEvent = wrapWithVerifyWS(
    app.securityStrategy,
    spark,
    spark.write.bind(spark) as (delta: Delta) => void
  )
  app.on('serverlog', onServerLogEvent as (data: unknown) => void)
  spark.onDisconnects.push(() => {
    app.removeListener('serverlog', onServerLogEvent as (data: unknown) => void)
  })
  app.logging.getLog().forEach((log) => {
    spark.write({
      type: 'LOG',
      data: log
    })
  })
  return () => {
    app.removeListener('serverlog', onServerLogEvent as (data: unknown) => void)
  }
}

function flushAccumulator(app: WsApp, spark: Spark): void {
  const map = spark.backpressure.accumulator
  if (map.size === 0) return

  const countBefore = map.size
  const duration = spark.backpressure.since
    ? Date.now() - spark.backpressure.since
    : 0

  const deltas = buildFlushDeltas(map, duration)
  for (const delta of deltas) {
    sendMetaData(app, spark, delta as Delta)
    spark.write(delta)
  }

  map.clear()
  spark.backpressure.active = false
  spark.backpressure.since = null
  debug('Flushed %d accumulated values for spark %s', countBefore, spark.id)
}

function getAssertBufferSize(config: WsAppConfig): (spark: Spark) => void {
  const MAXSENDBUFFERSIZE = process.env.MAXSENDBUFFERSIZE
    ? parseInt(process.env.MAXSENDBUFFERSIZE, 10)
    : config.maxSendBufferSize || 4 * 512 * 1024
  const MAXSENDBUFFERCHECKTIME = process.env.MAXSENDBUFFERCHECKTIME
    ? parseInt(process.env.MAXSENDBUFFERCHECKTIME, 10)
    : config.maxSendBufferCheckTime || 30 * 1000
  debug(`MAXSENDBUFFERSIZE:${MAXSENDBUFFERSIZE}`)

  if (MAXSENDBUFFERSIZE === 0) {
    return () => undefined
  }

  return (spark: Spark) => {
    if (spark.request.socket.bufferSize > MAXSENDBUFFERSIZE) {
      if (!spark.bufferSizeExceeded) {
        console.warn(
          `${spark.id} outgoing buffer > max:${spark.request.socket.bufferSize}`
        )
        spark.bufferSizeExceeded = Date.now()
      }
      if (Date.now() - spark.bufferSizeExceeded > MAXSENDBUFFERCHECKTIME) {
        spark.end({
          errorMessage:
            'Server outgoing buffer overflow, terminating connection'
        })
        console.error(
          'Send buffer overflow, terminating connection ' + spark.id
        )
      }
    } else {
      spark.bufferSizeExceeded = undefined
    }
  }
}

module.exports = wsInterface
