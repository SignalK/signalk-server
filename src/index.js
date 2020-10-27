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

const express = require('express')
const _ = require('lodash')
const debug = require('debug')('signalk-server')
const DeltaCache = require('./deltacache')
const path = require('path')
const http = require('http')
const spdy = require('spdy')
const { FullSignalK, getSourceId } = require('@signalk/signalk-schema')
const SubscriptionManager = require('./subscriptionmanager')
const ports = require('./ports')
const getPrimaryPort = ports.getPrimaryPort
const getSecondaryPort = ports.getSecondaryPort
const getExternalPort = ports.getExternalPort
const DeltaChain = require('./deltachain')
import { checkForNewServerVersion } from './modules'
import { getToPreferredDelta } from './deltaPriority'

const { StreamBundle } = require('./streambundle')
const {
  startSecurity,
  getCertificateOptions,
  getSecurityConfig,
  saveSecurityConfig
} = require('./security.js')
const { startDeltaStatistics, incDeltaStatistics } = require('./deltastats')

function Server(opts) {
  const FILEUPLOADSIZELIMIT = process.env.FILEUPLOADSIZELIMIT || '10mb'
  const bodyParser = require('body-parser')
  const app = express()
  app.use(require('compression')())
  app.use(require('cors')())
  app.use(bodyParser.json({ limit: FILEUPLOADSIZELIMIT }))

  this.app = app
  app.started = false
  _.merge(app, opts)

  app.logging = require('./logging')(app)
  require('./config/config').load(app)
  app.version = '0.0.1'

  startSecurity(app, opts ? opts.securityConfig : null)

  require('./serverroutes')(app, saveSecurityConfig, getSecurityConfig)
  require('./put').start(app)

  app.signalk = new FullSignalK(
    app.selfId,
    app.selfType,
    JSON.parse(JSON.stringify(app.config.defaults))
  )

  const deltachain = new DeltaChain(app.signalk.addDelta.bind(app.signalk))
  app.registerDeltaInputHandler = deltachain.register

  app.providerStatus = {}

  app.setPluginStatus = function(providerId, statusMessage) {
    doSetProviderStatus(providerId, statusMessage, 'status', 'plugin')
  }

  app.setPluginError = function(providerId, errorMessage) {
    doSetProviderStatus(providerId, errorMessage, 'error', 'plugin')
  }

  app.setProviderStatus = function(providerId, statusMessage) {
    doSetProviderStatus(providerId, statusMessage, 'status')
  }

  app.setProviderError = function(providerId, errorMessage) {
    doSetProviderStatus(providerId, errorMessage, 'error')
  }

  function doSetProviderStatus(
    providerId,
    statusMessage,
    type,
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

  app.getProviderStatus = function() {
    const providerStatus = _.values(app.providerStatus)

    if (app.plugins) {
      app.plugins.forEach(plugin => {
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
                  message: message,
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

  app.registerHistoryProvider = provider => {
    app.historyProvider = provider
  }

  app.unregisterHistoryProvider = provider => {
    delete app.historyProvider
  }

  let toPreferredDelta = delta => delta
  app.activateSourcePriorities = () => {
    try {
      toPreferredDelta = getToPreferredDelta(
        app.config.settings.sourcePriorities
      )
    } catch (e) {
      console.error(`getToPreferredDelta failed: ${e.message}`)
    }
  }
  app.activateSourcePriorities()

  app.handleMessage = function(providerId, data) {
    if (data && data.updates) {
      incDeltaStatistics(app, providerId)

      if (
        typeof data.context === 'undefined' ||
        data.context === 'vessels.self'
      ) {
        data.context = 'vessels.' + app.selfId
      }
      const now = new Date()
      data.updates.forEach(function(update) {
        if (typeof update.source !== 'undefined') {
          update.source.label = providerId
          if (!update.$source) {
            update.$source = getSourceId(update.source)
          }
        } else {
          if (typeof update.$source === 'undefined') {
            update.$source = providerId
          }
        }
        if (!update.timestamp || app.config.overrideTimestampWithNow) {
          update.timestamp = now.toISOString()
        }
      })
      try {
        deltachain.process(toPreferredDelta(data, now, app.selfContext))
      } catch (err) {
        console.error(err.message)
      }
    }
  }

  app.webapps = []

  app.streambundle = new StreamBundle(app.selfId)
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

module.exports = Server

Server.prototype.start = function() {
  const self = this
  const app = this.app

  const eventDebugs = {}
  const emit = app.emit
  app.emit = function(eventName) {
    if (eventName !== 'serverlog') {
      let eventDebug = eventDebugs[eventName]
      if (!eventDebug) {
        eventDebugs[eventName] = eventDebug = require('debug')(
          `signalk-server:events:${eventName}`
        )
      }
      if (eventDebug.enabled) {
        eventDebug([...arguments].slice(1))
      }
    }
    emit.apply(app, arguments)
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

  function serverUpgradeIsAvailable(err, newVersion) {
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
  app.on('serverevent', event => {
    if (event.type) {
      app.lastServerEvents[event.type] = event
    }
  })

  app.intervals.push(startDeltaStatistics(app))

  return new Promise((resolve, reject) => {
    createServer(app, function(err, server) {
      if (err) {
        reject(err)
        return
      }
      app.server = server
      app.interfaces = {}
      app.clients = 0

      debug('ID type: ' + app.selfType)
      debug('ID: ' + app.selfId)

      startInterfaces(app)
      startMdns(app)
      app.providers = require('./pipedproviders')(app).start()

      const primaryPort = getPrimaryPort(app)
      debug(`primary port:${primaryPort}`)
      server.listen(primaryPort, function() {
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
          (anErr, aServer) => {
            if (!anErr) {
              app.redirectServer = aServer
            }
          }
        )
      }
    })
  })
}

function createServer(app, cb) {
  if (app.config.settings.ssl) {
    getCertificateOptions(app, function(err, options) {
      if (err) {
        cb(err)
      } else {
        debug('Starting server to serve both http and https')
        cb(null, spdy.createServer(options, app))
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

function startRedirectToSsl(port, redirectPort, cb) {
  const redirectApp = new express()
  redirectApp.use((req, res) => {
    const hostHeader = req.headers.host || ''
    const host = req.headers.host.split(':')[0]
    res.redirect(`https://${host}:${redirectPort}${req.path}`)
  })
  const server = http.createServer(redirectApp)
  server.listen(port, err => {
    if (err) {
      console.error(err)
      return
    }
    console.log(`Redirect server running on port ${port.toString()}`)
    cb(null, server)
  })
}

function startMdns(app) {
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

function startInterfaces(app) {
  debug('Interfaces config:' + JSON.stringify(app.config.settings.interfaces))
  const availableInterfaces = require('./interfaces')
  _.forIn(availableInterfaces, function(theInterface, name) {
    if (
      _.isUndefined(app.config.settings.interfaces) ||
      _.isUndefined(app.config.settings.interfaces[name]) ||
      app.config.settings.interfaces[name]
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

Server.prototype.reload = function(mixed) {
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

  this.stop()

  setTimeout(function() {
    self.start()
  }, 1000)

  return this
}

Server.prototype.stop = function(cb) {
  return new Promise((resolve, reject) => {
    if (!this.app.started) {
      resolve(this)
    } else {
      try {
        _.each(this.app.interfaces, function(intf) {
          if (
            intf !== null &&
            typeof intf === 'object' &&
            typeof intf.stop === 'function'
          ) {
            intf.stop()
          }
        })

        this.app.intervals.forEach(interval => {
          clearInterval(interval)
        })

        this.app.providers.forEach(function(providerHolder) {
          providerHolder.pipeElements[0].end()
        })

        debug('Closing server...')

        const that = this
        this.app.server.close(function() {
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
