/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-this-alias */
/* eslint-disable @typescript-eslint/no-var-requires */
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

if (typeof [].includes !== 'function') {
  console.log('Minimum required Node.js version is 6, please update.')
  process.exit(-1)
}

import {
  Delta,
  DeltaInputHandler,
  PropertyValues,
  SKVersion,
  SourceRef,
  Timestamp,
  Update
} from '@signalk/server-api'
import { FullSignalK, getSourceId } from '@signalk/signalk-schema'
import { Debugger } from 'debug'
import express, { IRouter, Request, Response } from 'express'
import http from 'http'
import https from 'https'
import _ from 'lodash'
import path from 'path'
import { startApis } from './api'
import { SelfIdentity, ServerApp, SignalKMessageHub, WithConfig } from './app'
import { ConfigApp, load, sendBaseDeltas } from './config/config'
import { createDebug } from './debug'
import DeltaCache from './deltacache'
import DeltaChain from './deltachain'
import { getToPreferredDelta, ToPreferredDelta } from './deltaPriority'
import { incDeltaStatistics, startDeltaStatistics } from './deltastats'
import { checkForNewServerVersion } from './modules'
import { getExternalPort, getPrimaryPort, getSecondaryPort } from './ports'
import {
  getCertificateOptions,
  getSecurityConfig,
  saveSecurityConfig,
  startSecurity,
  WithSecurityStrategy
} from './security.js'
import { setupCors } from './cors'
import SubscriptionManager from './subscriptionmanager'
const debug = createDebug('signalk-server')

const { StreamBundle } = require('./streambundle')

interface ServerOptions {
  securityConfig: any
}

class Server {
  app: ServerApp &
    SelfIdentity &
    WithConfig &
    SignalKMessageHub &
    WithSecurityStrategy &
    IRouter
  constructor(opts: ServerOptions) {
    const FILEUPLOADSIZELIMIT = process.env.FILEUPLOADSIZELIMIT || '10mb'
    const bodyParser = require('body-parser')
    const app = express() as any
    app.use(require('compression')())
    app.use(bodyParser.json({ limit: FILEUPLOADSIZELIMIT }))

    this.app = app
    app.started = false
    _.merge(app, opts)

    load(app)
    app.logging = require('./logging')(app)
    app.version = '0.0.1'

    setupCors(app, getSecurityConfig(app))
    startSecurity(app, opts ? opts.securityConfig : null)

    require('./serverroutes')(app, saveSecurityConfig, getSecurityConfig)
    require('./put').start(app)

    app.signalk = new FullSignalK(app.selfId, app.selfType)

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
      status.timeStamp = new Date().toLocaleString()

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
    app.activateSourcePriorities = () => {
      try {
        toPreferredDelta = getToPreferredDelta(
          app.config.settings.sourcePriorities
        )
      } catch (e) {
        console.error(`getToPreferredDelta failed: ${(e as any).message}`)
      }
    }
    app.activateSourcePriorities()

    app.handleMessage = (
      providerId: string,
      data: any,
      skVersion = SKVersion.v1
    ) => {
      if (data && data.updates) {
        incDeltaStatistics(app, providerId)

        if (
          typeof data.context === 'undefined' ||
          data.context === 'vessels.self'
        ) {
          data.context = 'vessels.' + app.selfId
        }
        const now = new Date()
        data.updates.forEach((update: Update) => {
          if (typeof update.source !== 'undefined') {
            update.source.label = providerId
            if (!update.$source) {
              update.$source = getSourceId(update.source)
            }
          } else {
            if (typeof update.$source === 'undefined') {
              update.$source = providerId as SourceRef
            }
          }
          if (!update.timestamp || app.config.overrideTimestampWithNow) {
            update.timestamp = now.toISOString() as Timestamp
          }
        })
        try {
          const preferredDelta = toPreferredDelta(data, now, app.selfContext)
          if (skVersion == SKVersion.v1) {
            deltachainV1.process(preferredDelta)
          } else {
            deltachainV2.process(preferredDelta)
          }
        } catch (err) {
          console.error(err)
        }
      }
    }

    app.streambundle = new StreamBundle(app, app.selfId)
    app.signalk.on('delta', app.streambundle.pushDelta.bind(app.streambundle))
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
  }

  start() {
    const self = this
    const app = this.app

    const eventDebugs: { [key: string]: Debugger } = {}
    const expressAppEmit = app.emit.bind(app)
    app.emit = (eventName: string, ...args: any[]) => {
      if (eventName !== 'serverlog') {
        let eventDebug = eventDebugs[eventName]
        if (!eventDebug) {
          eventDebugs[eventName] = eventDebug = createDebug(
            `signalk-server:events:${eventName}`
          )
        }
        if (eventDebug.enabled) {
          eventDebug(args)
        }
      }
      expressAppEmit(eventName, ...args)
    }

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
      app.handleMessage(app.config.name, {
        updates: [
          {
            values: [
              {
                path: 'notifications.server.newVersion',
                value: {
                  state: 'alert',
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

    // eslint-disable-next-line no-async-promise-executor
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

        await startApis(app)
        startInterfaces(app)
        startMdns(app)
        app.providers = require('./pipedproviders')(app).start()

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
      } catch (e) {
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

  stop(cb?: () => void) {
    return new Promise((resolve, reject) => {
      if (!this.app.started) {
        resolve(this)
      } else {
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
        } catch (err) {
          reject(err)
        }
      }
    })
  }
}

module.exports = Server

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

function startInterfaces(app: ServerApp & WithConfig) {
  debug('Interfaces config:' + JSON.stringify(app.config.settings.interfaces))
  const availableInterfaces = require('./interfaces')
  _.forIn(availableInterfaces, (theInterface: any, name: string) => {
    if (
      _.isUndefined(app.config.settings.interfaces) ||
      _.isUndefined((app.config.settings.interfaces || {})[name]) ||
      (app.config.settings.interfaces || {})[name]
    ) {
      debug(`Loading interface '${name}'`)
      app.interfaces[name] = theInterface(app)
      if (app.interfaces[name] && _.isFunction(app.interfaces[name].start)) {
        if (
          _.isUndefined(app.interfaces[name].forceInactive) ||
          !app.interfaces[name].forceInactive
        ) {
          debug(`Starting interface '${name}'`)
          app.interfaces[name].data = app.interfaces[name].start()
        } else {
          debug(`Not starting interface '${name}' by forceInactive`)
        }
      }
    } else {
      debug(`Not loading interface '${name}' because of configuration`)
    }
  })
}
