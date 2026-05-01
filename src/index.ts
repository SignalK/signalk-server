/* eslint-disable @typescript-eslint/no-require-imports */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-this-alias */
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

import './baconjs-compat'
import {
  Context,
  Delta,
  DeltaInputHandler,
  FullSignalK,
  getSourceId,
  Path,
  PropertyValues,
  SKVersion,
  SignalKApiId,
  SourceRef,
  Timestamp,
  Update,
  WithFeatures
} from '@signalk/server-api'
import express, { IRouter, Request, Response } from 'express'
import http from 'http'
import https from 'https'
import _ from 'lodash'
import path from 'path'
import { startApis } from './api'
import { ServerApp, SignalKMessageHub, WithConfig } from './app'
import { ConfigApp, load, sendBaseDeltas } from './config/config'
import { createDebug } from './debug'
import DeltaCache, { buildSrcToCanonicalMap } from './deltacache'
import DeltaChain from './deltachain'
import { getToPreferredDelta, ToPreferredDelta } from './deltaPriority'
import { incDeltaStatistics, startDeltaStatistics } from './deltastats'
import { checkForNewServerVersion } from './modules'
import { getExternalPort, getPrimaryPort, getSecondaryPort } from './ports'
import {
  getCertificateOptions,
  getSecurityConfig,
  saveSecurityConfig,
  SecurityConfig,
  startSecurity,
  WithSecurityStrategy
} from './security.js'
import { setupCors } from './cors'
import SubscriptionManager from './subscriptionmanager'
import { PluginId, PluginManager } from './interfaces/plugins'
import { OpenApiDescription, OpenApiRecord } from './api/swagger'
import { WithProviderStatistics } from './deltastats'
import { buildProviderTalkerLookups } from './nmea0183TalkerGroups'
import { pipedProviders } from './pipedproviders'
import { EventsActorId, WithWrappedEmitter, wrapEmitter } from './events'
import { Zones } from './zones'
import checkNodeVersion from './version'
import helmet from 'helmet'
const debug = createDebug('signalk-server')

import { migrateSourceRef } from './sourceref-migration'
import { StreamBundle } from './streambundle'

function cloneDelta(delta: any): any {
  // Per-element shallow copy of values/meta entries — without it, an
  // unfilteredDelta consumer that mutates a single value object would
  // also corrupt the delta still travelling through the main pipeline.
  // Deep cloning (structuredClone) would isolate nested mutations too
  // but is too expensive on the per-delta hot path; consumers must not
  // mutate nested objects within a value.
  return {
    ...delta,
    updates: delta.updates?.map((update: any) => ({
      ...update,
      values: update.values
        ? update.values.map((v: any) => ({ ...v }))
        : update.values,
      meta: update.meta ? update.meta.map((m: any) => ({ ...m })) : update.meta
    }))
  }
}

class Server {
  app: ServerApp &
    WithConfig &
    WithFeatures &
    SignalKMessageHub &
    PluginManager &
    WithSecurityStrategy &
    IRouter &
    WithWrappedEmitter &
    WithProviderStatistics & {
      apis?: Array<SignalKApiId>
    }

  constructor(opts: { securityConfig: SecurityConfig }) {
    checkNodeVersion()
    const FILEUPLOADSIZELIMIT = process.env.FILEUPLOADSIZELIMIT || '10mb'
    const bodyParser = require('body-parser')
    const app = express() as any
    app.use(require('compression')())
    app.use(
      helmet({
        // ENABLED (safe, no compatibility impact):
        xContentTypeOptions: true,
        xDnsPrefetchControl: true,
        xDownloadOptions: true,
        xPermittedCrossDomainPolicies: true,
        referrerPolicy: true,
        hsts: true,

        // DISABLED (would break chart plotters, plugins, webapps):
        frameguard: false, // Allow embedding in iframes (chart plotters, MFDs)
        contentSecurityPolicy: false,
        crossOriginEmbedderPolicy: false,
        crossOriginOpenerPolicy: false,
        crossOriginResourcePolicy: false
      })
    )
    app.use(bodyParser.json({ limit: FILEUPLOADSIZELIMIT }))

    this.app = app
    app.started = false
    _.merge(app, opts)

    load(app)

    // Apply trust proxy setting if configured
    if (app.config.settings.trustProxy !== undefined) {
      app.set('trust proxy', app.config.settings.trustProxy)
    }

    app.logging = require('./logging')(app)
    app.version = '0.0.1'

    setupCors(app, getSecurityConfig(app))
    startSecurity(app, opts ? opts.securityConfig : null)

    require('./serverroutes')(app, saveSecurityConfig, getSecurityConfig)
    require('./put').start(app)

    app.signalk = new FullSignalK(app.selfId, app.selfType)

    const maxListeners = process.env.EVENT_EMITTER_MAX_LISTENERS
      ? parseInt(process.env.EVENT_EMITTER_MAX_LISTENERS, 10)
      : 50
    if (maxListeners > 0) {
      app.signalk.setMaxListeners(maxListeners)
    }

    app.propertyValues = new PropertyValues()

    const deltachainV1 = new DeltaChain(app.signalk.addDelta.bind(app.signalk))
    const deltachainV2 = new DeltaChain((delta: Delta) =>
      app.signalk.emit('delta', delta)
    )
    app.registerDeltaInputHandler = (handler: DeltaInputHandler) => {
      const unRegisterHandlers = [
        deltachainV1.register(handler),
        deltachainV2.register(handler)
      ]
      return () => unRegisterHandlers.forEach((f) => f())
    }

    app.providerStatus = {}

    // feature detection
    app.getFeatures = async (enabled?: boolean) => {
      return {
        apis: enabled === false ? [] : app.apis,
        plugins: await app.getPluginsList(enabled)
      }
    }

    // create first temporary pluginManager to get typechecks, as
    // app is any and not typechecked
    // TODO separate app.plugins and app.pluginsMap from app
    const pluginManager: PluginManager = {
      setPluginOpenApi: (pluginId: PluginId, openApi: OpenApiDescription) => {
        app.pluginsMap[pluginId].openApi = openApi
      },
      getPluginOpenApi: (pluginId: PluginId) => ({
        name: `plugins/${pluginId}`,
        path: `/plugins/${pluginId}`,
        apiDoc: app.pluginsMap[pluginId].openApi
      }),
      getPluginOpenApiRecords: () =>
        Object.keys(app.pluginsMap).reduce<OpenApiRecord[]>((acc, pluginId) => {
          if (app.pluginsMap[pluginId].openApi) {
            acc.push({
              name: `plugins/${pluginId}`,
              path: `/plugins/${pluginId}`,
              apiDoc: app.pluginsMap[pluginId].openApi
            })
          }
          return acc
        }, [])
    }
    Object.assign(app, pluginManager)

    app.setPluginStatus = (providerId: string, statusMessage: string) => {
      doSetProviderStatus(providerId, statusMessage, 'status', 'plugin')
    }

    app.setPluginError = (providerId: string, errorMessage: string) => {
      doSetProviderStatus(providerId, errorMessage, 'error', 'plugin')
    }

    app.setProviderStatus = (providerId: string, statusMessage: string) => {
      doSetProviderStatus(providerId, statusMessage, 'status')
    }

    app.setProviderError = (providerId: string, errorMessage: string) => {
      doSetProviderStatus(providerId, errorMessage, 'error')
    }

    function doSetProviderStatus(
      providerId: string,
      statusMessage: string,
      type: string,
      statusType = 'provider'
    ) {
      if (!statusMessage) {
        delete app.providerStatus[providerId]
        return
      }

      if (_.isUndefined(app.providerStatus[providerId])) {
        app.providerStatus[providerId] = {}
      }
      const status = app.providerStatus[providerId]

      if (status.type === 'error' && status.message !== statusMessage) {
        status.lastError = status.message
        status.lastErrorTimeStamp = status.timeStamp
      }

      status.type = type
      status.id = providerId
      status.statusType = statusType
      status.timeStamp = new Date().toISOString()

      status.message = statusMessage

      app.emit('serverevent', {
        type: 'PROVIDERSTATUS',
        from: 'signalk-server',
        data: app.getProviderStatus()
      })
    }

    app.getProviderStatus = () => {
      const providerStatus = _.values(app.providerStatus)

      if (app.plugins) {
        app.plugins.forEach((plugin: any) => {
          try {
            if (
              typeof plugin.statusMessage === 'function' &&
              _.isUndefined(app.providerStatus[plugin.id])
            ) {
              let message = plugin.statusMessage()
              if (message) {
                message = message.trim()
                if (message.length > 0) {
                  providerStatus.push({
                    message,
                    type: 'status',
                    id: plugin.id,
                    statusType: 'plugin'
                  })
                }
              }
            }
          } catch (e) {
            console.error(e)
            providerStatus.push({
              message:
                'Error fetching provider status, see server log for details',
              type: 'status',
              id: plugin.id
            })
          }
        })
      }
      return providerStatus
    }

    app.registerHistoryProvider = (provider: any) => {
      app.historyProvider = provider
    }

    app.unregisterHistoryProvider = () => {
      delete app.historyProvider
    }

    let toPreferredDelta: ToPreferredDelta = () => undefined
    // Translate `<label>.<numeric>` deltas to their `<label>.<canName>`
    // form so a saved canName-form ranking matches incoming refs from
    // providers that have useCanName off. The cache is keyed by the
    // sources tree's last-mutation marker (Object reference comparison
    // would suffice if signalk-schema replaced the object on every
    // change, but it mutates in place, so we rebuild on each call and
    // rely on Map construction being cheap for typical fleets).
    let cachedCanonicalMap: Map<string, string> | null = null
    let cachedCanonicalSnapshot: unknown = null
    const canonicaliseSourceRef = (sourceRef: string): string => {
      const sources = (app.signalk as any)?.sources
      if (sources !== cachedCanonicalSnapshot || cachedCanonicalMap === null) {
        cachedCanonicalSnapshot = sources
        cachedCanonicalMap = buildSrcToCanonicalMap(sources)
      }
      return cachedCanonicalMap.get(sourceRef) ?? sourceRef
    }
    // Refresh the canonical cache whenever a new device is observed or
    // a numeric-keyed source is replaced by a canName-keyed one. This
    // covers the cold-boot window where an early delta arrives before
    // the address claim and the engine briefly treats it as unknown.
    app.on('sourceRefChanged', () => {
      cachedCanonicalSnapshot = null
    })
    app.activateSourcePriorities = () => {
      try {
        cachedCanonicalSnapshot = null
        const s = app.config.settings
        toPreferredDelta = getToPreferredDelta({
          groups: s.priorityGroups ?? [],
          overrides: s.priorityOverrides ?? {},
          fallbackMs: s.priorityDefaults?.fallbackMs,
          canonicalise: canonicaliseSourceRef
        })
        // Drop preferredSources entries for paths that no longer have
        // an explicit override. Group-covered paths are kept so a path
        // whose only ranking came from group resolution doesn't lose
        // its winner from the bootstrap snapshot. The next delta will
        // re-evaluate via the engine anyway.
        const activeOverridePaths = new Set<string>(
          Object.keys(s.priorityOverrides ?? {})
        )
        app.deltaCache?.resetPreferredSourcesNotIn?.(activeOverridePaths, {
          keepGroupCovered: true
        })
      } catch (e) {
        console.error('getToPreferredDelta failed:', e)
      }
    }
    app.activateSourcePriorities()

    // Defer migration so that the moved device's own re-arbitration
    // address claim has time to land in app.signalk.sources first.
    // Without this delay, every legitimate address takeover would be
    // misclassified as a reclaim by the takeover guard, since the
    // arbitration loser only re-claims a fraction of a second later.
    // 10s is well within an admin-attention window and well past the
    // worst-case bus settling time observed on busy fleets.
    const SOURCE_REF_MIGRATION_DELAY_MS = 10_000
    app.on(
      'sourceRefChanged',
      ({ oldRef, newRef }: { oldRef: string; newRef: string }) => {
        setTimeout(() => {
          migrateSourceRef(app, oldRef, newRef)
        }, SOURCE_REF_MIGRATION_DELAY_MS)
      }
    )

    let providerTalkerLookups = buildProviderTalkerLookups(
      app.config.settings.pipedProviders
    )
    app.on('pipedProvidersStarted', () => {
      providerTalkerLookups = buildProviderTalkerLookups(
        app.config.settings.pipedProviders
      )
    })

    app.handleMessage = (
      providerId: string,
      data: Partial<Delta>,
      skVersion = SKVersion.v1
    ) => {
      if (data && Array.isArray(data.updates)) {
        incDeltaStatistics(app, providerId)

        if (
          typeof data.context === 'undefined' ||
          data.context === 'vessels.self'
        ) {
          data.context = ('vessels.' + app.selfId) as Context
        }

        const now = new Date()
        data.updates = data.updates
          .map((update: Partial<Update>) => {
            if (!isValidUpdate(update)) {
              console.warn(
                `Discarding update from ${providerId}: invalid values entry (null or missing path)`
              )
              return undefined
            }

            if (typeof update.source !== 'undefined') {
              // Respect an existing label if the upstream provider has
              // already set one that is schema-conformant (no slashes
              // or other special characters that would fail Signal K
              // $source validation). Remote Signal K servers forward
              // deltas that already carry their own label (e.g. canhat,
              // ydwg02); preserving that lets the receiving server
              // recognise the same physical device across transports.
              // Native providers and providers that set illegal labels
              // (e.g. a raw device path /dev/actisense) get normalised
              // to providerId.
              const existing = update.source.label
              if (
                typeof existing !== 'string' ||
                existing.length === 0 ||
                !/^[A-Za-z0-9-_.]+$/.test(existing)
              ) {
                update.source.label = providerId
              }
              if (!update.$source) {
                update.$source = getSourceId(update.source)
              }
              // Talker-group rewriting is a local-provider feature: only
              // apply it when this provider actually owns the label.
              if (
                update.source.type === 'NMEA0183' &&
                update.source.talker &&
                update.source.label === providerId
              ) {
                const lookup = providerTalkerLookups.get(providerId)
                if (lookup) {
                  const groupName = lookup.get(update.source.talker)
                  if (groupName) {
                    update.$source = (providerId + '.' + groupName) as SourceRef
                    update.source.talker = groupName
                  }
                }
              }
            } else {
              if (typeof update.$source === 'undefined') {
                update.$source = providerId as SourceRef
              }
            }
            if (!update.timestamp || app.config.overrideTimestampWithNow) {
              update.timestamp = now.toISOString() as Timestamp
            }

            if ('meta' in update && !Array.isArray(update.meta)) {
              debug(`handleMessage: ignoring invalid meta`, update.meta)
              delete update.meta
            }

            if ('values' in update || 'meta' in update) {
              return update as Update
            }
          })
          .filter((update) => update !== undefined)

        // No valid updates, discarding
        if (data.updates.length < 1) return

        try {
          let delta = filterStaticSelfData(data, app.selfContext)
          if (app.deltaCache) {
            app.deltaCache.ingestDelta(delta)
          }
          if (app.signalk.listenerCount('unfilteredDelta') > 0) {
            app.signalk.emit('unfilteredDelta', cloneDelta(delta))
          }
          delta = toPreferredDelta(delta, now, app.selfContext)

          if (skVersion === SKVersion.v1) {
            deltachainV1.process(delta)
          } else {
            deltachainV2.process(delta)
          }
        } catch (err) {
          console.error(err)
        }
      }
    }

    app.streambundle = new StreamBundle(app.selfId)
    new Zones(app.streambundle, (delta: Delta) =>
      process.nextTick(() =>
        app.handleMessage('self.notificationhandler', delta)
      )
    )
    app.signalk.on('delta', app.streambundle.pushDelta.bind(app.streambundle))
    app.signalk.on(
      'unfilteredDelta',
      app.streambundle.pushUnfilteredDelta.bind(app.streambundle)
    )
    app.subscriptionmanager = new SubscriptionManager(app)
    app.deltaCache = new DeltaCache(app, app.streambundle)

    app.getHello = () => ({
      name: app.config.name,
      version: app.config.version,
      self: `vessels.${app.selfId}`,
      roles: ['master', 'main'],
      timestamp: new Date()
    })

    app.isNmea2000OutAvailable = false
    app.on('nmea2000OutAvailable', () => {
      app.isNmea2000OutAvailable = true
    })

    installProcessErrorHandlers(app)
  }

  start() {
    const self = this
    const app = this.app

    app.wrappedEmitter = wrapEmitter(app)
    app.emit = app.wrappedEmitter.emit
    app.on = app.wrappedEmitter.addListener as any
    app.addListener = app.wrappedEmitter.addListener as any

    this.app.intervals = []

    this.app.intervals.push(
      setInterval(
        app.signalk.pruneContexts.bind(
          app.signalk,
          (app.config.settings.pruneContextsMinutes || 60) * 60
        ),
        60 * 1000
      )
    )
    this.app.intervals.push(
      setInterval(
        app.deltaCache.pruneContexts.bind(
          app.deltaCache,
          (app.config.settings.pruneContextsMinutes || 60) * 60
        ),
        60 * 1000
      )
    )
    app.intervals.push(
      setInterval(() => {
        app.emit('serverevent', {
          type: 'PROVIDERSTATUS',
          from: 'signalk-server',
          data: app.getProviderStatus()
        })
      }, 5 * 1000)
    )

    function serverUpgradeIsAvailable(err: any, newVersion?: string) {
      if (err) {
        console.error(err)
        return
      }
      const msg = `A new version (${newVersion}) of the server is available`
      console.log(msg)
      app.handleMessage(app.config.name as Path, {
        updates: [
          {
            values: [
              {
                path: 'notifications.server.newVersion' as Path,
                value: {
                  state: 'normal',
                  method: [],
                  message: msg
                }
              }
            ]
          }
        ]
      })
    }
    if (!process.env.SIGNALK_DISABLE_SERVER_UPDATES) {
      checkForNewServerVersion(app.config.version, serverUpgradeIsAvailable)
      app.intervals.push(
        setInterval(
          () =>
            checkForNewServerVersion(
              app.config.version,
              serverUpgradeIsAvailable
            ),
          60 * 1000 * 60 * 24
        )
      )
    }

    this.app.providers = []

    app.lastServerEvents = {}
    app.on('serverevent', (event: any) => {
      if (event.type) {
        app.lastServerEvents[event.type] = event
      }
    })

    app.intervals.push(startDeltaStatistics(app))

    return new Promise(async (resolve, reject) => {
      createServer(app, async (err, server) => {
        if (err) {
          reject(err)
          return
        }
        app.server = server
        app.interfaces = {}
        app.clients = 0

        debug('ID type: ' + app.selfType)
        debug('ID: ' + app.selfId)

        sendBaseDeltas(app as unknown as ConfigApp)

        app.apis = await startApis(app)
        await startInterfaces(app)
        startMdns(app)
        app.pipedProviders = pipedProviders(app as any)
        app.providers = app.pipedProviders.start()

        const primaryPort = getPrimaryPort(app)
        debug(`primary port:${primaryPort}`)
        server.listen(primaryPort, () => {
          console.log(
            'signalk-server running at 0.0.0.0:' + primaryPort.toString() + '\n'
          )
          app.started = true
          resolve(self)
        })
        const secondaryPort = getSecondaryPort(app)
        debug(`secondary port:${primaryPort}`)
        if (app.config.settings.ssl && secondaryPort) {
          startRedirectToSsl(
            secondaryPort,
            getExternalPort(app),
            (anErr: any, aServer: any) => {
              if (!anErr) {
                app.redirectServer = aServer
              }
            }
          )
        }
      })
    })
  }

  reload(mixed: any) {
    let settings
    const self = this

    if (typeof mixed === 'string') {
      try {
        settings = require(path.join(process.cwd(), mixed))
      } catch (_e) {
        debug(`Settings file '${settings}' does not exist`)
      }
    }

    if (mixed !== null && typeof mixed === 'object') {
      settings = mixed
    }

    if (settings) {
      this.app.config.settings = settings
    }

    this.stop().catch((e) => console.error(e))

    setTimeout(() => {
      self.start().catch((e) => console.error(e))
    }, 1000)

    return this
  }

  async stop(cb?: () => void) {
    if (!this.app.started) {
      return this
    }

    try {
      _.each(this.app.interfaces, (intf: any) => {
        if (
          intf !== null &&
          typeof intf === 'object' &&
          typeof intf.stop === 'function'
        ) {
          intf.stop()
        }
      })

      this.app.intervals.forEach((interval) => {
        clearInterval(interval)
      })

      this.app.providers.forEach((providerHolder) => {
        providerHolder.pipeElements[0].end()
      })

      debug('Closing server...')

      const that = this
      return new Promise((resolve, reject) => {
        this.app.server.close(() => {
          debug('Server closed')
          if (that.app.redirectServer) {
            try {
              that.app.redirectServer.close(() => {
                debug('Redirect server closed')
                delete that.app.redirectServer
                that.app.started = false
                cb && cb()
                resolve(that)
              })
            } catch (err) {
              reject(err)
            }
          } else {
            that.app.started = false
            cb && cb()
            resolve(that)
          }
        })
      })
    } catch (err) {
      throw err
    }
  }
}

module.exports = Server

function identifyPluginFromStack(
  stack: string,
  plugins: Array<{ id: string; packageName: string }>
): string | undefined {
  for (const plugin of plugins) {
    if (stack.includes(plugin.packageName)) {
      return plugin.id
    }
  }
  return undefined
}

function installProcessErrorHandlers(app: any) {
  process.on('uncaughtException', (err: Error) => {
    console.error('Uncaught exception:', err)
    if (app.plugins) {
      const pluginId = identifyPluginFromStack(err.stack ?? '', app.plugins)
      if (pluginId) {
        app.setPluginError(pluginId, `Uncaught error: ${err.message}`)
      }
    }
  })

  process.on('unhandledRejection', (reason: unknown) => {
    const err = reason instanceof Error ? reason : new Error(String(reason))
    console.error('Unhandled rejection:', err)
    if (app.plugins) {
      const pluginId = identifyPluginFromStack(err.stack ?? '', app.plugins)
      if (pluginId) {
        app.setPluginError(pluginId, `Unhandled rejection: ${err.message}`)
      }
    }
  })
}

function createServer(app: any, cb: (err: any, server?: any) => void) {
  if (app.config.settings.ssl) {
    getCertificateOptions(app, (err: any, options: any) => {
      if (err) {
        cb(err)
      } else {
        debug('Starting server to serve both http and https')
        cb(null, https.createServer(options, app))
      }
    })
    return
  }
  let server
  try {
    debug('Starting server to serve only http')
    server = http.createServer(app)
  } catch (e) {
    cb(e)
    return
  }
  cb(null, server)
}

function startRedirectToSsl(
  port: number,
  redirectPort: number,
  cb: (e: unknown, server: any) => void
) {
  const redirectApp = express()
  redirectApp.use((req: Request, res: Response) => {
    const host = req.headers.host?.split(':')[0]
    res.redirect(`https://${host}:${redirectPort}${req.path}`)
  })
  const server = http.createServer(redirectApp)
  server.listen(port, () => {
    console.log(`Redirect server running on port ${port.toString()}`)
    cb(null, server)
  })
}

function startMdns(app: ServerApp & WithConfig) {
  if (_.isUndefined(app.config.settings.mdns) || app.config.settings.mdns) {
    debug(`Starting interface 'mDNS'`)
    try {
      app.interfaces.mdns = require('./mdns')(app)
    } catch (ex) {
      console.error('Could not start mDNS:' + ex)
    }
  } else {
    debug(`Interface 'mDNS' was disabled in configuration`)
  }
}

async function startInterfaces(
  app: ServerApp & WithConfig & WithWrappedEmitter
) {
  debug.enabled &&
    debug('Interfaces config:' + JSON.stringify(app.config.settings.interfaces))
  const argv = (app as unknown as ConfigApp).argv
  const noPlugins = argv?.plugins === false
  const noWebapps = argv?.webapps === false
  type StartupCollections = {
    plugins: unknown[]
    pluginsMap: Record<string, unknown>
    getPluginsList: (enabled?: boolean) => Promise<unknown[]>
    webapps: unknown[]
    addons: unknown[]
    embeddablewebapps: unknown[]
    pluginconfigurators: unknown[]
  }
  const startupApp = app as unknown as StartupCollections
  if (noPlugins) {
    console.log('Plugins disabled by --no-plugins; skipping plugin loading')
    startupApp.plugins = []
    startupApp.pluginsMap = {}
    startupApp.getPluginsList = async () => []
  }
  if (noWebapps) {
    console.log('Webapps disabled by --no-webapps; skipping webapp loading')
    startupApp.webapps = []
    startupApp.addons = []
    startupApp.embeddablewebapps = []
    startupApp.pluginconfigurators = []
  }
  const skippedInterfaces = new Set<string>()
  if (noPlugins) {
    skippedInterfaces.add('plugins').add('wasm')
  }
  if (noWebapps) {
    skippedInterfaces.add('webapps').add('mfd_webapp')
  }
  const availableInterfaces = require('./interfaces')
  return await Promise.all(
    Object.keys(availableInterfaces).map(async (name) => {
      if (skippedInterfaces.has(name)) {
        debug.enabled &&
          debug(
            `Not loading interface '${name}' (disabled by command line flag)`
          )
        return
      }
      const theInterface = availableInterfaces[name]
      if (
        _.isUndefined(app.config.settings.interfaces) ||
        _.isUndefined((app.config.settings.interfaces || {})[name]) ||
        (app.config.settings.interfaces || {})[name]
      ) {
        debug(`Loading interface '${name}'`)
        const boundEventMethods = app.wrappedEmitter.bindMethodsById(
          `interface:${name}` as EventsActorId
        )

        const appCopy = {
          ...app,
          ...boundEventMethods
        }
        const handler = {
          set(obj: any, prop: any, value: any) {
            ;(app as any)[prop] = value
            return true
          },
          get(target: any, prop: string | symbol, _receiver: any) {
            return (app as any)[prop]
          }
        }
        const _interface = (appCopy.interfaces[name] = theInterface(
          new Proxy(appCopy, handler)
        ))
        if (_interface && _.isFunction(_interface.start)) {
          if (
            _.isUndefined(_interface.forceInactive) ||
            !_interface.forceInactive
          ) {
            debug(`Starting interface '${name}'`)
            _interface.data = await _interface.start()
          } else {
            debug(`Not starting interface '${name}' by forceInactive`)
          }
        }
      } else {
        debug(`Not loading interface '${name}' because of configuration`)
      }
    })
  )
}

function isValidUpdate(update: unknown): update is Partial<Update> {
  if (update === null || typeof update !== 'object') {
    return false
  }
  const values = (update as { values?: unknown }).values
  if ('values' in update && !Array.isArray(values)) {
    return false
  }
  if (
    Array.isArray(values) &&
    values.some(
      (v: unknown) =>
        v === null ||
        v === undefined ||
        typeof (v as { path?: unknown }).path !== 'string'
    )
  ) {
    return false
  }
  return true
}

function filterStaticSelfData(delta: any, selfContext: string) {
  if (delta.context === selfContext) {
    delta.updates &&
      delta.updates.forEach((update: any) => {
        if ('values' in update && update['$source'] !== 'defaults') {
          update.values = update.values.reduce((acc: any, pathValue: any) => {
            const nvp = filterSelfDataKP(pathValue)
            if (nvp) {
              acc.push(nvp)
            }
            return acc
          }, [])
          if (update.values.length === 0) {
            delete update.values
          }
        }
      })
  }
  return delta
}

function filterSelfDataKP(pathValue: any) {
  const deepKeys: { [key: string]: string[] } = {
    '': ['name', 'mmsi']
  }

  const filteredPaths: string[] = [
    'design.aisShipType',
    'design.beam',
    'design.length',
    'design.draft',
    'sensors.gps.fromBow',
    'sensors.gps.fromCenter'
  ]

  const deep = deepKeys[pathValue.path]

  const filterValues = (obj: any, items: string[]) => {
    const res: { [key: string]: any } = {}
    Object.keys(obj).forEach((k) => {
      if (!items.includes(k)) {
        res[k] = obj[k]
      }
    })
    return res
  }

  if (deep !== undefined) {
    if (Object.keys(pathValue.value).some((k) => deep.includes(k))) {
      pathValue.value = filterValues(pathValue.value, deep)
    }
    if (pathValue.path === '' && pathValue.value.communication !== undefined) {
      pathValue.value.communication = filterValues(
        pathValue.value.communication,
        ['callsignVhf']
      )
      if (Object.keys(pathValue.value.communication).length === 0) {
        delete pathValue.value.communication
      }
    }
    if (Object.keys(pathValue.value).length === 0) {
      return null
    }
  } else if (filteredPaths.includes(pathValue.path)) {
    return null
  }
  return pathValue
}
